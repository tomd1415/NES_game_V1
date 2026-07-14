"""Check a project for the mistakes that stop a game working.

A faithful port of `tools/tile_editor_web/builder-validators.js` (~30 checks) plus
the sprites-per-scanline analysis the web keeps in `studio.js`. Pure logic over
the project state — no Qt — so `tests/contract/` can pin it to the web's output
and it can never drift.

Two things the web does that look like bugs but are not, and are reproduced here
deliberately because the *output must match*:

* Two separate scanline analyses exist and they disagree (see `scanline_load`
  and `too_many_sprites_per_scanline`). One samples every 8th row and windows
  by 256px; the other counts every scanline and ignores x entirely. The Studio
  shows both.
* Several messages interpolate a value **raw**, so an absent sprite index reads
  "sprite #None" rather than being caught. Where the web would print JS's
  `undefined`, this prints the same text (`_js`).

Order is the order of the checks, exactly as the web emits them. No sorting, no
dedup, no grouping — the parity test compares lists.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

#: The characters the built-in dialogue font has tiles for. Mirrors
#: `tools/playground_server.py` `_DIALOGUE_FONT`.
SUPPORTED_DIALOGUE = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?'-:"

#: Behaviour ids when the project does not name them itself. From
#: `behaviour.html defaultBehaviourTypes()`.
DEFAULT_BEHAVIOUR_IDS: dict[str, int] = {
    "none": 0,
    "solid_ground": 1,
    "wall": 2,
    "platform": 3,
    "door": 4,
    "trigger": 5,
    "ladder": 6,
}

#: Hardware limits. These are the machine, not a policy.
SPRITES_PER_SCANLINE = 8
OAM_SPRITES = 64
SCREEN_WIDTH = 256
VISIBLE_SCANLINES = 240
TILES_PER_SCREEN_X = 32

#: The custom behaviour slot, which the runner uses for spikes and the racer for
#: its finish line.
CUSTOM_BEHAVIOUR = 7
RACER_CHECKPOINT_1 = 5  # the trigger tile
RACER_CHECKPOINT_2 = 6  # the ladder tile

#: `jumpTo` in the web is a legacy page filename. This is the mapping the web's
#: own UI applies (`studio.js:934-945`) to turn one into a "Fix in <Mode> →"
#: button — done here so the button has somewhere to go.
_JUMP_TO_MODE: tuple[tuple[str, str], ...] = (
    ("sprite", "CHARS"),
    ("behaviour", "WORLD"),
    ("index", "WORLD"),
    ("background", "WORLD"),
    ("builder", "RULES"),
    ("audio", "SOUND"),
    ("code", "CODE"),
    ("palette", "PALS"),
    ("pal", "PALS"),
)


@dataclass(frozen=True)
class Problem:
    """One thing wrong with the project."""

    severity: str  # "error" | "warn" — the web has no third level
    message: str
    fix: str
    id: str = ""
    jump_to: str | None = None

    @property
    def is_error(self) -> bool:
        return self.severity == "error"

    @property
    def mode(self) -> str | None:
        """Which mode fixes this — the target of the 'Fix in <Mode> →' button."""

        if not self.jump_to:
            return None
        target = self.jump_to.lower()
        for fragment, mode in _JUMP_TO_MODE:
            if fragment in target:
                return mode
        return None


def has_errors(problems: list[Problem]) -> bool:
    """Errors stop Play. Warnings do not."""

    return any(problem.is_error for problem in problems)


# ---- JavaScript semantics the messages depend on -------------------------


def _int(value: Any) -> int:
    """JavaScript's `x | 0`: anything that is not a number becomes 0."""

    if isinstance(value, _Missing):
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return 0 if value != value or value in (float("inf"), float("-inf")) else int(value)
    return 0


class _Missing:
    """A key that is not in the dict at all.

    JavaScript tells `undefined` (absent) apart from `null` (present, empty), and
    the messages interpolate whichever one they got — so `dict.get(key)`, which
    collapses both to `None`, would print the wrong word. The contract test
    against the real JS caught this the first time it ran.
    """

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return "undefined"


MISSING = _Missing()


def _get(mapping: dict, key: str) -> Any:
    return mapping.get(key, MISSING)


def _js(value: Any) -> str:
    """Render a value the way JS string interpolation would."""

    if isinstance(value, _Missing):
        return "undefined"
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _is_integer(value: Any) -> bool:
    """`Number.isInteger` — strict: a float or a string is not an integer."""

    return isinstance(value, int) and not isinstance(value, bool)


# ---- reading the project -------------------------------------------------


def _sprites(state: dict) -> list:
    value = state.get("sprites")
    return value if isinstance(value, list) else []


