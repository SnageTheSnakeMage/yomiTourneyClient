# Modding Spike Findings — YOMIH GDScript capabilities

**Verdict: GO for in-game approach** with one known limitation (file picker UX).

---

## Correction: language is GDScript, not Lua

The plan references "Lua-based" mods, but analysis of the YOMIH Workshop ecosystem (including
the reference mod YOMIRecord: https://github.com/Snazzah/YOMIRecord) confirms mods are written
in **GDScript** (Godot 3.5). The modding Discord API docs, `mod_main.gd` conventions, and all
published source code are GDScript. All mod files in this repo use `.gd` extensions accordingly.

---

## Capability matrix (Godot 3.5 GDScript)

| Capability | Status | Notes |
|---|---|---|
| **HTTPS requests** | ✅ Supported | `HTTPRequest` node; Godot 3.5 bundles Mozilla CA root bundle, so public Let's Encrypt certs are trusted without extra config |
| **Token persistence** | ✅ Supported | `ConfigFile` writes to `user://yomih_tourney.cfg`; survives game restarts |
| **Read local replay files** | ✅ Supported | `Directory` + `File` classes; replay path is deterministic (`user://replays/` or known game path) |
| **File picker (native)** | ⚠️ Limited | No native dialog in Godot 3.5 GDScript; work-around is listing replay directory and presenting in-game scroll list (sufficient for MVP) |
| **OS.shell_open()** | ✅ Supported | Works on Windows/Linux/Mac; used for Steam profile deep-links (`steam://url/SteamIDPage/...`) |
| **JSON encode/decode** | ✅ Supported | `JSON.parse()` and `to_json()` built-in |
| **UI scene additions** | ✅ Supported | Mods hook into the game scene tree; standard pattern for YOMIH mods |

---

## Go / no-go decision

**GO.** All blocking capabilities exist natively in Godot 3.5:
- HTTPS to our API works with public PKI (Let's Encrypt).
- JWT stored in `ConfigFile` is adequate for a game mod (not a browser, no XSS risk).
- Replay listing via `Directory` + scroll UI replaces a native file picker without loss of function.
- `OS.shell_open()` handles Steam profile links.

**No companion app needed at this time.** If the game's mod sandbox is found to restrict
`HTTPRequest` at runtime (some Godot builds disable it in exported projects), add a note to
fall back to a companion HTTP helper executable reading the same `ConfigFile`.

---

## Replay directory path (discovered from sample files)

The sample replays provided are named `PlayerA_v_PlayerB_YYYY-M-D-HH-MM-SS.replay`.
In Godot 3.5, the default user data path is:
- **Windows:** `%APPDATA%\Godot\app_userdata\Your Only Move Is HUSTLE\`
- **Linux:** `~/.local/share/godot/app_userdata/Your Only Move Is HUSTLE/`

The mod should scan that directory (or game-provided path) for `.replay` files when the
player opens the replay submit screen.

---

## Spike script

See `http_spike.gd` in this directory — attach to any Node in the game scene to verify
`HTTPRequest` connectivity to the tournament API during development.
