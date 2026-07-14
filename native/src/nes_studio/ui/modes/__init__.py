"""The Studio's modes, one module each.

`MainWindow` used to build all of them inline, in a single 597-line method.
Adding a mode meant editing four places in a 3,000-line file; now it means
adding a class here.

The order is the order of the mode rail, and therefore of the `1`..`8`
shortcuts.
"""

from __future__ import annotations

from .base import Level, Mode, ModeContext
from .chars import CharsMode
from .code import CodeMode
from .pals import PalsMode
from .rules import RulesMode
from .sound import SoundMode
from .style import StyleMode
from .tiles import TilesMode
from .world import WorldMode

#: Rail order. WORLD first, because it is where a pupil starts.
MODE_CLASSES: tuple[type[Mode], ...] = (
    WorldMode,
    CharsMode,
    TilesMode,
    PalsMode,
    StyleMode,
    RulesMode,
    SoundMode,
    CodeMode,
)

MODE_NAMES: tuple[str, ...] = tuple(mode.id for mode in MODE_CLASSES)

__all__ = [
    "MODE_CLASSES",
    "MODE_NAMES",
    "CharsMode",
    "CodeMode",
    "Level",
    "Mode",
    "ModeContext",
    "PalsMode",
    "RulesMode",
    "SoundMode",
    "StyleMode",
    "TilesMode",
    "WorldMode",
]