def _module(state: dict, dotted: str) -> dict | None:
    builder = state.get("builder") or {}
    node: Any = builder.get("modules") or {}
    for index, part in enumerate(dotted.split(".")):
        if not isinstance(node, dict):
            return None
        if index == 0:
            node = node.get(part)
        else:
            submodules = node.get("submodules") if isinstance(node, dict) else None
            if not isinstance(submodules, dict):
                return None
            node = submodules.get(part)
    return node if isinstance(node, dict) else None


def _enabled(state: dict, dotted: str) -> bool:
    node = _module(state, dotted)
    return bool(node and node.get("enabled"))


def _config(state: dict, dotted: str) -> dict:
    node = _module(state, dotted)
    config = node.get("config") if isinstance(node, dict) else None
    return config if isinstance(config, dict) else {}


def _count_role(state: dict, role: str) -> int:
    return sum(
        1 for sprite in _sprites(state) if isinstance(sprite, dict) and sprite.get("role") == role
    )


def _game_type(state: dict) -> str:
    """`gameType()` — defaults to platformer."""

    return _config(state, "game").get("type") or "platformer"


def _raw_game_type(state: dict) -> Any:
    """The runner/racer checks compare `=== 'runner'` *without* the default."""

    return _config(state, "game").get("type")


def _active_background(state: dict) -> dict:
    backgrounds = state.get("backgrounds") or []
    if not isinstance(backgrounds, list) or not backgrounds:
        return {}
    index = _int(state.get("selectedBgIdx"))
    background = (
        backgrounds[index] if 0 <= index < len(backgrounds) else backgrounds[0]
    )
    return background if isinstance(background, dict) else {}


def _behaviour_map(state: dict) -> list:
    behaviour = _active_background(state).get("behaviour")
    return behaviour if isinstance(behaviour, list) else []


def _behaviour_id(state: dict, name: str) -> int:
    for entry in state.get("behaviour_types") or []:
        if isinstance(entry, dict) and entry.get("name") == name:
            return _int(entry.get("id"))
    return DEFAULT_BEHAVIOUR_IDS.get(name, -1)


def _count_behaviour(state: dict, name: str) -> int:
    identifier = _behaviour_id(state, name)
    if identifier < 0:
        return 0
    return sum(
        1
        for row in _behaviour_map(state)
        for value in (row if isinstance(row, list) else [])
        if _int(value) == identifier
    )


def _screens(state: dict) -> tuple[int, int]:
    dimensions = _active_background(state).get("dimensions") or {}
    if not isinstance(dimensions, dict):
        dimensions = {}
    return _int(dimensions.get("screens_x")) or 1, _int(dimensions.get("screens_y")) or 1


def _level_tile_width(state: dict) -> int:
    return _screens(state)[0] * TILES_PER_SCREEN_X


def _instances(state: dict) -> list:
    instances = _config(state, "scene").get("instances")
    return instances if isinstance(instances, list) else []


def _cells(sprite: Any) -> int:
    """How many hardware sprites one character costs."""

    if not isinstance(sprite, dict):
        return 0
    return max(1, _int(sprite.get("width"))) * max(1, _int(sprite.get("height")))


def _sprite_at(state: dict, index: Any) -> dict | None:
    sprites = _sprites(state)
    if not isinstance(index, int) or isinstance(index, bool):
        return None
    if not 0 <= index < len(sprites):
        return None
    sprite = sprites[index]
    return sprite if isinstance(sprite, dict) else None


# ---- the checks, in the order the web emits them --------------------------


def _no_player_role(state: dict) -> Problem | None:
    if not _enabled(state, "players.player1") or _count_role(state, "player"):
        return None
    return Problem(
        id="no-player-role",
        severity="error",
        message="Player 1 is turned on, but no sprite has the Player role yet.",
        fix=(
            "Open the Sprites page and tag one of your sprites as Player "
            "(the role dropdown next to its name)."
        ),
        jump_to="sprites.html",
    )


def _no_walk_animation(state: dict) -> Problem | None:
    if not _enabled(state, "players.player1"):
        return None
    assignments = state.get("animation_assignments")
    walk = assignments.get("walk") if isinstance(assignments, dict) else None
    if walk is not None:
        return None
    return Problem(
        id="no-walk-animation",
        severity="warn",
        message="No walk animation is assigned.",
        fix=(
            'Open the Sprites page → Animations panel and assign one of your animations to "walk" '
            "(optional — the game still runs, the player just uses the static layout)."
        ),
        jump_to="sprites.html",
    )


def _no_wall_tiles(state: dict) -> Problem | None:
    if not _enabled(state, "behaviour_walls"):
        return None
    painted = (
        _count_behaviour(state, "wall")
        + _count_behaviour(state, "solid_ground")
        + _count_behaviour(state, "platform")
    )
    if painted:
        return None
    return Problem(
        id="no-wall-tiles",
        severity="warn",
        message="No walls, platforms or solid-ground tiles are painted yet.",
        fix=(
            "Open the Behaviour page and paint at least a row of Solid ground or Platform "
            "tiles.  Without them the player falls through the floor."
        ),
        jump_to="behaviour.html",
    )


