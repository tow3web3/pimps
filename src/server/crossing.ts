// When did a token cross the $100K floor? Discovery time is NOT the answer:
// a token first met at $2M has been above the line for ages. Two honest
// signals exist, in order of strength:
//   1. WITNESSED — we saw the coin below the floor (the newest-coins page
//      shows them all), then it merged above it: the crossing happened between
//      those two sightings. Re-crossings re-stamp.
//   2. HUGGING — first sight at ≤2× the floor: it crossed moments before we
//      looked. First sight at a high cap yields NO stamp.

import { RULES } from "@/lib/rules";

const BELOW_FLOOR_MEMORY = 24 * 3600_000;

/** mint → last time it was sighted below the floor */
export const belowFloor = new Map<string, number>();

export function noteBelowFloor(mint: string, mcapUsd: number): void {
  if (mcapUsd > 0 && mcapUsd < RULES.minMcapUsd) belowFloor.set(mint, Date.now());
}

export function pruneBelowFloor(): void {
  const cutoff = Date.now() - BELOW_FLOOR_MEMORY;
  for (const [mint, ts] of belowFloor) {
    if (ts < cutoff) belowFloor.delete(mint);
  }
}

/** serverless instances reset module state — the watch rides the kv snapshot */
export function restoreBelowFloor(entries: [string, number][] | undefined): void {
  const now = Date.now();
  for (const [mint, ts] of entries ?? []) {
    if (now - ts < BELOW_FLOOR_MEMORY) belowFloor.set(mint, ts);
  }
}

/**
 * The crossing decision for a token merging into the universe (mcap is above
 * the floor here by construction). Consumes the below-floor sighting.
 */
export function crossingStamp(
  mint: string,
  mcapUsd: number,
  prev: { crossedAt?: number; firstSeenAt?: number } | undefined,
  now: number,
): number | undefined {
  if (belowFloor.has(mint)) {
    belowFloor.delete(mint);
    return now;
  }
  if (prev?.crossedAt) return prev.crossedAt;
  if (mcapUsd <= RULES.minMcapUsd * 2) return prev?.firstSeenAt ?? now;
  return undefined;
}
