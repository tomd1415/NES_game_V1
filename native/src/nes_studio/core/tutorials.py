"""The guided tutorials — what to do next, and how to tell when it is done.

Declarative, and free of Qt, so the checks are testable without a display.

**Every check is re-baselined.** A step says "draw a tile", and it is satisfied
by drawing a tile *since the step began* — not by the project already containing
one. A pupil who opens a starter that already has ground painted must still be
able to complete "paint some ground"; a check that asked "does any ground exist"
would tick itself the moment they arrived, teach nothing, and skip the step.

**Every check is lenient.** They ask "did something of this shape happen", never
"did you do exactly what I said". A pupil who paints a wall instead of a floor
has painted a tile, and the step should move on. The tutorial is a nudge, not a
test.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

#: A check compares the live state against the state when the step began.
Check = Callable[[dict, dict], bool]


# ---- readers over the raw project state ----------------------------------


def _sprites(state: dict) -> list:
    value = state.get("sprites")
    return value if isinstance(value, list) else []


def _roles(state: dict) -> list[str]:
    return [
        str(sprite.get("role") or "other")
        for sprite in _sprites(state)
        if isinstance(sprite, dict)
    ]


def _tile_pixels(state: dict, group: str) -> list:
    value = state.get(group)
    return value if isinstance(value, list) else []


def _painted_cells(state: dict) -> int:
    total = 0
    for background in state.get("backgrounds") or []:
        for row in (background or {}).get("nametable") or []:
            total += sum(
                1 for cell in row if isinstance(cell, dict) and int(cell.get("tile", 0)) != 0
            )
    return total


def _behaviour_cells(state: dict, behaviour: int) -> int:
    total = 0
    for background in state.get("backgrounds") or []:
        for row in (background or {}).get("behaviour") or []:
            total += sum(1 for value in row if int(value or 0) == behaviour)
    return total


def _palettes(state: dict) -> Any:
    """Both palette banks, plus the backdrop they all share.

    The keys are `bg_palettes` / `sprite_palettes` / `universal_bg` — a check
    reading a key the document does not have would simply never fire, silently,
    and the step would trap the pupil forever.
    """

    return (
        state.get("bg_palettes"),
        state.get("sprite_palettes"),
        state.get("universal_bg"),
    )


def _module(state: dict, name: str) -> dict:
    builder = state.get("builder") or {}
    module = (builder.get("modules") or {}).get(name) or {}
    return module if isinstance(module, dict) else {}


def _instances(state: dict) -> list:
    config = _module(state, "scene").get("config") or {}
    instances = config.get("instances")
    return instances if isinstance(instances, list) else []


# ---- the checks -----------------------------------------------------------


def drew_a_tile(state: dict, baseline: dict) -> bool:
    """Any background tile's pixels changed."""

    return _tile_pixels(state, "bg_tiles") != _tile_pixels(baseline, "bg_tiles")


def drew_a_sprite_tile(state: dict, baseline: dict) -> bool:
    return _tile_pixels(state, "sprite_tiles") != _tile_pixels(baseline, "sprite_tiles")


def painted_the_screen(state: dict, baseline: dict) -> bool:
    """More cells are painted than when the step began."""

    return _painted_cells(state) > _painted_cells(baseline)


def painted_ground(state: dict, baseline: dict) -> bool:
    """Any solid behaviour appeared — ground, wall or platform. Lenient on which."""

    return any(
        _behaviour_cells(state, behaviour) > _behaviour_cells(baseline, behaviour)
        for behaviour in (1, 2, 3)
    )


def painted_a_trigger(state: dict, baseline: dict) -> bool:
    return _behaviour_cells(state, 5) > _behaviour_cells(baseline, 5)


def painted_a_door(state: dict, baseline: dict) -> bool:
    return _behaviour_cells(state, 4) > _behaviour_cells(baseline, 4)


def made_a_character(state: dict, baseline: dict) -> bool:
    return len(_sprites(state)) > len(_sprites(baseline))


def tagged_a_player(state: dict, _baseline: dict) -> bool:
    """The one check that is *not* re-baselined: a game needs exactly one hero,
    and a pupil who already has one has satisfied the idea."""

    return "player" in _roles(state)


