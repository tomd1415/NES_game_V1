# Linux packaging scaffold

These files describe the development identity of the native Linux application.
They are not a release package yet.

The current desktop/AppStream ID is
`io.github.tomd1415.NESStudio.Devel`. The `.Devel` suffix prevents early test
installs from claiming the permanent settings, desktop activation and package
identity. The product owner must approve the production ID before the first
public package.

Future packaging work must:

- install the desktop file, AppStream metadata, MIME definition and icon;
- install only required Qt modules and exclude QtWebEngine;
- decide whether cc65 is system-provided or bundled;
- keep FCEUX optional unless a release profile explicitly includes Play;
- validate metadata and test installation from read-only application files.
