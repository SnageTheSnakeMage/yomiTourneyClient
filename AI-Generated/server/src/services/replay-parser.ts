// Godot 3.5 binary Variant replay parser.
//
// YOMIH replays are Godot 3.5 binary-serialized Dictionaries (encode_variant /
// var2bytes format). This module implements:
//
//   Step A — Metadata extraction (low risk, used in production):
//     - game version string (key "version")
//     - selected characters (key "selected_characters")
//     - optional network_ids (key "network_ids") → Steam64 ID strings
//
//   Step B — Outcome extraction (research track, not production-ready):
//     - Attempts to find "finished" boolean and player HP to derive winner
//     - Falls back gracefully; TO override is always available
//
// Godot 3.5 binary Variant wire format (core/io/marshalls.cpp):
//   Every value starts with a uint32 TYPE tag (little-endian).
//   Type codes used here:
//     1 = BOOL, 2 = INT, 3 = REAL, 4 = STRING, 18 = DICTIONARY, 19 = ARRAY
//
// References:
//   https://github.com/godotengine/godot/blob/3.5/core/io/marshalls.cpp

export interface ReplayMetadata {
  gameVersion:      string | null;
  characterIds:     string[];
  embeddedSteamIds: string[];
  warnings:         string[];
}

export interface ReplayOutcome {
  winnerSlot: "A" | "B" | null;  // null = undetermined
  confidence: "high" | "low";
  method:     "parsed" | "simulation" | "undetermined";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseReplayMetadata(buf: Buffer): ReplayMetadata {
  const warnings: string[] = [];

  // Fast path: scan for known keys as ASCII strings using the length-prefix heuristic.
  // This is the "naive scanner" from Phase 0 hardened against alignment issues.
  const version    = extractStringValue(buf, "version");
  const characters = extractStringArray(buf, "selected_characters");
  const steamIds   = extractSteamIds(buf);

  if (!version)         warnings.push("game_version_not_found");
  if (!characters.length) warnings.push("characters_not_found");
  if (!steamIds.length) warnings.push("network_ids_absent");

  return {
    gameVersion:      version,
    characterIds:     characters,
    embeddedSteamIds: steamIds,
    warnings,
  };
}

// Attempt to determine match outcome from the replay binary.
// Returns confidence="low" / winnerSlot=null if parsing cannot confirm.
export function parseReplayOutcome(buf: Buffer): ReplayOutcome {
  // Check if the replay contains a "finished" key = true
  const finished = extractBoolValue(buf, "finished");
  if (!finished) {
    return { winnerSlot: null, confidence: "low", method: "undetermined" };
  }

  // Try to locate HP values for P1 and P2.
  // YOMIH stores current HP as a float; key names inferred from binary inspection.
  // If they're not found, we cannot determine the winner deterministically.
  const hp1 = extractFloatValue(buf, "hp_1");
  const hp2 = extractFloatValue(buf, "hp_2");

  if (hp1 !== null && hp2 !== null) {
    // Player with HP > 0 wins; both at 0 = draw (shouldn't happen in YOMIH)
    const winnerSlot: "A" | "B" | null =
      hp1 > 0 && hp2 <= 0 ? "A" :
      hp2 > 0 && hp1 <= 0 ? "B" :
      null;

    return {
      winnerSlot,
      confidence: winnerSlot !== null ? "high" : "low",
      method: "parsed",
    };
  }

  return { winnerSlot: null, confidence: "low", method: "undetermined" };
}

// ---------------------------------------------------------------------------
// Internal — Godot 3.5 binary field extraction
// ---------------------------------------------------------------------------

// Extract a string value following a named key in the binary blob.
// Approach: find the key string by its length-prefix, then read the next string value.
function extractStringValue(buf: Buffer, key: string): string | null {
  const keyBytes = Buffer.from(key, "utf8");
  let offset = 0;

  while (offset < buf.length - keyBytes.length - 8) {
    // Look for length prefix matching the key length (uint32 little-endian)
    const candidateLen = buf.readUInt32LE(offset);
    if (candidateLen === keyBytes.length) {
      if (buf.slice(offset + 4, offset + 4 + keyBytes.length).equals(keyBytes)) {
        // Found the key — the value follows after padding to 4-byte alignment
        const afterKey = offset + 4 + keyBytes.length;
        const pad = (4 - (keyBytes.length % 4)) % 4;
        const valueOffset = afterKey + pad;
        const valueLen = buf.readUInt32LE(valueOffset);
        if (valueLen > 0 && valueLen < 512 && valueOffset + 4 + valueLen <= buf.length) {
          return buf.slice(valueOffset + 4, valueOffset + 4 + valueLen).toString("utf8");
        }
      }
    }
    offset++;
  }
  return null;
}

// Extract an array of strings from a named array key.
function extractStringArray(buf: Buffer, key: string): string[] {
  const keyBytes = Buffer.from(key, "utf8");
  let offset = 0;
  const results: string[] = [];

  while (offset < buf.length - keyBytes.length - 12) {
    const candidateLen = buf.readUInt32LE(offset);
    if (candidateLen === keyBytes.length) {
      if (buf.slice(offset + 4, offset + 4 + keyBytes.length).equals(keyBytes)) {
        const afterKey = offset + 4 + keyBytes.length;
        const pad = (4 - (keyBytes.length % 4)) % 4;
        let pos = afterKey + pad;

        // Expect ARRAY type (19 = 0x13) — uint32 at pos
        // Then uint32 count, then elements
        if (pos + 8 > buf.length) break;
        const arrayCount = buf.readUInt32LE(pos + 4);
        pos += 8;

        for (let i = 0; i < arrayCount && pos + 8 <= buf.length; i++) {
          // Skip type uint32
          pos += 4;
          const strLen = buf.readUInt32LE(pos);
          pos += 4;
          if (strLen > 0 && strLen < 256 && pos + strLen <= buf.length) {
            const str = buf.slice(pos, pos + strLen).toString("utf8");
            results.push(str);
            pos += strLen;
            // Align to 4 bytes
            const strPad = (4 - (strLen % 4)) % 4;
            pos += strPad;
          }
        }
        if (results.length > 0) return results;
      }
    }
    offset++;
  }
  return results;
}

// Extract Steam64 ID strings embedded in network_ids arrays.
function extractSteamIds(buf: Buffer): string[] {
  const ids: string[] = [];
  const text = buf.toString("ascii");
  const regex = /7656119\d{10}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (!ids.includes(m[0])) ids.push(m[0]);
  }
  return ids;
}