def tagged_an_enemy(state: dict, _baseline: dict) -> bool:
    return "enemy" in _roles(state)


def placed_a_character(state: dict, baseline: dict) -> bool:
    return len(_instances(state)) > len(_instances(baseline))


def changed_a_colour(state: dict, baseline: dict) -> bool:
    return _palettes(state) != _palettes(baseline)


def added_a_background(state: dict, baseline: dict) -> bool:
    return len(state.get("backgrounds") or []) > len(baseline.get("backgrounds") or [])


def made_an_animation(state: dict, baseline: dict) -> bool:
    return len(state.get("animations") or []) > len(baseline.get("animations") or [])


def assigned_walk(state: dict, _baseline: dict) -> bool:
    assignments = state.get("animation_assignments")
    return isinstance(assignments, dict) and assignments.get("walk") is not None


def enabled_winning(state: dict, _baseline: dict) -> bool:
    return bool(_module(state, "win_condition").get("enabled"))


def enabled_doors(state: dict, _baseline: dict) -> bool:
    return bool(_module(state, "doors").get("enabled"))


def enabled_damage(state: dict, _baseline: dict) -> bool:
    return bool(_module(state, "damage").get("enabled"))


def _build_count(state: dict) -> int:
    native_ui = state.get("nativeUi")
    if not isinstance(native_ui, dict):
        return 0
    return int(native_ui.get("buildCount") or 0)


def built_the_game(state: dict, baseline: dict) -> bool:
    """Built *since the step began*.

    `hasBuilt` is a one-way latch, so a pupil taking this tutorial a second time
    would be trapped on this step forever — it would already be true, and could
    never become "more" true. The build count can say "again".
    """

    return _build_count(state) > _build_count(baseline)


# ---- the shape of a tutorial ---------------------------------------------


@dataclass(frozen=True)
class Step:
    """One instruction, and how to tell it has been followed."""

    title: str
    body: str
    #: The mode this step happens in. The tutorial opens it for you.
    mode: str
    #: `objectName` of the control the "Show me" button should flash. The real
    #: control, in the real UI — not a picture of it.
    show_me: str = ""
    done: Check = field(default=lambda _state, _baseline: True)


@dataclass(frozen=True)
class Tutorial:
    id: str
    title: str
    summary: str
    steps: tuple[Step, ...]

    def __len__(self) -> int:
        return len(self.steps)


