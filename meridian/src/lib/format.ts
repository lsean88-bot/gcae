export function isoOffset(days: number, from = new Date()) {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return isoOffset(0);
}

export function parseIso(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function daysBetween(fromIso: string, toIso = todayIso()) {
  const ms = parseIso(toIso).getTime() - parseIso(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseIso(value));
}

export function money(amount?: number | null, currency = "MYR") {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-MY")}`;
  }
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function dueDate(status: string) {
  return status === "Closed" || status === "Deferred";
}

export function isOverdue(status: string, due: string) {
  if (dueDate(status)) return false;
  return daysBetween(due) > 0;
}

export function effectiveDue(originalDue: string, revisedDue?: string | null) {
  return revisedDue || originalDue;
}
