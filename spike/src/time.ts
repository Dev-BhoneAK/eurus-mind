export interface LocalNow {
  /** YYYY-MM-DDTHH:mm in the given timezone, the same shape as fire_at_local. */
  iso: string;
  weekday: string;
}

// Throws RangeError for an unknown timezone, which callers use as validation.
export function localNow(now: Date, timezone: string): LocalNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "";
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`,
    weekday: get("weekday"),
  };
}
