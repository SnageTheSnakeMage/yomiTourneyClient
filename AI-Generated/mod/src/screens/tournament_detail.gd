extends Control
# Tournament detail — shows description, rules, player list, and action buttons.

signal open_bracket(tournament_id)
signal open_replay_submit(tournament_id, match_id)

var _tournament := {}
var _registrations := []

onready var _title_lbl    : Label  = $VBox/TitleLabel
onready var _desc_lbl     : Label  = $VBox/DescLabel
onready var _info_lbl     : Label  = $VBox/InfoLabel
onready var _player_list  : ItemList = $VBox/PlayerList
onready var _register_btn : Button   = $HBox/RegisterButton
onready var _checkin_btn  : Button   = $HBox/CheckInButton
onready var _bracket_btn  : Button   = $HBox/BracketButton
onready var _status_lbl   : Label    = $VBox/StatusLabel


func _ready() -> void:
	Api.connect("api_response", self, "_on_api_response")
	_register_btn.connect("pressed",  self, "_on_register")
	_checkin_btn.connect("pressed",   self, "_on_check_in")
	_bracket_btn.connect("pressed",   self, "_on_bracket")


func load_tournament(data: Dictionary) -> void:
	_tournament = data
	_refresh_ui()
	var tid : String = data.get("id", "")
	Api.get_json("/tournaments/" + tid + "/registrations")


func _refresh_ui() -> void:
	var t := _tournament
	_title_lbl.text = t.get("title", "")
	_desc_lbl.text  = t.get("description", "(no description)")
	_info_lbl.text  = (
		"Type: %s   Players: %d/%d\nStarts: %s\nCheck-in: %s – %s" % [
			t.get("type", "?"),
			t.get("_count", {}).get("registrations", 0),
			t.get("maxPlayers", 0),
			_fmt(t.get("startsAt", "")),
			_fmt(t.get("checkInOpensAt", "")),
			_fmt(t.get("checkInClosesAt", "")),
		]
	)

	var status : String = t.get("status", "")
	_register_btn.visible = (status == "OPEN")
	_checkin_btn.visible  = (status == "CHECK_IN")
	_bracket_btn.visible  = (status == "IN_PROGRESS" or status == "COMPLETED")


func _on_api_response(endpoint: String, status_code: int, body) -> void:
	var tid : String = _tournament.get("id", "")
	if endpoint.ends_with(tid + "/registrations") and status_code == 200:
		_registrations = body.get("registrations", [])
		_player_list.clear()
		for reg in _registrations:
			var p = reg.get("player", {})
			var name : String = p.get("displayName", p.get("steamId", "?"))
			var status : String = reg.get("status", "")
			_player_list.add_item("%s  [%s]" % [name, status.to_lower()])
		return

	if endpoint.ends_with(tid + "/register"):
		if status_code in [200, 201]:
			_status_lbl.text = "Registered!"
			Api.get_json("/tournaments/" + tid)
		else:
			_status_lbl.text = body.get("error", "Registration failed.")
		return

	if endpoint.ends_with(tid + "/check-in"):
		if status_code == 200:
			_status_lbl.text = "Checked in!"
		else:
			_status_lbl.text = body.get("error", "Check-in failed.")
		return

	if endpoint.ends_with("/tournaments/" + tid) and status_code == 200:
		_tournament = body.get("tournament", _tournament)
		_refresh_ui()


func _on_register() -> void:
	var tid : String = _tournament.get("id", "")
	Api.post_json("/tournaments/" + tid + "/register", {})


func _on_check_in() -> void:
	var tid : String = _tournament.get("id", "")
	Api.post_json("/tournaments/" + tid + "/check-in", {})


func _on_bracket() -> void:
	emit_signal("open_bracket", _tournament.get("id", ""))


func _fmt(iso: String) -> String:
	return iso.substr(0, 16).replace("T", " ") if iso != "" else "?"
