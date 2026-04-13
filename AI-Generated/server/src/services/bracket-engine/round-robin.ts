// Round-robin bracket generator using the circle (polygon) method.
// Produces a flat list of MatchSpec objects, one per pairing.
// All rounds are generated upfront; standings are computed separately
// from match results (wins, then head-to-head).

import type { MatchSpec } from "./index.js";

export function generateRoundRobin(playerIds: string[]): MatchSpec[] {
  if (playerIds.length < 2) {
    throw new Error("Need at least 2 players for round robin");
  }

  // If odd number of players, add a virtual "bye" player
  const players: (string | null)[] = [...playerIds];
  if (players.length % 2 !== 0) players.push(null);

  const n = players.length;
  const rounds = n - 1;
  const matchesPerRound = n / 2;

  const matches: MatchSpec[] = [];

  // Circle algorithm: fix players[0], rotate the rest
  const rotation = players.slice(1);

  for (let round = 0; round < rounds; round++) {
    const roundPlayers = [players[0], ...rotation];
    for (let i = 0; i < matchesPerRound; i++) {
      const a = roundPlayers[i];
      const b = roundPlayers[n - 1 - i];
      matches.push({
        round: round + 1,
        position: i,
        slotA: { playerId: a, seed: a ? playerIds.indexOf(a) + 1 : null },
        slotB: { playerId: b, seed: b ? playerIds.indexOf(b) + 1 : null },
        isBye: a === null || b === null,
      });
    }
    // Rotate: last element moves to front of rotation array
    rotation.unshift(rotation.pop()!);
  }

  return matches;
}

// Compute standings from a map of match results.
// Returns players sorted by wins DESC, then head-to-head win rate DESC.
export function computeRoundRobinStandings(
  playerIds: string[],
  results: Array<{ playerAId: string | null; playerBId: string | null; winnerId: string | null }>
): Array<{ playerId: string; wins: number; losses: number }> {
  const stats = new Map<string, { wins: number; losses: number }>(
    playerIds.map((id) => [id, { wins: 0, losses: 0 }])
  );

  for (const r of results) {
    if (!r.winnerId || !r.playerAId || !r.playerBId) continue;
    const loserId = r.winnerId === r.playerAId ? r.playerBId : r.playerAId;
    stats.get(r.winnerId)!.wins += 1;
    stats.get(loserId)!.losses += 1;
  }

  return [...stats.entries()]
    .map(([playerId, s]) => ({ playerId, ...s }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}
