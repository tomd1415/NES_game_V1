"""Pupil accounts (T4.2 — P1 backend foundation).

See docs/plans/current/2026-06-21-pupil-accounts.md.

Data-minimisation is the whole point: the ONLY personal datum stored is a
self-chosen, non-real-name **username**.  The **password is stored only as a
salted scrypt hash** — never plaintext.  No email, no real name, no class lists,
no analytics.  Recovery uses a one-time code (shown once at signup) and/or a
teacher/admin reset — neither needs any extra personal data.

Pure standard library (sqlite3 + hashlib.scrypt + secrets); the playground
server already runs on stdlib only, so this adds no dependencies.  SQLite gives
us atomic username-uniqueness and concurrent-safe writes from the threaded
server in a single file (tools/accounts.db by default).

This module is deliberately transport-agnostic (no HTTP) so it can be unit
tested directly.  playground_server.py owns the HTTP routes, cookies and
per-IP rate limiting; everything here is pure data + crypto.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import time

# --- Tunables ---------------------------------------------------------------

SESSION_TTL_SECONDS = 30 * 24 * 60 * 60      # 30 days — "log in again next week"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{3,20}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 128
PROJECT_BLOB_MAX = 4 * 1024 * 1024           # 4 MB — matches the gallery cap

# scrypt cost: 128 * N * r bytes ≈ 16 MB at N=2**14, under the 32 MB default
# maxmem, and a few ms per hash — fine for a classroom login rate.
_SCRYPT_N = 2 ** 14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32

# Recovery codes: unambiguous alphabet (no 0/O/1/I/l) so pupils can copy them by
# hand; 16 chars ≈ 80 bits of entropy.
_RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_RECOVERY_LEN = 16


class RateLimiter:
    """In-memory sliding-window limiter keyed by an arbitrary string (the HTTP
    layer keys it by client IP).  Coarse and per-process — fine for throttling
    classroom brute-force, not a distributed quota."""

    def __init__(self, max_attempts: int, window_seconds: int):
        self.max = max_attempts
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> bool:
        """Record an attempt; return True if allowed, False if over the limit."""
        now = time.time()
        with self._lock:
            recent = [t for t in self._hits.get(key, []) if t > now - self.window]
            if len(recent) >= self.max:
                self._hits[key] = recent
                return False
            recent.append(now)
            self._hits[key] = recent
            return True


class AccountError(Exception):
    """A user-facing account problem.  ``code`` is a short machine string the
    HTTP layer maps to a status; ``message`` is safe to show a pupil."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# --- Password / code hashing ------------------------------------------------

def _hash_secret(secret: str) -> str:
    """Salted scrypt hash, self-describing so params can be upgraded later:
    ``scrypt$N$r$p$<salt hex>$<dk hex>``."""
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(secret.encode("utf-8"), salt=salt, n=_SCRYPT_N,
                        r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_DKLEN)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${dk.hex()}"


