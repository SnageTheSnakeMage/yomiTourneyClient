extends Control
# Next opponent dashboard — shows who the authenticated player fights next,
# in which tournament and round, with a Steam profile link.

onready var _info_label   : Label  = $VBox/InfoLabel
onready var _steam_btn    : Button = $VBox/SteamButton
onready var _replay_btn   : Button = $VBox/ReplayButton
onready var _status_label : Label  = $VBox/StatusLabel

var _steam_profile_url := ""
var _match_id          := ""
var _tournament_id     := ""


func _ready() -> void:
	Api.connect("api_response", self, "_on_api_response")
	_steam_btn.connect("pressed",  self, "_open_steam")
	_replay_btn.connect("pressed", self, "_open_replay_submit")
	_steam_btn.visible  = false
	_replay_btn.visible = false
	_status_label.text  = "Loading…"
	Api.get_json("/me/next-match")


func _on_api_response(endpoint: String, status_code: int, body) -> void:
	if not endpoint.ends_with("/me/next-match"):
		return

	if status_code != 200:
		_status_label.text = "Failed to load next match."
		return

	var match_data = body.get("match", null)
	if match_data == null:
		_info_label.text  = "No pending matches — you're all caught up!"
		_status_label.text = ""
		return

	var opponent = body.get("opponent", {})
	_steam_profile_url = body.get("steamProfileUrl", "")
	_match_id          = match_data.get("id", "")
	_tournament_id     = match_data.get("tournament", {}).get("id", "")

	var opp_name : String = (
		opponent.get("displayName", opponent.get("steamId", "Unknown"))
	)
	var tournament_title : String = match_data.get("tournament", {}).get("title", "?")
	var round            : int    = match_data.get("round", 0)

	_info_label.text = (
		"Tournament: %s\nRound: %d\nOpponent: %s" % [tournament_title, round, opp_name]
	)
	_status_label.text = ""
	_steam_btn.visible  = _steam_profile_url != ""
	_replay_btn.visible = _match_id != ""


func _open_steam() -> void:
	if _steam_profile_url != "":
		OS.shell_open(_steam_profile_url)


func _open_replay_submit() -> void:
	# Signal the mod root to open replay submit for this match
	get_tree().get_root().get_node("TournamentMod").call(
		"_show_replay_submit", _tournament_id, _match_id
	)
