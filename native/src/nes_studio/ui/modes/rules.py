"""RULES — players, enemies, doors, dialogue, and winning.

Game *type* and physics moved to STYLE, where they belong: this mode is now
about what happens in the game, not what kind of game it is.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QLabel,
    QLineEdit,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ..widgets.forms import Card
from ..widgets.visuals import add_visual_choice, prepare_visual_selector, role_colour
from .base import Level, Mode, ModeContext, scroll_body


class RulesMode(Mode):
    """The engine's feature modules, one card each."""

    id = "RULES"
    title = "RULES"
    help_text = "Configure players, enemies, doors, dialogue, and winning."
    min_level = Level.MAKER

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(context, parent)
        self.setObjectName("rulesModePage")
        content = scroll_body(self, "rulesEditor")
        layout = QVBoxLayout(content)
        layout.setContentsMargins(20, 18, 20, 28)
        layout.setSpacing(10)

        # ---- player 1 ------------------------------------------------------
        player = Card("Player 1", parent=content)
        self.player_options: dict[str, QSpinBox] = {}
        for key, label, minimum, maximum, hint in (
            ("startX", "Start X", 0, 240, "Where the player appears, in pixels from the left."),
            ("startY", "Start Y", 16, 200, "Where the player appears, in pixels from the top."),
            ("walkSpeed", "Walk speed", 1, 4, ""),
            ("jumpHeight", "Jump height", 8, 40, ""),
            ("maxHp", "Max health", 0, 9, "0 means the player cannot be hurt."),
        ):
            control = QSpinBox(player)
            control.setObjectName(f"player{key[0].upper()}{key[1:]}Control")
            control.setRange(minimum, maximum)
            self.player_options[key] = control
            player.field(label, control, hint=hint)
        self.attack_button = QComboBox(player)
        self.attack_button.setObjectName("attackButtonSelector")
        prepare_visual_selector(self.attack_button, "Player attack button")
        for value, label, colour, glyph in (
            ("none", "No attack", "#787898", "–"),
            ("a", "A button", "#f87878", "A"),
            ("b", "B button", "#f8d878", "B"),
        ):
            add_visual_choice(self.attack_button, label, value, colour=colour, glyph=glyph)
        player.field("Attack", self.attack_button)
        layout.addWidget(player)

        # ---- player 2 ------------------------------------------------------
        player2 = Card("Player 2", "A second player on the same screen.", content)
        self.player2_enabled = player2.toggle("Enable Player 2")
        self.player2_enabled.setObjectName("player2Enabled")
        self.player2_options: dict[str, QSpinBox] = {}
        for key, label, minimum, maximum in (
            ("startX", "Start X", 0, 240),
            ("startY", "Start Y", 16, 200),
            ("walkSpeed", "Walk speed", 1, 4),
            ("jumpHeight", "Jump height", 8, 40),
            ("maxHp", "Max health", 0, 9),
        ):
            control = QSpinBox(player2)
            control.setObjectName(f"player2{key[0].upper()}{key[1:]}Control")
            control.setRange(minimum, maximum)
            self.player2_options[key] = control
            player2.field(label, control)
        layout.addWidget(player2)

        # ---- damage --------------------------------------------------------
        damage = Card("Damage", "What happens when the player is hit.", content)
        self.damage_amount = QSpinBox(damage)
        self.damage_amount.setObjectName("damageAmountControl")
        self.damage_amount.setRange(1, 9)
        damage.field("Damage per hit", self.damage_amount)
        self.damage_iframes = QSpinBox(damage)
        self.damage_iframes.setObjectName("damageIframesControl")
        self.damage_iframes.setRange(0, 120)
        damage.field(
            "Invincibility",
            self.damage_iframes,
            hint="Frames of mercy after a hit. 60 frames is one second.",
        )
        self.damage_respawn_hp = QSpinBox(damage)
        self.damage_respawn_hp.setObjectName("damageRespawnHpControl")
        self.damage_respawn_hp.setRange(1, 9)
        damage.field("Health on respawn", self.damage_respawn_hp)
        self.damage_checkpoints = damage.toggle("Respawn at checkpoints")
        self.damage_checkpoints.setObjectName("damageCheckpointsToggle")
        self.stomp_defeat = damage.toggle("Jumping on an enemy defeats it")
        self.stomp_defeat.setObjectName("stompDefeatToggle")
        self.stomp_bounce = QSpinBox(damage)
        self.stomp_bounce.setObjectName("stompBounceControl")
        self.stomp_bounce.setRange(1, 30)
        damage.field("Stomp bounce", self.stomp_bounce, hint="How high a stomp bounces you.")
        layout.addWidget(damage)

        # ---- pickups -------------------------------------------------------
        pickups = Card("Pickups", "Coins, hearts, keys — anything collectable.", content)
        self.pickups_enabled = pickups.toggle("Enable pickups")
        self.pickups_enabled.setObjectName("pickupsEnabled")
        layout.addWidget(pickups)

        # ---- spawn ---------------------------------------------------------
        spawn = Card("Spawn effect", "A character that appears on a trigger tile.", content)
        self.spawn_enabled = spawn.toggle("Effect when entering a trigger tile")
        self.spawn_enabled.setObjectName("spawnEffectEnabled")
        self.spawn_sprite = QComboBox(spawn)
        self.spawn_sprite.setObjectName("spawnEffectSprite")
        prepare_visual_selector(self.spawn_sprite, "Spawn effect sprite")
        spawn.field("Character", self.spawn_sprite)
        self.spawn_ttl = QSpinBox(spawn)
        self.spawn_ttl.setObjectName("spawnEffectLifetime")
        self.spawn_ttl.setRange(1, 120)
        self.spawn_ttl.setAccessibleName("Spawn effect lifetime in frames")
        spawn.field("Lasts for", self.spawn_ttl, hint="Frames before the effect disappears.")
        layout.addWidget(spawn)

        # ---- HUD -----------------------------------------------------------
        hud = Card("Heads-up display", parent=content)
        self.hud_enabled = hud.toggle("Show hearts for player health")
        self.hud_enabled.setObjectName("hudEnabled")
        self.hud_hint = QLabel(hud)
        self.hud_hint.setObjectName("hudSpriteHint")
        self.hud_hint.setWordWrap(True)
        hud.wide(self.hud_hint)
        layout.addWidget(hud)

        # ---- doors ---------------------------------------------------------
        doors = Card("Doors", "Teleport when the player enters a Door tile.", content)
        self.doors_enabled = doors.toggle("Enable doors")
        self.doors_enabled.setObjectName("doorsEnabled")
        self.doors_spawn_x = QSpinBox(doors)
        self.doors_spawn_x.setObjectName("doorsSpawnXControl")
        self.doors_spawn_x.setRange(0, 240)
        doors.field("Arrive at X", self.doors_spawn_x)
        self.doors_spawn_y = QSpinBox(doors)
        self.doors_spawn_y.setObjectName("doorsSpawnYControl")
        self.doors_spawn_y.setRange(16, 200)
        doors.field("Arrive at Y", self.doors_spawn_y)
        self.doors_target_bg = QSpinBox(doors)
        self.doors_target_bg.setObjectName("doorsTargetBgControl")
        self.doors_target_bg.setRange(-1, 9)
        self.doors_target_bg.setSpecialValueText("Same room")
        doors.field(
            "Go to background",
            self.doors_target_bg,
            hint="'Same room' is a shortcut inside one background; 0+ swaps to that background.",
        )
        layout.addWidget(doors)

        # ---- dialogue ------------------------------------------------------
        dialogue = Card("Dialogue", "What an NPC says when you stand next to it.", content)
        self.dialogue_enabled = dialogue.toggle("Enable NPC dialogue")
        self.dialogue_enabled.setObjectName("dialogueEnabled")
        self.dialogue_lines: dict[str, QLineEdit] = {}
        for key, label in (("text", "Line 1"), ("text2", "Line 2"), ("text3", "Line 3")):
            control = QLineEdit(dialogue)
            control.setObjectName(f"dialogue{key.title()}Input")
            control.setMaxLength(28)
            control.setPlaceholderText("up to 28 characters")
            self.dialogue_lines[key] = control
            dialogue.field(label, control)
        self.dialogue_proximity = QSpinBox(dialogue)
        self.dialogue_proximity.setObjectName("dialogueProximityControl")
        self.dialogue_proximity.setRange(1, 6)
        dialogue.field("Talk distance", self.dialogue_proximity, hint="In tiles.")
        self.dialogue_auto_close = QSpinBox(dialogue)
        self.dialogue_auto_close.setObjectName("dialogueAutoCloseControl")
        self.dialogue_auto_close.setRange(0, 240)
        self.dialogue_auto_close.setSpecialValueText("Stays open")
        dialogue.field("Close after", self.dialogue_auto_close, hint="Frames. 0 keeps it open.")
        self.dialogue_pause = dialogue.toggle("Pause the game while dialogue is open")
        self.dialogue_pause.setObjectName("dialoguePauseToggle")
        layout.addWidget(dialogue)

        # ---- winning -------------------------------------------------------
        win = Card("Winning", parent=content)
        self.win_enabled = win.toggle("This game can be won")
        self.win_enabled.setObjectName("winConditionEnabled")
        self.win_type = QComboBox(win)
        self.win_type.setObjectName("winTypeSelector")
        prepare_visual_selector(self.win_type, "Win condition type")
        add_visual_choice(
            self.win_type, "Reach a tile", "reach_tile", colour="#78d878", glyph="★"
        )
        add_visual_choice(
            self.win_type,
            "Collect every pickup",
            "all_pickups_collected",
            colour="#f8d878",
            glyph="+",
        )
        win.field("You win by", self.win_type)
        self.win_behaviour = QComboBox(win)
        self.win_behaviour.setObjectName("winBehaviourSelector")
        prepare_visual_selector(self.win_behaviour, "Winning tile type")
        for value, label, colour, glyph in (
            ("trigger", "Trigger tile", "#f8d878", "!"),
            ("door", "Door", "#78d8d8", "D"),
            ("solid_ground", "Ground", "#787898", "■"),
            ("wall", "Wall", "#c87848", "W"),
            ("platform", "Platform", "#78d878", "="),
            ("ladder", "Ladder", "#f8d878", "H"),
        ):
            add_visual_choice(self.win_behaviour, label, value, colour=colour, glyph=glyph)
        win.field("Winning tile", self.win_behaviour)
        layout.addWidget(win)
        layout.addStretch(1)

        self._connect()

    def _connect(self) -> None:
        """Wire every control — after all of them exist and are populated."""

        for key, control in self.player_options.items():
            control.valueChanged.connect(
                lambda value, key=key: self._set(self.document.set_player_option, key, value)
            )
        self.attack_button.currentIndexChanged.connect(
            lambda _index: self._set(
                self.document.set_player_option, "attackButton", self.attack_button.currentData()
            )
        )
        self.player2_enabled.toggled.connect(self._set_player2_enabled)
        for key, control in self.player2_options.items():
            control.valueChanged.connect(
                lambda value, key=key: self._set(self.document.set_player2_option, key, value)
            )
        for control, key in (
            (self.damage_amount, "amount"),
            (self.damage_iframes, "invincibilityFrames"),
            (self.damage_respawn_hp, "respawnHp"),
            (self.stomp_bounce, "stompBounce"),
        ):
            control.valueChanged.connect(
                lambda value, key=key: self._set(self.document.set_damage_option, key, value)
            )
        for control, key in (
            (self.damage_checkpoints, "checkpoints"),
            (self.stomp_defeat, "stompDefeat"),
        ):
            control.toggled.connect(
                lambda value, key=key: self._set(self.document.set_damage_option, key, value)
            )
        self.pickups_enabled.toggled.connect(
            lambda value: self._toggle(self.document.set_pickups_enabled, value, "Pickups")
        )
        self.spawn_enabled.toggled.connect(self._set_spawn_enabled)
        self.spawn_sprite.currentIndexChanged.connect(self._set_spawn_sprite)
        self.spawn_ttl.valueChanged.connect(
            lambda value: self._set(self.document.set_spawn_option, "ttl", value)
        )
        self.hud_enabled.toggled.connect(
            lambda value: self._toggle(self.document.set_hud_enabled, value, "HUD")
        )
        self.doors_enabled.toggled.connect(self._set_doors_enabled)
        for control, key in (
            (self.doors_spawn_x, "spawnX"),
            (self.doors_spawn_y, "spawnY"),
            (self.doors_target_bg, "targetBgIdx"),
        ):
            control.valueChanged.connect(
                lambda value, key=key: self._set(self.document.set_doors_option, key, value)
            )
        self.dialogue_enabled.toggled.connect(self._set_dialogue_enabled)
        for key, control in self.dialogue_lines.items():
            control.editingFinished.connect(
                lambda key=key, control=control: self._set(
                    self.document.set_dialogue_option, key, control.text()
                )
            )
        for control, key in (
            (self.dialogue_proximity, "proximity"),
            (self.dialogue_auto_close, "autoClose"),
        ):
            control.valueChanged.connect(
                lambda value, key=key: self._set(self.document.set_dialogue_option, key, value)
            )
        self.dialogue_pause.toggled.connect(
            lambda value: self._set(self.document.set_dialogue_option, "pauseOnOpen", value)
        )
        self.win_enabled.toggled.connect(self._set_win_enabled)
        self.win_type.currentIndexChanged.connect(
            lambda _index: self._set(
                self.document.set_win_condition_option, "type", self.win_type.currentData()
            )
        )
        self.win_behaviour.currentIndexChanged.connect(
            lambda _index: self._set(
                self.document.set_win_condition_option,
                "behaviourType",
                self.win_behaviour.currentData(),
            )
        )

    # ---- dock -------------------------------------------------------------

    def build_dock(self) -> QWidget:
        dock = QWidget()
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(0, 0, 0, 0)
        label = QLabel("WHAT IS SWITCHED ON", dock)
        label.setObjectName("sectionLabel")
        layout.addWidget(label)
        self.summary = QLabel(dock)
        self.summary.setObjectName("rulesSummary")
        self.summary.setWordWrap(True)
        layout.addWidget(self.summary)
        hint = QLabel(
            "A switched-off module costs nothing: the compiler strips it out, so "
            "the ROM stays exactly as small as the game you actually made.",
            dock,
        )
        hint.setWordWrap(True)
        layout.addWidget(hint)
        layout.addStretch(1)
        return dock

    # ---- reading the document ---------------------------------------------

    def _module(self, name: str) -> dict:
        builder = self.document.state.get("builder") or {}
        module = (builder.get("modules") or {}).get(name) or {}
        return module if isinstance(module, dict) else {}

    def _config(self, name: str) -> dict:
        config = self._module(name).get("config")
        return config if isinstance(config, dict) else {}

    def _enabled(self, name: str) -> bool:
        return bool(self._module(name).get("enabled", False))

    def _player_config(self, which: str) -> dict:
        players = self._module("players").get("submodules") or {}
        player = players.get(which) or {}
        config = player.get("config") if isinstance(player, dict) else {}
        return config if isinstance(config, dict) else {}

    # ---- refresh ----------------------------------------------------------

    def refresh(self) -> None:
        player = self._player_config("player1")
        for key, default in (
            ("startX", 60),
            ("startY", 120),
            ("walkSpeed", 1),
            ("jumpHeight", 20),
            ("maxHp", 0),
        ):
            control = self.player_options[key]
            control.blockSignals(True)
            control.setValue(int(player.get(key, default)))
            control.blockSignals(False)
        self.attack_button.blockSignals(True)
        attack = self.attack_button.findData(str(player.get("attackButton", "none")))
        self.attack_button.setCurrentIndex(max(0, attack))
        self.attack_button.blockSignals(False)

        players = self._module("players").get("submodules") or {}
        player2 = players.get("player2") or {}
        enabled2 = bool(player2.get("enabled", False)) if isinstance(player2, dict) else False
        config2 = self._player_config("player2")
        self.player2_enabled.blockSignals(True)
        self.player2_enabled.setChecked(enabled2)
        self.player2_enabled.blockSignals(False)
        for key, default in (
            ("startX", 180),
            ("startY", 120),
            ("walkSpeed", 1),
            ("jumpHeight", 20),
            ("maxHp", 0),
        ):
            control = self.player2_options[key]
            control.blockSignals(True)
            control.setValue(int(config2.get(key, default)))
            control.setEnabled(enabled2)
            control.blockSignals(False)

        damage = self._config("damage")
        for control, key, default in (
            (self.damage_amount, "amount", 1),
            (self.damage_iframes, "invincibilityFrames", 30),
            (self.damage_respawn_hp, "respawnHp", 1),
            (self.stomp_bounce, "stompBounce", 12),
        ):
            control.blockSignals(True)
            control.setValue(int(damage.get(key, default)))
            control.blockSignals(False)
        for control, key in (
            (self.damage_checkpoints, "checkpoints"),
            (self.stomp_defeat, "stompDefeat"),
        ):
            control.blockSignals(True)
            control.setChecked(bool(damage.get(key, False)))
            control.blockSignals(False)

        self.pickups_enabled.blockSignals(True)
        self.pickups_enabled.setChecked(self._enabled("pickups"))
        self.pickups_enabled.blockSignals(False)

        spawn = self._config("spawn")
        spawn_on = self._enabled("spawn")
        self.spawn_enabled.blockSignals(True)
        self.spawn_enabled.setChecked(spawn_on)
        self.spawn_enabled.blockSignals(False)
        self.spawn_sprite.blockSignals(True)
        self.spawn_sprite.clear()
        sprites = self.document.state.get("sprites") or []
        for index, name in enumerate(self.document.sprite_names()):
            entry = sprites[index] if index < len(sprites) else {}
            role = str(entry.get("role") or "other") if isinstance(entry, dict) else "other"
            add_visual_choice(
                self.spawn_sprite, name, index, colour=role_colour(role), glyph=role[:1]
            )
        chosen = self.spawn_sprite.findData(int(spawn.get("spriteIdx", 0)))
        self.spawn_sprite.setCurrentIndex(chosen if chosen >= 0 else 0)
        self.spawn_sprite.setEnabled(spawn_on and self.spawn_sprite.count() > 0)
        self.spawn_sprite.blockSignals(False)
        self.spawn_ttl.blockSignals(True)
        self.spawn_ttl.setValue(int(spawn.get("ttl", 24)))
        self.spawn_ttl.setEnabled(spawn_on)
        self.spawn_ttl.blockSignals(False)

        self.hud_enabled.blockSignals(True)
        self.hud_enabled.setChecked(self._enabled("hud"))
        self.hud_enabled.blockSignals(False)
        has_hud_sprite = any(
            isinstance(sprite, dict) and sprite.get("role") == "hud" for sprite in sprites
        )
        self.hud_hint.setText(
            "HUD sprite found — its tiles will be used for the hearts."
            if has_hud_sprite
            else "Tag a small sprite as ‘hud’ in CHARS to choose the heart art."
        )

        doors = self._config("doors")
        doors_on = self._enabled("doors")
        self.doors_enabled.blockSignals(True)
        self.doors_enabled.setChecked(doors_on)
        self.doors_enabled.blockSignals(False)
        for control, key, default in (
            (self.doors_spawn_x, "spawnX", 24),
            (self.doors_spawn_y, "spawnY", 120),
            (self.doors_target_bg, "targetBgIdx", -1),
        ):
            control.blockSignals(True)
            control.setValue(int(doors.get(key, default)))
            control.setEnabled(doors_on)
            control.blockSignals(False)

        dialogue = self._config("dialogue")
        dialogue_on = self._enabled("dialogue")
        self.dialogue_enabled.blockSignals(True)
        self.dialogue_enabled.setChecked(dialogue_on)
        self.dialogue_enabled.blockSignals(False)
        for key, control in self.dialogue_lines.items():
            control.blockSignals(True)
            control.setText(str(dialogue.get(key, "HELLO" if key == "text" else "")))
            control.setEnabled(dialogue_on)
            control.blockSignals(False)
        for control, key, default in (
            (self.dialogue_proximity, "proximity", 2),
            (self.dialogue_auto_close, "autoClose", 0),
        ):
            control.blockSignals(True)
            control.setValue(int(dialogue.get(key, default)))
            control.setEnabled(dialogue_on)
            control.blockSignals(False)
        self.dialogue_pause.blockSignals(True)
        self.dialogue_pause.setChecked(bool(dialogue.get("pauseOnOpen", True)))
        self.dialogue_pause.setEnabled(dialogue_on)
        self.dialogue_pause.blockSignals(False)

        win = self._config("win_condition")
        win_on = self._enabled("win_condition")
        self.win_enabled.blockSignals(True)
        self.win_enabled.setChecked(win_on)
        self.win_enabled.blockSignals(False)
        for control, key, default in (
            (self.win_type, "type", "reach_tile"),
            (self.win_behaviour, "behaviourType", "trigger"),
        ):
            control.blockSignals(True)
            index = control.findData(str(win.get(key, default)))
            control.setCurrentIndex(max(0, index))
            control.setEnabled(win_on)
            control.blockSignals(False)

        self._refresh_summary()

    def _refresh_summary(self) -> None:
        if self._dock is None:
            return
        modules = [
            ("Player 2", self._module("players").get("submodules", {}).get("player2", {}).get("enabled")),
            ("Pickups", self._enabled("pickups")),
            ("Spawn effect", self._enabled("spawn")),
            ("HUD hearts", self._enabled("hud")),
            ("Doors", self._enabled("doors")),
            ("Dialogue", self._enabled("dialogue")),
            ("Win condition", self._enabled("win_condition")),
        ]
        self.summary.setText(
            "\n".join(
                f"{'✓' if bool(on) else '○'}  {name}" for name, on in modules
            )
        )

    # ---- edits ------------------------------------------------------------

    def _set(self, setter, key: str, value: object) -> None:
        setter(key, value)
        self.edited("")

    def _toggle(self, setter, value: bool, label: str) -> None:
        setter(value)
        self._refresh_summary()
        self.edited(f"{label} {'enabled' if value else 'disabled'}")

    def _set_player2_enabled(self, enabled: bool) -> None:
        self.document.set_player2_enabled(enabled)
        for control in self.player2_options.values():
            control.setEnabled(enabled)
        self._refresh_summary()
        self.edited(f"Player 2 {'enabled' if enabled else 'disabled'}")

    def _set_spawn_enabled(self, enabled: bool) -> None:
        self.document.set_spawn_enabled(enabled)
        self.spawn_sprite.setEnabled(enabled and self.spawn_sprite.count() > 0)
        self.spawn_ttl.setEnabled(enabled)
        self._refresh_summary()
        self.edited(f"Spawn effect {'enabled' if enabled else 'disabled'}")

    def _set_spawn_sprite(self, _index: int) -> None:
        sprite = self.spawn_sprite.currentData()
        if isinstance(sprite, int):
            self._set(self.document.set_spawn_option, "spriteIdx", sprite)

    def _set_doors_enabled(self, enabled: bool) -> None:
        self.document.set_doors_enabled(enabled)
        for control in (self.doors_spawn_x, self.doors_spawn_y, self.doors_target_bg):
            control.setEnabled(enabled)
        self._refresh_summary()
        self.edited(f"Doors {'enabled' if enabled else 'disabled'}")

    def _set_dialogue_enabled(self, enabled: bool) -> None:
        self.document.set_dialogue_enabled(enabled)
        for control in (
            *self.dialogue_lines.values(),
            self.dialogue_proximity,
            self.dialogue_pause,
            self.dialogue_auto_close,
        ):
            control.setEnabled(enabled)
        self._refresh_summary()
        self.edited(f"Dialogue {'enabled' if enabled else 'disabled'}")

    def _set_win_enabled(self, enabled: bool) -> None:
        self.document.set_win_condition_enabled(enabled)
        self.win_type.setEnabled(enabled)
        self.win_behaviour.setEnabled(enabled)
        self._refresh_summary()
        self.edited(f"Win condition {'enabled' if enabled else 'disabled'}")
