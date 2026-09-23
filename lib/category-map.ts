// Maps Plaid personal_finance_category values to our category names.
// Lookup order: payments to people go to review, then detailed category, then primary, else "Other".

export const DETAILED_MAP: Record<string, string> = {
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  FOOD_AND_DRINK_COFFEE: "Coffee",
  TRANSPORTATION_GAS: "Gas",
  RENT_AND_UTILITIES_RENT: "Rent/Housing",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Transfers",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Rent/Housing",
  GENERAL_SERVICES_INSURANCE: "Utilities",
  GENERAL_SERVICES_POSTAGE_AND_SHIPPING: "Shopping",
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "Gifts",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Health/Fitness",
  ENTERTAINMENT_TV_AND_MOVIES: "Subscriptions",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Subscriptions",
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "Gifts",
};

export const PRIMARY_MAP: Record<string, string> = {
  FOOD_AND_DRINK: "Dining",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Utilities",
  GENERAL_MERCHANDISE: "Shopping",
  ENTERTAINMENT: "Entertainment",
  PERSONAL_CARE: "Personal Care",
  MEDICAL: "Health/Fitness",
  BANK_FEES: "Fees",
  INCOME: "Income",
  TRANSFER_IN: "Transfers",
  TRANSFER_OUT: "Transfers",
};

export const FALLBACK_CATEGORY = "Other";

// Payments to and from people (Venmo, Cash App, Apple Cash, Zelle). The bank feed doesn't
// say who or what for, so they could be rent, dinner, or a reimbursement. Plaid calls them
// transfers with HIGH confidence, which would hide real spending from totals; send them to
// "Other" and the review queue instead. Amount-bounded rules can then catch the regular ones.
export const PEER_TO_PEER = new Set([
  "TRANSFER_OUT_TRANSFER_OUT_FROM_APPS",
  "TRANSFER_IN_TRANSFER_IN_FROM_APPS",
  "TRANSFER_OUT_ACCOUNT_TRANSFER",
]);

export const isPeerToPeer = (detailed: string | null | undefined) =>
  !!detailed && PEER_TO_PEER.has(detailed);

/** Returns the mapped category name, or null when nothing matched (caller falls back to "Other"). */
export function mapPlaidCategory(
  primary: string | null | undefined,
  detailed: string | null | undefined,
): string | null {
  if (isPeerToPeer(detailed)) return null;
  return (detailed && DETAILED_MAP[detailed]) || (primary && PRIMARY_MAP[primary]) || null;
}

/**
 * Amount window for a rule suggested from a payment to a person: ±15% around the amount,
 * so "Venmo ≈ $1,762 → Rent" survives small rent changes without catching the $12 splits.
 */
export function peerAmountRange(amount: number): { minAmount: number; maxAmount: number } {
  const a = Math.round(amount * 0.85);
  const b = Math.round(amount * 1.15);
  return { minAmount: Math.min(a, b), maxAmount: Math.max(a, b) };
}