def _win_condition_no_tiles(state: dict) -> Problem | None:
    if not _enabled(state, "win_condition"):
        return None
    config = _config(state, "win_condition")
    if (config.get("type") or "reach_tile") != "reach_tile":
        return None
    name = config.get("behaviourType") or "trigger"
    if _count_behaviour(state, name):
        return None
    return Problem(
        id="win-no-tiles",
        severity="error",
        message=(
            f"Win condition is on ({name} tiles) but you have not painted any {name} tiles yet."
        ),
        fix=(
            f"Open the Behaviour page, pick {name} from the type list, and paint at least one "
            "tile where the player should end up to win.  (Or switch the win condition off.)"
        ),
        jump_to="behaviour.html",
    )


def _all_pickups_needs_pickups(state: dict) -> Problem | None:
    if not _enabled(state, "win_condition"):
        return None
    if (_config(state, "win_condition").get("type") or "reach_tile") != "all_pickups_collected":
        return None
    if _enabled(state, "pickups"):
        return None
    return Problem(
        id="all-pickups-needs-pickups",
        severity="error",
        message=(
            'Win condition is "collect every Pickup" but the Pickups module is switched off.'
        ),
        fix=(
            "Turn on the Pickups module (and tag at least one sprite with the Pickup role on "
            "the Sprites page)."
        ),
    )


def _invalid_instance_sprite(state: dict) -> Problem | None:
    if not _enabled(state, "scene"):
        return None
    for instance in _instances(state):
        if _sprite_at(state, (instance or {}).get("spriteIdx")) is None:
            return Problem(
                id="scene-invalid-sprite",
                severity="error",
                message="A Scene instance points at a sprite that no longer exists.",
                fix=(
                    "Open the Scene list below and delete rows whose sprite dropdown is blank "
                    "— or recreate the sprite on the Sprites page."
                ),
            )
    return None


def _instance_off_screen(state: dict) -> Problem | None:
    if not _enabled(state, "scene"):
        return None
    for instance in _instances(state):
        if not isinstance(instance, dict):
            continue
        x, y = instance.get("x"), instance.get("y")
        # Raw comparison, as the web does: a missing coordinate is not off-screen.
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        if x < 0 or x > 240 or y < 16 or y > 216:
            return Problem(
                id="scene-off-screen",
                severity="warn",
                message="One of your Scene instances is placed off the visible screen.",
                fix=(
                    "Check the x / y numbers on each Scene row — keep x between 0 and 240, "
                    "and y between 16 and 216, to stay on screen."
                ),
            )
    return None


def too_many_sprites_per_scanline(state: dict) -> Problem | None:
    """The validators' own scanline check: every 8th row, windowed by one screen.

    Not the same analysis as `scanline_load` — see the module docstring. This one
    ignores empty cells and only counts sprites within 256px of each other, so a
    scrolling level does not flag enemies that are nowhere near one another.
    """

    if not _enabled(state, "scene"):
        return None
    actors = []
    for instance in _instances(state):
        if not isinstance(instance, dict):
            continue
        sprite = _sprite_at(state, instance.get("spriteIdx"))
        if sprite is None:
            continue
        height = max(1, _int(sprite.get("height")))
        top = _int(instance.get("y"))
        actors.append(
            {
                "x": _int(instance.get("x")),
                "y0": top,
                "y1": top + height * 8,
                "w": max(1, _int(sprite.get("width"))),
            }
        )
    if len(actors) < 2:
        return None

    worst = 0
    for row in range(0, VISIBLE_SCANLINES, 8):
        here = sorted(
            (actor for actor in actors if actor["y0"] <= row < actor["y1"]),
            key=lambda actor: actor["x"],
        )
        if len(here) < 2:
            continue
        low = 0
        total = 0
        for high in range(len(here)):
            total += here[high]["w"]
            while here[high]["x"] - here[low]["x"] >= SCREEN_WIDTH:
                total -= here[low]["w"]
                low += 1
            worst = max(worst, total)
    if worst <= SPRITES_PER_SCANLINE:
        return None
    return Problem(
        id="too-many-sprites-per-scanline",
        severity="warn",
        message=(
            f"Up to {worst} sprites can line up on one row here — the NES only shows 8 per row, "
            "so some will flicker or disappear."
        ),
        fix=(
            "Spread enemies/pickups out vertically (different heights) or place fewer on the "
            "same row. Sprite flicker (SMB rendering options) helps share the slots but cannot "
            "show more than 8 at once."
        ),
    )


