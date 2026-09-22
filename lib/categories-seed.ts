import type { Category } from "./db/schema";

export const SEED_CATEGORIES: Pick<Category, "name" | "kind" | "color">[] = [
  { name: "Groceries", kind: "expense", color: "#16a34a" },
  { name: "Dining", kind: "expense", color: "#ea580c" },
  { name: "Coffee", kind: "expense", color: "#92400e" },
  { name: "Gas", kind: "expense", color: "#ca8a04" },
  { name: "Transport", kind: "expense", color: "#0891b2" },
  { name: "Rent/Housing", kind: "expense", color: "#7c3aed" },
  { name: "Utilities", kind: "expense", color: "#2563eb" },
  { name: "Subscriptions", kind: "expense", color: "#db2777" },
  { name: "Shopping", kind: "expense", color: "#e11d48" },
  { name: "Travel", kind: "expense", color: "#0d9488" },
  { name: "Health/Fitness", kind: "expense", color: "#65a30d" },
  { name: "Entertainment", kind: "expense", color: "#9333ea" },
  { name: "Personal Care", kind: "expense", color: "#c026d3" },
  { name: "Gifts", kind: "expense", color: "#dc2626" },
  { name: "Fees", kind: "expense", color: "#57534e" },
  { name: "Other", kind: "expense", color: "#94a3b8" },
  { name: "Income", kind: "income", color: "#059669" },
  { name: "Transfers", kind: "transfer", color: "#64748b" },
];
