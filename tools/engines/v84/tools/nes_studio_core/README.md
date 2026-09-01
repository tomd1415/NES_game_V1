# NES Studio build core

This package contains the transport-independent project-to-ROM generation and
build workflow shared by the web HTTP adapter and the native Linux client. It
does not start a server, create a database, or write outside a caller-provided
temporary build workspace.