def _p2_hp_zero_with_damage(state: dict) -> Problem | None:
    if not _enabled(state, "damage") or not _enabled(state, "players.player2"):
        return None
    if _int(_config(state, "players.player2").get("maxHp")) > 0:
        return None
    return Problem(
        id="p2-hp-zero-with-damage",
        severity="warn",
        message=(
            "Damage is on and Player 2 is on, but P2's Max HP is 0 — P2 is invincible."
        ),
        fix=(
            "Raise Player 2 → Max HP if you want P2 to take damage too, or leave it at 0 for "
            'an "assist mode" co-op feel.'
        ),
    )


def _hp_zero_with_damage(state: dict) -> Problem | None:
    if not _enabled(state, "damage"):
        return None
    if _int(_config(state, "players.player1").get("maxHp")) > 0:
        return None
    p2_on = _enabled(state, "players.player2")
    p2_mortal = p2_on and _int(_config(state, "players.player2").get("maxHp")) > 0
    if p2_mortal:
        return Problem(
            id="hp-zero-with-damage",
            severity="warn",
            message=(
                "Damage is on and Player 1’s Max HP is 0 — Player 1 is invincible "
                "(only Player 2 can be hurt)."
            ),
            fix=(
                "Raise Player 1 → Max HP if you want P1 to take damage too, or leave it at 0 "
                'for an "assist mode" co-op feel.'
            ),
        )
    return Problem(
        id="hp-zero-with-damage",
        severity="error",
        message=(
            "Damage is on but no player can take damage — enemies will never hurt anyone."
        ),
        fix=(
            "Raise Player 1 → Max HP above 0 (or Player 2’s if P2 is on), or turn Damage off."
        ),
    )


def _damage_no_enemies(state: dict) -> Problem | None:
    if not _enabled(state, "damage") or _count_role(state, "enemy"):
        return None
    return Problem(
        id="damage-no-enemies",
        severity="warn",
        message="Damage is on, but no sprite is tagged Enemy.",
        fix=(
            "Tag a sprite as Enemy on the Sprites page so there's something to take damage from."
        ),
        jump_to="sprites.html",
    )


def _dialogue_no_npc(state: dict) -> Problem | None:
    if not _enabled(state, "dialogue") or _count_role(state, "npc"):
        return None
    return Problem(
        id="dialogue-no-npc",
        severity="error",
        message="Dialogue is on but no sprite is tagged NPC.",
        fix=(
            "Open the Sprites page and set a sprite's role to NPC — that's who the player "
            "talks to."
        ),
        jump_to="sprites.html",
    )


def _dialogue_empty_text(state: dict) -> Problem | None:
    if not _enabled(state, "dialogue"):
        return None
    if str(_config(state, "dialogue").get("text") or "").strip():
        return None
    return Problem(
        id="dialogue-empty-text",
        severity="warn",
        message="Dialogue is on but the text is blank — the NPC will show an empty box.",
        fix='Type something in the "What the NPC says" field on the Dialogue module.',
    )


def _dialogue_unsupported_chars(state: dict) -> Problem | None:
    if not _enabled(state, "dialogue"):
        return None
    config = _config(state, "dialogue")
    texts: list[Any] = [config.get("text"), config.get("text2"), config.get("text3")]
    # Deliberately reads the scene node without checking whether it is enabled,
    # exactly as the web does.
    for instance in _instances(state):
        if not isinstance(instance, dict):
            continue
        sprite = _sprite_at(state, instance.get("spriteIdx"))
        if sprite is not None and sprite.get("role") == "npc":
            if isinstance(instance.get("text"), str):
                texts.append(instance["text"])

    bad: list[str] = []
    for text in texts:
        if not text:
            continue
        for character in str(text).upper():
            if character not in SUPPORTED_DIALOGUE and character not in bad:
                bad.append(character)  # insertion order, like a JS Set
    if not bad:
        return None
    listed = " ".join(f'"{character}"' for character in bad)
    return Problem(
        id="dialogue-unsupported-chars",
        severity="warn",
        message=(
            f"Dialogue uses character(s) the built-in font does not include ({listed}) — "
            "those will show as blank or garbage tiles."
        ),
        fix=(
            "Stick to letters, numbers, spaces and . , ! ? ' - : — or paint your own tile for "
            "that character at its ASCII slot on the Backgrounds page."
        ),
    )


def _question_block_powerup_without_module(state: dict) -> Problem | None:
    if not _enabled(state, "blocks") or _enabled(state, "powerups"):
        return None
    blocks = _config(state, "blocks").get("blockList")
    for block in blocks if isinstance(blocks, list) else []:
        if not isinstance(block, dict):
            continue
        if (block.get("kind") or "question") == "question" and block.get("contents") not in (
            None,
            "",
            "coin",
        ):
            return Problem(
                id="question-block-powerup-no-module",
                severity="warn",
                message=(
                    "A ? block is set to give a power-up (mushroom / fire flower / star / 1-Up) "
                    "but the Power-ups module is off — it will give a coin instead."
                ),
                fix=(
                    "Turn on the Power-ups module (Style tab) so the power-up can pop out, or "
                    "set the ? block’s contents to Coin so it matches what will actually "
                    "happen."
                ),
            )
    return None


