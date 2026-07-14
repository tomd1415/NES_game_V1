"""RULES and STYLE.

STYLE is the missing 8th mode — game type and physics used to sit at the top of
RULES, above forty unrelated fields.
"""

from __future__ import annotations

import unittest

from support import StudioTest


class StyleModeTests(StudioTest):
    def style(self, window):
        window.select_mode("STYLE")
        return window.modes["STYLE"]

    def test_choosing_a_game_type(self) -> None:
        window = self.window("basics")
        style = self.style(window)

        style.game_style.setCurrentIndex(style.game_style.findData("racer"))

        self.assertEqual(
            window.document.state["builder"]["modules"]["game"]["config"]["type"], "racer"
        )

    def test_fields_a_game_type_does_not_use_are_hidden(self) -> None:
        """Every racer field used to be shown in a platformer, where it does
        nothing at all."""

        window = self.window("basics")
        style = self.style(window)

        style.game_style.setCurrentIndex(style.game_style.findData("platformer"))
        self.assertTrue(style.cards["racer"].isHidden())
        self.assertFalse(style.cards["gravity"].isHidden())

        style.game_style.setCurrentIndex(style.game_style.findData("racer"))
        self.assertFalse(style.cards["racer"].isHidden())
        self.assertTrue(style.cards["gravity"].isHidden())

        style.game_style.setCurrentIndex(style.game_style.findData("topdown"))
        self.assertTrue(style.cards["gravity"].isHidden(), "top-down has no gravity")

    def test_racer_settings_round_trip(self) -> None:
        window = self.window("basics")
        style = self.style(window)
        style.game_style.setCurrentIndex(style.game_style.findData("racer"))

        style.racer_top_speed.setValue(4)
        style.racer_laps.setValue(5)

        config = window.document.state["builder"]["modules"]["game"]["config"]
        self.assertEqual(config["racerTopSpeed"], 4)
        self.assertEqual(config["racerLaps"], 5)

    def test_physics_round_trips(self) -> None:
        window = self.window("basics")
        style = self.style(window)
        style.gravity.setValue(3)
        style.walk_bob.setChecked(True)

        config = window.document.state["builder"]["modules"]["globals"]["config"]
        self.assertEqual(config["gravityPx"], 3)
        self.assertTrue(config["bobWhenWalking"])

    def test_labels_are_real_labels_not_spin_box_prefixes(self) -> None:
        """`Racer laps: 3` was a *prefix*, rendered inside the spin box as part of
        its value — unreachable to a screen reader as a label."""

        window = self.window("basics")
        style = self.style(window)
        self.assertEqual(style.racer_laps.prefix(), "")
        self.assertEqual(style.gravity.prefix(), "")


class RulesModeTests(StudioTest):
    def rules(self, window):
        window.select_mode("RULES")
        return window.modes["RULES"]

    def test_the_panel_renders(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)
        rules.resize(700, 900)
        self.assertRenders(rules, minimum_colours=4)

    def test_player_options_round_trip(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)
        rules.player_options["startX"].setValue(88)
        rules.attack_button.setCurrentIndex(rules.attack_button.findData("a"))

        config = window.document.state["builder"]["modules"]["players"]["submodules"]["player1"][
            "config"
        ]
        self.assertEqual(config["startX"], 88)
        self.assertEqual(config["attackButton"], "a")

    def test_damage_options_round_trip(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)
        rules.damage_respawn_hp.setValue(3)
        rules.stomp_defeat.setChecked(True)

        config = window.document.state["builder"]["modules"]["damage"]["config"]
        self.assertEqual(config["respawnHp"], 3)
        self.assertTrue(config["stompDefeat"])

    def test_modules_toggle(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)

        rules.hud_enabled.setChecked(True)
        self.assertTrue(window.document.state["builder"]["modules"]["hud"]["enabled"])

        rules.doors_enabled.setChecked(True)
        rules.doors_spawn_x.setValue(88)
        doors = window.document.state["builder"]["modules"]["doors"]
        self.assertTrue(doors["enabled"])
        self.assertEqual(doors["config"]["spawnX"], 88)

    def test_dialogue_round_trips(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)
        rules.dialogue_enabled.setChecked(True)
        rules.dialogue_lines["text"].setText("HELLO")
        rules.dialogue_lines["text"].editingFinished.emit()
        rules.dialogue_proximity.setValue(3)

        config = window.document.state["builder"]["modules"]["dialogue"]["config"]
        self.assertEqual(config["text"], "HELLO")
        self.assertEqual(config["proximity"], 3)

    def test_win_condition_round_trips(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)
        rules.win_enabled.setChecked(True)
        rules.win_type.setCurrentIndex(rules.win_type.findData("all_pickups_collected"))

        config = window.document.state["builder"]["modules"]["win_condition"]["config"]
        self.assertEqual(config["type"], "all_pickups_collected")

    def test_spawn_effect_round_trips(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)
        rules.spawn_enabled.setChecked(True)
        rules.spawn_ttl.setValue(48)

        spawn = window.document.state["builder"]["modules"]["spawn"]
        self.assertTrue(spawn["enabled"])
        self.assertEqual(spawn["config"]["ttl"], 48)

    def test_a_rules_edit_is_undoable(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)
        before = window.document.state["builder"]["modules"]["hud"]["enabled"]

        rules.hud_enabled.setChecked(not before)
        self.assertTrue(window.store.undo())
        self.assertEqual(
            window.document.state["builder"]["modules"]["hud"]["enabled"], before
        )

    def test_the_dock_summarises_what_is_on(self) -> None:
        window = self.window("basics")
        rules = self.rules(window)
        rules.doors_enabled.setChecked(True)
        self.assertIn("✓  Doors", rules.summary.text())


if __name__ == "__main__":
    unittest.main()
