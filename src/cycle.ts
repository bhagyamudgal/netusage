import { format, startOfDay } from "date-fns";

/** Local-midnight start of the billing cycle containing d for a cycle resetting on day. */
export function billingCycleStart(d: Date, day = 4): Date {
  const current = startOfDay(new Date(d.getFullYear(), d.getMonth(), day));
  if (startOfDay(d).getTime() >= current.getTime()) {
    return current;
  }
  return startOfDay(new Date(d.getFullYear(), d.getMonth() - 1, day));
}

/** Stable storage key for the billing cycle containing d. */
export function cycleKeyFor(d: Date, day = 4): string {
  return format(billingCycleStart(d, day), "yyyy-MM-dd");
}