TUTORIALS: tuple[Tutorial, ...] = (
    Tutorial(
        id="first-game",
        title="Make a game in five minutes",
        summary="Draw some ground, stand on it, and play the result on a real NES.",
        steps=(
            Step(
                title="Draw a block of ground",
                body=(
                    "TILES is the box of 8×8 drawings your whole game is built from. "
                    "Pick a slot and colour in some pixels — grass, brick, anything."
                ),
                mode="TILES",
                show_me="tilePixelCanvas",
                done=drew_a_tile,
            ),
            Step(
                title="Paint it across the floor",
                body=(
                    "Back in WORLD, choose the Paint tool and drag along the bottom of the "
                    "screen. That is the tile you just drew, on a real NES screen."
                ),
                mode="WORLD",
                show_me="worldPaintButton",
                done=painted_the_screen,
            ),
            Step(
                title="Make it solid",
                body=(
                    "Right now the player falls straight through. Choose the Behaviour tool, "
                    "pick “Solid ground”, and paint over your floor again."
                ),
                mode="WORLD",
                show_me="worldBehaviourButton",
                done=painted_ground,
            ),
            Step(
                title="Play it",
                body=(
                    "Press ▶ Play. The Studio compiles your game with cc65 into a real .nes "
                    "ROM and runs it — the same file a real console would run."
                ),
                mode="WORLD",
                show_me="playButton",
                done=built_the_game,
            ),
        ),
    ),
    Tutorial(
        id="hero",
        title="Draw your hero",
        summary="Make a character, give it the Player role, and draw it pixel by pixel.",
        steps=(
            Step(
                title="Make a new character",
                body="In CHARS, press New. Give them a name.",
                mode="CHARS",
                show_me="spriteNewButton",
                done=made_a_character,
            ),
            Step(
                title="Tell the game this is the hero",
                body=(
                    "Set the role to “player”. That is how the engine knows which character "
                    "the arrow keys move."
                ),
                mode="CHARS",
                show_me="spriteRoleSelector",
                done=tagged_a_player,
            ),
            Step(
                title="Draw them",
                body=(
                    "Draw straight onto the character with the pencil. Pen 0 is transparent — "
                    "it rubs out, and lets the background show through."
                ),
                mode="CHARS",
                show_me="spriteCanvas",
                done=drew_a_sprite_tile,
            ),
        ),
    ),
    Tutorial(
        id="enemies",
        title="Add something dangerous",
        summary="An enemy that hurts you, and a health bar that says so.",
        steps=(
            Step(
                title="Make an enemy",
                body="A new character in CHARS, with the role set to “enemy”.",
                mode="CHARS",
                show_me="spriteRoleSelector",
                done=tagged_an_enemy,
            ),
            Step(
                title="Put one on the screen",
                body=(
                    "In WORLD, choose your enemy and press Add entity. Drag it where you want "
                    "it to stand."
                ),
                mode="WORLD",
                show_me="addSceneInstanceButton",
                done=placed_a_character,
            ),
            Step(
                title="Let it hurt you",
                body=(
                    "In RULES, switch on Damage — and give Player 1 some health, or nothing "
                    "can hurt them."
                ),
                mode="RULES",
                show_me="damageAmountControl",
                done=enabled_damage,
            ),
        ),
    ),
    Tutorial(
        id="colours",
        title="Choose your colours",
        summary="The NES has 64 colours and can show 4 at a time. Learn to live with that.",
        steps=(
            Step(
                title="Look at the whole palette",
                body=(
                    "These 64 swatches are every colour an NES can produce. Not "
                    "approximately — exactly."
                ),
                mode="PALS",
                show_me="nesMasterColour16",
                done=changed_a_colour,
            ),
            Step(
                title="See what it changed",
                body=(
                    "Go back to WORLD. Every tile using that palette changed at once — because "
                    "on a real NES, a tile has no colours of its own. The palette does."
                ),
                mode="WORLD",
                show_me="worldPaletteValue",
            ),
        ),
    ),
    Tutorial(
        id="rooms",
        title="Build a second room",
        summary="More than one screen, and a door between them.",
        steps=(
            Step(
                title="Add a background",
                body="In WORLD, press New under BACKGROUND. That is a whole second room.",
                mode="WORLD",
                show_me="worldBackgroundNewButton",
                done=added_a_background,
            ),
            Step(
                title="Switch on doors",
                body="In RULES, enable Doors, and say which background the door leads to.",
                mode="RULES",
                show_me="doorsEnabled",
                done=enabled_doors,
            ),
            Step(
                title="Paint a door",
                body=(
                    "Back in WORLD, use the Behaviour tool and paint a Door tile. Walk into it "
                    "and you are in the other room."
                ),
                mode="WORLD",
                show_me="worldBehaviourValue",
                done=painted_a_door,
            ),
        ),
    ),
    Tutorial(
        id="winning",
        title="Make it winnable",
        summary="A game you cannot win is a toy. Give it an ending.",
        steps=(
            Step(
                title="Switch on a win condition",
                body="In RULES, tick “This game can be won”, and choose “Reach a tile”.",
                mode="RULES",
                show_me="winConditionEnabled",
                done=enabled_winning,
            ),
            Step(
                title="Paint the winning tile",
                body=(
                    "In WORLD, use the Behaviour tool to paint a Trigger tile where the player "
                    "should end up. Reach it, and you win."
                ),
                mode="WORLD",
                show_me="worldBehaviourValue",
                done=painted_a_trigger,
            ),
            Step(
                title="Prove it",
                body="Play the game and reach your tile.",
                mode="WORLD",
                show_me="playButton",
                done=built_the_game,
            ),
        ),
    ),
)


def tutorial(identifier: str) -> Tutorial | None:
    return next((entry for entry in TUTORIALS if entry.id == identifier), None)
