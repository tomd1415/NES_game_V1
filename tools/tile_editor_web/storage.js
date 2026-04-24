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
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(c));
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
      localStorage.setItem(projectMetaKey(id), JSON.stringify(m));
    }

    function parseSlot(raw) {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        const s = migrateState ? migrateState(parsed) : parsed;
        if (validateState && validateState(s)) return null;
        return s;
      } catch { return null; }
    }

    function touchProject(id) {
      const c = catalog();
      const p = c.projects.find(p => p.id === id);
      if (p) { p.modified = Date.now(); saveCatalog(c); }
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
          localStorage.setItem(projectCurrentKey(activeId()), JSON.stringify(state));
          touchProject(activeId());
          return { ok: true };
        } catch (e) { return { ok: false, error: e.message }; }
      },
      loadCurrent() {
        return parseSlot(localStorage.getItem(projectCurrentKey(activeId())));
      },

      // Snapshots & backups — per active project.
      saveSnapshot(state, reason) {
        try {
          const id = activeId();
          const meta = readProjectMeta(id);
          const ts = Date.now();
          const key = projectSnapPrefix(id) + ts;
          localStorage.setItem(key, JSON.stringify(state));
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
          const key = projectBackupPrefix(id) + ts;
          localStorage.setItem(key, JSON.stringify(state));
          meta.backups.push({ key, ts, name: state.name });
          while (meta.backups.length > MAX_BACKUPS) {
            const d = meta.backups.shift();
            try { localStorage.removeItem(d.key); } catch {}
          }
          writeProjectMeta(id, meta);
          return { ok: true };
        } catch (e) { return { ok: false, error: e.message }; }
      },
      listSnapshots() {
        return readProjectMeta(activeId()).snapshots.slice().reverse();
      },
      listBackups() {
        return readProjectMeta(activeId()).backups.slice().reverse();
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
        return catalog().projects.slice();
      },
      getActiveProjectId() { return activeId(); },
      getActiveProject() {
        return catalog().projects.find(p => p.id === activeId()) || null;
      },
      setActiveProjectId(id) {
        const c = catalog();
        if (!c.projects.some(p => p.id === id)) return false;
        c.activeId = id;
        saveCatalog(c);
        return true;
      },
      createProject(name, initialState) {
        const c = catalog();
        const id = uid();
        const now = Date.now();
        c.projects.push({ id, name: name || 'untitled', created: now, modified: now });
        c.activeId = id;
        if (initialState) {
          localStorage.setItem(projectCurrentKey(id), JSON.stringify(initialState));
        }
        writeProjectMeta(id, { snapshots: [], backups: [] });
        saveCatalog(c);
        return { id };
      },
      renameProject(id, name) {
        const c = catalog();
        const p = c.projects.find(p => p.id === id);
        if (!p) return false;
        p.name = name || p.name;
        p.modified = Date.now();
        saveCatalog(c);
        return true;
      },
      duplicateProject(id) {
        const c = catalog();
        const p = c.projects.find(p => p.id === id);
        if (!p) return null;
        const newId = uid();
        const now = Date.now();
        c.projects.push({ id: newId, name: p.name + ' (copy)', created: now, modified: now });
        const curRaw = localStorage.getItem(projectCurrentKey(id));
        if (curRaw != null) {
          localStorage.setItem(projectCurrentKey(newId), curRaw);
        }
        writeProjectMeta(newId, { snapshots: [], backups: [] });
        c.activeId = newId;
        saveCatalog(c);
        return newId;
      },
      deleteProject(id) {
        const c = catalog();
        if (c.projects.length <= 1) return false;  // never delete the last one
        const idx = c.projects.findIndex(p => p.id === id);
        if (idx < 0) return false;
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
        c.projects.splice(idx, 1);
        if (c.activeId === id) c.activeId = c.projects[0].id;
        saveCatalog(c);
        return true;
      },

      // Migration helper --------------------------------------------------
      hasPreMigrationBackup() { return !!preMigrationBackup; },
      getPreMigrationBackup() { return preMigrationBackup; },
      clearPreMigrationBackup() { preMigrationBackup = null; },

      // Project-menu shared action wiring --------------------------------
      // Phase 1.3: wire the New / Duplicate / Delete buttons on pages
      // that don't have bespoke handlers (behaviour / builder / code).
      // The index.html + sprites.html handlers do in-place state
      // replacement for a smoother UX; this reload-based fallback is
      // simpler and good enough for pages where project-level actions
      // are rare.  Caller passes a factory that makes a fresh blank
      // state when the pupil clicks New.  Silently no-ops if a button
      // is missing — pages stay free to ship a subset.
      wireBasicProjectActions(opts) {
        opts = opts || {};
        const factory = typeof opts.makeFreshState === 'function'
          ? opts.makeFreshState : () => null;

        const byId = (id) => document.getElementById(id);
        const btnNew = byId('btn-project-new');
        const btnDup = byId('btn-project-duplicate');
        const btnDel = byId('btn-project-delete');

        if (btnNew) {
          btnNew.addEventListener('click', () => {
            const raw = window.prompt('Name for the new project:',
                                      'untitled');
            if (raw == null) return;
            const name = (raw || '').trim() || 'untitled';
            try {
              this.createProject(name, factory());
              window.location.reload();
            } catch (e) {
              alert('Could not create project: ' + e.message);
            }
          });
        }
        if (btnDup) {
          btnDup.addEventListener('click', () => {
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