def _verify_secret(secret: str, stored: str) -> bool:
    """Constant-time verify of a secret against a stored ``_hash_secret`` value."""
    try:
        algo, n, r, p, salt_hex, dk_hex = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(secret.encode("utf-8"), salt=bytes.fromhex(salt_hex),
                            n=int(n), r=int(r), p=int(p), dklen=len(dk_hex) // 2)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(dk.hex(), dk_hex)


def _new_recovery_code() -> str:
    return "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(_RECOVERY_LEN))


def _now() -> int:
    return int(time.time())


# --- Validation -------------------------------------------------------------

def validate_username(username: str) -> str:
    username = (username or "").strip()
    if not USERNAME_RE.match(username):
        raise AccountError(
            "bad_username",
            "Pick a nickname 3–20 characters long using only letters, numbers, "
            "- or _ (no spaces or dots). Please don't use your real name.",
        )
    return username


def validate_password(password: str) -> str:
    password = password or ""
    if len(password) < PASSWORD_MIN:
        raise AccountError(
            "bad_password",
            f"Your password needs at least {PASSWORD_MIN} characters. A few "
            "words you'll remember works well.",
        )
    if len(password) > PASSWORD_MAX:
        raise AccountError("bad_password", "That password is too long.")
    return password


# --- Store ------------------------------------------------------------------

class AccountStore:
    """SQLite-backed account + session + project store.

    Thread-safe: the threaded HTTP server hits this from many threads, so one
    connection (``check_same_thread=False``) is guarded by a single lock.  The
    load is tiny (a classroom), so a coarse lock is simpler and correct.
    """

    def __init__(self, db_path: str, join_code: str | None = None,
                 admin_secret: str | None = None,
                 session_ttl: int = SESSION_TTL_SECONDS):
        self.db_path = str(db_path)
        # Empty env strings count as "not configured".
        self.join_code = join_code or None
        self.admin_secret = admin_secret or None
        self.session_ttl = int(session_ttl) or SESSION_TTL_SECONDS
        self._lock = threading.Lock()
        self._db = sqlite3.connect(self.db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA foreign_keys=ON")
        self._init_schema()

    def _init_schema(self):
        with self._lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id            INTEGER PRIMARY KEY,
                    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    pw_hash       TEXT NOT NULL,
                    recovery_hash TEXT,
                    created_at    INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token      TEXT PRIMARY KEY,
                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS projects (
                    id         INTEGER PRIMARY KEY,
                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name       TEXT NOT NULL,
                    blob       TEXT NOT NULL,
                    size       INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
                CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
                """
            )
            self._db.commit()

    # ----- accounts ---------------------------------------------------------

    def signups_open(self) -> bool:
        """Self-signup is gated on a class join code (decision D5).  With no
        code configured, enrolment is closed — the safe default for a public
        instance."""
        return self.join_code is not None

    def signup(self, username: str, password: str, join_code: str | None):
        """Create an account.  Returns ``(username, recovery_code, token)``.
        The recovery code is shown to the pupil ONCE and only its hash is kept."""
        if not self.signups_open():
            raise AccountError("signups_closed",
                               "New sign-ups are closed right now. Ask your teacher.",
                               status=403)
        if not hmac.compare_digest(join_code or "", self.join_code):
            raise AccountError("bad_join_code",
                               "That class code isn't right. Ask your teacher for "
                               "the current one.", status=403)
        username = validate_username(username)
        password = validate_password(password)
        pw_hash = _hash_secret(password)
        recovery_code = _new_recovery_code()
        recovery_hash = _hash_secret(recovery_code)
        now = _now()
        with self._lock:
            try:
                cur = self._db.execute(
                    "INSERT INTO users (username, pw_hash, recovery_hash, created_at) "
                    "VALUES (?, ?, ?, ?)",
                    (username, pw_hash, recovery_hash, now),
                )
                self._db.commit()
            except sqlite3.IntegrityError:
                raise AccountError("username_taken",
                                   "That nickname is taken — try another.",
                                   status=409)
            user_id = cur.lastrowid
            token = self._open_session(user_id, now)
        # Re-read the stored username so the caller echoes canonical casing.
        return username, recovery_code, token

    def login(self, username: str, password: str):
        """Verify credentials and open a session.  Returns ``(username, token)``.
        One generic error for both unknown-user and wrong-password so we don't
        leak which usernames exist."""
        username = (username or "").strip()
        with self._lock:
            row = self._db.execute(
                "SELECT id, username, pw_hash FROM users WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
        bad = AccountError("bad_credentials",
                           "That nickname or password isn't right.", status=401)
        if row is None:
            # Still do a hash to keep timing roughly uniform.
            _verify_secret(password or "", _hash_secret("decoy"))
            raise bad
        if not _verify_secret(password or "", row["pw_hash"]):
            raise bad
        with self._lock:
            token = self._open_session(row["id"], _now())
        return row["username"], token

    def _open_session(self, user_id: int, now: int) -> str:
        token = secrets.token_urlsafe(32)
        self._db.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) "
            "VALUES (?, ?, ?, ?)",
            (token, user_id, now, now + self.session_ttl),
        )
        self._db.commit()
        return token

    def logout(self, token: str | None):
        if not token:
            return
        with self._lock:
            self._db.execute("DELETE FROM sessions WHERE token = ?", (token,))
            self._db.commit()

    def user_for_session(self, token: str | None):
        """Return ``{'id', 'username'}`` for a live session, or None.  Expired
        sessions are deleted lazily on lookup."""
        if not token:
            return None
        now = _now()
        with self._lock:
            row = self._db.execute(
                "SELECT s.token, s.expires_at, u.id AS uid, u.username AS username "
                "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
                (token,),
            ).fetchone()
            if row is None:
                return None
            if row["expires_at"] <= now:
                self._db.execute("DELETE FROM sessions WHERE token = ?", (token,))
                self._db.commit()
                return None
        return {"id": row["uid"], "username": row["username"]}

    def reset_with_recovery_code(self, username: str, recovery_code: str,
                                 new_password: str) -> str:
        """Pupil self-reset with the one-time code.  Returns a FRESH recovery
        code (the old one is single-use).  Logs the account out everywhere."""
        username = (username or "").strip()
        new_password = validate_password(new_password)
        with self._lock:
            row = self._db.execute(
                "SELECT id, recovery_hash FROM users WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
        if row is None or not row["recovery_hash"] or \
                not _verify_secret((recovery_code or "").strip().upper(), row["recovery_hash"]):
            raise AccountError("bad_recovery", "That recovery code isn't right.",
                               status=401)
        new_code = _new_recovery_code()
        with self._lock:
            self._db.execute(
                "UPDATE users SET pw_hash = ?, recovery_hash = ? WHERE id = ?",
                (_hash_secret(new_password), _hash_secret(new_code), row["id"]),
            )
            self._db.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            self._db.commit()
        return new_code

    def admin_reset(self, username: str, new_password: str, admin_secret: str):
        """Teacher reset (decision D6).  Requires the server admin secret — NOT
        a pupil credential.  Logs the account out everywhere."""
        if not self.admin_secret:
            raise AccountError("admin_disabled",
                               "Admin reset isn't configured on this server.",
                               status=403)
        if not hmac.compare_digest(admin_secret or "", self.admin_secret):
            raise AccountError("bad_admin", "Admin secret is wrong.", status=403)
        username = (username or "").strip()
        new_password = validate_password(new_password)
        with self._lock:
            row = self._db.execute(
                "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,),
            ).fetchone()
            if row is None:
                raise AccountError("no_such_user", "No account with that nickname.",
                                   status=404)
            self._db.execute("UPDATE users SET pw_hash = ? WHERE id = ?",
                             (_hash_secret(new_password), row["id"]))
            self._db.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            self._db.commit()

    # ----- projects (P2) ----------------------------------------------------
    #
    # A pupil's saved games.  Every method scopes by user_id, so a session can
    # only ever see or change its OWN projects — ownership is enforced in the
    # WHERE clause, not trusted from the request.  ``blob`` is the editor's
    # serialised project state (opaque to the server); we only size-cap it.

    def _clean_name(self, name: str) -> str:
        name = (name or "").strip()
        if not name:
            raise AccountError("bad_project_name", "Give your project a name.")
        return name[:80]

    def _clean_blob(self, blob) -> str:
        if not isinstance(blob, str):
            raise AccountError("bad_project", "Project data must be text.")
        if len(blob.encode("utf-8")) > PROJECT_BLOB_MAX:
            raise AccountError("project_too_big",
                               "That project is too big to save.", status=413)
        return blob

    def list_projects(self, user_id: int):
        with self._lock:
            rows = self._db.execute(
                "SELECT id, name, size, updated_at FROM projects "
                "WHERE user_id = ? ORDER BY updated_at DESC", (user_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def create_project(self, user_id: int, name: str, blob) -> dict:
        name = self._clean_name(name)
        blob = self._clean_blob(blob)
        now = _now()
        with self._lock:
            cur = self._db.execute(
                "INSERT INTO projects (user_id, name, blob, size, updated_at) "
                "VALUES (?, ?, ?, ?, ?)", (user_id, name, blob, len(blob), now))
            self._db.commit()
            new_id = cur.lastrowid
        return {"id": new_id, "name": name, "size": len(blob), "updated_at": now}

    def update_project(self, user_id: int, project_id: int, name: str, blob) -> dict:
        name = self._clean_name(name)
        blob = self._clean_blob(blob)
        now = _now()
        with self._lock:
            cur = self._db.execute(
                "UPDATE projects SET name = ?, blob = ?, size = ?, updated_at = ? "
                "WHERE id = ? AND user_id = ?",
                (name, blob, len(blob), now, project_id, user_id))
            self._db.commit()
            if cur.rowcount == 0:
                raise AccountError("no_such_project",
                                   "That project doesn't exist.", status=404)
        return {"id": project_id, "name": name, "size": len(blob), "updated_at": now}

    def get_project(self, user_id: int, project_id: int) -> dict:
        with self._lock:
            row = self._db.execute(
                "SELECT id, name, blob, size, updated_at FROM projects "
                "WHERE id = ? AND user_id = ?", (project_id, user_id)).fetchone()
        if row is None:
            raise AccountError("no_such_project", "That project doesn't exist.",
                               status=404)
        return dict(row)

    def delete_project(self, user_id: int, project_id: int):
        with self._lock:
            cur = self._db.execute(
                "DELETE FROM projects WHERE id = ? AND user_id = ?",
                (project_id, user_id))
            self._db.commit()
        if cur.rowcount == 0:
            raise AccountError("no_such_project", "That project doesn't exist.",
                               status=404)

    def close(self):
        with self._lock:
            self._db.close()
