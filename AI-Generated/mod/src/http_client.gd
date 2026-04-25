extends Node
# Singleton: Api
# Thin wrapper around Godot 3.5 HTTPRequest for JSON REST calls.
# Emits api_response(endpoint, status_code, body_dict) when complete.

signal api_response(endpoint, status_code, body)

# Queue so requests don't stomp each other
var _queue := []
var _busy  := false

# Created programmatically because this script is loaded as a plain-script autoload
# (no .tscn), so there is no scene tree to read $HTTPRequest from.
var _http : HTTPRequest


func _ready() -> void:
	_http = HTTPRequest.new()
	add_child(_http)
	_http.connect("request_completed", self, "_on_request_completed")


# Convenience shorthands -------------------------------------------------

func get_json(endpoint: String) -> void:
	_enqueue("GET", endpoint, {})


func post_json(endpoint: String, body: Dictionary) -> void:
	_enqueue("POST", endpoint, body)


func delete_req(endpoint: String) -> void:
	_enqueue("DELETE", endpoint, {})


# Internal ---------------------------------------------------------------

func _enqueue(method: String, endpoint: String, body: Dictionary) -> void:
	_queue.append({ "method": method, "endpoint": endpoint, "body": body })
	if not _busy:
		_process_next()


func _process_next() -> void:
	if _queue.empty():
		_busy = false
		return
	_busy = true
	var req = _queue.pop_front()
	_send(req.method, req.endpoint, req.body)


func _send(method: String, endpoint: String, body: Dictionary) -> void:
	var url     := Config.API_BASE + endpoint
	var token   := Config.get_token()
	var headers := PoolStringArray(["Content-Type: application/json"])
	if token != "":
		headers.append("Authorization: Bearer " + token)

	var method_enum: int
	match method:
		"GET":    method_enum = HTTPClient.METHOD_GET
		"POST":   method_enum = HTTPClient.METHOD_POST
		"DELETE": method_enum = HTTPClient.METHOD_DELETE
		_:        method_enum = HTTPClient.METHOD_GET

	var body_str := JSON.print(body) if method != "GET" else ""
	var err := _http.request(url, headers, true, method_enum, body_str)
	if err != OK:
		emit_signal("api_response", endpoint, -1, {})
		_process_next()


func _on_request_completed(
	result: int,
	response_code: int,
	_headers: PoolStringArray,
	body: PoolByteArray
) -> void:
	var parsed := {}
	if body.size() > 0:
		var raw := body.get_string_from_utf8()
		var res  := JSON.parse(raw)
		if res.error == OK:
			parsed = res.result

	# If the server returns 401, clear stored token so next open shows login
	if response_code == 401:
		Config.clear_auth()

	emit_signal("api_response", _current_endpoint(), response_code, parsed)
	_busy = false
	_process_next()


func _current_endpoint() -> String:
	# Approximate — good enough for logging; improve if multi-inflight needed
	return "unknown"