def _flagpole_needs_win_condition(state: dict) -> Problem | None:
    if _game_type(state) != "smb" or not _enabled(state, "flagpole"):
        return None
    if _enabled(state, "win_condition"):
        return None
    return Problem(
        id="flagpole-needs-win",
        severity="error",
        message=(
            "Flagpole finish is on but the Win condition module is off — crossing the flag "
            "will not finish the level."
        ),
        fix=(
            "Turn on the Win condition module (Rules tab) — the flagpole needs it to run the "
            "level-complete celebration."
        ),
    )


def _flagpole_beyond_level(state: dict) -> Problem | None:
    if _game_type(state) != "smb" or not _enabled(state, "flagpole"):
        return None
    column = _int(_config(state, "flagpole").get("x"))
    width = _level_tile_width(state)
    if column < width:
        return None
    return Problem(
        id="flagpole-beyond-level",
        severity="warn",
        message=(
            f"The flagpole column ({column}) is past the end of your level ({width} tiles wide) "
            "— the player can never reach it."
        ),
        fix=(
            "Lower the Flagpole column in the Style tab, or make the level wider on the "
            "Backgrounds page (add screens across)."
        ),
    )


def _doors_target_bg_out_of_range(state: dict) -> Problem | None:
    if not _enabled(state, "doors"):
        return None
    target = _get(_config(state, "doors"), "targetBgIdx")
    if target is None or isinstance(target, _Missing):
        return None
    if isinstance(target, (int, float)) and target < 0:
        return None
    backgrounds = state.get("backgrounds") or []
    if _int(target) < len(backgrounds):
        return None
    count = len(backgrounds)
    return Problem(
        id="doors-target-invalid-bg",
        severity="error",
        message=(
            f"Doors → Target background is {_js(target)} but you only have {count} "
            f"background{'' if count == 1 else 's'}."
        ),
        fix=(
            "Open the Backgrounds page and add more backgrounds, or drop the Target number "
            "down to a valid index (or -1 for a same-room teleport)."
        ),
        jump_to="index.html",
    )


def _doors_no_door_tiles(state: dict) -> Problem | None:
    if not _enabled(state, "doors") or _count_behaviour(state, "door"):
        return None
    return Problem(
        id="doors-no-door-tiles",
        severity="error",
        message=(
            "Doors is on but no tile is painted Door on this background — the teleport will "
            "never trigger."
        ),
        fix=(
            "Open the Behaviour page, pick Door from the type list, and paint at least one tile."
        ),
        jump_to="behaviour.html",
    )


def _enemy_walk_anim_size_mismatch(state: dict) -> Problem | None:
    animations = state.get("animations") or []
    animation = next(
        (
            entry
            for entry in animations
            if isinstance(entry, dict) and entry.get("role") == "enemy" and entry.get("style") == "walk"
        ),
        None,
    )
    if animation is None:
        return None
    frames = animation.get("frames")
    if not isinstance(frames, list) or not frames:
        return None
    first = _sprite_at(state, _int(frames[0]))
    if first is None:
        return None
    width, height = _int(first.get("width")), _int(first.get("height"))
    for sprite in _sprites(state):
        if (
            isinstance(sprite, dict)
            and sprite.get("role") == "enemy"
            and _int(sprite.get("width")) == width
            and _int(sprite.get("height")) == height
        ):
            return None
    return Problem(
        id="enemy-walk-anim-size-mismatch",
        severity="warn",
        message=(
            f"An Enemy + Walk animation exists ({width}×{height}) but no sprite tagged "
            "Enemy shares that size — the animation will not play on any of your enemies."
        ),
        fix=(
            f"Either resize an Enemy sprite to {width}×{height} or change the animation's "
            "frames on the Sprites page so its sprites match your enemy size."
        ),
        jump_to="sprites.html",
    )


def _hud_no_sprite(state: dict) -> Problem | None:
    if not _enabled(state, "hud") or _count_role(state, "hud"):
        return None
    return Problem(
        id="hud-no-sprite",
        severity="warn",
        message="HUD is on, but no sprite is tagged HUD.",
        fix=(
            "Tag a small sprite (a heart, a coin icon…) as HUD on the Sprites page so the "
            "hearts have something to draw."
        ),
        jump_to="sprites.html",
    )


