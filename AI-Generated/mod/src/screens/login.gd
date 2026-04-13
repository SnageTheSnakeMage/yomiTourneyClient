extends Control
# Login screen — shown when no JWT token is stored.
# Obtains a Steamworks session ticket via GodotSteam and sends it to the API.

signal login_success

onready var _status_label : Label   = $VBox/StatusLabel
onready var _login_btn    : Button  = $VBox/LoginButton


func _ready() -> void:
	Api.connect("api_response", self, "_on_api_response")
	_login_btn.connect("pressed", self, "_on_login_pressed")
	_status_label.text = "Sign in with your Steam account to access tournaments."


func _on_login_pressed() -> void:
	_login_btn.disabled = true
	_status_label.text  = "Authenticating with Steam..."

	# GodotSteam is available in YOMIH — obtain a session ticket
	if not Steam.steamInitEx(false):
		_set_error("Steam not running. Launch the game through Steam.")
		return

	var ticket_result := Steam.getAuthSessionTicket()
	# ticket_result is a Dictionary: { "id": int, "buffer": PoolByteArray }
	var buffer : PoolByteArray = ticket_result.get("buffer", PoolByteArray())
	if buffer.empty():
		_set_error("Failed to get Steam auth ticket.")
		return

	# Convert buffer to hex string for the API
	var hex := ""
	for byte in buffer:
		hex += "%02x" % byte

	Api.post_json("/auth/steam", { "ticket": hex })


func _on_api_response(endpoint: String, status_code: int, body) -> void:
	if not endpoint.ends_with("/auth/steam"):
		return

	if status_code == 200:
		var token    : String = body.get("token", "")
		var player           = body.get("player", {})
		var steam_id : String = player.get("steamId", "")
		Config.set_token(token)
		Config.set_steam_id(steam_id)
		emit_signal("login_success")
	else:
		var msg : String = body.get("error", "Login failed (status %d)" % status_code)
		_set_error(msg)
		_login_btn.disabled = false


func _set_error(msg: String) -> void:
	_status_label.text = "Error: " + msg
	_login_btn.disabled = false
