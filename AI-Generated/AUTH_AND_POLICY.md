# Auth and Policy — YOMIH Tournament Mod

Non-negotiables. Resolve any ambiguity here before backend work.

---

## 1. Steam authentication approach

**Method: Steamworks session ticket → `AuthenticateUserTicket`**

The game mod calls `Steam.getAuthSessionTicket()` (via the GodotSteam plugin already
available to YOMIH mods) to obtain a short-lived ticket hex string. It sends that to
`POST /v1/auth/steam` in the request body. The API server calls:

```
GET https://api.steampowered.com/ISteamUserAuth/AuthenticateUserTicket/v1/
    ?key=<STEAM_PUBLISHER_KEY>
    &appid=2212330
    &ticket=<hex_ticket>
```

On a `200 OK` with `"result":"OK"`, the server extracts `steamid` and issues a **JWT**
(HS256, signed with `JWT_SECRET`) with a 24-hour expiry. The Steam64 ID becomes the
primary player identifier in the database.

**Website OpenID is not used.** This is a game mod, not a web login.

---

## 2. Guest policy

**Guests are not supported in MVP.**

All actions (registration, check-in, replay upload, bracket viewing) require a valid JWT
obtained through Steam ticket auth. Unauthenticated users can only call `GET /v1/time`
and `GET /v1/tournaments` (read-only list).

---

## 3. Replay trust rules

1. **Hash integrity:** Every replay upload stores the SHA-256 of the raw file. The same
   hash cannot produce two different processing outcomes—idempotent by hash.
2. **Version pinning:** `replay_game_version` is extracted from the replay. If it does
   not match a version in the server's `SUPPORTED_GAME_VERSIONS` env var, processing
   is quarantined (status = `FAILED`, warning logged, TO can override manually).
3. **Identity:** `network_ids` embedded in a replay is optional enrichment only. The
   authoritative player mapping is always `match_id` + bracket slot + the uploader's JWT.
   A mismatch between `embedded_steam_ids` and bracket players is logged as a
   `parser_warning`, never an automatic ban.
4. **TO override:** Tournament Organizers can manually set `winner_player_id` on any match
   via `POST /v1/matches/:id/override`. This always supersedes any simulation result.

---

## 4. Privacy stance (MVP)

> MVP scope is a small, friends-only group. Formalize before any wide or public launch.

- **Steam IDs:** Stored permanently as player primary keys. Considered public (Steam
  profiles are public by default). No deletion mechanism in MVP—add GDPR-style right-to-
  erasure before wide launch.
- **Client IPs:** Not logged by the application. Caddy (reverse proxy) logs IPs in its
  access log; rotate logs every 7 days.
- **Replay blobs:** Retained indefinitely in MVP. Add a retention policy (e.g. 90 days,
  or on tournament completion + N days) before wide launch.
- **Avatars/names:** Cached from Steam Web API. Refreshed on registration. No separate
  consent needed (public profile data).

---

## 5. Double-elimination ruleset (frozen)

To prevent rework, the DE bracket spec is fixed at:

| Setting | Value |
|---|---|
| `de_grand_finals_reset` | `true` — losers-bracket finalist who wins GF set 1 forces a reset set |
| Grand finals format | Two sets maximum (bracket reset is one extra set) |
| Losers bracket seeding | Standard: loser of winners-round N drops to corresponding losers round |

These are stored as constants in `server/src/services/bracket-engine/double-elim.ts`.
Change them **only** via a new migration + version bump, not at runtime per-tournament.

---

## 6. Character ID format

Workshop characters use the format `F-<workshop_file_id_hex>__<internal_name>`, e.g.
`F-02ebad6c205dbca2ce07279b3382a8bf__RecordVainglory`. Base game characters use plain
names: `Cowboy`, `Wizard`, `Ninja`, `Samurai`, `Swordfighter`. Whitelist/blacklist
entries must use these exact strings as extracted from the `selected_characters` field
of replay files.
