"""Canonical JSON-compatible project document for the native client."""

from __future__ import annotations

import copy
import json
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .migrations import CURRENT_SCHEMA_VERSION, migrate_project


class ProjectFormatError(ValueError):
    """Raised when a project cannot provide an editable WORLD grid."""


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    path: str
    message: str
    severity: str = "error"


@dataclass(frozen=True, slots=True)
class ProjectSnapshot:
    json_bytes: bytes
    sha256: str
    engine_version: int

    @classmethod
    def from_state(cls, state: dict[str, Any]) -> "ProjectSnapshot":
        payload = _json_bytes(state)
        return cls(
            payload,
            hashlib.sha256(payload).hexdigest(),
            max(1, int(state.get("engineVersion") or 1)),
        )

    def state(self) -> dict[str, Any]:
        return json.loads(self.json_bytes)


@dataclass(slots=True)
class ProjectDocument:
    """Own a project state while preserving fields the native UI does not know."""

    state: dict[str, Any]
    path: Path | None = None
    dirty: bool = False

    @classmethod
    def preview(cls) -> "ProjectDocument":
        """Create the small canonical in-memory project shown by the preview UI."""

        nametable = [
            [{"tile": 0, "palette": 0} for _ in range(32)] for _ in range(30)
        ]
        for row in range(24, 30):
            for col in range(32):
                nametable[row][col]["tile"] = 2 if row == 24 else 1
        for col, height in ((5, 3), (6, 3), (12, 5), (13, 5), (22, 2)):
            for row in range(24 - height, 24):
                nametable[row][col]["tile"] = 3
        return cls(
            state={
                "name": "Native Preview",
                "version": CURRENT_SCHEMA_VERSION,
                "selectedBgIdx": 0,
                "backgrounds": [
                    {
                        "name": "room1",
                        "dimensions": {"screens_x": 1, "screens_y": 1},
                        "nametable": nametable,
                        "behaviour": [[0 for _ in range(32)] for _ in range(30)],
                    }
                ],
            }
        )

    @classmethod
    def from_json(cls, data: str | bytes, path: Path | None = None) -> "ProjectDocument":
        try:
            state = json.loads(data)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ProjectFormatError(f"Invalid project JSON: {exc}") from exc
        if not isinstance(state, dict):
            raise ProjectFormatError("Project JSON must contain an object at the top level")
        migration = migrate_project(state)
        issues = cls.validate(migration.state)
        errors = [issue for issue in issues if issue.severity == "error"]
        if errors:
            first = errors[0]
            raise ProjectFormatError(f"{first.path}: {first.message}")
        return cls(state=migration.state, path=path)

    @classmethod
    def open(cls, path: str | Path) -> "ProjectDocument":
        project_path = Path(path)
        return cls.from_json(project_path.read_bytes(), project_path)

    def to_json(self) -> bytes:
        return _json_bytes(self.state)

    @property
    def name(self) -> str:
        return str(self.state.get("name") or "Untitled")

    @property
    def selected_background_index(self) -> int:
        return int(self.state.get("selectedBgIdx", 0))

    def background_names(self) -> list[str]:
        backgrounds = self.state.get("backgrounds") or []
        return [
            str(background.get("name") or f"Room {index + 1}")
            if isinstance(background, dict)
            else f"Room {index + 1}"
            for index, background in enumerate(backgrounds)
        ]

    @property
    def universal_background(self) -> int:
        value = self.state.get("universal_bg", 0x21)
        try:
            return int(value) & 0x3F
        except (TypeError, ValueError):
            return 0x21

    def set_universal_background(self, colour: int) -> None:
        if not 0 <= colour <= 0x3F:
            raise ValueError("NES universal background colour must be 0x00..0x3F")
        if self.universal_background != colour or "universal_bg" not in self.state:
            self.state["universal_bg"] = colour
            self.dirty = True

    def background_palette(self, index: int) -> tuple[int, int, int]:
        return self._palette("bg_palettes", index)

    def set_background_palette_slot(self, palette: int, slot: int, colour: int) -> None:
        self._set_palette_slot("bg_palettes", palette, slot, colour)

    def sprite_palette(self, index: int) -> tuple[int, int, int]:
        return self._palette("sprite_palettes", index)

    def set_sprite_palette_slot(self, palette: int, slot: int, colour: int) -> None:
        self._set_palette_slot("sprite_palettes", palette, slot, colour)

    def background_tile_pixels(self, index: int) -> list[list[int]]:
        return self._tile_pixels("bg_tiles", index)

    def sprite_tile_pixels(self, index: int) -> list[list[int]]:
        return self._tile_pixels("sprite_tiles", index)

    def set_background_tile_pixel(self, index: int, column: int, row: int, value: int) -> None:
        self._set_tile_pixel("bg_tiles", index, column, row, value)

    def set_sprite_tile_pixel(self, index: int, column: int, row: int, value: int) -> None:
        self._set_tile_pixel("sprite_tiles", index, column, row, value)

    def _set_tile_pixel(self, group: str, index: int, column: int, row: int, value: int) -> None:
        if not 0 <= value <= 3:
            raise ValueError("NES tile pixel must be 0..3")
        pixels = self._ensure_tile_pixels(group, index)
        if not 0 <= column < 8 or not 0 <= row < 8:
            raise IndexError("NES tile pixel coordinates must be 0..7")
        if pixels[row][column] != value:
            pixels[row][column] = value
            self.dirty = True

    def transform_background_tile(self, index: int, operation: str) -> None:
        self._transform_tile("bg_tiles", index, operation)

    def transform_sprite_tile(self, index: int, operation: str) -> None:
        self._transform_tile("sprite_tiles", index, operation)

    def duplicate_background_tile(self, index: int) -> int:
        return self._duplicate_tile("bg_tiles", index)

    def duplicate_sprite_tile(self, index: int) -> int:
        return self._duplicate_tile("sprite_tiles", index)

    def _duplicate_tile(self, group: str, index: int) -> int:
        source = copy.deepcopy(self._tile_pixels(group, index))
        target = next((candidate for candidate in range(256) if candidate != index and all(value == 0 for row in self._tile_pixels(group, candidate) for value in row)), None)
        if target is None:
            raise ValueError("No empty tile slot is available")
        self._ensure_tile_pixels(group, target)[:] = source
        self.dirty = True
        return target

    def _transform_tile(self, group: str, index: int, operation: str) -> None:
        pixels = self._ensure_tile_pixels(group, index)
        if operation == "clear":
            transformed = [[0 for _ in range(8)] for _ in range(8)]
        elif operation == "flip_h":
            transformed = [list(reversed(row)) for row in pixels]
        elif operation == "flip_v":
            transformed = list(reversed([list(row) for row in pixels]))
        elif operation == "rotate":
            transformed = [[pixels[7 - column][row] for column in range(8)] for row in range(8)]
        else:
            raise ValueError(f"Unknown tile transformation: {operation}")
        if pixels != transformed:
            pixels[:] = transformed
            self.dirty = True

    def sprite_names(self) -> list[str]:
        sprites = self.state.get("sprites")
        return [str(sprite.get("name") or f"Sprite {index + 1}") if isinstance(sprite, dict) else f"Sprite {index + 1}" for index, sprite in enumerate(sprites or [])]

    def add_sprite(self, name: str, *, role: str = "other") -> int:
        normalized = name.strip()
        if not normalized:
            raise ValueError("Sprite name cannot be empty")
        sprites = self.state.setdefault("sprites", [])
        if not isinstance(sprites, list):
            sprites = []
            self.state["sprites"] = sprites
        sprites.append({
            "name": normalized, "role": role, "width": 1, "height": 1,
            "cells": [[{"tile": 0, "palette": 0, "empty": False}]], "flying": False,
        })
        self.dirty = True
        return len(sprites) - 1

    def duplicate_sprite(self, index: int, name: str) -> int:
        normalized = name.strip()
        if not normalized:
            raise ValueError("Sprite name cannot be empty")
        sprites = self._sprites()
        if not 0 <= index < len(sprites) or not isinstance(sprites[index], dict):
            raise IndexError("Sprite index outside project")
        duplicate = copy.deepcopy(sprites[index])
        duplicate["name"] = normalized
        sprites.append(duplicate)
        self.dirty = True
        return len(sprites) - 1

    def rename_sprite(self, index: int, name: str) -> None:
        normalized = name.strip()
        if not normalized:
            raise ValueError("Sprite name cannot be empty")
        sprite = self._sprite_at(index)
        if sprite.get("name") != normalized:
            sprite["name"] = normalized
            self.dirty = True

    def delete_sprite(self, index: int) -> None:
        sprites = self._sprites()
        if not 0 <= index < len(sprites):
            raise IndexError("Sprite index outside project")
        del sprites[index]
        self.dirty = True

    def set_sprite_role(self, index: int, role: str) -> None:
        if role not in {"player", "npc", "enemy", "item", "tool", "powerup", "pickup", "projectile", "decoration", "hud", "other"}:
            raise ValueError("Unknown sprite role")
        sprite = self._sprite_at(index)
        if sprite.get("role") != role:
            sprite["role"] = role
            self.dirty = True

    def set_sprite_flying(self, index: int, flying: bool) -> None:
        sprite = self._sprite_at(index)
        if bool(sprite.get("flying", False)) != bool(flying):
            sprite["flying"] = bool(flying)
            self.dirty = True

    def resize_sprite(self, index: int, width: int, height: int) -> None:
        if not 1 <= width <= 8 or not 1 <= height <= 8:
            raise ValueError("Sprite dimensions must be 1..8 tiles")
        sprite = self._sprite_at(index)
        cells = sprite.get("cells") if isinstance(sprite.get("cells"), list) else []
        resized = [
            [
                copy.deepcopy(cells[row][column])
                if row < len(cells) and isinstance(cells[row], list) and column < len(cells[row]) and isinstance(cells[row][column], dict)
                else {"tile": 0, "palette": 0, "empty": True}
                for column in range(width)
            ]
            for row in range(height)
        ]
        if sprite.get("width") != width or sprite.get("height") != height or sprite.get("cells") != resized:
            sprite["width"], sprite["height"], sprite["cells"] = width, height, resized
            self.dirty = True

    def set_sprite_cell(self, index: int, column: int, row: int, *, tile: int, palette: int) -> None:
        sprite = self._sprite_at(index)
        width, height = int(sprite.get("width") or 1), int(sprite.get("height") or 1)
        if not 0 <= column < width or not 0 <= row < height:
            raise IndexError("Sprite cell coordinates are outside the sprite")
        if not 0 <= tile <= 255 or not 0 <= palette <= 3:
            raise ValueError("Sprite cell tile/palette is invalid")
        self.resize_sprite(index, width, height)
        cell = sprite["cells"][row][column]
        if cell.get("tile") != tile or cell.get("palette") != palette or cell.get("empty"):
            cell.update({"tile": tile, "palette": palette, "empty": False})
            self.dirty = True

    def add_animation(self, name: str, *, fps: int = 8, frames: list[int] | None = None) -> int:
        if not name.strip() or not 1 <= fps <= 60:
            raise ValueError("Animation needs a name and FPS 1..60")
        animations = self.state.setdefault("animations", [])
        if not isinstance(animations, list):
            animations = []; self.state["animations"] = animations
        identifier = int(self.state.get("nextAnimationId") or 1)
        self.state["nextAnimationId"] = identifier + 1
        animations.append({"id": identifier, "name": name.strip(), "fps": fps, "frames": list(frames or [])})
        self.dirty = True
        return len(animations) - 1

    def append_animation_frame(self, animation_index: int, sprite_index: int) -> None:
        animations = self.state.get("animations") or []
        if not 0 <= animation_index < len(animations) or not 0 <= sprite_index < len(self._sprites()):
            raise IndexError("Animation or sprite index outside project")
        animation = animations[animation_index]
        if not isinstance(animation, dict):
            raise ValueError("Animation is malformed")
        frames = animation.setdefault("frames", [])
        if not isinstance(frames, list):
            frames = []; animation["frames"] = frames
        frames.append(sprite_index)
        self.dirty = True

    def update_animation(self, animation_index: int, *, name: str | None = None, fps: int | None = None) -> None:
        animation = self._animation_at(animation_index)
        changed = False
        if name is not None:
            if not name.strip():
                raise ValueError("Animation needs a name")
            if animation.get("name") != name.strip():
                animation["name"] = name.strip()
                changed = True
        if fps is not None:
            if not 1 <= fps <= 60:
                raise ValueError("Animation FPS must be 1..60")
            if animation.get("fps") != fps:
                animation["fps"] = fps
                changed = True
        if changed:
            self.dirty = True

    def remove_animation_frame(self, animation_index: int) -> None:
        animation = self._animation_at(animation_index)
        frames = animation.get("frames")
        if not isinstance(frames, list) or not frames:
            raise ValueError("Animation has no frames to remove")
        frames.pop()
        self.dirty = True

    def delete_animation(self, animation_index: int) -> None:
        animation = self._animation_at(animation_index)
        identifier = animation.get("id")
        animations = self.state.get("animations") or []
        animations.pop(animation_index)
        assignments = self._animation_assignments()
        for key in ("walk", "jump", "attack"):
            if assignments.get(key) == identifier:
                assignments[key] = None
        self.dirty = True

    def set_animation_assignment(self, kind: str, animation_index: int | None) -> None:
        if kind not in {"walk", "jump", "attack"}:
            raise ValueError("Unknown animation assignment")
        identifier = None if animation_index is None else self._animation_at(animation_index).get("id")
        assignments = self._animation_assignments()
        if assignments.get(kind) != identifier:
            assignments[kind] = identifier
            self.dirty = True

    def set_game_style(self, style: str) -> None:
        if style not in {"platformer", "topdown", "runner", "racer", "smb"}:
            raise ValueError("Unknown game style")
        builder = self.state.setdefault("builder", {"version": 1, "modules": {}})
        modules = builder.setdefault("modules", {}) if isinstance(builder, dict) else {}
        if not isinstance(modules, dict):
            modules = {}; builder["modules"] = modules
        game = modules.setdefault("game", {"enabled": True, "config": {}})
        if not isinstance(game, dict): game = {}; modules["game"] = game
        config = game.setdefault("config", {})
        if not isinstance(config, dict): config = {}; game["config"] = config
        if config.get("type") != style:
            config["type"] = style; self.dirty = True

    def set_game_option(self, key: str, value: int) -> None:
        ranges = {
            "autoscrollSpeed": (1, 4),
            "racerTopSpeed": (1, 4),
            "racerLaps": (1, 9),
            "racerCheckpoints": (1, 2),
        }
        if key not in ranges or not ranges[key][0] <= value <= ranges[key][1]:
            raise ValueError("Invalid game option")
        builder = self.state.setdefault("builder", {"version": 1, "modules": {}})
        modules = builder.setdefault("modules", {}) if isinstance(builder, dict) else {}
        if not isinstance(modules, dict):
            modules = {}; builder["modules"] = modules
        game = modules.setdefault("game", {"enabled": True, "config": {}})
        if not isinstance(game, dict): game = {}; modules["game"] = game
        config = game.setdefault("config", {})
        if not isinstance(config, dict): config = {}; game["config"] = config
        if config.get(key) != value:
            config[key] = value
            self.dirty = True

    def set_player_option(self, key: str, value: int | str) -> None:
        ranges = {
            "startX": (0, 240), "startY": (16, 200), "walkSpeed": (1, 4),
            "jumpHeight": (8, 40), "maxHp": (0, 9),
        }
        valid = (key in ranges and isinstance(value, int) and ranges[key][0] <= value <= ranges[key][1]) or (
            key == "attackButton" and value in {"none", "a", "b"}
        )
        if not valid:
            raise ValueError("Invalid player option")
        builder = self.state.setdefault("builder", {"version": 1, "modules": {}})
        modules = builder.setdefault("modules", {}) if isinstance(builder, dict) else {}
        if not isinstance(modules, dict):
            modules = {}; builder["modules"] = modules
        players = modules.setdefault("players", {"enabled": True, "config": {"count": 1}, "submodules": {}})
        if not isinstance(players, dict): players = {}; modules["players"] = players
        submodules = players.setdefault("submodules", {})
        if not isinstance(submodules, dict): submodules = {}; players["submodules"] = submodules
        player = submodules.setdefault("player1", {"enabled": True, "config": {}})
        if not isinstance(player, dict): player = {}; submodules["player1"] = player
        config = player.setdefault("config", {})
        if not isinstance(config, dict): config = {}; player["config"] = config
        if config.get(key) != value:
            config[key] = value
            self.dirty = True

    def add_audio_song(self, filename: str, asm: str) -> int:
        if not filename or not asm:
            raise ValueError("Audio source needs a filename and content")
        audio = self._audio()
        song = self._audio_asset(filename, asm)
        audio["songs"].append(song)
        self.dirty = True
        return len(audio["songs"]) - 1

    def set_audio_sfx(self, filename: str, asm: str) -> None:
        if not filename or not asm:
            raise ValueError("Audio source needs a filename and content")
        asset = self._audio_asset(filename, asm)
        audio = self._audio()
        if audio.get("sfx") != asset:
            audio["sfx"] = asset
            self.dirty = True

    def set_default_song(self, index: int) -> None:
        songs = self._audio()["songs"]
        if not 0 <= index < len(songs):
            raise IndexError("Song index outside project")
        if self._audio().get("defaultSongIdx") != index:
            self._audio()["defaultSongIdx"] = index
            self.dirty = True

    def remove_audio_song(self, index: int) -> None:
        audio = self._audio()
        songs = audio["songs"]
        if not 0 <= index < len(songs):
            raise IndexError("Song index outside project")
        songs.pop(index)
        audio["defaultSongIdx"] = min(int(audio.get("defaultSongIdx") or 0), max(0, len(songs) - 1))
        self.dirty = True

    def clear_audio_sfx(self) -> None:
        audio = self._audio()
        if audio.get("sfx") is not None:
            audio["sfx"] = None
            self.dirty = True

    def scene_instances(self) -> list[dict[str, Any]]:
        return self._scene_node()["config"]["instances"]

    def add_scene_instance(self, sprite_index: int, *, x: int = 120, y: int = 120) -> int:
        if not 0 <= sprite_index < len(self._sprites()) or not 0 <= x <= 504 or not 0 <= y <= 464:
            raise ValueError("Scene instance is outside the project")
        instances = self.scene_instances()
        identifier = max((int(instance.get("id") or 0) for instance in instances if isinstance(instance, dict)), default=0) + 1
        instances.append({"id": identifier, "spriteIdx": sprite_index, "x": x, "y": y, "ai": "static", "speed": 1})
        self.dirty = True
        return len(instances) - 1

    def update_scene_instance(self, index: int, *, sprite_index: int | None = None, x: int | None = None, y: int | None = None, ai: str | None = None) -> None:
        instances = self.scene_instances()
        if not 0 <= index < len(instances) or not isinstance(instances[index], dict):
            raise IndexError("Scene instance outside project")
        instance = instances[index]
        changes: dict[str, Any] = {}
        if sprite_index is not None:
            if not 0 <= sprite_index < len(self._sprites()): raise ValueError("Sprite index outside project")
            changes["spriteIdx"] = sprite_index
        if x is not None:
            if not 0 <= x <= 504: raise ValueError("Scene X must be 0..504")
            changes["x"] = x
        if y is not None:
            if not 0 <= y <= 464: raise ValueError("Scene Y must be 0..464")
            changes["y"] = y
        if ai is not None:
            if ai not in {"static", "walker", "chaser", "goomba", "koopa", "item", "flyer", "patrol"}: raise ValueError("Unknown scene AI")
            changes["ai"] = ai
        if any(instance.get(key) != value for key, value in changes.items()):
            instance.update(changes)
            self.dirty = True

    def delete_scene_instance(self, index: int) -> None:
        instances = self.scene_instances()
        if not 0 <= index < len(instances):
            raise IndexError("Scene instance outside project")
        instances.pop(index)
        self.dirty = True

    def _sprites(self) -> list[Any]:
        sprites = self.state.setdefault("sprites", [])
        if not isinstance(sprites, list):
            sprites = []
            self.state["sprites"] = sprites
        return sprites

    def _animation_at(self, index: int) -> dict[str, Any]:
        animations = self.state.get("animations") or []
        if not 0 <= index < len(animations) or not isinstance(animations[index], dict):
            raise IndexError("Animation index outside project")
        return animations[index]

    def _animation_assignments(self) -> dict[str, Any]:
        assignments = self.state.setdefault("animation_assignments", {})
        if not isinstance(assignments, dict):
            assignments = {}
            self.state["animation_assignments"] = assignments
        for key in ("walk", "jump", "attack"):
            assignments.setdefault(key, None)
        return assignments

    def _audio(self) -> dict[str, Any]:
        audio = self.state.setdefault("audio", {"songs": [], "sfx": None, "defaultSongIdx": 0})
        if not isinstance(audio, dict):
            audio = {"songs": [], "sfx": None, "defaultSongIdx": 0}
            self.state["audio"] = audio
        if not isinstance(audio.get("songs"), list):
            audio["songs"] = []
        if "sfx" not in audio:
            audio["sfx"] = None
        if not isinstance(audio.get("defaultSongIdx"), int):
            audio["defaultSongIdx"] = 0
        return audio

    def _scene_node(self) -> dict[str, Any]:
        builder = self.state.setdefault("builder", {"version": 1, "modules": {}})
        modules = builder.setdefault("modules", {}) if isinstance(builder, dict) else {}
        if not isinstance(modules, dict): modules = {}; builder["modules"] = modules
        scene = modules.setdefault("scene", {"enabled": True, "config": {"instances": []}})
        if not isinstance(scene, dict): scene = {}; modules["scene"] = scene
        scene["enabled"] = True
        config = scene.setdefault("config", {})
        if not isinstance(config, dict): config = {}; scene["config"] = config
        if not isinstance(config.get("instances"), list): config["instances"] = []
        return scene

    @staticmethod
    def _audio_asset(filename: str, asm: str) -> dict[str, Any]:
        match = re.search(r"^\s*\.export\s+_?([A-Za-z_][A-Za-z0-9_]*)\b", asm, re.MULTILINE)
        name = re.sub(r"\.(s|asm)$", "", Path(filename).name, flags=re.IGNORECASE)
        return {"name": name, "filename": Path(filename).name, "symbol": match.group(1) if match else None, "asm": asm, "size": len(asm.encode("utf-8"))}

    def _sprite_at(self, index: int) -> dict[str, Any]:
        sprites = self._sprites()
        if not 0 <= index < len(sprites) or not isinstance(sprites[index], dict):
            raise IndexError("Sprite index outside project")
        return sprites[index]

    def _tile_pixels(self, group: str, index: int) -> list[list[int]]:
        if not 0 <= index < 256:
            raise IndexError("NES tile index must be 0..255")
        tiles = self.state.get(group)
        tile = tiles[index] if isinstance(tiles, list) and index < len(tiles) else None
        pixels = tile.get("pixels") if isinstance(tile, dict) else None
        if not isinstance(pixels, list) or len(pixels) < 8:
            return [[0 for _ in range(8)] for _ in range(8)]
        return [
            [int(row[column]) & 3 if isinstance(row, list) and column < len(row) else 0 for column in range(8)]
            for row in pixels[:8]
        ]

    def _ensure_tile_pixels(self, group: str, index: int) -> list[list[int]]:
        tiles = self.state.setdefault(group, [])
        if not isinstance(tiles, list):
            tiles = []
            self.state[group] = tiles
        while len(tiles) < 256:
            tiles.append({"name": "", "pixels": [[0 for _ in range(8)] for _ in range(8)]})
        tile = tiles[index]
        if not isinstance(tile, dict):
            tile = {"name": ""}
            tiles[index] = tile
        pixels = self._tile_pixels(group, index)
        tile["pixels"] = pixels
        return pixels

    def _palette(self, group: str, index: int) -> tuple[int, int, int]:
        if not 0 <= index < 4:
            raise IndexError("Palette index must be 0..3")
        palettes = self.state.get(group)
        entry = palettes[index] if isinstance(palettes, list) and index < len(palettes) else None
        slots = entry.get("slots") if isinstance(entry, dict) else None
        values = slots if isinstance(slots, list) and len(slots) >= 3 else [0x0F, 0x0F, 0x0F]
        return tuple(int(value) & 0x3F for value in values[:3])

    def _set_palette_slot(self, group: str, palette: int, slot: int, colour: int) -> None:
        if not 0 <= palette < 4 or not 0 <= slot < 3:
            raise IndexError("Palette and slot must be in range")
        if not 0 <= colour <= 0x3F:
            raise ValueError("NES palette colour must be 0x00..0x3F")
        palettes = self.state.setdefault(group, [])
        if not isinstance(palettes, list):
            palettes = []
            self.state[group] = palettes
        while len(palettes) < 4:
            palettes.append({"slots": [0x0F, 0x0F, 0x0F]})
        entry = palettes[palette]
        if not isinstance(entry, dict):
            entry = {}
            palettes[palette] = entry
        slots = entry.get("slots")
        if not isinstance(slots, list):
            slots = list(self._palette(group, palette))
            entry["slots"] = slots
        while len(slots) < 3:
            slots.append(0x0F)
        if int(slots[slot]) != colour:
            slots[slot] = colour
            self.dirty = True

    def world_grid_options(self) -> tuple[bool, bool]:
        native_ui = self.state.get("nativeUi")
        world = native_ui.get("world") if isinstance(native_ui, dict) else None
        return (
            bool(world.get("showGrid", True)) if isinstance(world, dict) else True,
            bool(world.get("showAttributes", True)) if isinstance(world, dict) else True,
        )

    def set_world_grid_options(self, *, show_grid: bool, show_attributes: bool) -> None:
        native_ui = self.state.setdefault("nativeUi", {})
        if not isinstance(native_ui, dict):
            native_ui = {}
            self.state["nativeUi"] = native_ui
        world = native_ui.setdefault("world", {})
        if not isinstance(world, dict):
            world = {}
            native_ui["world"] = world
        value = {"showGrid": bool(show_grid), "showAttributes": bool(show_attributes)}
        if world != value:
            world.clear()
            world.update(value)
            self.dirty = True

    def select_background(self, index: int) -> None:
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list) or not 0 <= index < len(backgrounds):
            raise IndexError(f"Background index outside project: {index}")
        candidate = copy.deepcopy(self.state)
        candidate["selectedBgIdx"] = index
        self._world_grid(candidate)
        if self.selected_background_index != index:
            self.state["selectedBgIdx"] = index
            self.dirty = True

    def add_background(self, name: str, *, duplicate_selected: bool = False) -> int:
        """Add a blank room or a deep copy of the selected room and select it."""

        normalized = name.strip()
        if not normalized:
            raise ValueError("Background name cannot be empty")
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list):
            raise ProjectFormatError("Project has no editable backgrounds")
        if duplicate_selected:
            background = copy.deepcopy(self._selected_background())
            background["name"] = normalized
        else:
            background = {
                "name": normalized,
                "dimensions": {"screens_x": 1, "screens_y": 1},
                "nametable": [
                    [{"tile": 0, "palette": 0} for _ in range(32)] for _ in range(30)
                ],
                "behaviour": [[0 for _ in range(32)] for _ in range(30)],
            }
        backgrounds.append(background)
        self.state["selectedBgIdx"] = len(backgrounds) - 1
        self.dirty = True
        return len(backgrounds) - 1

    def rename_background(self, index: int, name: str) -> None:
        normalized = name.strip()
        if not normalized:
            raise ValueError("Background name cannot be empty")
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list) or not 0 <= index < len(backgrounds):
            raise IndexError(f"Background index outside project: {index}")
        background = backgrounds[index]
        if not isinstance(background, dict):
            raise ProjectFormatError("Selected background is not an object")
        if background.get("name") != normalized:
            background["name"] = normalized
            self.dirty = True

    def delete_background(self, index: int) -> None:
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list) or not 0 <= index < len(backgrounds):
            raise IndexError(f"Background index outside project: {index}")
        if len(backgrounds) == 1:
            raise ValueError("A project must keep at least one background")
        del backgrounds[index]
        selected = self.selected_background_index
        self.state["selectedBgIdx"] = min(selected - (1 if index < selected else 0), len(backgrounds) - 1)
        self.dirty = True

    def background_dimensions(self, index: int | None = None) -> tuple[int, int]:
        background = self._background_at(self.selected_background_index if index is None else index)
        dimensions = background.get("dimensions")
        if not isinstance(dimensions, dict):
            raise ProjectFormatError("Background has no dimensions")
        try:
            return int(dimensions["screens_x"]), int(dimensions["screens_y"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ProjectFormatError("Background dimensions are invalid") from exc

    def set_background_dimensions(self, screens_x: int, screens_y: int) -> None:
        if (screens_x, screens_y) not in {(1, 1), (2, 1), (1, 2), (2, 2)}:
            raise ValueError("WORLD layout must be 1×1, 2×1, 1×2, or 2×2")
        background = self._selected_background()
        old_x, old_y = self.background_dimensions()
        if (old_x, old_y) == (screens_x, screens_y):
            return
        columns, rows = screens_x * 32, screens_y * 30
        old_grid = background.get("nametable") if isinstance(background.get("nametable"), list) else []
        old_behaviour = background.get("behaviour") if isinstance(background.get("behaviour"), list) else []
        background["nametable"] = [
            [
                copy.deepcopy(old_grid[row][col])
                if row < len(old_grid) and isinstance(old_grid[row], list) and col < len(old_grid[row]) and isinstance(old_grid[row][col], dict)
                else {"tile": 0, "palette": 0}
                for col in range(columns)
            ]
            for row in range(rows)
        ]
        background["behaviour"] = [
            [
                int(old_behaviour[row][col]) & 0xFF
                if row < len(old_behaviour) and isinstance(old_behaviour[row], list) and col < len(old_behaviour[row])
                else 0
                for col in range(columns)
            ]
            for row in range(rows)
        ]
        background["dimensions"] = {"screens_x": screens_x, "screens_y": screens_y}
        self.dirty = True

    def snapshot(self) -> dict[str, Any]:
        return copy.deepcopy(self.state)

    def immutable_snapshot(self) -> ProjectSnapshot:
        return ProjectSnapshot.from_state(self.state)

    @property
    def engine_version(self) -> int:
        return max(1, int(self.state.get("engineVersion") or 1))

    def set_engine_version(
        self, version: int, *, current: int, allow_downgrade: bool = False
    ) -> None:
        if not 1 <= version <= current:
            raise ValueError(f"Engine version must be 1..{current}: {version}")
        if version < self.engine_version and not allow_downgrade:
            raise ValueError("Engine downgrade requires explicit confirmation")
        if version != self.engine_version:
            self.state["engineVersion"] = version
            self.dirty = True

    @classmethod
    def validate(cls, state: dict[str, Any]) -> tuple[ValidationIssue, ...]:
        issues = []
        version = state.get("version")
        if not isinstance(version, int) or version < 1:
            issues.append(ValidationIssue("version", "must be a positive integer"))
        elif version > CURRENT_SCHEMA_VERSION:
            issues.append(
                ValidationIssue(
                    "version",
                    f"future schema {version} is preserved but only schema {CURRENT_SCHEMA_VERSION} is understood",
                    "warning",
                )
            )
        backgrounds = state.get("backgrounds")
        if not isinstance(backgrounds, list) or not backgrounds:
            issues.append(ValidationIssue("backgrounds", "must contain at least one background"))
            return tuple(issues)
        selected = state.get("selectedBgIdx")
        if not isinstance(selected, int) or not 0 <= selected < len(backgrounds):
            issues.append(ValidationIssue("selectedBgIdx", "is outside the background list"))
        for bg_index, background in enumerate(backgrounds):
            prefix = f"backgrounds[{bg_index}]"
            if not isinstance(background, dict):
                issues.append(ValidationIssue(prefix, "must be an object"))
                continue
            dimensions = background.get("dimensions")
            if not isinstance(dimensions, dict):
                issues.append(ValidationIssue(prefix + ".dimensions", "must be an object"))
                continue
            try:
                screens_x = int(dimensions.get("screens_x"))
                screens_y = int(dimensions.get("screens_y"))
            except (TypeError, ValueError):
                screens_x = screens_y = 0
            if screens_x < 1 or screens_y < 1:
                issues.append(ValidationIssue(prefix + ".dimensions", "screen counts must be positive"))
                continue
            required_columns, required_rows = screens_x * 32, screens_y * 30
            grid = background.get("nametable")
            if not isinstance(grid, list) or len(grid) < required_rows:
                issues.append(ValidationIssue(prefix + ".nametable", f"needs {required_rows} rows"))
                continue
            for row_index, row in enumerate(grid[:required_rows]):
                if not isinstance(row, list) or len(row) < required_columns:
                    issues.append(
                        ValidationIssue(
                            f"{prefix}.nametable[{row_index}]",
                            f"needs {required_columns} columns",
                        )
                    )
                    continue
                for column, cell in enumerate(row[:required_columns]):
                    if not isinstance(cell, dict):
                        issues.append(
                            ValidationIssue(
                                f"{prefix}.nametable[{row_index}][{column}]",
                                "must be an object",
                            )
                        )
                        continue
                    try:
                        tile, palette = int(cell.get("tile", 0)), int(cell.get("palette", 0))
                    except (TypeError, ValueError):
                        tile = palette = -1
                    if not 0 <= tile <= 255:
                        issues.append(ValidationIssue(f"{prefix}.nametable[{row_index}][{column}].tile", "must be 0..255"))
                    if not 0 <= palette <= 3:
                        issues.append(ValidationIssue(f"{prefix}.nametable[{row_index}][{column}].palette", "must be 0..3"))
        return tuple(issues)

    @staticmethod
    def _world_grid(state: dict[str, Any]) -> list[list[dict[str, Any]]]:
        backgrounds = state.get("backgrounds")
        if not isinstance(backgrounds, list) or not backgrounds:
            raise ProjectFormatError("Project has no editable backgrounds")
        index = state.get("selectedBgIdx", 0)
        if not isinstance(index, int) or not 0 <= index < len(backgrounds):
            raise ProjectFormatError("Selected background index is invalid")
        background = backgrounds[index]
        if not isinstance(background, dict):
            raise ProjectFormatError("Selected background is not an object")
        grid = background.get("nametable")
        if not isinstance(grid, list) or len(grid) < 30:
            raise ProjectFormatError("Selected background has no 30-row nametable")
        if any(not isinstance(row, list) or len(row) < 32 for row in grid[:30]):
            raise ProjectFormatError("Selected background has no 32-column nametable")
        for row_index, row in enumerate(grid[:30]):
            for col_index, cell in enumerate(row[:32]):
                if not isinstance(cell, dict):
                    raise ProjectFormatError(
                        f"WORLD cell {col_index}, {row_index} is not an object"
                    )
        return grid

    def world_tiles(self, screen_x: int = 0, screen_y: int = 0) -> list[list[int]]:
        grid = self._world_grid(self.state)
        left, top = self._screen_origin(screen_x, screen_y)
        return [
            [int(cell.get("tile", 0)) for cell in row[left : left + 32]]
            for row in grid[top : top + 30]
        ]

    def world_palettes(self, screen_x: int = 0, screen_y: int = 0) -> list[list[int]]:
        grid = self._world_grid(self.state)
        left, top = self._screen_origin(screen_x, screen_y)
        return [
            [int(cell.get("palette", 0)) & 3 for cell in row[left : left + 32]]
            for row in grid[top : top + 30]
        ]

    def world_behaviours(self, screen_x: int = 0, screen_y: int = 0) -> list[list[int]]:
        background = self._selected_background()
        behaviour = background.get("behaviour")
        if not isinstance(behaviour, list):
            return [[0 for _ in range(32)] for _ in range(30)]
        if len(behaviour) < 30 or any(
            not isinstance(row, list) or len(row) < 32 for row in behaviour[:30]
        ):
            raise ProjectFormatError("Selected background has no 32 by 30 behaviour map")
        left, top = self._screen_origin(screen_x, screen_y)
        return [
            [int(value) & 0xFF for value in row[left : left + 32]]
            for row in behaviour[top : top + 30]
        ]

    def _selected_background(self) -> dict[str, Any]:
        return self._background_at(self.selected_background_index)

    def _background_at(self, index: int) -> dict[str, Any]:
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list) or not 0 <= index < len(backgrounds):
            raise IndexError(f"Background index outside project: {index}")
        background = backgrounds[index]
        if not isinstance(background, dict):
            raise ProjectFormatError("Selected background is not an object")
        return background

    def set_world_tile(self, col: int, row: int, tile: int) -> None:
        if not 0 <= tile <= 0xFF:
            raise ValueError(f"NES tile index must be 0..255: {tile}")
        self._validate_coordinates(col, row)
        grid = self._world_grid(self.state)
        cell = grid[row][col]
        if int(cell.get("tile", 0)) != tile:
            cell["tile"] = tile
            self.dirty = True

    def set_world_palette(self, col: int, row: int, palette: int) -> None:
        if not 0 <= palette <= 3:
            raise ValueError(f"NES background palette must be 0..3: {palette}")
        self._set_world_cell_field(col, row, "palette", palette)

    def set_world_behaviour(self, col: int, row: int, behaviour: int) -> None:
        if not 0 <= behaviour <= 0xFF:
            raise ValueError(f"WORLD behaviour must be 0..255: {behaviour}")
        self._validate_coordinates(col, row)
        background = self._selected_background()
        values = background.get("behaviour")
        if not isinstance(values, list):
            screens_x, screens_y = self.background_dimensions()
            values = [[0 for _ in range(screens_x * 32)] for _ in range(screens_y * 30)]
            background["behaviour"] = values
        if int(values[row][col]) != behaviour:
            values[row][col] = behaviour
            self.dirty = True

    def _set_world_cell_field(self, col: int, row: int, field: str, value: int) -> None:
        self._validate_coordinates(col, row)
        cell = self._world_grid(self.state)[row][col]
        if not isinstance(cell, dict):
            raise ProjectFormatError(f"WORLD cell {col}, {row} is not an object")
        if int(cell.get(field, 0)) != value:
            cell[field] = value
            self.dirty = True

    def _screen_origin(self, screen_x: int, screen_y: int) -> tuple[int, int]:
        columns, rows = self.background_dimensions()
        if not 0 <= screen_x < columns or not 0 <= screen_y < rows:
            raise IndexError(f"WORLD screen outside {columns}x{rows}: {screen_x}, {screen_y}")
        return screen_x * 32, screen_y * 30

    def _validate_coordinates(self, col: int, row: int) -> None:
        screens_x, screens_y = self.background_dimensions()
        if not 0 <= col < screens_x * 32 or not 0 <= row < screens_y * 30:
            raise IndexError(f"WORLD cell outside {screens_x * 32}x{screens_y * 30}: {col}, {row}")


def _json_bytes(state: dict[str, Any]) -> bytes:
    return (json.dumps(state, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