def _player2_needs_second_sprite(state: dict) -> Problem | None:
    if not _enabled(state, "players.player2") or _count_role(state, "player") >= 2:
        return None
    return Problem(
        id="player2-needs-second-sprite",
        severity="error",
        message="Player 2 is on, but fewer than 2 sprites are tagged Player.",
        fix=(
            "Open the Sprites page and set a second sprite's role to Player.  The first tagged "
            "sprite drives Player 1, the second drives Player 2."
        ),
        jump_to="sprites.html",
    )


def _all_pickups_win_no_sprites(state: dict) -> Problem | None:
    if not _enabled(state, "win_condition"):
        return None
    if (_config(state, "win_condition").get("type") or "reach_tile") != "all_pickups_collected":
        return None
    if not _enabled(state, "pickups") or _count_role(state, "pickup"):
        return None
    return Problem(
        id="all-pickups-no-sprites",
        severity="error",
        message='"Collect every Pickup" is on but no sprite is tagged Pickup.',
        fix=(
            "Open the Sprites page and set at least one sprite's role to Pickup.  Without a "
            "pickup on the level the game can never end."
        ),
        jump_to="sprites.html",
    )


def _player_oam_overflow(state: dict) -> Problem | None:
    players = [
        sprite
        for sprite in _sprites(state)
        if isinstance(sprite, dict) and sprite.get("role") == "player"
    ]
    if not players:
        return None
    total = _cells(players[0])
    p2_on = _enabled(state, "players.player2") and len(players) >= 2
    if p2_on:
        total += _cells(players[1])
    if total <= OAM_SPRITES:
        return None
    return Problem(
        id="player-oam-overflow",
        severity="error",
        message=(
            f"Player 1{' + Player 2' if p2_on else ''} need {total} hardware sprites, but the "
            "NES only has 64."
        ),
        fix=(
            "Make the two Player sprites smaller on the Sprites page so their tile cells add up "
            "to 64 or fewer (for example two 5x6 players, or one 8x8 and one tiny P2)."
            if p2_on
            else "Make the Player sprite smaller on the Sprites page — at most 64 tile cells "
            "(e.g. 8x8)."
        ),
        jump_to="sprites.html",
    )


def _frame_oam_budget_tight(state: dict) -> Problem | None:
    sprites = _sprites(state)
    players = [
        sprite for sprite in sprites if isinstance(sprite, dict) and sprite.get("role") == "player"
    ]
    if not players:
        return None
    total = _cells(players[0])
    if _enabled(state, "players.player2") and len(players) >= 2:
        total += _cells(players[1])
    if _enabled(state, "scene"):
        for instance in _instances(state):
            if isinstance(instance, dict):
                total += _cells(_sprite_at(state, instance.get("spriteIdx")))
    if _enabled(state, "hud"):
        max_hp = _int(_config(state, "players.player1").get("maxHp"))
        hud = next(
            (
                sprite
                for sprite in sprites
                if isinstance(sprite, dict) and sprite.get("role") == "hud"
            ),
            None,
        )
        total += max_hp * (_cells(hud) if hud is not None else 1)
    if total <= OAM_SPRITES:
        return None
    return Problem(
        id="frame-oam-budget-tight",
        severity="warn",
        message=(
            f"Your players, scene sprites and HUD hearts add up to about {total} hardware "
            "sprites, over the NES limit of 64."
        ),
        fix=(
            "The game will still run, but some sprites won't be drawn each frame.  Reduce "
            "sprite sizes, place fewer Scene instances, or lower Player 1's max HP to stay "
            "within 64."
        ),
    )


def _spawn_trigger_invalid_sprite(state: dict) -> Problem | None:
    if not _enabled(state, "spawn"):
        return None
    index = _get(_config(state, "spawn"), "spriteIdx")
    if _is_integer(index) and 0 <= index < len(_sprites(state)):
        return None
    return Problem(
        id="spawn-trigger-invalid-sprite",
        severity="error",
        message=f"The Spawn effect points at sprite #{_js(index)}, which does not exist.",
        fix=(
            "Choose an existing sprite in the Spawn effect's dropdown, or draw the sprite on "
            "the Sprites page first."
        ),
    )


def _damage_effect_invalid_sprite(state: dict) -> Problem | None:
    if not _enabled(state, "damage"):
        return None
    config = _config(state, "damage")
    if not config.get("spawnOnHit"):
        return None
    index = _get(config, "spawnSpriteIdx")
    if _is_integer(index) and 0 <= index < len(_sprites(state)):
        return None
    return Problem(
        id="damage-effect-invalid-sprite",
        severity="error",
        message=(
            f'The "show an effect sprite when hit" option points at sprite #{_js(index)}, '
            "which does not exist."
        ),
        fix=(
            "Choose an existing sprite in the Damage module's effect dropdown, or draw the "
            "sprite on the Sprites page first."
        ),
    )


