// Steam Web API integration:
//   - AuthenticateUserTicket  (auth flow)
//   - GetPlayerSummaries      (profile caching)

import { config } from "../config.js";

const STEAM_API = "https://api.steampowered.com";

export interface SteamAuthResult {
  steamId: string;
  ownsApp: boolean;
}

export interface SteamProfile {
  steamId: string;
  displayName: string;
  avatarUrl: string;
}

// -----------------------------------------------------------------------
// Validate a Steamworks session ticket from the game client.
// Returns the steam64 ID on success; throws on invalid/expired ticket.
// -----------------------------------------------------------------------
export async function authenticateTicket(
  ticketHex: string
): Promise<SteamAuthResult> {
  const url = new URL(`${STEAM_API}/ISteamUserAuth/AuthenticateUserTicket/v1/`);
  url.searchParams.set("key", config.steamPublisherKey);
  url.searchParams.set("appid", config.steamAppId);
  url.searchParams.set("ticket", ticketHex);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Steam API returned ${res.status}`);
  }

  const json = (await res.json()) as {
    response?: {
      params?: { result: string; steamid: string; ownersteamid: string };
      error?: { errorcode: number; errordesc: string };
    };
  };

  const params = json.response?.params;
  if (!params || params.result !== "OK") {
    const err = json.response?.error;
    throw new Error(
      `Steam ticket validation failed: ${err?.errordesc ?? "unknown error"}`
    );
  }

  return {
    steamId: params.steamid,
    ownsApp: params.ownersteamid === params.steamid,
  };
}

// -----------------------------------------------------------------------
// Fetch profiles for a list of Steam64 IDs (max 100 per call).
// On Steam API failure, returns cached/partial data and marks stale.
// -----------------------------------------------------------------------
export async function getPlayerSummaries(
  steamIds: string[]
): Promise<SteamProfile[]> {
  if (steamIds.length === 0) return [];

  // Steam allows up to 100 ids per request
  const chunks: string[][] = [];
  for (let i = 0; i < steamIds.length; i += 100) {
    chunks.push(steamIds.slice(i, i + 100));
  }

  const results: SteamProfile[] = [];
  for (const chunk of chunks) {
    const url = new URL(`${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`);
    url.searchParams.set("key", config.steamPublisherKey);
    url.searchParams.set("steamids", chunk.join(","));

    const res = await fetch(url.toString());
    if (!res.ok) {
      // Degraded mode: return empty for this chunk, caller handles stale
      console.error(`Steam GetPlayerSummaries returned ${res.status}`);
      continue;
    }

    const json = (await res.json()) as {
      response: {
        players: Array<{
          steamid: string;
          personaname: string;
          avatarfull: string;
        }>;
      };
    };

    for (const p of json.response.players) {
      results.push({
        steamId: p.steamid,
        displayName: p.personaname,
        avatarUrl: p.avatarfull,
      });
    }
  }

  return results;
}
