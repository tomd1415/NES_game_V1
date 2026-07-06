// Shared localStorage layer for the tile editor.
// Both index.html and sprites.html load this file and call
// createTileEditorStorage(deps) with their own migrate/validate.
//
// Storage model
// -------------
//   Legacy v1 (single project):
//     nes_tile_editor.current.v1           → current state JSON
//     nes_tile_editor.snap.<ts>            → snapshot JSONs
//     nes_tile_editor.backup.<ts>          → backup JSONs
//     nes_tile_editor.meta.v1              → { snapshots: [...], backups: [...] }
//     nes_tile_editor.prefs.v1             → prefs (app-wide, unchanged)
//
//   v2 (named projects):
//     nes_tile_editor.projects.v2          → { version:2, activeId, projects:[...], migratedAt }
//     nes_tile_editor.project.<id>.current → state
//     nes_tile_editor.project.<id>.snap.<ts>
//     nes_tile_editor.project.<id>.backup.<ts>
//     nes_tile_editor.project.<id>.meta    → { snapshots, backups }
//
// On first boot after this module ships, if v2 is missing and legacy v1
// keys exist, the legacy data is silently copied into project 'default'
// and the legacy keys are deleted. The catalog remembers `migratedAt`
// so this never runs twice. A one-shot JSON dump of the pre-migration
// keys is held in-memory and can be downloaded via `getMigrationBackupBlob()`
// until the user dismisses it.