def _respawn_hp_over_max(state: dict) -> Problem | None:
    if not _enabled(state, "damage"):
        return None
    config = _config(state, "damage")
    if not config.get("checkpoints"):
        return None
    respawn = _int(config.get("respawnHp"))
    max_hp = _int(_config(state, "players.player1").get("maxHp"))
    if max_hp <= 0 or respawn <= max_hp:
        return None
    return Problem(
        id="respawn-hp-over-max",
        severity="warn",
        message=(
            f"Respawn HP ({respawn}) is higher than Player 1's max HP ({max_hp}), so it will "
            f"be capped at {max_hp} on respawn."
        ),
        fix=(
            f'Lower "HP restored on respawn" to {max_hp} or less, or raise Player 1\'s max HP.'
        ),
    )


def _runner_needs_scrolling_world(state: dict) -> Problem | None:
    if _raw_game_type(state) != "runner":
        return None
    screens_x = _screens(state)[0]
    if screens_x >= 2:
        return None
    return Problem(
        id="runner-needs-scrolling-world",
        severity="error",
        message=(
            "Auto-runner needs a world at least 2 screens wide so it can scroll, but this "
            f"background is only {screens_x} screen wide."
        ),
        fix=(
            "On the Backgrounds page, make the background wider — set it to 2 or more screens "
            "across."
        ),
        jump_to="index.html",
    )


def _runner_no_spike(state: dict) -> Problem | None:
    if _raw_game_type(state) != "runner":
        return None
    for row in _behaviour_map(state):
        for value in row if isinstance(row, list) else []:
            if _int(value) == CUSTOM_BEHAVIOUR:
                return None
    return Problem(
        id="runner-no-spike",
        severity="warn",
        message=(
            "Auto-runner has no spike tiles painted, so the player has nothing to dodge and "
            "can never lose."
        ),
        fix=(
            "On the Behaviour page, paint some tiles as the spike (the custom slot, id 7) for "
            "the player to jump over."
        ),
        jump_to="behaviour.html",
    )


def _runner_dialogue_unsupported(state: dict) -> Problem | None:
    if _raw_game_type(state) != "runner" or not _enabled(state, "dialogue"):
        return None
    return Problem(
        id="runner-dialogue-unsupported",
        severity="warn",
        message=(
            "Dialogue boxes don't work in an auto-runner game (the auto-scroll glitches the "
            "box), so dialogue is turned off in the built game."
        ),
        fix=(
            "Untick the Dialogue module for this game, or switch the Game type away from "
            "Auto-runner if you need dialogue."
        ),
    )


def _racer_needs_scrolling_world(state: dict) -> Problem | None:
    if _raw_game_type(state) != "racer":
        return None
    screens_x, screens_y = _screens(state)
    if not (screens_x < 2 and screens_y < 2):
        return None
    return Problem(
        id="racer-needs-scrolling-world",
        severity="error",
        message=(
            "A racer needs a track bigger than one screen so the car has room to drive, but "
            f"this background is only {screens_x}×{screens_y} screen."
        ),
        fix=(
            "On the Backgrounds page, make the background larger — set it to 2 or more screens "
            "across or down."
        ),
        jump_to="index.html",
    )


def _racer_laps_need_markers(state: dict) -> Problem | None:
    if _raw_game_type(state) != "racer":
        return None
    config = _config(state, "game")
    checkpoints = max(1, min(2, _int(config.get("racerCheckpoints")) or 1))

    has_finish = has_first = has_second = False
    for row in _behaviour_map(state):
        for value in row if isinstance(row, list) else []:
            behaviour = _int(value)
            if behaviour == CUSTOM_BEHAVIOUR:
                has_finish = True
            elif behaviour == RACER_CHECKPOINT_1:
                has_first = True
            elif behaviour == RACER_CHECKPOINT_2:
                has_second = True

    needs_second = checkpoints >= 2
    if has_finish and has_first and (not needs_second or has_second):
        return None

    missing = []
    if not has_finish:
        missing.append("a finish line")
    if not has_first:
        missing.append("checkpoint 1 (the trigger tile)")
    if needs_second and not has_second:
        missing.append("checkpoint 2 (the ladder tile)")

    return Problem(
        id="racer-laps-need-markers",
        severity="warn",
        message=(
            f"This racer is missing {' and '.join(missing)}, so laps can never be completed "
            "and the race can't be won — it will just be free-drive."
        ),
        fix=(
            "On the Behaviour page, paint a finish line (the custom slot, id 7) across the "
            "track and "
            + (
                "two checkpoints — the trigger tile (passed first) then the ladder tile "
                "(passed second)"
                if needs_second
                else "a checkpoint (the trigger tile)"
            )
            + " on the far side, so a lap = finish → "
            + ("checkpoint 1 → checkpoint 2" if needs_second else "checkpoint")
            + " → finish."
        ),
        jump_to="behaviour.html",
    )


