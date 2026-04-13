extends Node
# Singleton: Config
# Loaded at game startup; exposes API base URL and cached JWT.
# Usage: Config.api_base, Config.get_token(), Config.set_token(t)

const CFG_PATH := "user://yomih_tourney.cfg"
const API_BASE := "https://tourney.example.com/v1"  # Replace with real domain

var _cfg := ConfigFile.new()
var _loaded := false


func _ready() -> void:
	_load()


func _load() -> void:
	var err := _cfg.load(CFG_PATH)
	_loaded = (err == OK)


func get_token() -> String:
	return _cfg.get_value("auth", "jwt", "") as String


func set_token(token: String) -> void:
	_cfg.set_value("auth", "jwt", token)
	_cfg.save(CFG_PATH)


func get_steam_id() -> String:
	return _cfg.get_value("auth", "steam_id", "") as String


func set_steam_id(steam_id: String) -> void:
	_cfg.set_value("auth", "steam_id", steam_id)
	_cfg.save(CFG_PATH)


func clear_auth() -> void:
	_cfg.erase_section("auth")
	_cfg.save(CFG_PATH)


func is_authenticated() -> bool:
	return get_token() != ""
