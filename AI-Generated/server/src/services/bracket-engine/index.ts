export { generateSingleElim } from "./single-elim.js";
export { generateDoubleElim, DE_RULESET } from "./double-elim.js";
export { generateRoundRobin } from "./round-robin.js";

// Shared types used by all generators
export interface Slot {
  playerId: string | null; // null = TBD or bye
  seed: number | null;
}

export interface MatchSpec {
  round: number;
  position: number;
  bracketSide?: "WINNERS" | "LOSERS";
  slotA: Slot;
  slotB: Slot;
  isBye?: boolean;
}
