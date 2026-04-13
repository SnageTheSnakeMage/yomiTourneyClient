// Single-elimination bracket generator.
//
// Given a list of player IDs (already seeded/randomized by caller),
// produces a flat array of MatchSpec objects ready to be persisted.
//
// Algorithm:
//   - Pad to next power of 2 with null "bye" slots
//   - Round 1 pairs: seed[0] vs seed[last], seed[1] vs seed[last-1], …
//   - Subsequent rounds: TBD slots (winner advances)

import type { MatchSpec, Slot } from "./index.js";

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function generateSingleElim(playerIds: string[]): MatchSpec[] {
  if (playerIds.length < 2) {
    throw new Error("Need at least 2 players for single elimination");
  }

  const size = nextPowerOf2(playerIds.length);
  // Pad with nulls (byes)
  const seeds: (string | null)[] = [
    ...playerIds,
    ...new Array(size - playerIds.length).fill(null),
  ];

  const matches: MatchSpec[] = [];
  const totalRounds = Math.log2(size);

  // Round 1 — pair by standard tournament seeding (1 vs 2^n, 2 vs 2^n-1, …)
  const round1Pairs = buildSeedPairs(seeds);
  for (let pos = 0; pos < round1Pairs.length; pos++) {
    const [a, b] = round1Pairs[pos];
    const isBye = a === null || b === null;
    matches.push({
      round: 1,
      position: pos,
      slotA: { playerId: a, seed: a ? playerIds.indexOf(a) + 1 : null },
      slotB: { playerId: b, seed: b ? playerIds.indexOf(b) + 1 : null },
      isBye,
    });
  }

  // Subsequent rounds — TBD slots
  let matchesInRound = size / 4; // round 2 has size/4 matches
  for (let round = 2; round <= totalRounds; round++) {
    for (let pos = 0; pos < matchesInRound; pos++) {
      matches.push({
        round,
        position: pos,
        slotA: { playerId: null, seed: null },
        slotB: { playerId: null, seed: null },
      });
    }
    matchesInRound = Math.max(1, matchesInRound / 2);
  }

  return matches;
}

// Standard tournament bracket seeding pairs for a bracket of `seeds.length`.
// Result: [[seed1, seedLast], [seed2, seed2ndLast], ...]
function buildSeedPairs(seeds: (string | null)[]): [string | null, string | null][] {
  const n = seeds.length;
  const pairs: [string | null, string | null][] = [];
  const placed = new Array<boolean>(n).fill(false);

  function recurse(lo: number, hi: number): void {
    if (lo === hi) {
      if (!placed[lo]) {
        // bye match with self (should not happen with power-of-2 sizing)
        pairs.push([seeds[lo], null]);
        placed[lo] = true;
      }
      return;
    }
    if (!placed[lo] && !placed[hi]) {
      pairs.push([seeds[lo], seeds[hi]]);
      placed[lo] = true;
      placed[hi] = true;
    }
    if (lo + 1 <= hi - 1) {
      recurse(lo + 1, hi - 1);
    }
  }

  recurse(0, n - 1);
  return pairs;
}

// Given a completed match, return the position of the next-round match
// and which slot (A or B) it feeds into.
export function advanceSlot(
  round: number,
  position: number
): { nextRound: number; nextPosition: number; slot: "A" | "B" } {
  return {
    nextRound: round + 1,
    nextPosition: Math.floor(position / 2),
    slot: position % 2 === 0 ? "A" : "B",
  };
}
