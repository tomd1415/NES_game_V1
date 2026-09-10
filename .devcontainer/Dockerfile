# Dev container image for nesnative — agent + egress firewall, for ROOTLESS Docker.
# Runs as root INSIDE the container; under rootless that maps to the unprivileged host
# user, so it has no host privilege but can write the bind-mounted workspace.
FROM node:20-bookworm

ARG TZ=Europe/London
ENV TZ="$TZ"
ENV DEBIAN_FRONTEND=noninteractive

# Base tooling, the firewall's dependencies, and this project's toolchain.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git less procps openssh-client tmux python3 \
      iptables ipset dnsutils jq \
      build-essential make \
      cc65 fceux \
    && rm -rf /var/lib/apt/lists/*

# nft-in-userns commonly fails "Could not fetch rule set generation id: Permission denied".
RUN update-alternatives --set iptables  /usr/sbin/iptables-legacy && \
    update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy

COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh

RUN npm install -g @anthropic-ai/claude-code

# --- Common testing tools, baked into every image ------------------------------------
# Built with full egress (the firewall only applies at container RUNTIME). pytest via pipx
# (global `pytest` without a system-wide pip — Debian PEP 668 — and without shadowing the
# project's python); vitest/jest global for quick node tests.
RUN apt-get update && apt-get install -y --no-install-recommends pipx \
    && rm -rf /var/lib/apt/lists/* \
    && pipx install pytest && pipx inject pytest pytest-cov \
    && npm install -g vitest jest \
    # The `npm install -g @anthropic-ai/claude-code` earlier intermittently leaves its
    # global bin half-linked — an orphaned .claude-XXXX stub and no working `claude` —
    # which only surfaces later as `exec: "claude": executable file not found in $PATH`.
    # Repair it HERE, at build time: egress is unrestricted during a build, so the
    # native binary behind `claude.exe` can (re)download. Then FAIL THE BUILD if `claude`
    # still will not run, so an agent-less image is never shipped silently. Do NOT try to
    # repair this in a RUNNING container — the egress firewall blocks the native-binary
    # download and leaves it worse ("claude native binary not installed").
    && rm -f /usr/local/bin/.claude-* \
    && { claude --version >/dev/null 2>&1 \
         || npm rebuild -g @anthropic-ai/claude-code >/dev/null 2>&1 || true; } \
    && { claude --version >/dev/null 2>&1 \
         || { npm uninstall -g @anthropic-ai/claude-code >/dev/null 2>&1; \
              npm install -g @anthropic-ai/claude-code >/dev/null 2>&1; } || true; } \
    && { claude --version >/dev/null 2>&1 \
         || { echo "FATAL: claude unusable after install+repair" >&2; exit 1; }; }
ENV PATH="/root/.local/bin:${PATH}"

# --- The native app's toolchain: Qt runtime, Rust, maturin -----------------------------
# Without these the PySide6 desktop app cannot run here at all, and its UI tests SKIP —
# 161 of them. A skip is not a pass, and this image is the reason they skip.
#
# THE APT LIST IS MEASURED, NOT COPIED. Every name below was resolved and installed on
# this exact base (node:20-bookworm) on 2026-09-10 before being written down; `libGL.so.1`
# and `libxcb-cursor.so.0` were confirmed present afterwards. PySide6's wheels bundle Qt
# itself but link these system libraries, and `libxcb-cursor0` in particular is the one
# whose absence produces the famously unhelpful "could not load the Qt platform plugin
# xcb" — even under QT_QPA_PLATFORM=offscreen, which is how the tests run.
RUN apt-get update && apt-get install -y --no-install-recommends       libgl1 libegl1 libglib2.0-0 libfontconfig1 libdbus-1-3       libxkbcommon-x11-0 libx11-xcb1       libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 libxcb-render-util0       libxcb-shape0 libxcb-shm0 libxcb-sync1 libxcb-xfixes0 libxcb-xinerama0       libxcb-xkb1 libxcb-cursor0     && rm -rf /var/lib/apt/lists/*     # FAIL THE BUILD rather than ship an image whose Qt libraries are half-there. The
    # alternative is an image that looks fine and produces 161 skips, which reads as
    # "the UI layer passed" to anyone not looking closely.
    && for lib in libGL.so.1 libEGL.so.1 libxcb-cursor.so.0 libxkbcommon-x11.so.0; do          ldconfig -p | grep -q "$lib"            || { echo "FATAL: $lib missing after install — PySide6 will not import" >&2; exit 1; };        done

# Rust, for the embedded NES core (native/nes_core is a PyO3 extension around
# tetanes-core). rustup rather than Debian's rustc: bookworm ships 1.63, which is pyo3
# 0.23's exact minimum and below what tetanes-core 0.14 wants — near enough to look like
# it might work and fail deep in a build. Pinned so an image rebuild is reproducible.
#
# `--profile minimal` skips docs and clippy: this toolchain exists to build one cdylib.
ARG RUST_VERSION=1.83.0
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs       | sh -s -- -y --profile minimal --default-toolchain "${RUST_VERSION}"     && /root/.cargo/bin/cargo --version     && pipx install maturin     && maturin --version
ENV PATH="/root/.cargo/bin:${PATH}"

# Playwright + Chromium, baked at build (no per-create download, no rotating-CDN egress
# problem at runtime; --with-deps pulls the browser's apt libraries into the image).
#
# Baked, NOT allowlisted at runtime, on purpose: init-firewall.sh resolves each allowed
# host's A records ONCE at container start and pins the IPs in an ipset. cdn.playwright.dev
# is a rotating CDN, so an allowlist entry goes stale mid-session and the download fails
# anyway. Downloading at build time — when the firewall does not yet apply — is reliable.
#
# PLAYWRIGHT_VERSION MUST match the @playwright/test version resolved in the repo's
# package-lock.json: browser builds are keyed to the Playwright version (a mismatch gives
# the "Executable doesn't exist at .../chromium_headless_shell-<N>" error at test time,
# which is exactly what a floating "^1.49.0" produced before this was pinned). The
# builder-tests suite has an invariant that fails if the two drift apart — if it does,
# bump the ARG below and rebuild the container.
#
# Installing `chromium` also pulls chromium_headless_shell + ffmpeg, which is what
# playwright.config.js's single chromium project needs. Browsers land in
# /root/.cache/ms-playwright — deliberately NOT a mounted path, so they survive in the
# image and are not shadowed by the workspace bind mount.
ARG PLAYWRIGHT_VERSION=1.61.1
RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/.claude /commandhistory

# Debian puts some binaries (e.g. fceux) in /usr/games, which is NOT on the default PATH.
ENV PATH="/usr/games:${PATH}"
# Explain the host/container split on an interactive shell. Docker is deliberately absent
# in here, and the resulting "docker is not installed" from a project's own start script
# reads like a broken image rather than the isolation working.
RUN printf '%s\n' \
  'if [ -t 1 ]; then' \
  '  printf "\\nDev container: edit, build and test in here.\\n"' \
  '  printf "Docker is intentionally NOT available — the project'"'"'s own stack (compose,\\n"' \
  '  printf "./start.sh) runs on the HOST. Exit and run it there.\\n"' \
  '  printf "Dev servers: bind 0.0.0.0, not 127.0.0.1, or the host cannot reach them.\\n\\n"' \
  'fi' > /etc/profile.d/00-devcontainer.sh && chmod 644 /etc/profile.d/00-devcontainer.sh

ENV HISTFILE=/commandhistory/.bash_history
WORKDIR /workspace
