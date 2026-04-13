extends Control
# Calendar screen — displays a month grid of days that have tournaments.

signal open_tournament(tournament_data)

var _year  : int = 0
var _month : int = 0
var _tournaments_by_day := {}   # day (int) -> Array of tournament dicts

onready var _month_label  : Label    = $VBox/MonthLabel
onready var _grid         : GridContainer = $VBox/DayGrid
onready var _prev_btn     : Button   = $HBox/PrevMonth
onready var _next_btn     : Button   = $HBox/NextMonth
onready var _status_label : Label    = $VBox/StatusLabel


func _ready() -> void:
	Api.connect("api_response", self, "_on_api_response")
	_prev_btn.connect("pressed", self, "_prev_month")
	_next_btn.connect("pressed", self, "_next_month")
	var now := OS.get_datetime()
	_year  = now["year"]
	_month = now["month"]
	_load_month()


func _load_month() -> void:
	_month_label.text = "%d / %02d" % [_year, _month]
	_status_label.text = "Loading..."
	_tournaments_by_day.clear()

	# Fetch the whole month
	var from_str := "%d-%02d-01T00:00:00Z" % [_year, _month]
	var last_day := _days_in_month(_year, _month)
	var to_str   := "%d-%02d-%02dT23:59:59Z" % [_year, _month, last_day]
	Api.get_json("/tournaments?from=" + from_str + "&to=" + to_str + "&limit=200")


func _on_api_response(endpoint: String, status_code: int, body) -> void:
	if not endpoint.contains("/tournaments"):
		return
	if status_code != 200:
		_status_label.text = "Failed to load calendar."
		return

	_status_label.text = ""
	var tournaments = body.get("tournaments", [])

	# Bucket by day
	_tournaments_by_day.clear()
	for t in tournaments:
		var iso : String = t.get("startsAt", "")
		if iso == "":
			continue
		var day_str := iso.substr(8, 2)
		var day := int(day_str)
		if not _tournaments_by_day.has(day):
			_tournaments_by_day[day] = []
		_tournaments_by_day[day].append(t)

	_rebuild_grid()


func _rebuild_grid() -> void:
	for child in _grid.get_children():
		child.queue_free()

	var last_day := _days_in_month(_year, _month)
	for day in range(1, last_day + 1):
		var btn := Button.new()
		var has  := _tournaments_by_day.has(day)
		btn.text = str(day) + (" ●" if has else "")
		btn.hint_tooltip = (
			str(_tournaments_by_day[day].size()) + " tournament(s)" if has else ""
		)
		if has:
			var tournaments_for_day = _tournaments_by_day[day]
			btn.connect("pressed", self, "_on_day_pressed", [tournaments_for_day])
		_grid.add_child(btn)


func _on_day_pressed(tournaments: Array) -> void:
	if tournaments.size() == 1:
		emit_signal("open_tournament", tournaments[0])
	else:
		# Multiple tournaments — show the first one for now (could show a list)
		emit_signal("open_tournament", tournaments[0])


func _prev_month() -> void:
	_month -= 1
	if _month < 1:
		_month = 12
		_year -= 1
	_load_month()


func _next_month() -> void:
	_month += 1
	if _month > 12:
		_month = 1
		_year += 1
	_load_month()


func _days_in_month(year: int, month: int) -> int:
	var days := [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
	if month == 2:
		var leap := (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)
		return 29 if leap else 28
	return days[month]
