// Shared eligibility set: filled by the universe sweep, read by the game
// engine. Needed because old pump.fun mints (pre-vanity era: MOODENG,
// ZEREBRO, …) do NOT end in "pump" — provenance comes from pump.fun's own
// listing, not from the mint suffix.
//
// On serverless the sweep and the buy handler live in DIFFERENT instances, so
// an in-memory set alone is empty exactly where it matters. The kv universe
// snapshot is the shared source of truth; instances hydrate from it on demand.

import { kvGet } from "./sql";

export const eligibleMints = new Set<string>();
let loadedAt = 0;

export function replaceEligible(mints: Iterable<string>) {
  eligibleMints.clear();
  for (const m of mints) eligibleMints.add(m);
  loadedAt = Date.now();
}

/** hydrate from the shared snapshot when this instance's set is cold/stale */
export async function ensureEligible(): Promise<void> {
  if (eligibleMints.size > 0 && Date.now() - loadedAt < 5 * 60_000) return;
  try {
    const raw = await kvGet("universe");
    if (!raw) return;
    const snap = JSON.parse(raw) as { tokens?: { mint: string }[] };
    if (snap.tokens?.length) replaceEligible(snap.tokens.map((t) => t.mint));
  } catch {
    /* the suffix check still guards modern mints */
  }
}
