// Double-elimination bracket generator.
//
// Frozen ruleset (from AUTH_AND_POLICY.md):
//   - Grand finals reset: YES — losers finalist who wins GF set 1 forces reset
//   - Losers bracket seeding: standard (loser of winners round N drops to losers)
//
// Produces MatchSpec arrays for both winners and losers brackets plus grand finals.

import type { MatchSpec } from "./index.js";
import { generateSingleElim } from "./single-elim.js";

// Exported so tests and API can read the frozen ruleset
export const DE_RULESET = {
  grandFinalsReset: true,
  description: "Losers finalist who wins GF set 1 forces a reset set",
} as const;

export interface DoubleElimBracket {
  winners: MatchSpec[];
  losers: MatchSpec[];
  grandFinals: MatchSpec[];
}

export function generateDoubleElim(playerIds: string[]): DoubleElimBracket {
  if (playerIds.length < 2) {
    throw new Error("Need at least 2 players for double elimination");
  }

  // Winners bracket is the same structure as single elim
  const winners = generateSingleElim(playerIds).map((m) => ({
    ...m,
    bracketSide: "WINNERS" as const,
  }));

  const totalWinnersRounds = Math.max(...winners.map((m) => m.round));

  // Losers bracket:
  //   - Round 1 losers: losers from WB round 1 (bottom half of seeds paired)
  //   - Each subsequent WB round feeds a new LB round
  //   - LB consolidation rounds between each WB drop-in
  const losers: MatchSpec[] = buildLosersBracket(playerIds.length, totalWinnersRounds);

  // Grand finals: 1 match (+ potential reset handled by TO advancing manually)
  const grandFinals: MatchSpec[] = [
    {
      round: totalWinnersRounds + 1,
      position: 0,
      bracketSide: "WINNERS",
      slotA: { playerId: null, seed: null }, // winners bracket champion
      slotB: { playerId: null, seed: null }, // losers bracket champion
    },
  ];

  if (DE_RULESET.grandFinalsReset) {
    // Potential reset match (played only if losers finalist wins GF set 1)
    grandFinals.push({
      round: totalWinnersRounds + 2,
      position: 0,
      bracketSide: "WINNERS",
      slotA: { playerId: null, seed: null },
      slotB: { playerId: null, seed: null },
    });
  }

  return { winners, losers, grandFinals };
}

function buildLosersBracket(playerCount: number, totalWinnersRounds: number): MatchSpec[] {
  const losers: MatchSpec[] = [];
  // LB has roughly 2*(totalWinnersRounds - 1) rounds
  const lbRounds = 2 * (totalWinnersRounds - 1);
  let matchCount = Math.max(1, Math.floor(playerCount / 4));

  for (let round = 1; round <= lbRounds; round++) {
    for (let pos = 0; pos < matchCount; pos++) {
      losers.push({
        round,
        position: pos,
        bracketSide: "LOSERS",
        slotA: { playerId: null, seed: null },
        slotB: { playerId: null, seed: null },
      });
    }
    // Consolidation rounds halve the match count; drop-in rounds keep the count
    if (round % 2 === 0) {
      matchCount = Math.max(1, Math.floor(matchCount / 2));
    }
  }

  return losers;
}
