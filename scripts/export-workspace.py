"""Export regular workspace files only; never follow links or include package caches."""
import os
from pathlib import Path
import stat
import sys
import zipfile

EXCLUDED = {".venv", "venv", ".local", ".cache", ".tmp", "node_modules", ".ssh", ".gnupg"}
MAX_BYTES = 50 * 1024 * 1024
MAX_FILES = 2000


def files(root, practice=False):
    total = 0
    selected = []
    for directory, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED and not (practice and d == "casebook") and not Path(directory, d).is_symlink())
        for name in sorted(names):
            if name == ".case-data.json":
                continue
            target = Path(directory, name)
            info = target.lstat()
            if not stat.S_ISREG(info.st_mode):
                continue
            total += info.st_size
            selected.append(target)
            if total > MAX_BYTES or len(selected) > MAX_FILES:
                raise ValueError("Export limit exceeded")
    return selected


def export(root, output, practice=False):
    selected = files(root, practice)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        total = 0
        for target in selected:
            target.resolve().relative_to(root.resolve())
            fd = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
            with os.fdopen(fd, "rb") as source:
                if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                    raise ValueError("File changed during export")
                with archive.open(target.relative_to(root).as_posix(), "w") as dest:
                    while chunk := source.read(65536):
                        total += len(chunk)
                        if total > MAX_BYTES:
                            raise ValueError("Export limit exceeded")
                        dest.write(chunk)


if __name__ == "__main__":
    try:
        export(Path(sys.argv[1]).resolve(), sys.stdout.buffer, len(sys.argv) > 2 and sys.argv[2] == "demo")
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