// Extract a boolean value — returns true only if key exists and value is 1
function extractBoolValue(buf: Buffer, key: string): boolean {
  const keyBytes = Buffer.from(key, "utf8");
  let offset = 0;
  while (offset < buf.length - keyBytes.length - 8) {
    const candidateLen = buf.readUInt32LE(offset);
    if (candidateLen === keyBytes.length &&
        buf.slice(offset + 4, offset + 4 + keyBytes.length).equals(keyBytes)) {
      const afterKey = offset + 4 + keyBytes.length;
      const pad = (4 - (keyBytes.length % 4)) % 4;
      const valueOffset = afterKey + pad + 4; // skip type uint32
      if (valueOffset + 4 <= buf.length) {
        return buf.readUInt32LE(valueOffset) !== 0;
      }
    }
    offset++;
  }
  return false;
}

// Extract a float (real) value by key
function extractFloatValue(buf: Buffer, key: string): number | null {
  const keyBytes = Buffer.from(key, "utf8");
  let offset = 0;
  while (offset < buf.length - keyBytes.length - 12) {
    const candidateLen = buf.readUInt32LE(offset);
    if (candidateLen === keyBytes.length &&
        buf.slice(offset + 4, offset + 4 + keyBytes.length).equals(keyBytes)) {
      const afterKey = offset + 4 + keyBytes.length;
      const pad = (4 - (keyBytes.length % 4)) % 4;
      const valueOffset = afterKey + pad + 4; // skip type uint32
      if (valueOffset + 8 <= buf.length) {
        return buf.readDoubleBE(valueOffset);
      }
    }
    offset++;
  }
  return null;
}
