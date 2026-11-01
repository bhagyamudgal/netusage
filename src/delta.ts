/** Difference between two interface counters, treating a missing baseline or a reset as zero. */
export function computeDelta(previous: number | undefined, current: number): number {
  if (previous === undefined) {
    return 0;
  }
  if (current < previous) {
    return 0;
  }
  return current - previous;
}
