extends Control
# Bracket viewer — renders all matches in a tournament.
# Each match node shows both players (Steam display name + avatar placeholder),
# match status, and a link to the associated replay if available.

var _tournament_id := ""

onready var _container : VBoxContainer = $Scroll/VBox
onready var _status    : Label         = $StatusLabel


func _ready() -> void:
	Api.connect("api_response", self, "_on_api_response")


func load_bracket(tournament_id: String) -> void:
	_tournament_id = tournament_id
	_status.text   = "Loading bracket..."
	Api.get_json("/tournaments/" + tournament_id + "/bracket")


func _on_api_response(endpoint: String, status_code: int, body) -> void:
	if not (_tournament_id + "/bracket") in endpoint:
		return
	if status_code != 200:
		_status.text = body.get("error", "Failed to load bracket.")
		return

	var matches = body.get("matches", [])
	_status.text = ""
	_build_bracket(matches)


func _build_bracket(matches: Array) -> void:
	for child in _container.get_children():
		child.queue_free()

	# Group by round
	var rounds := {}
	for m in matches:
		var r : int = m.get("round", 0)
		if not rounds.has(r):
			rounds[r] = []
		rounds[r].append(m)

	var sorted_rounds := rounds.keys()
	sorted_rounds.sort()

	for round_num in sorted_rounds:
		var round_label := Label.new()
		var side = matches[0].get("bracketSide", "")
		round_label.text = "Round %d" % round_num + (" [%s]" % side if side else "")
		_container.add_child(round_label)

		for m in rounds[round_num]:
			_container.add_child(_build_match_row(m))


func _build_match_row(m: Dictionary) -> HBoxContainer:
	var row := HBoxContainer.new()

	var player_a = m.get("playerA", {})
	var player_b = m.get("playerB", {})
	var winner   = m.get("winner",  {})
	var status   : String = m.get("status", "PENDING")

	var a_name  := _player_label(player_a, winner.get("id", "") == player_a.get("id", ""))
	var vs_lbl  := Label.new()
	vs_lbl.text  = "  vs  "
	var b_name  := _player_label(player_b, winner.get("id", "") == player_b.get("id", ""))
	var stat_lbl := Label.new()
	stat_lbl.text = "  [%s]" % status.to_lower().capitalize()

	row.add_child(a_name)
	row.add_child(vs_lbl)
	row.add_child(b_name)
	row.add_child(stat_lbl)

	# Replay link — opens Steam profile URL in browser as a proxy for replay
	if status == "COMPLETED":
		var replay_btn := Button.new()
		replay_btn.text = "▶ Replay"
		var match_id : String = m.get("id", "")
		replay_btn.connect("pressed", self, "_open_match_replays", [match_id])
		row.add_child(replay_btn)

	# Steam profile links for each player
	for p in [player_a, player_b]:
		var steam_id : String = p.get("steamId", "")
		if steam_id != "":
			var profile_btn := Button.new()
			profile_btn.text = "Steam ↗"
			profile_btn.connect("pressed", self, "_open_steam_profile", [steam_id])
			row.add_child(profile_btn)

	return row


func _player_label(player: Dictionary, is_winner: bool) -> Label:
	var lbl := Label.new()
	var name : String = player.get("displayName", player.get("steamId", "TBD"))
	lbl.text = ("★ " if is_winner else "") + name
	return lbl


func _open_steam_profile(steam_id: String) -> void:
	OS.shell_open("steam://url/SteamIDPage/" + steam_id)


func _open_match_replays(match_id: String) -> void:
	# Fetch match to find replay IDs and then link
	Api.get_json("/matches/" + match_id)
