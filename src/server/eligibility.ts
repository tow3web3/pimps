// Shared eligibility set: filled by the universe sweep, read by the game
// engine. Needed because old pump.fun mints (pre-vanity era: MOODENG,
// ZEREBRO, …) do NOT end in "pump" — provenance comes from pump.fun's own
// listing, not from the mint suffix.

export const eligibleMints = new Set<string>();

export function replaceEligible(mints: Iterable<string>) {
  eligibleMints.clear();
  for (const m of mints) eligibleMints.add(m);
}
