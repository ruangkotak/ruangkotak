// Business identity and consent wording, shared by the forms, the API routes and the privacy notice.
// The server records NOTICE_VERSION and the exact consent text with every lead, as the PDPA Standards 2015 require
// consent to be recorded. Change the version whenever the notice or any consent sentence changes.

export const NOTICE_VERSION = "2026-09-30";

// Shown on the privacy notice and in the footer (Consumer Protection (Electronic Trade Transactions) Regulations).
// `registration` is the SSM business registration number.
export const BUSINESS = {
  name: "RUANGKOTAK",
  registration: "003713495-X",
  site: "ruangkotak.com",
};

export const CONSENT: Record<"notice" | "owner" | "marketing", string> = {
  notice: "I agree to the Privacy Notice. RUANGKOTAK may use my details and my account's public videos to prepare and send my mini-diagnosis, including on service providers outside Malaysia.",
  owner: "This is my account, or I am allowed to manage it. I am 18 or older, or my parent or guardian agrees to this.",
  marketing: "Optional: you may contact me about the monthly service and send occasional tips. I can stop this anytime.",
};

export const APPLY_CONSENT =
  "I agree to the Privacy Notice. RUANGKOTAK may use these details and my account's public videos to review my application and contact me with a quote, including on service providers outside Malaysia. I am 18 or older, or my parent or guardian agrees to this.";

export type ConsentRecord = {
  version: string;
  at: string;
  ip: string;
  accepted: string[]; // the exact sentences the person ticked
};

export function consentRecord(sentences: string[], ip: string): ConsentRecord {
  return { version: NOTICE_VERSION, at: new Date().toISOString(), ip, accepted: sentences };
}
