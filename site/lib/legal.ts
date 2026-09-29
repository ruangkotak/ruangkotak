// Business identity and consent wording, shared by the forms, the API routes and the privacy notice.
// The server records NOTICE_VERSION and the exact consent text with every lead, as the PDPA Standards 2015 require
// consent to be recorded. Change the version whenever the notice or any consent sentence changes.

export const NOTICE_VERSION = "2026-09-30";

// Shown on the privacy notice and in the footer (Consumer Protection (Electronic Trade Transactions) Regulations).
// `registration` is the SSM business registration number.
export const BUSINESS = {
  name: "RUANGKOTAK",
  registration: "003713495-X",
  email: "hello@ruangkotak.com",
  site: "ruangkotak.com",
};

type Bilingual = { en: string; ms: string };

export const CONSENT: Record<"notice" | "owner" | "marketing", Bilingual> = {
  notice: {
    en: "I agree to the Privacy Notice. RUANGKOTAK may use my details and my account's public videos to prepare and send my mini-diagnosis, including on service providers outside Malaysia.",
    ms: "Saya bersetuju dengan Notis Privasi. RUANGKOTAK boleh menggunakan butiran saya dan video awam akaun saya untuk menyediakan dan menghantar diagnosis mini saya, termasuk melalui pembekal perkhidmatan di luar Malaysia.",
  },
  owner: {
    en: "This is my account, or I am allowed to manage it. I am 18 or older, or my parent or guardian agrees to this.",
    ms: "Ini akaun saya, atau saya dibenarkan menguruskannya. Saya berumur 18 tahun ke atas, atau ibu bapa atau penjaga saya bersetuju.",
  },
  marketing: {
    en: "Optional: you may contact me about the monthly service and send occasional tips. I can stop this anytime.",
    ms: "Pilihan: anda boleh menghubungi saya tentang perkhidmatan bulanan dan menghantar tip sekali-sekala. Saya boleh hentikannya bila-bila masa.",
  },
};

export const APPLY_CONSENT: Bilingual = {
  en: "I agree to the Privacy Notice. RUANGKOTAK may use these details and my account's public videos to review my application and contact me with a quote, including on service providers outside Malaysia. I am 18 or older, or my parent or guardian agrees to this.",
  ms: "Saya bersetuju dengan Notis Privasi. RUANGKOTAK boleh menggunakan butiran ini dan video awam akaun saya untuk menyemak permohonan saya dan menghubungi saya dengan sebut harga, termasuk melalui pembekal perkhidmatan di luar Malaysia. Saya berumur 18 tahun ke atas, atau ibu bapa atau penjaga saya bersetuju.",
};

export type ConsentRecord = {
  version: string;
  at: string;
  ip: string;
  accepted: string[]; // the exact English sentences the person ticked
};

export function consentRecord(sentences: string[], ip: string): ConsentRecord {
  return { version: NOTICE_VERSION, at: new Date().toISOString(), ip, accepted: sentences };
}
