/*
 * SOUND mode (redesign Phase 1.5).
 *
 * Ports the audio page: FamiStudio-exported .s song/sfx import, the
 * starter-pack fetch (/starter/audio), the default-song star, remove, and
 * a ROM-size audit against the 32 KB budget. Reads/writes state.audio
 * ({songs:[], sfx:null, defaultSongIdx}) — the same shape play-pipeline.js
 * packages into the /play request, so a chosen song actually plays.
 */
(function (global) {
  'use strict';
  var UI = global.StudioUI;
  var el = UI.el;
  var ROM_BUDGET = 32 * 1024;

  function audio(ctx) {
    var s = ctx.getState();
    if (!s.audio || !Array.isArray(s.audio.songs)) s.audio = { songs: [], sfx: null, defaultSongIdx: 0 };
    return s.audio;
  }
  // Mirrors _audio_extract_symbol on the server / audio.html extractSymbol.
  function extractSymbol(asm) {
    var m1 = (asm || '').match(/^\s*\.export\s+_([A-Za-z_][A-Za-z0-9_]*)\b/m);
    if (m1) return m1[1];
    var m2 = (asm || '').match(/^\s*\.export\s+([A-Za-z_][A-Za-z0-9_]*)\b/m);
    return m2 ? m2[1] : null;
  }
  function byteLen(s) { try { return new Blob([s]).size; } catch (e) { return (s || '').length; } }

  function totalSize(a) {
    var n = 0;
    (a.songs || []).forEach(function (s) { n += (s.size || byteLen(s.asm)); });
    if (a.sfx) n += (a.sfx.size || byteLen(a.sfx.asm));
    return n;
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = reject;
      r.readAsText(file);
    });
  }

  function renderDock(dock, ctx) {
    var a = audio(ctx);

    // Starter pack.
    var starterSec = UI.section('Music & SFX');
    starterSec.appendChild(el('div', { class: 'dock-note',
      text: 'Songs are FamiStudio-exported .s files. Grab the starter pack, or upload your own.' }));
    starterSec.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, [
      el('button', { class: 'btn primary', id: 'sound-starter', text: '♪ Add starter pack', onclick: function () {
        fetch('/starter/audio').then(function (r) { return r.json(); }).then(function (d) {
          ctx.pushUndo();
          if (Array.isArray(d.songs)) d.songs.forEach(function (song) { a.songs.push(song); });
          if (d.sfx && !a.sfx) a.sfx = d.sfx;
          ctx.markDirty(); ctx.renderDock();
        }).catch(function () { alert('Could not reach the starter pack on the server.'); });
      } }),
      el('button', { class: 'btn', text: 'Remove all', onclick: function () {
        if (!confirm('Remove all songs and SFX?')) return;
        ctx.pushUndo(); a.songs = []; a.sfx = null; a.defaultSongIdx = 0;
        ctx.markDirty(); ctx.renderDock();
      } }),
    ]));
    dock.appendChild(starterSec);

    // Songs list.
    var songSec = UI.section('Songs (' + a.songs.length + ')');
    if (!a.songs.length) {
      songSec.appendChild(el('div', { class: 'dock-note', text: 'No songs yet.' }));
    }
    a.songs.forEach(function (song, idx) {
      var isDef = idx === (a.defaultSongIdx | 0);
      var row = el('div', { class: 'entity-row song-row' + (isDef ? ' sel' : '') }, [
        el('button', { class: 'icon-btn', title: isDef ? 'Default song' : 'Make default', text: isDef ? '★' : '☆',
          onclick: function () { a.defaultSongIdx = idx; ctx.markDirty(); ctx.renderDock(); } }),
        el('span', { class: 'grow', text: song.name || song.filename || ('song ' + idx) }),
        el('span', { class: 'dock-note', style: 'margin:0', text: Math.round((song.size || byteLen(song.asm)) / 1024 * 10) / 10 + 'k' }),
        el('button', { class: 'icon-btn', title: 'Remove', text: '🗑', onclick: function () {
          ctx.pushUndo(); a.songs.splice(idx, 1);
          if (a.defaultSongIdx >= a.songs.length) a.defaultSongIdx = Math.max(0, a.songs.length - 1);
          ctx.markDirty(); ctx.renderDock();
        } }),
      ]);
      songSec.appendChild(row);
    });
    var songFile = el('input', { type: 'file', accept: '.s,.asm', style: 'display:none', id: 'sound-song-file' });
    songFile.addEventListener('change', function () {
      var f = songFile.files[0]; if (!f) return;
      readFile(f).then(function (text) {
        ctx.pushUndo();
        a.songs.push({ name: f.name.replace(/\.(s|asm)$/i, ''), filename: f.name, symbol: extractSymbol(text), asm: text, size: byteLen(text) });
        ctx.markDirty(); ctx.renderDock();
      });
      songFile.value = '';
    });
    songSec.appendChild(el('button', { class: 'btn', style: 'margin-top:6px', text: '⬆ Upload song (.s)',
      onclick: function () { songFile.click(); } }));
    songSec.appendChild(songFile);
    dock.appendChild(songSec);

    // SFX.
    var sfxSec = UI.section('Sound effects');
    if (a.sfx) {
      sfxSec.appendChild(el('div', { class: 'entity-row' }, [
        el('span', { class: 'grow', text: a.sfx.name || a.sfx.filename || 'sfx pack' }),
        el('button', { class: 'icon-btn', title: 'Remove', text: '🗑', onclick: function () {
          ctx.pushUndo(); a.sfx = null; ctx.markDirty(); ctx.renderDock();
        } }),
      ]));
    } else {
      sfxSec.appendChild(el('div', { class: 'dock-note', text: 'No sfx pack loaded.' }));
    }
    var sfxFile = el('input', { type: 'file', accept: '.s,.asm', style: 'display:none', id: 'sound-sfx-file' });
    sfxFile.addEventListener('change', function () {
      var f = sfxFile.files[0]; if (!f) return;
      readFile(f).then(function (text) {
        ctx.pushUndo();
        a.sfx = { name: f.name.replace(/\.(s|asm)$/i, ''), filename: f.name, symbol: extractSymbol(text), asm: text, size: byteLen(text) };
        ctx.markDirty(); ctx.renderDock();
      });
      sfxFile.value = '';
    });
    sfxSec.appendChild(el('button', { class: 'btn', style: 'margin-top:6px', text: '⬆ Upload sfx pack (.s)', onclick: function () { sfxFile.click(); } }));
    sfxSec.appendChild(sfxFile);
    dock.appendChild(sfxSec);

    // ROM-size audit.
    var used = totalSize(a);
    var pct = Math.round(used / ROM_BUDGET * 100);
    var auditSec = UI.section('ROM budget');
    auditSec.appendChild(el('div', { class: 'dock-note',
      text: 'Audio uses ~' + Math.round(used / 1024 * 10) / 10 + ' KB (' + pct + '% of the 32 KB cartridge). ' +
        (pct > 70 ? '⚠ Getting large — remove a song if the build fails.' : 'Plenty of room.') }));
    dock.appendChild(auditSec);
  }

  global.StudioModes = global.StudioModes || {};
  global.StudioModes.sound = {
    stageTools: [],
    renderDock: renderDock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
