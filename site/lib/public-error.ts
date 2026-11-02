// A short error string safe to store on a lead and to send to the owner. Never includes env values.

const SECRET_NAMES = ["APIFY_TOKEN", "REPORT_SECRET", "RESEND_API_KEY", "TELEGRAM_BOT_TOKEN", "UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_URL", "TYPESAFE_API_KEY", "QSTASH_TOKEN", "CRON_SECRET"] as const;

export function publicError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  msg = msg.replace(/([?&](?:access_)?(?:token|key|secret|sig|signature)=)[^&\s]+/gi, "$1[redacted]");
  msg = msg.replace(/((?:api[_-]?key|token|secret|authorization|password)\s*[=:]\s*)[^\s,]+/gi, "$1[redacted]");
  for (const name of SECRET_NAMES) {
    const value = process.env[name];
    if (value && value.length >= 6) msg = msg.split(value).join("[redacted]");
  }
  msg = msg.replace(/\s+/g, " ").trim();
  return (msg || "unknown error").slice(0, 300);
}
