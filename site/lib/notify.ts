// Tells the site owner about blocks, leads and applications on Telegram and by email.
// Each channel only fires when its env vars are set; otherwise the message goes to the server log.

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
  results.forEach((r) => r.status === "rejected" && console.error("[notify] failed", r.reason));
}
