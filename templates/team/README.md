# Team CTF workspace

Start with `clite help`, `clite tools` and `clite doctor`.

- `clite init NAME` creates a challenge folder with files/, output/, notes.md and solve.py.
- Your Python venv is already active: `pip install PACKAGE` and `pip install -U PACKAGE` work locally.
- `pipx install PACKAGE` and `pipx upgrade-all` manage local command-line apps.
- `clite install web|crypto|forensics|stego` installs optional presets.
- `clite system update`, `clite system install PACKAGE`, `clite system upgrade` manage relocatable Debian tools under ~/.local/opt/sysroot. Base OS/root-only changes require a rebuild.
- Use tmux, editors, Git, compilers, debuggers and outbound network tools normally for authorized challenges.
- Upload challenge files from the toolbar. Uploads land in HOME and never overwrite files.
- Run `clite snapshot` then Download workspace before expiry or a deployment.
- In a fresh session, upload your ZIP, run `unzip clite-workspace.zip`, then `clite restore`.

The workspace survives short disconnects and page refreshes while this server instance lives. It is temporary. Download your work before the displayed deadline or a server restart. Package caches, virtual environments and SSH keys are excluded from exports. Teammates share a Linux account; use this instance only with trusted teammates.

Built for ethical CTFs, lab practice, and owned learning environments.
