extends Control
# Replay submit screen — lists local .replay files and uploads the selected one.
# Uses Directory to scan the YOMIH replay folder (no native file picker in Godot 3.5).

var _tournament_id := ""
var _match_id      := ""
var _replay_files  := []   # Array of { "name": String, "path": String }

onready var _list      : ItemList = $VBox/ReplayList
onready var _upload_btn: Button   = $HBox/UploadButton
onready var _status    : Label    = $VBox/StatusLabel

# Godot 3.5 user data replay path (Windows: %APPDATA%\Godot\app_userdata\...\replays)
const REPLAY_SUBDIR := "replays"


func _ready() -> void:
	_upload_btn.connect("pressed", self, "_on_upload")
	Api.connect("api_response",    self, "_on_api_response")
	_upload_btn.disabled = true


func load_match(tournament_id: String, match_id: String) -> void:
	_tournament_id = tournament_id
	_match_id      = match_id
	_status.text   = "Select a replay file to submit."
	_scan_replays()


func _scan_replays() -> void:
	_replay_files.clear()
	_list.clear()

	var dir := Directory.new()
	var base_path := "user://" + REPLAY_SUBDIR

	if dir.open(base_path) != OK:
		# Try the OS-absolute path as fallback
		base_path = OS.get_user_data_dir() + "/" + REPLAY_SUBDIR
		if dir.open(base_path) != OK:
			_status.text = "Replay folder not found. Play a match first."
			return

	dir.list_dir_begin(true, true)
	var fname := dir.get_next()
	while fname != "":
		if fname.ends_with(".replay"):
			_replay_files.append({ "name": fname, "path": base_path + "/" + fname })
			_list.add_item(fname)
		fname = dir.get_next()
	dir.list_dir_end()

	if _replay_files.empty():
		_status.text = "No replay files found."
	else:
		_status.text = "Select a replay, then click Upload."
		_list.connect("item_selected", self, "_on_item_selected")


func _on_item_selected(_index: int) -> void:
	_upload_btn.disabled = false


func _on_upload() -> void:
	var idx := _list.get_selected_items()
	if idx.empty():
		return

	var file_info : Dictionary = _replay_files[idx[0]]
	var file := File.new()
	if file.open(file_info["path"], File.READ) != OK:
		_status.text = "Could not read file: " + file_info["name"]
		return

	var bytes : PoolByteArray = file.get_buffer(file.get_len())
	file.close()

	_status.text  = "Uploading…"
	_upload_btn.disabled = true

	# Godot 3.5 HTTPRequest doesn't natively support multipart; we manually
	# build the multipart body with the Content-Type boundary.
	var boundary := "----YomiTourneyBoundary"
	var crlf     := "\r\n"
	var header   := (
		"--" + boundary + crlf +
		"Content-Disposition: form-data; name=\"file\"; filename=\"" + file_info["name"] + "\"" + crlf +
		"Content-Type: application/octet-stream" + crlf + crlf
	)
	var footer   := crlf + "--" + boundary + "--" + crlf

	var body := PoolByteArray()
	body.append_array(header.to_utf8())
	body.append_array(bytes)
	body.append_array(footer.to_utf8())

	var token   := Config.get_token()
	var headers := PoolStringArray([
		"Content-Type: multipart/form-data; boundary=" + boundary,
		"Authorization: Bearer " + token,
	])

	var http := HTTPRequest.new()
	add_child(http)
	http.connect("request_completed", self, "_on_upload_complete", [http])
	http.request_raw(
		Config.API_BASE + "/matches/" + _match_id + "/replay",
		headers, true, HTTPClient.METHOD_POST, body
	)


func _on_upload_complete(
	result: int, response_code: int,
	_headers: PoolStringArray, body: PoolByteArray,
	http: HTTPRequest
) -> void:
	http.queue_free()
	_upload_btn.disabled = false

	if result != HTTPRequest.RESULT_SUCCESS or response_code >= 400:
		var parsed = JSON.parse(body.get_string_from_utf8())
		var msg : String = "Upload failed (HTTP %d)" % response_code
		if parsed.error == OK and typeof(parsed.result) == TYPE_DICTIONARY:
			msg = parsed.result.get("error", msg)
		_status.text = msg
		return

	_status.text = "Replay submitted! Processing in background — check back for winner result."
