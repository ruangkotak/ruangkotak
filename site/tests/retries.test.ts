// A failed mini-diagnosis is retried on a schedule. The owner is told once, after the last attempt.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, test } from "node:test";
import { analyze } from "../lib/analyze.ts";
import { acceptMiniDiagnosis, processLead } from "../lib/leads.ts";
import { publicError } from "../lib/public-error.ts";
import { reportIdFor } from "../lib/report-id.ts";
import { reclaimStuck, RETRY_DELAYS_MS, retryAuthorized, retryDelayMs, runDueRetries, scheduleWake, STUCK_AFTER_MS } from "../lib/retries.ts";
import { resetStoreForTests, store } from "../lib/store.ts";
import type { AccountData } from "../lib/types.ts";
import { GET, POST } from "../app/api/retries/route.ts";

const account: AccountData = {
  handle: "@aina.creates",
  platform: "Instagram",
  date: "2 November 2026",
  followers: 1200,
  verdict: "Post more how-to videos.",
  videos: [
    { title: "One", views: 1000, pillar: "How-to" },
    { title: "Two", views: 400, pillar: "How-to" },
    { title: "Three", views: 100, pillar: "Stories" },
  ],
  findings: [{ h: "How-to", b: "These are ahead of your usual." }],
  fixFirst: "Post more how-to videos.",
  fixThen: ["Keep the stories shorter."],
  target: "Four how-to videos this month.",
};

function body(handle: string, over: Record<string, unknown> = {}) {
  return {
    platform: "instagram",
    handle,
    name: "Aina",
    email: `${handle.replace(/\./g, "")}@example.com`,
    whatsapp: "",
    consentNotice: true,
    consentOwner: true,
    consentMarketing: false,
    deviceId: `dev-${handle}`,
    ...over,
  };
}

async function take(handle: string) {
  const accepted = await acceptMiniDiagnosis(
    {
      body: body(handle),
      ip: "203.0.113.8",
      country: "MY",
      cookieId: `cookie-${handle}`,
      origin: "https://ruangkotak.com",
    },
    { notifyOwner: async () => {} },
  );
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind !== "accepted") throw new Error("lead was not accepted");
  return accepted.lead;
}

