# Dev container image for nesgame — agent + egress firewall, for ROOTLESS Docker.
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
    && npm install -g vitest jest
ENV PATH="/root/.local/bin:${PATH}"

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
