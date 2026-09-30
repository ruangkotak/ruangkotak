// Tells the site owner about blocks, leads and applications on Telegram and by email.
// Each channel only fires when its env vars are set; otherwise the message goes to the server log.

import { BUSINESS } from "./legal";

export async function notifyOwner(subject: string, lines: string[]) {
  const text = [subject, "", ...lines].join("\n");
  const jobs: Promise<unknown>[] = [];

  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RESEND_API_KEY, ALERT_EMAIL, ALERT_FROM } = process.env;

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
      }),
    );
  }
  if (RESEND_API_KEY && ALERT_EMAIL) {
    jobs.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: ALERT_FROM ?? "RUANGKOTAK <alerts@resend.dev>",
          to: ALERT_EMAIL,
          subject: `[RUANGKOTAK] ${subject}`,
          text,
        }),
      }),
    );
  }

  if (!jobs.length) {
    console.log(`\n[notify:mock] ${text.replace(/\n/g, "\n                ")}\n`);
    return;
  }
  const results = await Promise.allSettled(jobs);
  // fetch only rejects on network errors, so a 401 from Resend or a 400 from Telegram has to be caught by status.
  for (const r of results) {
    if (r.status === "rejected") console.error("[notify] failed", r.reason);
    else if (r.value instanceof Response && !r.value.ok) console.error("[notify] failed", r.value.url.split("/bot")[0], r.value.status);
  }
}

// Emails the creator their mini-diagnosis link. Needs REPORT_FROM on a domain verified in Resend,
// because Resend's shared test sender only delivers to the account owner.
// It is a transactional message the person asked for, so it carries no offers; follow-ups need their marketing opt-in.
export async function sendReportLink(to: { name: string; email: string }, handle: string, url: string, pdf?: Uint8Array) {
  const { RESEND_API_KEY, REPORT_FROM } = process.env;
  const text = [
    `Hi ${to.name},`,
    "",
    `Your mini-diagnosis for ${handle} is ready${pdf ? ", attached as a PDF" : ""}. You can also open it online:`,
    url,
    "",
    "It ranks your content types against your usual views and names the one fix to start with.",
    "Reply to this email if anything in it doesn't match what you see in your insights.",
    "",
    BUSINESS.name,
    "",
    "--",
    `You got this email because you asked for a mini-diagnosis at ${BUSINESS.site}.`,
    `${BUSINESS.name}${BUSINESS.registration ? ` (${BUSINESS.registration})` : ""}`,
    `Privacy Notice: https://${BUSINESS.site}/privacy`,
    `To see, correct or delete your data, or withdraw consent, reply to this email.`,
  ].join("\n");

  if (!RESEND_API_KEY || !REPORT_FROM) {
    console.log(`\n[report-email:mock] to ${to.email}\n${text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: REPORT_FROM, to: to.email, subject: `Your mini-diagnosis for ${handle}`,
      text,
      ...(pdf && { attachments: [{ filename: `ruangkotak-diagnosis-${handle.replace(/[^a-z0-9._-]/gi, "")}.pdf`, content: Buffer.from(pdf).toString("base64") }] }),
    }),
  }).catch((err) => err);
  if (!(res instanceof Response) || !res.ok) console.error("[report-email] failed", res instanceof Response ? res.status : res);
}
