extends Control
# Tournament list screen — shows upcoming OPEN/CHECK_IN tournaments.
# Players can register or check in from here.

signal open_tournament(tournament_data)
signal open_calendar
signal open_create

var _tournaments := []

onready var _list        : ItemList = $VBox/TournamentList
onready var _status      : Label    = $VBox/StatusLabel
onready var _refresh_btn : Button   = $HBox/RefreshButton
onready var _calendar_btn: Button   = $HBox/CalendarButton
onready var _create_btn  : Button   = $HBox/CreateButton


func _ready() -> void:
	Api.connect("api_response", self, "_on_api_response")
	_refresh_btn.connect("pressed",  self, "_refresh")
	_calendar_btn.connect("pressed", self, "_on_calendar")
	_create_btn.connect("pressed",   self, "_on_create")
	_list.connect("item_activated",  self, "_on_item_activated")
	_refresh()


func _refresh() -> void:
	_status.text = "Loading tournaments..."
	_list.clear()
	Api.get_json("/tournaments?status=OPEN&limit=50")


func _on_api_response(endpoint: String, status_code: int, body) -> void:
	if not endpoint.contains("/tournaments"):
		return
	if status_code != 200:
		_status.text = "Failed to load tournaments."
		return

	_tournaments = body.get("tournaments", [])
	_list.clear()

	if _tournaments.empty():
		_status.text = "No open tournaments right now."
		return

	for t in _tournaments:
		var label := "%s  [%s]  %s" % [
			t.get("title", "?"),
			t.get("type", "?").replace("_", " ").to_lower().capitalize(),
			_format_dt(t.get("startsAt", "")),
		]
		_list.add_item(label)

	_status.text = ""


func _on_item_activated(index: int) -> void:
	if index < _tournaments.size():
		emit_signal("open_tournament", _tournaments[index])


func _on_calendar() -> void:
	emit_signal("open_calendar")


func _on_create() -> void:
	emit_signal("open_create")


func _format_dt(iso: String) -> String:
	if iso == "":
		return "?"
	# Simple display — show date and time portion only
	return iso.substr(0, 16).replace("T", " ")
