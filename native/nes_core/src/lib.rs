//! Python bindings for an embedded NES core.
//!
//! Wraps `tetanes-core` (MIT OR Apache-2.0) so the native Studio can run a ROM
//! inside its own CRT stage, with audio, instead of shelling out to FCEUX.
//!
//! The Python-facing API is deliberately core-neutral: it exposes a frame of
//! RGBA pixels and a frame of f32 audio samples, and nothing about tetanes.
//! Swapping the core should mean rewriting only this file.

use pyo3::exceptions::{PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::PyBytes;
use std::io::Cursor;

use tetanes_core::common::{Reset, ResetKind};
use tetanes_core::control_deck::ControlDeck;
use tetanes_core::input::{JoypadBtn, Player};

/// NES output resolution. RGBA, so four bytes per pixel.
const WIDTH: usize = 256;
const HEIGHT: usize = 240;
const FRAME_BYTES: usize = WIDTH * HEIGHT * 4;

fn player_from(slot: u8) -> PyResult<Player> {
    match slot {
        1 => Ok(Player::One),
        2 => Ok(Player::Two),
        other => Err(PyValueError::new_err(format!(
            "player must be 1 or 2, got {other}"
        ))),
    }
}

fn button_from(name: &str) -> PyResult<JoypadBtn> {
    match name.to_ascii_lowercase().as_str() {
        "up" => Ok(JoypadBtn::Up),
        "down" => Ok(JoypadBtn::Down),
        "left" => Ok(JoypadBtn::Left),
        "right" => Ok(JoypadBtn::Right),
        "a" => Ok(JoypadBtn::A),
        "b" => Ok(JoypadBtn::B),
        "start" => Ok(JoypadBtn::Start),
        "select" => Ok(JoypadBtn::Select),
        other => Err(PyValueError::new_err(format!("unknown button {other:?}"))),
    }
}

/// A running NES.
#[pyclass]
struct Nes {
    deck: ControlDeck,
    frame: Vec<u8>,
    loaded: bool,
}

#[pymethods]
impl Nes {
    /// `sample_rate` must match the QAudioSink format the samples are played through.
    #[new]
    #[pyo3(signature = (sample_rate = 44100.0))]
    fn new(sample_rate: f32) -> Self {
        let mut deck = ControlDeck::new();
        deck.set_sample_rate(sample_rate);
        Self {
            deck,
            frame: vec![0; FRAME_BYTES],
            loaded: false,
        }
    }

    #[classattr]
    const WIDTH: usize = WIDTH;
    #[classattr]
    const HEIGHT: usize = HEIGHT;

    /// Load a ROM from the raw bytes of a `.nes` file.
    #[pyo3(signature = (rom, name = "game"))]
    fn load_rom(&mut self, rom: &[u8], name: &str) -> PyResult<()> {
        let mut cursor = Cursor::new(rom);
        self.deck
            .load_rom(name, &mut cursor)
            .map_err(|err| PyRuntimeError::new_err(format!("could not load ROM: {err}")))?;
        self.loaded = true;
        Ok(())
    }

    fn reset(&mut self) {
        self.deck.reset(ResetKind::Hard);
    }

    /// Advance exactly one frame.
    ///
    /// Returns `(pixels, samples)` — 256x240 RGBA bytes, and the audio produced
    /// during this frame. The sample count varies frame to frame, which is why
    /// this does not use tetanes' fixed-length `clock_frame_into`.
    fn clock_frame<'py>(&mut self, py: Python<'py>) -> PyResult<(Bound<'py, PyBytes>, Vec<f32>)> {
        if !self.loaded {
            return Err(PyRuntimeError::new_err("no ROM loaded"));
        }
        self.deck
            .clock_frame()
            .map_err(|err| PyRuntimeError::new_err(format!("emulation failed: {err}")))?;
        self.deck.frame_buffer_into(&mut self.frame);
        let samples = self.deck.audio_samples().to_vec();
        self.deck.clear_audio_samples();
        Ok((PyBytes::new(py, &self.frame), samples))
    }

    /// Press or release a button. `player` is 1 or 2.
    fn set_button(&mut self, player: u8, button: &str, pressed: bool) -> PyResult<()> {
        let slot = player_from(player)?;
        let btn = button_from(button)?;
        self.deck.joypad_mut(slot).set_button(btn, pressed);
        Ok(())
    }
}

#[pymodule]
fn nes_core(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<Nes>()?;
    Ok(())
}
