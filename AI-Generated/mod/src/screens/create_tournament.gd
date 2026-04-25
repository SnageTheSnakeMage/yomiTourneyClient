extends Control
# Create tournament form — covers title, description, type, dates, player count,
# and character whitelist (populated from installed mod IDs).

signal created

onready var _title_edit      : LineEdit   = $Form/TitleEdit
onready var _desc_edit       : TextEdit   = $Form/DescEdit
onready var _type_option     : OptionButton = $Form/TypeOption
onready var _starts_edit     : LineEdit   = $Form/StartsEdit
onready var _checkin_open    : LineEdit   = $Form/CheckInOpenEdit
onready var _checkin_close   : LineEdit   = $Form/CheckInCloseEdit
onready var _min_spin        : SpinBox    = $Form/MinPlayers
onready var _max_spin        : SpinBox    = $Form/MaxPlayers
onready var _char_list       : ItemList   = $Form/CharacterList
onready var _whitelist_check : CheckButton= $Form/WhitelistToggle
onready var _submit_btn      : Button     = $Form/SubmitButton
onready var _status_label    : Label      = $Form/StatusLabel

# Known base game characters (always available)
const BASE_CHARACTERS := ["Cowboy", "Wizard", "Ninja", "Samurai", "Swordfighter"]


func _ready() -> void:
	Api.connect("api_response", self, "_on_api_response")
	_submit_btn.connect("pressed", self, "_on_submit")

	_type_option.add_item("Single Elimination")
	_type_option.add_item("Double Elimination")
	_type_option.add_item("Round Robin")

	_min_spin.min_value = 2
	_min_spin.max_value = 256
	_min_spin.value     = 4
	_max_spin.min_value = 2
	_max_spin.max_value = 256
	_max_spin.value     = 16

	_populate_character_list()


func _populate_character_list() -> void:
	_char_list.clear()
	# Base game characters
	for c in BASE_CHARACTERS:
		_char_list.add_item(c)
	# Installed Workshop mods — scan the mods directory for character IDs
	var mod_chars := _scan_installed_mod_characters()
	for c in mod_chars:
		_char_list.add_item(c)


func _scan_installed_mod_characters() -> Array:
	# Workshop mods live at:
	#   Windows: <steam>/steamapps/workshop/content/2212330/<mod_id>/...
	# We look for mod_id directories and match F-<hex>__<name> patterns.
	var results := []
	# Heuristic: scan known paths; adjust if game's mod loader exposes a better API
	var search_paths := [
		OS.get_user_data_dir() + "/../../../workshop/content/2212330",
	]
	for base in search_paths:
		var dir := Directory.new()
		if dir.open(base) != OK:
			continue
		dir.list_dir_begin(true, true)
		var entry := dir.get_next()
		while entry != "":
			if dir.current_is_dir():
				# Each sub-directory is a Workshop item ID; look for characters inside
				var char_id := _detect_character_id(base + "/" + entry)
				if char_id != "":
					results.append(char_id)
			entry = dir.get_next()
		dir.list_dir_end()
	return results


func _detect_character_id(mod_path: String) -> String:
	# A character mod typically contains a file named after the character.
	# The F-<hex>__<Name> pattern is the canonical ID.
	var dir := Directory.new()
	if dir.open(mod_path) != OK:
		return ""
	dir.list_dir_begin(true, true)
	var f := dir.get_next()
	while f != "":
		if f.match("F-*__*"):
			dir.list_dir_end()
			return f.get_basename()  # strip extension if any
		f = dir.get_next()
	dir.list_dir_end()
	return ""


func _on_submit() -> void:
	var title : String = _title_edit.text.strip_edges()
	if title == "":
		_status_label.text = "Title is required."
		return

	var starts : String = _starts_edit.text.strip_edges()
	if starts == "":
		_status_label.text = "Start date/time is required (ISO 8601, e.g. 2026-06-01T18:00:00Z)."
		return

	var types_map := ["SINGLE_ELIM", "DOUBLE_ELIM", "ROUND_ROBIN"]
	var type_str  : String = types_map[_type_option.selected]

	# Build character rules from selected list items
	var char_rules := []
	if _whitelist_check.pressed:
		for idx in _char_list.get_selected_items():
			char_rules.append({
				"mode":        "WHITELIST",
				"characterId": _char_list.get_item_text(idx),
			})

	var payload := {
		"title":           title,
		"description":     _desc_edit.text,
		"type":            type_str,
		"startsAt":        starts,
		"checkInOpensAt":  _checkin_open.text.strip_edges(),
		"checkInClosesAt": _checkin_close.text.strip_edges(),
		"minPlayers":      int(_min_spin.value),
		"maxPlayers":      int(_max_spin.value),
	}
	if not char_rules.empty():
		payload["characterRules"] = char_rules

	_submit_btn.disabled = true
	_status_label.text   = "Creating…"
	Api.post_json("/tournaments", payload)


func _on_api_response(endpoint: String, status_code: int, body) -> void:
	if not endpoint.ends_with("/tournaments"):
		return
	_submit_btn.disabled = false
	if status_code == 201:
		_status_label.text = "Tournament created!"
		emit_signal("created")
	else:
		var msg : String = body.get("error", "Failed to create tournament (HTTP %d)" % status_code)
		_status_label.text = msg