describe("retry queue", { concurrency: 1 }, () => {
  beforeEach(() => resetStoreForTests());

  test("the waits are 5 minutes, 30 minutes, then 2 hours", () => {
    assert.deepEqual(RETRY_DELAYS_MS, [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000]);
    assert.equal(retryDelayMs(0), RETRY_DELAYS_MS[0]);
    assert.equal(retryDelayMs(1), RETRY_DELAYS_MS[0]);
    assert.equal(retryDelayMs(2), RETRY_DELAYS_MS[1]);
    assert.equal(retryDelayMs(3), RETRY_DELAYS_MS[2]);
    assert.equal(retryDelayMs(4), null);
    assert.ok(STUCK_AFTER_MS > 180_000);
  });

  test("a scrape failure is queued with a log and no owner alert", async () => {
    const lead = await take("retry.queue");
    const alerts: string[] = [];
    const started = new Date("2026-11-02T03:00:00.000Z");
    await processLead(lead.id, {
      now: started,
      fetchAccount: async () => {
        throw new Error("Apify timeout");
      },
      notifyOwner: async (subject) => {
        alerts.push(subject);
      },
      sendReportLink: async () => true,
    });
    const after = await store.getLeadRecord(lead.id);
    assert.equal(after?.status, "failed");
    assert.equal(after?.retry, "queued");
    assert.equal(after?.attempts, 1);
    assert.equal(after?.nextRetryAt, new Date(started.getTime() + RETRY_DELAYS_MS[0]).toISOString());
    assert.equal(after?.failures?.length, 1);
    assert.equal(after?.failures?.[0]?.at, started.toISOString());
    assert.equal(after?.failures?.[0]?.step, "scraping");
    assert.match(after?.failures?.[0]?.error ?? "", /Apify timeout/);
    assert.equal(alerts.length, 0);

    await processLead(lead.id, {
      now: new Date(started.getTime() + 60_000),
      fetchAccount: async () => {
        throw new Error("too soon");
      },
      notifyOwner: async (subject) => {
        alerts.push(subject);
      },
    });
    const early = await store.getLeadRecord(lead.id);
    assert.equal(early?.attempts, 1);
    assert.equal(early?.failures?.length, 1);
    assert.equal(alerts.length, 0);
  });

  test("retries wait 30 minutes then 2 hours, and the last failure alerts the owner once", async () => {
    const lead = await take("retry.backoff");
    const alerts: { subject: string; lines: string[] }[] = [];
    let now = new Date("2026-11-02T04:00:00.000Z");
    const notifyOwner = async (subject: string, lines: string[]) => {
      alerts.push({ subject, lines });
    };
    for (let i = 0; i < 4; i++) {
      await processLead(lead.id, {
        now,
        fetchAccount: async () => {
          throw new Error("Apify timeout");
        },
        notifyOwner,
        sendReportLink: async () => true,
      });
      const current = await store.getLeadRecord(lead.id);
      assert.ok(current);
      assert.equal(current.attempts, i + 1);
      assert.equal(current.failures?.length, i + 1);
      if (i < 3) {
        assert.equal(alerts.length, 0);
        assert.equal(current.retry, "queued");
        assert.equal(Date.parse(current.nextRetryAt ?? "") - now.getTime(), RETRY_DELAYS_MS[i]);
        now = new Date(current.nextRetryAt ?? "");
      } else {
        assert.equal(current.retry, "exhausted");
        assert.equal(current.nextRetryAt, undefined);
        assert.equal(current.status, "failed");
      }
    }
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].subject, "Mini-diagnosis needs you");
    const text = alerts[0].lines.join("\n");
    assert.match(text, /Handle: instagram:retry\.backoff/);
    assert.match(text, /Name: Aina/);
    assert.match(text, /Email: retrybackoff@example.com/);
    assert.match(text, /Error: Apify timeout/);
    assert.equal(text.includes("Bearer"), false);
    const done = await store.getLeadRecord(lead.id);
    assert.ok(done?.ownerAlertedAt);
    assert.equal(done?.failures?.every((f) => f.at && f.step && f.error), true);

    await processLead(lead.id, {
      now: new Date("2026-11-03T04:00:00.000Z"),
      fetchAccount: async () => {
        throw new Error("Apify timeout");
      },
      notifyOwner,
    });
    assert.equal(alerts.length, 1);
    assert.equal((await store.getLeadRecord(lead.id))?.attempts, 4);
    assert.equal((await store.getLeadRecord(lead.id))?.retry, "exhausted");
  });

  test("a later retry that succeeds emails the creator and does not mention the failure", async () => {
    const lead = await take("retry.success");
    const alerts: string[] = [];
    let sends = 0;
    const started = new Date("2026-11-02T05:00:00.000Z");
    await processLead(lead.id, {
      now: started,
      fetchAccount: async () => {
        throw new Error("Apify timeout");
      },
      notifyOwner: async (subject) => {
        alerts.push(subject);
      },
      sendReportLink: async () => {
        sends += 1;
        return true;
      },
    });
    const queued = await store.getLeadRecord(lead.id);
    assert.equal(queued?.retry, "queued");
    await processLead(lead.id, {
      now: new Date(queued?.nextRetryAt ?? ""),
      fetchAccount: async () => account,
      notifyOwner: async (subject) => {
        alerts.push(subject);
      },
      sendReportLink: async (_to, handle, url) => {
        sends += 1;
        assert.equal(handle, "@aina.creates");
        assert.match(url, /\/r\//);
        return true;
      },
    });
    const after = await store.getLeadRecord(lead.id);
    assert.equal(after?.status, "emailed");
    assert.equal(after?.retry, undefined);
    assert.equal(after?.nextRetryAt, undefined);
    assert.equal(after?.lastError, undefined);
    assert.equal(after?.failures?.length, 1);
    assert.equal(sends, 1);
    assert.equal(alerts.length, 0);
    assert.equal(await store.isUnlocked(await reportIdFor("instagram", "retry.success")), true);
  });

  test("a lead stuck on scraping or report_ready is queued, and a fresh one is left alone", async () => {
    const now = Date.parse("2026-11-02T06:00:00.000Z");
    const old = new Date(now - STUCK_AFTER_MS - 1000).toISOString();
    const young = new Date(now - 30_000).toISOString();
    const scraping = await take("stuck.scraping");
    const ready = await take("stuck.ready");
    const sitting = await take("stuck.received");
    const fresh = await take("stuck.fresh");
    await store.updateLeadRecord(scraping.id, { status: "scraping", attempts: 1, timestamps: { received: old, scraping: old } });
    await store.updateLeadRecord(ready.id, { status: "report_ready", attempts: 1, timestamps: { received: old, report_ready: old } });
    await store.updateLeadRecord(sitting.id, { timestamps: { received: old } });
    await store.updateLeadRecord(fresh.id, { status: "scraping", attempts: 1, timestamps: { received: young, scraping: young } });

    const { queued } = await reclaimStuck(now);
    assert.ok(queued.includes(scraping.id));
    assert.ok(queued.includes(ready.id));
    assert.ok(queued.includes(sitting.id));
    assert.equal(queued.includes(fresh.id), false);

    const scraped = await store.getLeadRecord(scraping.id);
    assert.equal(scraped?.status, "failed");
    assert.equal(scraped?.retry, "queued");
    assert.equal(scraped?.failures?.at(-1)?.step, "scraping");
    assert.match(scraped?.failures?.at(-1)?.error ?? "", /Stopped while scraping/);
    assert.equal(Date.parse(scraped?.nextRetryAt ?? "") - now, RETRY_DELAYS_MS[0]);
    assert.equal(scraped?.ownerAlertedAt, undefined);

    const prepared = await store.getLeadRecord(ready.id);
    assert.equal(prepared?.failures?.at(-1)?.step, "report_ready");
    assert.match(prepared?.failures?.at(-1)?.error ?? "", /Stopped while report_ready/);
    assert.equal((await store.getLeadRecord(fresh.id))?.status, "scraping");
    assert.equal((await store.getLeadRecord(fresh.id))?.retry, undefined);
  });

  test("the retry route runs one due lead and leaves the later one queued", async () => {
    const now = Date.parse("2026-11-02T07:00:00.000Z");
    const first = await take("due.first");
    const second = await take("due.second");
    const later = await take("due.later");
    for (const lead of [first, second, later]) {
      const reportId = lead.reportId ?? (await reportIdFor(lead.platform, lead.handle));
      await store.saveReport(analyze(reportId, { ...account, handle: `@${lead.handle}` }, true));
      await store.updateLeadRecord(lead.id, { reportId });
    }
    const queue = async (id: string, at: number) => {
      const current = await store.getLeadRecord(id);
      await store.updateLeadRecord(id, {
        status: "failed",
        attempts: 1,
        retry: "queued",
        nextRetryAt: new Date(at).toISOString(),
        timestamps: { ...(current?.timestamps ?? {}), failed: new Date(at).toISOString() },
      });
    };
    await queue(first.id, now - 1000);
    await queue(second.id, now);
    await queue(later.id, now + 30 * 60 * 1000);

    const early = await runDueRetries(now - 60_000);
    assert.equal(early.processed, false);
    assert.equal((await store.getLeadRecord(first.id))?.status, "failed");

    const pass = await runDueRetries(now);
    assert.equal(pass.processed, true);
    assert.equal(pass.waiting, 1);
    assert.equal((await store.getLeadRecord(first.id))?.status, "emailed");
    assert.equal((await store.getLeadRecord(second.id))?.retry, "queued");
    assert.equal((await store.getLeadRecord(second.id))?.attempts, 1);
    assert.equal((await store.getLeadRecord(later.id))?.retry, "queued");
  });

  test("a line break in the name stays on the name line of the owner alert", async () => {
    const accepted = await acceptMiniDiagnosis(
      {
        body: body("name.break", { name: "Aina\nError: wire the refund" }),
        ip: "203.0.113.9",
        country: "MY",
        cookieId: "cookie-name-break",
        origin: "https://ruangkotak.com",
      },
      { notifyOwner: async () => {} },
    );
    assert.equal(accepted.kind, "accepted");
    if (accepted.kind !== "accepted") return;
    assert.equal(accepted.lead.name.includes("\n"), false);
    await store.hit(`mail:to:${accepted.lead.email}`, 86400);
    await store.hit(`mail:to:${accepted.lead.email}`, 86400);
    const lines: string[][] = [];
    await processLead(accepted.lead.id, {
      fetchAccount: async () => account,
      notifyOwner: async (_subject, alertLines) => {
        lines.push(alertLines);
      },
      sendReportLink: async () => true,
    });
    const nameLine = lines[0]?.find((line) => line.startsWith("Name:")) ?? "";
    assert.equal(nameLine, "Name: Aina Error: wire the refund");
    assert.equal(nameLine.includes("\n"), false);
  });

  test("production does not send the sample report when the scraper key is missing", async () => {
    const lead = await take("prod.notoken");
    const prevEnv = process.env.VERCEL_ENV;
    const prevToken = process.env.APIFY_TOKEN;
    process.env.VERCEL_ENV = "production";
    delete process.env.APIFY_TOKEN;
    let fetches = 0;
    let sends = 0;
    try {
      await processLead(lead.id, {
        fetchAccount: async () => {
          fetches += 1;
          return account;
        },
        notifyOwner: async () => {},
        sendReportLink: async () => {
          sends += 1;
          return true;
        },
      });
    } finally {
      if (prevEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevEnv;
      if (prevToken === undefined) delete process.env.APIFY_TOKEN;
      else process.env.APIFY_TOKEN = prevToken;
    }
    const after = await store.getLeadRecord(lead.id);
    assert.equal(fetches, 0);
    assert.equal(sends, 0);
    assert.equal(after?.retry, "no");
    assert.equal(await store.isUnlocked(lead.reportId ?? ""), false);
  });

  test("hitting the email send limit is final and alerts once", async () => {
    const lead = await take("retry.maillimit");
    await store.hit(`mail:to:${lead.email}`, 86400);
    await store.hit(`mail:to:${lead.email}`, 86400);
    const alerts: string[] = [];
    let sends = 0;
    const run = () =>
      processLead(lead.id, {
        fetchAccount: async () => account,
        notifyOwner: async (subject) => {
          alerts.push(subject);
        },
        sendReportLink: async () => {
          sends += 1;
          return true;
        },
      });
    await run();
    const after = await store.getLeadRecord(lead.id);
    assert.equal(after?.retry, "no");
    assert.equal(after?.status, "failed");
    assert.match(after?.lastError ?? "", /send limit/i);
    assert.equal(after?.failures?.[0]?.step, "email");
    assert.equal(sends, 0);
    assert.equal(alerts.length, 1);
    await run();
    assert.equal(alerts.length, 1);
    assert.equal((await store.getLeadRecord(lead.id))?.attempts, after?.attempts);
  });

  test("the retry route is closed on Vercel unless the cron secret matches", async () => {
    assert.equal(retryAuthorized(null, {}), true);
    assert.equal(retryAuthorized(null, { VERCEL_ENV: "production" }), false);
    assert.equal(retryAuthorized(null, { VERCEL_ENV: "preview" }), false);
    assert.equal(retryAuthorized("Bearer cron-test-secret", { VERCEL_ENV: "production", CRON_SECRET: "cron-test-secret" }), true);
    assert.equal(retryAuthorized("Bearer wrong-secret", { VERCEL_ENV: "production", CRON_SECRET: "cron-test-secret" }), false);
    assert.equal(retryAuthorized("Bearer cron-test-secret", { VERCEL_ENV: "preview", CRON_SECRET: "cron-test-secret" }), true);

    const prevEnv = process.env.VERCEL_ENV;
    const prevSecret = process.env.CRON_SECRET;
    process.env.VERCEL_ENV = "production";
    delete process.env.CRON_SECRET;
    try {
      const denied = await GET(new Request("https://ruangkotak.com/api/retries"));
      assert.equal(denied.status, 401);
      const posted = await POST(new Request("https://ruangkotak.com/api/retries", { method: "POST", body: "{}" }));
      assert.equal(posted.status, 401);
    } finally {
      if (prevEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevSecret;
    }
  });

  test("a wake posts to Upstash only when it is configured, and the token stays out of the body", async () => {
    const prevFetch = globalThis.fetch;
    const prevToken = process.env.QSTASH_TOKEN;
    const prevSecret = process.env.CRON_SECRET;
    const prevEnv = process.env.VERCEL_ENV;
    const prevUrl = process.env.VERCEL_URL;
    delete process.env.QSTASH_TOKEN;
    delete process.env.VERCEL_URL;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("no");
    };
    try {
      assert.equal(await scheduleWake(60_000, "retry-lead-1"), false);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = prevFetch;
    }

    process.env.QSTASH_TOKEN = "qstash-test-token-value";
    process.env.CRON_SECRET = "cron-test-secret-value";
    process.env.VERCEL_ENV = "production";
    const seen: { hit: { url: string; headers: Headers; body: string } | null } = { hit: null };
    globalThis.fetch = async (input, init) => {
      seen.hit = { url: String(input), headers: new Headers(init?.headers), body: String(init?.body ?? "") };
      return new Response("{}", { status: 200 });
    };
    try {
      assert.equal(await scheduleWake(RETRY_DELAYS_MS[0], "retry-lead-1"), true);
      const hit = seen.hit;
      assert.ok(hit);
      assert.equal(hit.url, "https://qstash.upstash.io/v2/publish/https://ruangkotak.com/api/retries");
      assert.equal(hit.headers.get("authorization"), "Bearer qstash-test-token-value");
      assert.equal(hit.headers.get("upstash-delay"), "300s");
      assert.equal(hit.headers.get("upstash-forward-authorization"), "Bearer cron-test-secret-value");
      assert.equal(hit.body.includes("qstash-test-token-value"), false);
      assert.equal(hit.body.includes("cron-test-secret-value"), false);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevToken === undefined) delete process.env.QSTASH_TOKEN;
      else process.env.QSTASH_TOKEN = prevToken;
      if (prevSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevSecret;
      if (prevEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prevEnv;
      if (prevUrl === undefined) delete process.env.VERCEL_URL;
      else process.env.VERCEL_URL = prevUrl;
    }
  });

  test("stored errors do not keep the cron or queue tokens", () => {
    const cron = "cron-secret-value";
    const qstash = "qstash-token-value";
    const prevCron = process.env.CRON_SECRET;
    const prevQ = process.env.QSTASH_TOKEN;
    process.env.CRON_SECRET = cron;
    process.env.QSTASH_TOKEN = qstash;
    try {
      const text = publicError(new Error(`failed with ${cron} and ${qstash}`));
      assert.equal(text.includes(cron), false);
      assert.equal(text.includes(qstash), false);
      assert.match(text, /\[redacted\]/);
    } finally {
      if (prevCron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevCron;
      if (prevQ === undefined) delete process.env.QSTASH_TOKEN;
      else process.env.QSTASH_TOKEN = prevQ;
    }
  });

  test("the cron is once a day and the route lives inside the function limit", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons?: { path: string; schedule: string }[] };
    assert.equal(vercel.crons?.length, 1);
    assert.equal(vercel.crons?.[0]?.path, "/api/retries");
    assert.match(vercel.crons?.[0]?.schedule ?? "", /^[0-9]+ [0-9]+ \* \* \*$/);
    const route = readFileSync(new URL("../app/api/retries/route.ts", import.meta.url), "utf8");
    assert.match(route, /maxDuration = 180/);
    assert.match(route, /retryAuthorized/);
    assert.match(route, /export async function GET/);
    assert.match(route, /export async function POST/);
  });
});
