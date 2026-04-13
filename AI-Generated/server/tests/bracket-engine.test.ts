import { describe, it, expect } from "vitest";
import { generateSingleElim, advanceSlot } from "../src/services/bracket-engine/single-elim.js";
import { generateDoubleElim, DE_RULESET } from "../src/services/bracket-engine/double-elim.js";
import { generateRoundRobin, computeRoundRobinStandings } from "../src/services/bracket-engine/round-robin.js";

// ---------------------------------------------------------------------------
// Single elimination
// ---------------------------------------------------------------------------

describe("generateSingleElim", () => {
  it("produces the correct number of matches for 8 players (no byes)", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const matches = generateSingleElim(ids);
    // 8-player SE: 7 total matches (4 + 2 + 1)
    expect(matches).toHaveLength(7);
  });

  it("produces byes for a non-power-of-2 player count", () => {
    const ids = Array.from({ length: 5 }, (_, i) => `p${i + 1}`);
    const matches = generateSingleElim(ids);
    // Padded to 8: 7 matches, 3 byes in round 1
    expect(matches).toHaveLength(7);
    const round1Byes = matches.filter((m) => m.round === 1 && m.isBye);
    expect(round1Byes.length).toBeGreaterThanOrEqual(1);
  });

  it("never puts two null players in a non-bye round-1 match", () => {
    const ids = Array.from({ length: 7 }, (_, i) => `p${i + 1}`);
    const matches = generateSingleElim(ids);
    const r1 = matches.filter((m) => m.round === 1);
    for (const m of r1) {
      // At most one side can be null
      const nullCount = [m.slotA.playerId, m.slotB.playerId].filter((x) => x === null).length;
      expect(nullCount).toBeLessThanOrEqual(1);
    }
  });

  it("throws for < 2 players", () => {
    expect(() => generateSingleElim(["p1"])).toThrow();
  });

  it("advanceSlot maps positions to the correct next-round slot", () => {
    expect(advanceSlot(1, 0)).toEqual({ nextRound: 2, nextPosition: 0, slot: "A" });
    expect(advanceSlot(1, 1)).toEqual({ nextRound: 2, nextPosition: 0, slot: "B" });
    expect(advanceSlot(1, 2)).toEqual({ nextRound: 2, nextPosition: 1, slot: "A" });
    expect(advanceSlot(1, 3)).toEqual({ nextRound: 2, nextPosition: 1, slot: "B" });
  });

  it("round-1 seeds follow standard tournament seeding order", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const matches = generateSingleElim(ids);
    const r1 = matches.filter((m) => m.round === 1);
    // Seed 1 (p1) must face seed 8 (p8) in round 1
    const seed1Match = r1.find(
      (m) => m.slotA.playerId === "p1" || m.slotB.playerId === "p1"
    );
    expect(seed1Match).toBeDefined();
    const opponent = seed1Match!.slotA.playerId === "p1" ? seed1Match!.slotB.playerId : seed1Match!.slotA.playerId;
    expect(opponent).toBe("p8");
  });
});

// ---------------------------------------------------------------------------
// Double elimination
// ---------------------------------------------------------------------------

describe("generateDoubleElim", () => {
  it("has grand finals reset enabled per frozen ruleset", () => {
    expect(DE_RULESET.grandFinalsReset).toBe(true);
  });

  it("produces winners, losers, and grand-finals arrays", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const { winners, losers, grandFinals } = generateDoubleElim(ids);
    expect(winners.length).toBeGreaterThan(0);
    expect(losers.length).toBeGreaterThan(0);
    expect(grandFinals.length).toBe(2); // 1 GF + 1 reset
  });

  it("all winners bracket matches have bracketSide WINNERS", () => {
    const ids = Array.from({ length: 4 }, (_, i) => `p${i + 1}`);
    const { winners } = generateDoubleElim(ids);
    for (const m of winners) {
      expect(m.bracketSide).toBe("WINNERS");
    }
  });

  it("all losers bracket matches have bracketSide LOSERS", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const { losers } = generateDoubleElim(ids);
    for (const m of losers) {
      expect(m.bracketSide).toBe("LOSERS");
    }
  });

  it("throws for < 2 players", () => {
    expect(() => generateDoubleElim(["p1"])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Round robin
// ---------------------------------------------------------------------------

describe("generateRoundRobin", () => {
  it("produces n*(n-1)/2 matches for an even player count", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const matches = generateRoundRobin(ids);
    // 4 players: 6 matches
    expect(matches).toHaveLength(6);
  });

  it("each pair plays exactly once", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const matches = generateRoundRobin(ids);
    const seen = new Set<string>();
    for (const m of matches) {
      const a = m.slotA.playerId;
      const b = m.slotB.playerId;
      if (!a || !b) continue;
      const key = [a, b].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("handles odd player count by inserting a bye", () => {
    const ids = ["p1", "p2", "p3"];
    const matches = generateRoundRobin(ids);
    // 4 slots (padded): 6 matches, but some are byes
    const byeMatches = matches.filter((m) => m.isBye);
    expect(byeMatches.length).toBeGreaterThan(0);
  });

  it("throws for < 2 players", () => {
    expect(() => generateRoundRobin(["p1"])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RR standings
// ---------------------------------------------------------------------------

describe("computeRoundRobinStandings", () => {
  it("sorts by wins descending", () => {
    const players = ["p1", "p2", "p3"];
    const results = [
      { playerAId: "p1", playerBId: "p2", winnerId: "p1" },
      { playerAId: "p1", playerBId: "p3", winnerId: "p1" },
      { playerAId: "p2", playerBId: "p3", winnerId: "p2" },
    ];
    const standings = computeRoundRobinStandings(players, results);
    expect(standings[0].playerId).toBe("p1");
    expect(standings[0].wins).toBe(2);
    expect(standings[1].playerId).toBe("p2");
    expect(standings[2].playerId).toBe("p3");
  });
});
