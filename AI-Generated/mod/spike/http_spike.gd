extends Node
# -----------------------------------------------------------------------
# YOMIH Tournament Mod — modding capabilities spike
#
# Attach this to any Node in the YOMIH scene tree during development.
# Run the game, open the node scene, and check the Output console for
# results. Remove before production release.
#
# Tests:
#   1. HTTPS GET to the tournament API health endpoint
#   2. ConfigFile token read/write (JWT persistence)
#   3. Directory scan of the replay folder
#   4. OS.shell_open() with a Steam profile URL
# -----------------------------------------------------------------------

const API_BASE = "https://tourney.example.com"  # replace with real URL

onready var _http := $HTTPRequest


func _ready() -> void:
	_test_config_file()
	_test_replay_directory()
	_test_https()
	# Uncomment to test shell_open (opens browser):
	# _test_shell_open()


# --- 1. HTTPS connectivity -------------------------------------------

func _test_https() -> void:
	print("[spike] Testing HTTPS GET ", API_BASE, "/v1/time ...")
	var err := _http.request(API_BASE + "/v1/time", [], true, HTTPClient.METHOD_GET)
	if err != OK:
		print("[spike] FAIL: HTTPRequest.request() returned error ", err)


func _on_HTTPRequest_request_completed(
	result: int, response_code: int,
	_headers: PoolStringArray, body: PoolByteArray
) -> void:
	if result == HTTPRequest.RESULT_SUCCESS:
		var text := body.get_string_from_utf8()
		print("[spike] HTTPS OK  status=", response_code, "  body=", text)
	else:
		print("[spike] HTTPS FAIL  result=", result)


# --- 2. ConfigFile token persistence ---------------------------------

func _test_config_file() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("auth", "jwt", "test.token.value")
	cfg.set_value("auth", "steam_id", "76561199999999999")
	var err := cfg.save("user://yomih_tourney.cfg")
	if err == OK:
		print("[spike] ConfigFile write: OK  path=", OS.get_user_data_dir(), "/yomih_tourney.cfg")
	else:
		print("[spike] ConfigFile write FAIL  err=", err)

	var cfg2 := ConfigFile.new()
	cfg2.load("user://yomih_tourney.cfg")
	var token = cfg2.get_value("auth", "jwt", "")
	print("[spike] ConfigFile read:  jwt=", token)


# --- 3. Replay directory scan ----------------------------------------

func _test_replay_directory() -> void:
	# YOMIH stores replays under user data; adjust path per OS if needed.
	var replay_dir := "user://replays"
	var dir := Directory.new()

	if dir.open(replay_dir) == OK:
		dir.list_dir_begin(true, true)
		var fname := dir.get_next()
		var count := 0
		while fname != "":
			if fname.ends_with(".replay"):
				count += 1
				print("[spike] Found replay: ", fname)
			fname = dir.get_next()
		dir.list_dir_end()
		print("[spike] Directory scan OK  found=", count, " replays")
	else:
		print("[spike] Directory '", replay_dir, "' not found — no replays uploaded yet (OK)")


# --- 4. OS.shell_open ------------------------------------------------

func _test_shell_open() -> void:
	var steam_id := "76561199491220133"
	var url := "steam://url/SteamIDPage/" + steam_id
	OS.shell_open(url)
	print("[spike] OS.shell_open() called for: ", url)
