const INDIA_TIMEZONE = "Asia/Kolkata";

export function nowIso() {
  return new Date().toISOString();
}

export function toDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function toMonthKey(value: string | Date) {
  const key = toDateKey(value);
  return key.slice(0, 7);
}

export function toIndiaTimeLabel(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function isSameDate(value: string, dateKey: string) {
  return toDateKey(value) === dateKey;
}

export function compareIsoAsc(a: string, b: string) {
  return new Date(a).getTime() - new Date(b).getTime();
}
