// Brand job categories and the rate card. Kept apart from lib/station.ts so the public /onboarding page can use
// them without shipping the board's code to every visitor.

/** The kinds of brand job. `fee: true` means the job cannot be added without a fee above RM0. */
export const DEAL_TYPES = [
  { id: "paid", label: "Paid", fee: true },
  { id: "paid-unit", label: "Paid + unit", fee: true },
  { id: "gifted", label: "Gifted review", fee: false },
  { id: "loan", label: "Loan", fee: false },
  { id: "affiliate", label: "Affiliate", fee: false },
  { id: "event", label: "Event / launch", fee: true },
  { id: "ambassador", label: "Ambassador", fee: true },
] as const;
export type DealType = (typeof DEAL_TYPES)[number]["id"];
/** The rate card: RM500 plus the review unit for one video on Instagram & TikTok. The fee box starts here. */
export const RATE_CARD_FEE = 500;
