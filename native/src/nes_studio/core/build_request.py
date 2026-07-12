"""Toolkit-independent browser-compatible Play request construction."""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass
from typing import Any, Callable

from .project_document import ProjectSnapshot

Assembler = Callable[[dict[str, Any]], str]


@dataclass(frozen=True, slots=True)
class BuildRequest:
    json_bytes: bytes

    def to_dict(self) -> dict[str, Any]:
        return json.loads(self.json_bytes)


class BuildRequestFactory:
    def __init__(
        self,
        *,
        target_engine: int,
        builder_defaults: dict[str, Any],
        assembler: Assembler,
    ) -> None:
        self.target_engine = target_engine
        self.builder_defaults = copy.deepcopy(builder_defaults)
        self.assembler = assembler

    def create(
        self,
        snapshot: ProjectSnapshot,
        *,
        mode: str = "browser",
        custom_main_c: str | None = None,
        custom_main_asm: str | None = None,
    ) -> BuildRequest:
        if custom_main_c is not None and custom_main_asm is not None:
            raise ValueError("Only one custom source language may be selected")
        state = self._fortify(snapshot.state())
        source_c = custom_main_c
        source_asm = custom_main_asm
        if source_c is None and source_asm is None:
            source_c = self.assembler(copy.deepcopy(state))
        players = self._derive_players(state)
        payload: dict[str, Any] = {
            "state": state,
            "playerSpriteIdx": max(0, players["player_index"]),
            "playerStart": players["start"],
            "sceneSprites": self._derive_scene_sprites(state, players["player_index"]),
            "mode": "native" if mode == "native" else "browser",
            "targetEngine": self.target_engine,
        }
        if source_c is not None:
            payload["customMainC"] = source_c
        if source_asm is not None:
            payload["customMainAsm"] = source_asm
        if players["player_index_2"] >= 0:
            payload["playerSpriteIdx2"] = players["player_index_2"]
            payload["playerStart2"] = players["start_2"]
        payload.update(self._audio_payload(state))
        return BuildRequest(
            (json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
        )

    def _fortify(self, source: dict[str, Any]) -> dict[str, Any]:
        state = copy.deepcopy(source)
        if not isinstance(state.get("builder"), dict) or state["builder"].get("version") != 1:
            state["builder"] = copy.deepcopy(self.builder_defaults)
        sprites = state.get("sprites") if isinstance(state.get("sprites"), list) else []
        if not any(isinstance(sprite, dict) and sprite.get("role") == "player" for sprite in sprites):
            sprites = list(sprites)
            sprites.append(_stub_player())
            state["sprites"] = sprites
        if not isinstance(state.get("audio"), dict) or not isinstance(
            state["audio"].get("songs"), list
        ):
            state["audio"] = {"songs": [], "sfx": None, "defaultSongIdx": 0}
        return state

    @staticmethod
    def _module(state: dict[str, Any], identifier: str) -> dict[str, Any] | None:
        parts = identifier.split(".")
        node = ((state.get("builder") or {}).get("modules") or {}).get(parts[0])
        for part in parts[1:]:
            node = (node.get("submodules") or {}).get(part) if isinstance(node, dict) else None
        return node if isinstance(node, dict) else None

    def _derive_players(self, state: dict[str, Any]) -> dict[str, Any]:
        indices = [
            index
            for index, sprite in enumerate(state.get("sprites") or [])
            if isinstance(sprite, dict) and sprite.get("role") == "player"
        ]
        player_index = indices[0] if indices else -1
        player_1 = self._module(state, "players.player1") or {}
        player_2 = self._module(state, "players.player2") or {}
        config_1, config_2 = player_1.get("config") or {}, player_2.get("config") or {}
        player_index_2 = indices[1] if player_2.get("enabled") and len(indices) > 1 else -1
        return {
            "player_index": player_index,
            "start": {"x": config_1.get("startX", 60), "y": config_1.get("startY", 120)},
            "player_index_2": player_index_2,
            "start_2": {"x": config_2.get("startX", 180), "y": config_2.get("startY", 120)},
        }

    def _derive_scene_sprites(
        self, state: dict[str, Any], player_index: int
    ) -> list[dict[str, int]]:
        scene = self._module(state, "scene") or {}
        instances = (scene.get("config") or {}).get("instances") or []
        if instances:
            return [
                {
                    "spriteIdx": int(instance.get("spriteIdx", 0)),
                    "x": int(instance.get("x", 0)),
                    "y": int(instance.get("y", 0)),
                }
                for instance in instances
                if isinstance(instance, dict)
                and 0 <= int(instance.get("spriteIdx", -1)) < len(state.get("sprites") or [])
            ]
        included = {
            "enemy",
            "npc",
            "pickup",
            "powerup",
            "item",
            "tool",
            "projectile",
            "decoration",
        }
        output = []
        cursor_x = 96
        for index, sprite in enumerate(state.get("sprites") or []):
            if index == player_index or not isinstance(sprite, dict) or sprite.get("role") not in included:
                continue
            width = (sprite.get("width") or 2) * 8
            output.append({"spriteIdx": index, "x": min(240 - width, cursor_x), "y": 120})
            cursor_x += width + 24
            if cursor_x > 240:
                break
        return output

    @staticmethod
    def _audio_payload(state: dict[str, Any]) -> dict[str, str]:
        audio = state.get("audio") or {"songs": [], "sfx": None}
        songs = audio.get("songs") if isinstance(audio.get("songs"), list) else []
        identifier = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
        payload = {}
        populated = [song for song in songs if isinstance(song, dict) and str(song.get("asm") or "").strip()]
        if populated:
            index = audio.get("defaultSongIdx", 0)
            index = index if isinstance(index, int) and 0 <= index < len(songs) else 0
            default = songs[index] if index < len(songs) else None
            if isinstance(default, dict) and identifier.fullmatch(str(default.get("symbol") or "")):
                source = "\n\n".join(str(song.get("asm") or "") for song in songs if str(song.get("asm") or "").strip())
                symbol = default["symbol"]
                payload["audioSongsAsm"] = source + (
                    "\n\n; Alias the pupil-chosen default song to the symbol\n"
                    "; main.c imports.  Phase 4.3.\n"
                    f".export _audio_default_music:={symbol}\n"
                    f".export audio_default_music:={symbol}\n"
                )
        sfx = audio.get("sfx")
        if isinstance(sfx, dict) and str(sfx.get("asm") or "").strip():
            symbol = str(sfx.get("symbol") or "sounds")
            if identifier.fullmatch(symbol):
                payload["audioSfxAsm"] = str(sfx["asm"]) + (
                    "\n\n; Alias the FamiStudio-exported `sounds` symbol to the\n"
                    "; one main.c imports.  Phase 4.3.\n"
                    f".export _audio_sfx_data:={symbol}\n"
                    f".export audio_sfx_data:={symbol}\n"
                )
        return payload


def _stub_player() -> dict[str, Any]:
    return {
        "role": "player",
        "name": "(placeholder player — make one on the Sprites page)",
        "width": 2,
        "height": 2,
        "cells": [
            [{"tile": 0, "palette": 0, "empty": True} for _ in range(2)]
            for _ in range(2)
        ],
    }
