extends Node
# mod_main.gd — YOMIH Tournament Mod entry point.
#
# Loaded by YOMIH's mod loader. Adds a "Tournaments" button to the main menu
# and manages the full-screen tournament panel.
#
# Scene tree this mod adds:
#   /root/
#     Autoload: Config  (config.gd)
#     Autoload: Api     (http_client.gd — has HTTPRequest child)
#     TournamentPanel   (CanvasLayer covering the game UI)

const LoginScene           := preload("res://mods/yomih_tourney/src/screens/login.tscn")
const TournamentListScene  := preload("res://mods/yomih_tourney/src/screens/tournament_list.tscn")
const TournamentDetailScene:= preload("res://mods/yomih_tourney/src/screens/tournament_detail.tscn")
const CalendarScene        := preload("res://mods/yomih_tourney/src/screens/calendar.tscn")
const BracketScene         := preload("res://mods/yomih_tourney/src/screens/bracket_viewer.tscn")
const ReplaySubmitScene    := preload("res://mods/yomih_tourney/src/screens/replay_submit.tscn")
const NextOpponentScene    := preload("res://mods/yomih_tourney/src/screens/next_opponent.tscn")
const CreateTournamentScene:= preload("res://mods/yomih_tourney/src/screens/create_tournament.tscn")

var _panel  : CanvasLayer
var _current_screen : Control


func _ready() -> void:
	# Build the overlay panel
	_panel = CanvasLayer.new()
	_panel.layer = 128
	_panel.visible = false
	add_child(_panel)

	# Inject "Tournaments" button into the main menu
	# (YOMIH exposes the main menu node via a known path; adjust if the path changes)
	call_deferred("_inject_menu_button")


func _inject_menu_button() -> void:
	var menu = get_node_or_null("/root/MainMenu/VBoxContainer")
	if menu == null:
		# Retry next frame if the menu isn't ready yet
		yield(get_tree(), "idle_frame")
		_inject_menu_button()
		return

	var btn := Button.new()
	btn.text = "TOURNAMENTS"
	btn.connect("pressed", self, "_open_panel")
	menu.add_child(btn)
	menu.move_child(btn, 0)


func _open_panel() -> void:
	_panel.visible = true
	if Config.is_authenticated():
		_show_tournament_list()
	else:
		_show_login()


func _close_panel() -> void:
	_panel.visible = false
	if _current_screen:
		_current_screen.queue_free()
		_current_screen = null


# ---- Screen transitions ------------------------------------------------

func _show_login() -> void:
	_swap_screen(LoginScene.instance())
	_current_screen.connect("login_success", self, "_show_tournament_list")


func _show_tournament_list() -> void:
	var screen = TournamentListScene.instance()
	_swap_screen(screen)
	screen.connect("open_tournament", self, "_show_tournament_detail")
	screen.connect("open_calendar",   self, "_show_calendar")
	screen.connect("open_create",     self, "_show_create_tournament")


func _show_tournament_detail(t_data: Dictionary) -> void:
	var screen = TournamentDetailScene.instance()
	_swap_screen(screen)
	screen.connect("open_bracket",      self, "_show_bracket")
	screen.connect("open_replay_submit",self, "_show_replay_submit")
	screen.load_tournament(t_data)


func _show_calendar() -> void:
	_swap_screen(CalendarScene.instance())


func _show_bracket(tournament_id: String) -> void:
	var screen = BracketScene.instance()
	_swap_screen(screen)
	screen.load_bracket(tournament_id)


func _show_replay_submit(tournament_id: String, match_id: String) -> void:
	var screen = ReplaySubmitScene.instance()
	_swap_screen(screen)
	screen.load_match(tournament_id, match_id)


func _show_create_tournament() -> void:
	var screen = CreateTournamentScene.instance()
	_swap_screen(screen)
	screen.connect("created", self, "_show_tournament_list")


func _swap_screen(new_screen: Control) -> void:
	if _current_screen:
		_current_screen.queue_free()
	_current_screen = new_screen
	_panel.add_child(_current_screen)

	# Back button (all screens share one)
	var back := Button.new()
	back.text = "← Back"
	back.rect_position = Vector2(8, 8)
	back.connect("pressed", self, "_show_tournament_list")
	_current_screen.add_child(back)

	# Close button
	var close := Button.new()
	close.text = "✕ Close"
	close.rect_position = Vector2(80, 8)
	close.connect("pressed", self, "_close_panel")
	_current_screen.add_child(close)
