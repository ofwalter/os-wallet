// Maps Plaid personal_finance_category values to our category names.
// Lookup order: detailed category, then primary, else "Other".

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

/** Returns the mapped category name, or null when nothing matched (caller falls back to "Other"). */
export function mapPlaidCategory(
  primary: string | null | undefined,
  detailed: string | null | undefined,
): string | null {
  return (detailed && DETAILED_MAP[detailed]) || (primary && PRIMARY_MAP[primary]) || null;
}
