// The mini-diagnosis must keep the creator even when the scrape throws, and must finish at "emailed" when it works.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { analyze } from "../lib/analyze.ts";
import { acceptMiniDiagnosis, processLead, SCRAPES_PER_DAY, scrapeDayKey } from "../lib/leads.ts";
import { CONFIRM_BODY, CONFIRM_TITLE } from "../lib/preview-copy.ts";
import { reportIdFor } from "../lib/report-id.ts";
import { listLeadRecordsForTests, resetStoreForTests, store } from "../lib/store.ts";
import type { AccountData } from "../lib/types.ts";

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

function body(over: Record<string, unknown> = {}) {
  return {
    platform: "instagram",
    handle: "Aina.Creates",
    name: "Aina",
    email: "aina@example.com",
    whatsapp: "",
    consentNotice: true,
    consentOwner: true,
    consentMarketing: false,
    deviceId: "device-1",
    ...over,
  };
}

function input(overBody: Record<string, unknown> = {}, over: { ip?: string; cookieId?: string; now?: Date } = {}) {
  return {
    body: body(overBody),
    ip: over.ip ?? "1.2.3.4",
    country: "MY",
    cookieId: over.cookieId ?? "cookie-1",
    origin: "http://127.0.0.1:3100",
    now: over.now,
  };
}

beforeEach(() => resetStoreForTests());

test("the daily cap bucket turns over at 08:00 in Malaysia", () => {
  // 07:30 MYT is still the previous UTC date. 08:30 MYT is the next one.
  assert.equal(scrapeDayKey(new Date("2026-11-01T23:30:00.000Z")), "2026-11-01");
  assert.equal(scrapeDayKey(new Date("2026-11-02T00:30:00.000Z")), "2026-11-02");
});

test("a lead is stored as received before the scrape, and still exists when the scrape throws", async () => {
  const notes: string[] = [];
  let scrapes = 0;
  const accepted = await acceptMiniDiagnosis(input(), {
    notifyOwner: async (subject) => {
      notes.push(subject);
    },
  });
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind !== "accepted") return;

  const stored = await store.getLeadRecord(accepted.lead.id);
  assert.equal(stored?.status, "received");
  assert.equal(stored?.attempts, 0);
  assert.equal(stored?.handle, "aina.creates");
  assert.equal(notes.length, 1);
  assert.equal(notes[0], "New lead: mini-diagnosis");
  assert.equal(scrapes, 0);

  await processLead(accepted.lead.id, {
    fetchAccount: async () => {
      scrapes += 1;
      throw new Error("Apify timeout");
    },
    notifyOwner: async (subject) => {
      notes.push(subject);
    },
    sendReportLink: async () => true,
  });

  const after = await store.getLeadRecord(accepted.lead.id);
  assert.ok(after);
  assert.equal(after.status, "failed");
  assert.equal(after.attempts, 1);
  assert.match(after.lastError ?? "", /Apify timeout/);
  assert.equal(after.timestamps.received?.length, 24);
  assert.ok(after.timestamps.failed);
  assert.equal(scrapes, 1);
  assert.ok(notes.includes("Preview failed"));
  assert.equal(await store.isUnlocked(after.reportId ?? ""), false);
});

test("a thrown error message does not keep a secret", async () => {
  const accepted = await acceptMiniDiagnosis(input({ handle: "secret.case", deviceId: "device-secret" }, { cookieId: "cookie-secret" }));
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind !== "accepted") return;
  const sentinel = "sentinel-not-a-real-token";
  const prev = process.env.APIFY_TOKEN;
  process.env.APIFY_TOKEN = sentinel;
  try {
    await processLead(accepted.lead.id, {
      fetchAccount: async () => {
        throw new Error(`scrape blew up ${sentinel}`);
      },
      notifyOwner: async () => {},
      sendReportLink: async () => true,
    });
  } finally {
    if (prev === undefined) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = prev;
  }
  const after = await store.getLeadRecord(accepted.lead.id);
  if (after?.lastError?.includes(sentinel)) throw new Error("lastError kept a secret value");
  assert.match(after?.lastError ?? "", /\[redacted\]/);
});

test("the success path saves the report, unlocks it, and reaches emailed", async () => {
  const sent: { email?: string; url?: string; handle?: string } = {};
  const accepted = await acceptMiniDiagnosis(input(), {
    notifyOwner: async (_subject, lines) => {
      assert.ok(lines.some((l) => l.includes("NO, send the report only")));
    },
  });
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind !== "accepted") return;

  await processLead(accepted.lead.id, {
    fetchAccount: async () => account,
    notifyOwner: async () => {},
    sendReportLink: async (to, handle, url) => {
      sent.email = to.email;
      sent.handle = handle;
      sent.url = url;
      return true;
    },
  });

  const after = await store.getLeadRecord(accepted.lead.id);
  assert.equal(after?.status, "emailed");
  assert.equal(after?.attempts, 1);
  assert.equal(after?.lastError, undefined);
  assert.ok(after?.timestamps.scraping && after.timestamps.report_ready && after.timestamps.emailed);
  assert.equal(sent.email, "aina@example.com");
  assert.equal(sent.handle, "@aina.creates");
  const reportId = await reportIdFor("instagram", "aina.creates");
  assert.equal(sent.url, `http://127.0.0.1:3100/r/${reportId}`);
  assert.equal(await store.isUnlocked(reportId), true);
  assert.ok(await store.getReport(reportId));
  assert.equal(await store.deviceHandle("c:cookie-1"), "instagram:aina.creates");
  assert.equal(await store.deviceHandle("d:device-1"), "instagram:aina.creates");
});