(function(global) {
  const LEGACY_CURRENT_KEY    = 'nes_tile_editor.current.v1';
  const LEGACY_SNAP_PREFIX    = 'nes_tile_editor.snap.';
  const LEGACY_BACKUP_PREFIX  = 'nes_tile_editor.backup.';
  const LEGACY_META_KEY       = 'nes_tile_editor.meta.v1';

  const STORAGE_PREF_KEY      = 'nes_tile_editor.prefs.v1';
  const PROJECTS_KEY          = 'nes_tile_editor.projects.v2';
  const PROJECT_PREFIX        = 'nes_tile_editor.project.';

  const MAX_SNAPSHOTS = 8;
  const MAX_BACKUPS   = 5;

  function projectKey(id, suffix) {
    return PROJECT_PREFIX + id + '.' + suffix;
  }
  function projectCurrentKey(id)  { return projectKey(id, 'current'); }
  function projectSnapPrefix(id)  { return projectKey(id, 'snap.'); }
  function projectBackupPrefix(id){ return projectKey(id, 'backup.'); }
  function projectMetaKey(id)     { return projectKey(id, 'meta'); }

  function uid() {
    return 'p_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  // localStorage is small (~5 MB) and full project states are large, so a few
  // projects' snapshot/backup history can fill it.  A raw setItem then throws
  // QuotaExceededError, which used to break saving AND loading a game/tutorial
  // (createProject threw mid-load, leaving the editor half-updated — the reason
  // a force-reload + clearing storage was needed).  This wrapper instead frees
  // space by dropping the OLDEST snapshots/backups (the least-valuable data,
  // across every project) and retrying, so a Save/Load never hard-fails.
  function isQuotaError(e) {
    return !!e && (e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
  }
  function transientKeysOldestFirst(exceptKey) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === exceptKey) continue;
      if (k.indexOf('.snap.') >= 0 || k.indexOf('.backup.') >= 0) {
        const m = /\.(?:snap|backup)\.(\d+)/.exec(k);
        out.push({ k: k, ts: m ? +m[1] : 0 });
      }
    }
    return out.sort((a, b) => a.ts - b.ts).map(function (x) { return x.k; });
  }
  // Returns true if the value was stored, false only if storage is full even
  // after dropping every snapshot/backup.  Never throws on a quota error.
  function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) {
      if (!isQuotaError(e)) throw e;
      const victims = transientKeysOldestFirst(key);
      for (let i = 0; i < victims.length; i++) {
        try { localStorage.removeItem(victims[i]); } catch (_) {}
        try { localStorage.setItem(key, value); return true; }
        catch (e2) { if (!isQuotaError(e2)) throw e2; }
      }
      return false;
    }
  }

  function createStorage(deps) {
    const migrateState = deps && deps.migrateState;
    const validateState = deps && deps.validateState;

    // --- Projects catalog --------------------------------------------------
    function readCatalog() {
      try {
        const raw = localStorage.getItem(PROJECTS_KEY);
        if (!raw) return null;
        const c = JSON.parse(raw);
        if (!c || c.version !== 2 || !Array.isArray(c.projects)) return null;
        return c;
      } catch { return null; }
    }
    function writeCatalog(c) {
      safeSetItem(PROJECTS_KEY, JSON.stringify(c));
    }
    function freshCatalog(activeId) {
      return {
        version: 2,
        activeId,
        projects: [],
        migratedAt: null,
      };
    }

    // --- Migration --------------------------------------------------------
    // Pre-migration backup is captured here so the caller can offer a
    // download *before* it's wiped. It's only valid for the current session.
    let preMigrationBackup = null;

    // BR-02: pages register a synchronous flush that copies any in-flight
    // editor state (CodeMirror contents, debounced Builder/Behaviour edits)
    // into the active-project slot.  Storage calls it before any action that
    // reloads or switches the active project, so a debounced edit made just
    // before the action is never lost.  Centralised here so every page is
    // covered and no individual call site can forget it.
    let flushHook = null;

    function collectLegacyKeys() {
      const dump = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === LEGACY_CURRENT_KEY
            || k === LEGACY_META_KEY
            || k.startsWith(LEGACY_SNAP_PREFIX)
            || k.startsWith(LEGACY_BACKUP_PREFIX)) {
          dump[k] = localStorage.getItem(k);
        }
      }
      return dump;
    }

    function migrateLegacy() {
      // Copy legacy keys into project 'default', then delete them.
      const legacyCurrent = localStorage.getItem(LEGACY_CURRENT_KEY);
      if (!legacyCurrent) return null;

      const dump = collectLegacyKeys();
      preMigrationBackup = {
        ts: Date.now(),
        keys: dump,
      };

      const defaultId = 'default';
      const now = Date.now();
      const catalog = freshCatalog(defaultId);
      catalog.projects.push({
        id: defaultId,
        name: 'My First Project',
        created: now,
        modified: now,
      });

      // current
      localStorage.setItem(projectCurrentKey(defaultId), legacyCurrent);

      // snapshots & backups
      const legacyMeta = (() => {
        try { return JSON.parse(localStorage.getItem(LEGACY_META_KEY) || '{}'); }
        catch { return {}; }
      })();
      const newMeta = { snapshots: [], backups: [] };
      for (const s of (legacyMeta.snapshots || [])) {
        const oldKey = s.key;
        const raw = localStorage.getItem(oldKey);
        if (raw == null) continue;
        const newKey = projectSnapPrefix(defaultId) + s.ts;
        localStorage.setItem(newKey, raw);
        newMeta.snapshots.push({ ...s, key: newKey });
      }
      for (const b of (legacyMeta.backups || [])) {
        const oldKey = b.key;
        const raw = localStorage.getItem(oldKey);
        if (raw == null) continue;
        const newKey = projectBackupPrefix(defaultId) + b.ts;
        localStorage.setItem(newKey, raw);
        newMeta.backups.push({ ...b, key: newKey });
      }
      localStorage.setItem(projectMetaKey(defaultId), JSON.stringify(newMeta));

      // Delete legacy keys — only after writes have succeeded.
      for (const k of Object.keys(dump)) {
        try { localStorage.removeItem(k); } catch {}
      }

      catalog.migratedAt = now;
      writeCatalog(catalog);
      return catalog;
    }

    function ensureCatalog() {
      let catalog = readCatalog();
      if (catalog) return catalog;
      // No v2 catalog. Either migrate legacy, or initialise fresh.
      catalog = migrateLegacy();
      if (catalog) return catalog;
      // No legacy either: create a first empty project.
      const defaultId = 'default';
      catalog = freshCatalog(defaultId);
      catalog.projects.push({
        id: defaultId,
        name: 'My First Project',
        created: Date.now(),
        modified: Date.now(),
      });
      writeCatalog(catalog);
      return catalog;
    }

    // Force catalog resolution on first method call to avoid surprising
    // the caller with side effects at `require` time.
    let cached = null;
    function catalog() {
      if (!cached) cached = ensureCatalog();
      return cached;
    }
    function refresh() { cached = readCatalog() || ensureCatalog(); return cached; }

    function saveCatalog(c) {
      cached = c;
      writeCatalog(c);
    }

    // Cross-tab-safe catalog mutation.  Two editor tabs share one
    // localStorage; a tab's in-memory `cached` catalog goes stale the moment
    // another tab adds/removes a project.  Writing that stale copy back (as
    // every autosave did via touchProject -> saveCatalog) silently erased the
    // other tab's project — the pupil-reported "saving a new project sometimes
    // loses one".  So always re-read the on-disk catalog as the base and apply
    // only the targeted change; an unrelated project can never be dropped.
    // This tab's own activeId is preserved across the reconcile unless `mutate`
    // changes it explicitly (New / switch / delete-active).
    function commitCatalog(mutate) {
      const disk = readCatalog();
      const myActive = cached ? cached.activeId : (disk ? disk.activeId : null);
      const base = disk || cached || ensureCatalog();
      const c = {
        version: 2,
        migratedAt: base.migratedAt != null ? base.migratedAt
                  : (cached ? cached.migratedAt : null),
        activeId: myActive != null ? myActive : base.activeId,
        projects: base.projects.slice(),
      };
      mutate(c);
      cached = c;
      writeCatalog(c);
      return c;
    }

    // Pull in any projects other tabs added/renamed since our last write, so
    // the project list a page renders is current.  Keeps THIS tab's activeId.
    function syncList() {
      const disk = readCatalog();
      if (disk) {
        cached = cached
          ? { ...cached, projects: disk.projects.slice(),
              migratedAt: disk.migratedAt != null ? disk.migratedAt : cached.migratedAt }
          : disk;
      } else if (!cached) {
        cached = ensureCatalog();
      }
      return cached;
    }

    // --- Per-project meta -------------------------------------------------
    function readProjectMeta(id) {
      try {
        const raw = localStorage.getItem(projectMetaKey(id));
        if (!raw) return { snapshots: [], backups: [] };
        const m = JSON.parse(raw);
        m.snapshots = m.snapshots || [];
        m.backups = m.backups || [];
        return m;
      } catch { return { snapshots: [], backups: [] }; }
    }
    function writeProjectMeta(id, m) {
      safeSetItem(projectMetaKey(id), JSON.stringify(m));
    }

    function parseSlot(raw) {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        const s = migrateState ? migrateState(parsed) : parsed;
        const err = validateState && validateState(s);
        if (err) { console.warn('storage: discarding invalid slot:', err); return null; }
        return s;
      } catch (e) { console.warn('storage: failed to parse slot JSON:', e && e.message); return null; }
    }

    function touchProject(id) {
      commitCatalog(c => {
        const p = c.projects.find(p => p.id === id);
        if (p) p.modified = Date.now();
      });
    }

    function activeId() { return catalog().activeId; }

    // --- Public API -------------------------------------------------------
    return {
      // Stable keys (legacy) and v2 key helpers for anyone else who needs them.
      KEYS: {
        current: LEGACY_CURRENT_KEY,
        snapPrefix: LEGACY_SNAP_PREFIX,
        backupPrefix: LEGACY_BACKUP_PREFIX,
        meta: LEGACY_META_KEY,
        prefs: STORAGE_PREF_KEY,
        projects: PROJECTS_KEY,
        projectPrefix: PROJECT_PREFIX,
      },
      MAX_SNAPSHOTS, MAX_BACKUPS,

      // Current state — operates on the active project.
      saveCurrent(state) {
        try {
          const ok = safeSetItem(projectCurrentKey(activeId()), JSON.stringify(state));
          if (!ok) return { ok: false, error: 'storage full' };
          touchProject(activeId());
          return { ok: true };
        } catch (e) { return { ok: false, error: e.message }; }
      },
      loadCurrent() {
        return parseSlot(localStorage.getItem(projectCurrentKey(activeId())));
      },
      // Load the active project, or seed a fresh one on first visit.  Crucially
      // the seeded state inherits the active catalog project's name (e.g. "My
      // First Project") instead of the factory default ("untitled"), so the
      // rename field, the project list and the dropdown label all agree — the
      // mismatch that made the starter project look un-renameable.
      bootstrapCurrent(makeDefault) {
        let s = this.loadCurrent();
        if (s) return s;
        s = (typeof makeDefault === 'function') ? makeDefault() : {};
        const ap = this.getActiveProject();
        if (ap && ap.name) s.name = ap.name;
        this.saveCurrent(s);
        return s;
      },

      // BR-02: flush-hook registration + invocation.  A page registers its
      // synchronous flushSave() once; flushPending() runs it (guarded) and is
      // called before every reload/switch path so debounced edits persist.
      setFlushHook(fn) { flushHook = (typeof fn === 'function') ? fn : null; },
      flushPending() {
        if (!flushHook) return;
        try { flushHook(); }
        catch (e) { try { console.error('[storage] flush hook failed', e); } catch (_) {} }
      },

      // Snapshots & backups — per active project.
      saveSnapshot(state, reason) {
        try {
          const id = activeId();
          const meta = readProjectMeta(id);
          const ts = Date.now();
          const key = projectSnapPrefix(id) + ts + '_' + Math.random().toString(36).slice(2, 6);
          if (!safeSetItem(key, JSON.stringify(state))) return { ok: false, error: 'storage full' };
          meta.snapshots.push({ key, ts, reason, name: state.name });
          while (meta.snapshots.length > MAX_SNAPSHOTS) {
            const d = meta.snapshots.shift();
            try { localStorage.removeItem(d.key); } catch {}
          }
          writeProjectMeta(id, meta);
          return { ok: true };
        } catch (e) { return { ok: false, error: e.message }; }
      },
      saveBackup(state) {
        try {
          const id = activeId();
          const meta = readProjectMeta(id);
          const ts = Date.now();
          const key = projectBackupPrefix(id) + ts + '_' + Math.random().toString(36).slice(2, 6);
          if (!safeSetItem(key, JSON.stringify(state))) return { ok: false, error: 'storage full' };
          meta.backups.push({ key, ts, name: state.name });
          while (meta.backups.length > MAX_BACKUPS) {
            const d = meta.backups.shift();
            try { localStorage.removeItem(d.key); } catch {}
          }
          writeProjectMeta(id, meta);
          return { ok: true };
        } catch (e) { return { ok: false, error: e.message }; }
      },
      // Filter out any entry whose blob was dropped to free space (safeSetItem),
      // so the Time Machine never lists a snapshot/backup that can't load.
      listSnapshots() {
        return readProjectMeta(activeId()).snapshots
          .filter(function (x) { return localStorage.getItem(x.key) != null; }).slice().reverse();
      },
      listBackups() {
        return readProjectMeta(activeId()).backups
          .filter(function (x) { return localStorage.getItem(x.key) != null; }).slice().reverse();
      },
      loadSnapshot(key) {
        return parseSlot(localStorage.getItem(key));
      },

      // Prefs — app-wide.
      readPrefs() {
        try {
          const raw = localStorage.getItem(STORAGE_PREF_KEY);
          return raw ? (JSON.parse(raw) || {}) : {};
        } catch { return {}; }
      },
      writePrefs(p) {
        try { localStorage.setItem(STORAGE_PREF_KEY, JSON.stringify(p)); } catch {}
      },

      // Projects API --------------------------------------------------------
      listProjects() {
        return syncList().projects.slice();
      },
      getActiveProjectId() { return activeId(); },
      getActiveProject() {
        return syncList().projects.find(p => p.id === activeId()) || null;
      },
      setActiveProjectId(id) {
        let okSwitch = false;
        commitCatalog(c => {
          if (c.projects.some(p => p.id === id)) { c.activeId = id; okSwitch = true; }
        });
        return okSwitch;
      },
      createProject(name, initialState) {
        const id = uid();
        const now = Date.now();
        // Write the project's own slot + meta BEFORE registering it in the
        // catalog.  safeSetItem first frees space by dropping old snapshots/
        // backups and retrying, so the ordinary "storage filled with history"
        // case (the one pupils hit) now succeeds instead of throwing.  Only if
        // it STILL cannot fit do we abort atomically — throw here, having
        // registered nothing, so no phantom project and the previously-active
        // one is untouched (the caller catches this and keeps the old project).
        if (initialState) {
          if (!safeSetItem(projectCurrentKey(id), JSON.stringify(initialState))) {
            const e = new Error('storage full: could not write project slot');
            e.name = 'QuotaExceededError';
            throw e;
          }
        }
        writeProjectMeta(id, { snapshots: [], backups: [] });
        // Commit against the on-disk catalog so a concurrent tab's projects
        // survive (we only ever add our new entry).
        commitCatalog(c => {
          c.projects.push({ id, name: name || 'untitled', created: now, modified: now });
          c.activeId = id;
        });
        return { id };
      },
      renameProject(id, name) {
        let okRename = false;
        commitCatalog(c => {
          const p = c.projects.find(p => p.id === id);
          if (p) { p.name = name || p.name; p.modified = Date.now(); okRename = true; }
        });
        return okRename;
      },
      // BR-07: rename the *active* project atomically — update both the
      // in-memory state and the v2 catalog so a page can't update only one
      // half (which left the catalog list / duplicate / delete showing the
      // old name).  Returns the normalised name.
      renameCurrent(state, name) {
        const n = (name && String(name)) || 'untitled';
        if (state) state.name = n;
        this.renameProject(activeId(), n);
        return n;
      },
      duplicateProject(id) {
        const src = (readCatalog() || catalog()).projects.find(p => p.id === id);
        if (!src) return null;
        const newId = uid();
        const now = Date.now();
        // Copy the slot + meta first (atomic, same reasoning as createProject).
        const curRaw = localStorage.getItem(projectCurrentKey(id));
        if (curRaw != null) {
          safeSetItem(projectCurrentKey(newId), curRaw);
        }
        writeProjectMeta(newId, { snapshots: [], backups: [] });
        commitCatalog(c => {
          c.projects.push({ id: newId, name: src.name + ' (copy)', created: now, modified: now });
          c.activeId = newId;
        });
        return newId;
      },
      deleteProject(id) {
        // Decide against the on-disk list so a concurrent tab's projects count.
        const live = (readCatalog() || catalog());
        if (live.projects.length <= 1) return false;  // never delete the last one
        if (!live.projects.some(p => p.id === id)) return false;
        // Remove storage keys for this project.
        const prefix = PROJECT_PREFIX + id + '.';
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) keys.push(k);
        }
        for (const k of keys) {
          try { localStorage.removeItem(k); } catch {}
        }
        commitCatalog(c => {
          const idx = c.projects.findIndex(p => p.id === id);
          if (idx >= 0) c.projects.splice(idx, 1);
          if (c.activeId === id) c.activeId = (c.projects[0] && c.projects[0].id) || c.activeId;
        });
        return true;
      },

      // Migration helper --------------------------------------------------
      hasPreMigrationBackup() { return !!preMigrationBackup; },
      getPreMigrationBackup() { return preMigrationBackup; },
      clearPreMigrationBackup() { preMigrationBackup = null; },

      // Project-menu shared action wiring --------------------------------
      // Phase 1.3: wire the Duplicate / Delete buttons on pages that don't
      // have bespoke handlers (behaviour / builder / code / audio).  The
      // index.html + sprites.html handlers do in-place state replacement for a
      // smoother UX; this reload-based fallback is simpler and good enough for
      // pages where project-level actions are rare.  "New project" is wired
      // separately by ProjectMenu.wire (a rich name+template dialog shared with
      // every page).  Silently no-ops if a button is missing — pages stay free
      // to ship a subset.
      wireBasicProjectActions(opts) {
        opts = opts || {};

        const byId = (id) => document.getElementById(id);
        const btnDup = byId('btn-project-duplicate');
        const btnDel = byId('btn-project-delete');

        if (btnDup) {
          btnDup.addEventListener('click', () => {
            // BR-02: flush so unsaved edits are in the slot duplicateProject copies.
            this.flushPending();
            const id = this.duplicateProject(this.getActiveProjectId());
            if (id) window.location.reload();
          });
        }
        if (btnDel) {
          btnDel.addEventListener('click', () => {
            if (this.listProjects().length <= 1) {
              alert('Cannot delete the only project — create another first.');
              return;
            }
            const active = this.getActiveProject();
            const label = active && active.name || 'this project';
            if (!confirm('Delete "' + label + '"? This cannot be undone.')) return;
            if (this.deleteProject(this.getActiveProjectId())) {
              window.location.reload();
            }
          });
        }
      },

      // Internal: force catalog to resolve now. Callers shouldn't need this.
      _ensureCatalog: refresh,
    };
  }

  global.createTileEditorStorage = createStorage;
})(typeof window !== 'undefined' ? window : globalThis);
