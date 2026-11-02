// Production must not mark a report emailed when the sender is not configured. Runs in its own process.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { acceptMiniDiagnosis } from "../lib/leads.ts";
import { sendReportLink } from "../lib/notify.ts";

describe("production gates", { concurrency: 1 }, () => {
test("production without a report sender reports failure", async () => {
  const prevEnv = process.env.VERCEL_ENV;
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.REPORT_FROM;
  process.env.VERCEL_ENV = "production";
  delete process.env.RESEND_API_KEY;
  delete process.env.REPORT_FROM;
  try {
    const sent = await sendReportLink({ name: "Aina", email: "aina@example.com" }, "@aina", "https://ruangkotak.com/r/abc");
    assert.equal(sent, false);
  } finally {
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.REPORT_FROM;
    else process.env.REPORT_FROM = prevFrom;
  }
});

test("production without Redis does not scrape or accept", async () => {
  const prevEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  const notes: string[] = [];
  try {
    const result = await acceptMiniDiagnosis(
      {
        body: {
          platform: "instagram",
          handle: "aina.creates",
          name: "Aina",
          email: "aina@example.com",
          consentNotice: true,
          consentOwner: true,
        },
        ip: "1.2.3.4",
        country: "MY",
        cookieId: "cookie-prod",
        origin: "https://ruangkotak.com",
      },
      {
        notifyOwner: async (subject) => {
          notes.push(subject);
        },
      },
    );
    assert.equal(result.kind, "unavailable");
    if (result.kind === "unavailable") assert.equal(result.lead, null);
    assert.ok(notes.includes("Preview failed"));
  } finally {
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
  }
});
});