test("a cached report does not spend another scrape and still emails", async () => {
  const now = new Date("2026-06-01T02:00:00.000Z");
  const reportId = await reportIdFor("instagram", "aina.creates");
  await store.saveReport(analyze(reportId, account, true));
  for (let i = 0; i < SCRAPES_PER_DAY; i++) await store.hit(`day:${scrapeDayKey(now)}`, 86400);
  let scrapes = 0;
  const accepted = await acceptMiniDiagnosis(input({}, { now }), {
    notifyOwner: async () => {},
  });
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind !== "accepted") return;
  await processLead(accepted.lead.id, {
    fetchAccount: async () => {
      scrapes += 1;
      throw new Error("should not scrape");
    },
    notifyOwner: async () => {},
    sendReportLink: async () => true,
  });
  assert.equal(scrapes, 0);
  assert.equal((await store.getLeadRecord(accepted.lead.id))?.status, "emailed");
});

test("the eleventh fresh scrape of the UTC day is held, and the next day is open again", async () => {
  const day = new Date("2026-06-01T02:00:00.000Z");
  const notes: string[] = [];
  for (let i = 0; i < SCRAPES_PER_DAY; i++) {
    const result = await acceptMiniDiagnosis(
      input({ handle: `creator${i}`, deviceId: `dev-${i}` }, { ip: `10.0.0.${i}`, cookieId: `ck-${i}`, now: day }),
      { notifyOwner: async () => {} },
    );
    assert.equal(result.kind, "accepted");
  }
  const held = await acceptMiniDiagnosis(
    input({ handle: "creatorheld", deviceId: "dev-held" }, { ip: "10.9.9.9", cookieId: "ck-held", now: day }),
    {
      notifyOwner: async (subject) => {
        notes.push(subject);
      },
    },
  );
  assert.equal(held.kind, "unavailable");
  if (held.kind !== "unavailable") return;
  assert.equal(held.lead?.status, "failed");
  assert.equal(held.lead?.attempts, 0);
  assert.match(held.lead?.lastError ?? "", /limit/i);
  assert.ok(notes.includes("Preview held: scrape limit reached"));
  assert.equal(notes.includes("New lead: mini-diagnosis"), false);

  const nextDay = new Date("2026-06-02T00:30:00.000Z");
  const again = await acceptMiniDiagnosis(
    input({ handle: "creatornew", deviceId: "dev-new" }, { ip: "10.8.8.8", cookieId: "ck-new", now: nextDay }),
    { notifyOwner: async () => {} },
  );
  assert.equal(again.kind, "accepted");
});

test("a second account on one device is refused without a scrape", async () => {
  await store.setDeviceHandle("c:cookie-1", "tiktok:firstone");
  let scrapes = 0;
  let blocks = 0;
  const refuse = async () => {
    const result = await acceptMiniDiagnosis(input(), {
      notifyOwner: async (subject) => {
        if (subject.startsWith("Preview blocked")) blocks += 1;
      },
    });
    assert.equal(result.kind, "unavailable");
    if (result.kind === "unavailable") assert.equal(result.lead?.status, "failed");
  };
  await refuse();
  await refuse();
  await processLead("missing", {
    fetchAccount: async () => {
      scrapes += 1;
      return account;
    },
  });
  assert.equal(scrapes, 0);
  assert.equal(blocks, 1);
});

test("a bad email is not stored", async () => {
  const result = await acceptMiniDiagnosis(input({ email: "not-an-email" }));
  assert.equal(result.kind, "invalid");
  if (result.kind === "invalid") assert.equal(result.field, "email");
  assert.equal(listLeadRecordsForTests().length, 0);
});

test("a refused report email is marked failed and the owner is told", async () => {
  const notes: string[] = [];
  const accepted = await acceptMiniDiagnosis(input({ handle: "mail.fail", deviceId: "device-mail" }, { cookieId: "cookie-mail" }), {
    notifyOwner: async () => {},
  });
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind !== "accepted") return;
  await processLead(accepted.lead.id, {
    fetchAccount: async () => account,
    notifyOwner: async (subject) => {
      notes.push(subject);
    },
    sendReportLink: async () => false,
  });
  const after = await store.getLeadRecord(accepted.lead.id);
  assert.equal(after?.status, "failed");
  assert.match(after?.lastError ?? "", /email/i);
  assert.ok(notes.includes("Preview failed"));
  assert.equal(await store.isUnlocked(await reportIdFor("instagram", "mail.fail")), true);
});

test("the confirmation copy promises the inbox and has no dash or arrow", () => {
  assert.match(CONFIRM_TITLE, /on its way to your inbox/);
  assert.match(CONFIRM_BODY("aina@example.com"), /aina@example.com/);
  const sheet = readFileSync(new URL("../components/preview-flow.tsx", import.meta.url), "utf8");
  assert.match(sheet, /CONFIRM_TITLE/);
  assert.equal(sheet.includes("location.assign"), false);
  for (const text of [CONFIRM_TITLE, CONFIRM_BODY("a@b.co"), sheet]) {
    assert.equal(text.includes("\u2192") || text.includes("\u2014"), false);
  }
  const markup = readFileSync(new URL("../components/landing/markup.ts", import.meta.url), "utf8");
  const site = readFileSync(new URL("../lib/site.ts", import.meta.url), "utf8");
  assert.equal(markup.includes("On screen right away"), false);
  assert.match(markup, /We email it to you when it is ready/);
  assert.match(site, /We email it to you when it is ready/);
});

test("the preview route answers first and scrapes afterwards", () => {
  const route = readFileSync(new URL("../app/api/preview/route.ts", import.meta.url), "utf8");
  assert.match(route, /acceptMiniDiagnosis/);
  assert.match(route, /after\(/);
  assert.equal(route.includes("await processLead"), false);
  assert.match(route, /maxDuration = 180/);
});