#: The order the web runs them in — and therefore the order they are reported.
VALIDATORS: tuple[Callable[[dict], Problem | None], ...] = (
    _no_player_role,
    _no_walk_animation,
    _no_wall_tiles,
    _win_condition_no_tiles,
    _all_pickups_needs_pickups,
    _invalid_instance_sprite,
    _instance_off_screen,
    too_many_sprites_per_scanline,
    _p2_hp_zero_with_damage,
    _hp_zero_with_damage,
    _damage_no_enemies,
    _dialogue_no_npc,
    _dialogue_empty_text,
    _dialogue_unsupported_chars,
    _question_block_powerup_without_module,
    _flagpole_needs_win_condition,
    _flagpole_beyond_level,
    _doors_target_bg_out_of_range,
    _doors_no_door_tiles,
    _enemy_walk_anim_size_mismatch,
    _hud_no_sprite,
    _player2_needs_second_sprite,
    _all_pickups_win_no_sprites,
    _player_oam_overflow,
    _frame_oam_budget_tight,
    _spawn_trigger_invalid_sprite,
    _damage_effect_invalid_sprite,
    _respawn_hp_over_max,
    _runner_needs_scrolling_world,
    _runner_no_spike,
    _runner_dialogue_unsupported,
    _racer_needs_scrolling_world,
    _racer_laps_need_markers,
)


# ---- the second scanline analysis ---------------------------------------


@dataclass(frozen=True)
class ScanlineLoad:
    """How many hardware sprites land on each of the 240 visible scanlines."""

    rows: list[int]
    max_load: int
    overflow_rows: int


def scanline_load(state: dict) -> ScanlineLoad:
    """Count every scanline, honouring empty cells and ignoring x.

    The web keeps this in `studio.js`, separate from the validators, and shows
    both. It is the stricter of the two: it counts *cells*, not sprite widths,
    and it does not window by x — so two enemies at opposite ends of a scrolling
    level still collide here. Reproduced as-is so the two targets agree.
    """

    rows = [0] * VISIBLE_SCANLINES
    sprites = _sprites(state)
    # Read the scene node directly, with no `enabled` check — as the web does.
    scene = _module(state, "scene") or {}
    instances = (scene.get("config") or {}).get("instances") or []

    for instance in instances if isinstance(instances, list) else []:
        if not isinstance(instance, dict):
            continue
        index = instance.get("spriteIdx")
        sprite = sprites[index] if isinstance(index, int) and 0 <= index < len(sprites) else None
        if not isinstance(sprite, dict):
            continue
        width = _int(sprite.get("width")) or 2
        height = _int(sprite.get("height")) or 2
        cells = sprite.get("cells")
        for cell_row in range(height):
            for cell_column in range(width):
                cell = None
                if isinstance(cells, list) and cell_row < len(cells):
                    row = cells[cell_row]
                    if isinstance(row, list) and cell_column < len(row):
                        cell = row[cell_column]
                if not isinstance(cell, dict) or cell.get("empty"):
                    continue
                top = _int(instance.get("y")) + cell_row * 8
                for scanline in range(top, top + 8):
                    if 0 <= scanline < VISIBLE_SCANLINES:
                        rows[scanline] += 1

    max_load = max(rows) if rows else 0
    overflow = sum(1 for count in rows if count > SPRITES_PER_SCANLINE)
    return ScanlineLoad(rows=rows, max_load=max_load, overflow_rows=overflow)


def scanline_problem(state: dict) -> Problem | None:
    load = scanline_load(state)
    if load.overflow_rows <= 0:
        return None
    return Problem(
        id="scanline-overflow",
        severity="warn",
        message=(
            f"{load.overflow_rows} scanline{'' if load.overflow_rows == 1 else 's'} have more "
            f"than 8 sprites (busiest: {load.max_load}). The NES draws only 8 sprites per line "
            "— the extras flicker or vanish."
        ),
        fix="Spread placed characters out vertically, or use fewer / smaller ones.",
        jump_to="background",
    )


# ---- the entry point -----------------------------------------------------


def validate(state: dict) -> list[Problem]:
    """Every problem with the project, in the web's order.

    A check that throws is skipped, not fatal — one broken validator must never
    be able to stop the pupil building their game.
    """

    problems: list[Problem] = []
    for check in VALIDATORS:
        try:
            problem = check(state)
        except Exception:  # noqa: BLE001 - a broken check must not break the app
            continue
        if problem is not None:
            problems.append(problem)
    # The web appends this one last, after all the others.
    try:
        scanline = scanline_problem(state)
    except Exception:  # noqa: BLE001
        scanline = None
    if scanline is not None:
        problems.append(scanline)
    return problems
