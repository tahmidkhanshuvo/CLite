"""Offline practice shell. Commands are explicit Python functions, never subprocesses/eval.

This is a small learning environment, not a general Linux shell or an OS sandbox.
"""
import base64
import codecs
import difflib
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sys
import urllib.parse

LIMIT = 1024 * 1024
HELP = """CLite 2.0 public practice shell
Navigation: pwd, ls [-a], cd, tree, find [path] [-name glob]
Files: cat, head [-n N], tail [-n N], touch, mkdir [-p], cp, mv, rm
Text: echo [-n], grep [-invc] TEXT [file] (literal search), sort [-ru], uniq [-c], wc [-lwc], diff
Bytes: strings, xxd [-r -p], base64 [-d], base32 [-d], hex [-d], rot13, url [-d]
Data: jq .path [file], md5sum, sha1sum, sha256sum, file, stat
Practice: challenges, hint ID, check ID FLAG, score, help, clear, exit
Use pipelines and redirects: cat challenges/encoded.txt | base64 -d > answer.txt
Create notes: echo 'my findings' >> notes.txt
Read README.md for exercises. Upload files and download this workspace with the toolbar.
All paths stay in your workspace. No host commands, network, Python execution, or package installs.
Team mode provides the full Linux toolchain. This demo implements the commands listed above.
"""
CHALLENGES = {
    "encoding": ("Decode challenges/encoded.txt", "Pipe the file through base64 -d.", "CLITE{layers_unwrapped}"),
    "rotation": ("Decode challenges/rotated.txt", "Try the rot13 helper.", "CLITE{rotate_your_view}"),
    "logs": ("Find the successful flag request in challenges/access.log", "grep 200 challenges/access.log", "CLITE{follow_the_logs}"),
    "json": ("Read the flag nested inside challenges/response.json", "jq .data.flag challenges/response.json", "CLITE{structured_evidence}"),
    "bytes": ("Inspect challenges/artifact.bin for printable evidence", "strings challenges/artifact.bin", "CLITE{strings_tell_stories}"),
}


class DemoShell:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.cwd = self.root
        self.solved = set()

    def path(self, value="."):
        if value in ("~", "$HOME"):
            return self.root
        if value.startswith("~/"):
            value = str(self.root / value[2:])
        candidate = self.cwd / value
        if any(part.startswith(".") and part not in (".", "..") for part in Path(value).parts):
            raise ValueError("Hidden paths are unavailable in public practice")
        # Reject links at every component, including links pointing inside HOME.
        current = candidate
        while current != self.root and current != current.parent:
            if current.is_symlink():
                raise ValueError("Symlinks are unavailable in public practice")
            current = current.parent
        resolved = candidate.resolve()
        if not resolved.is_relative_to(self.root):
            raise ValueError("Path must stay inside this workspace")
        return resolved

    def read(self, value):
        target = self.path(value)
        if not target.is_file():
            raise ValueError("Not a regular file")
        with target.open("rb") as source:
            data = source.read(LIMIT + 1)
        if len(data) > LIMIT:
            raise ValueError("Demo files must be at most 1 MiB")
        return data

    def write(self, target, data, append=False):
        dest = self.path(target)
        used = 0
        count = 0
        for directory, dirs, names in os.walk(self.root, followlinks=False):
            dirs[:] = [d for d in dirs if not Path(directory, d).is_symlink()]
            count += len(dirs)
            for name in names:
                item = Path(directory, name)
                if not item.is_symlink():
                    used += item.stat().st_size
                    count += 1
        existing = dest.stat().st_size if dest.exists() else 0
        if len(data) + (existing if append else 0) > LIMIT or used + len(data) > 16 * LIMIT or count >= 500:
            raise ValueError("Demo workspace limit: 1 MiB/file, 16 MiB total, 500 files")
        with dest.open("ab" if append else "wb") as output:
            output.write(data)

    def listing(self, root):
        entries = []
        for directory, dirs, names in os.walk(root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if not Path(directory, d).is_symlink() and not d.startswith("."))
            for name in sorted(dirs + names):
                entry = Path(directory, name)
                if not entry.is_symlink():
                    entries.append(entry)
                if len(entries) >= 500:
                    return entries
        return entries

    def run(self, line):
        if len(line) > 8192:
            raise ValueError("Command is too long")
        lexer = shlex.shlex(line, posix=True, punctuation_chars="|>")
        lexer.whitespace_split = True
        lexer.commenters = ""
        tokens = list(lexer)
        if not tokens:
            return b""
        if any(token in ("||", "|||", ">>>", "|>") for token in tokens):
            raise ValueError("Use single pipes and > or >> redirects")
        redirect = None
        for index, token in enumerate(tokens):
            if token in (">", ">>"):
                if index != len(tokens) - 2 or redirect:
                    raise ValueError("Put one output redirect at the end")
                redirect = (tokens[index + 1], token == ">>")
                tokens = tokens[:index]
                break
        groups = [[]]
        for token in tokens:
            if token == "|":
                groups.append([])
            else:
                groups[-1].append(token)
        if len(groups) > 12 or any(not group for group in groups):
            raise ValueError("Invalid pipeline (maximum 12 commands)")
        data = b""
        for group in groups:
            data = self.command(group[0], group[1:], data)
            if len(data) > LIMIT:
                raise ValueError("Output exceeds 1 MiB")
        if redirect:
            self.write(redirect[0], data, redirect[1])
            return b""
        return data

    def command(self, cmd, args, stdin):
        flags = [a for a in args if a.startswith("-")]
        values = [a for a in args if not a.startswith("-")]

        def source():
            if values:
                data = b""
                for value in values:
                    chunk = self.read(value)
                    if len(data) + len(chunk) > LIMIT:
                        raise ValueError("Input exceeds 1 MiB")
                    data += chunk
                return data
            return stdin

        def text(data):
            return data.decode("utf-8", errors="replace")

        def out(value):
            return (str(value) + "\n").encode()

        if cmd == "help":
            return HELP.encode()
        if cmd == "exit":
            raise EOFError
        if cmd == "clear":
            return b"\x1b[2J\x1b[H"
        if cmd == "pwd":
            return out("~" if self.cwd == self.root else "~/" + self.cwd.relative_to(self.root).as_posix())
        if cmd == "cd":
            target = self.path(args[0] if args else "~")
            if not target.is_dir():
                raise ValueError("Not a directory")
            self.cwd = target
            return b""
        if cmd in ("ls", "tree", "find"):
            target = self.path(values[0] if values else ".")
            if not target.is_dir():
                return out(target.name)
            if cmd == "ls":
                return out("  ".join(p.name + ("/" if p.is_dir() else "") for p in sorted(target.iterdir()) if ("-a" in flags or "-la" in flags or not p.name.startswith("."))))
            entries = self.listing(target)
            if cmd == "find" and "-name" in args:
                pattern = args[args.index("-name") + 1]
                entries = [p for p in entries if fnmatch.fnmatchcase(p.name, pattern)]
            return out("\n".join(p.relative_to(target).as_posix() + ("/" if p.is_dir() else "") for p in entries))
        if cmd in ("mkdir", "touch"):
            if not values or len(values) > 20:
                raise ValueError("Supply 1 to 20 paths")
            for value in values:
                if len(self.listing(self.root)) >= 500:
                    raise ValueError("Demo workspace file limit reached")
                target = self.path(value)
                if cmd == "mkdir":
                    if len(target.relative_to(self.root).parts) > 16:
                        raise ValueError("Directory depth limit reached")
                    target.mkdir(parents="-p" in flags, exist_ok="-p" in flags)
                elif not target.exists():
                    self.write(value, b"")
            return b""
        if cmd in ("cp", "mv"):
            if len(args) != 2:
                raise ValueError("Usage: cp|mv source destination (regular files)")
            self.write(args[1], self.read(args[0]))
            if cmd == "mv":
                self.path(args[0]).unlink()
            return b""
        if cmd == "rm":
            for value in values:
                self.path(value).unlink()  # files only; no recursive deletion
            return b""
        if cmd == "echo":
            return " ".join(args[1:] if args[:1] == ["-n"] else args).encode() + (b"" if args[:1] == ["-n"] else b"\n")
        if cmd in ("cat", "batcat"):
            return source()
        if cmd in ("head", "tail"):
            count = 10
            if args[:1] == ["-n"]:
                count = max(0, min(10000, int(args[1])))
                values = args[2:]
            lines = source().splitlines(keepends=True)
            return b"".join(lines[:count] if cmd == "head" else (lines[-count:] if count else []))
        if cmd in ("grep", "rg"):
            if not values:
                raise ValueError("Usage: grep [-invc] TEXT [file]")
            needle = values.pop(0)
            options = "".join(flags)
            if any(c not in "-invcF" for c in options):
                raise ValueError("Use literal grep with -i, -n, -v, -c or -F")
            matched = []
            for n, row in enumerate(text(source()).splitlines(), 1):
                hit = needle.casefold() in row.casefold() if "i" in options else needle in row
                if hit != ("v" in options):
                    matched.append(f"{n}:{row}" if "n" in options else row)
            return out(len(matched) if "c" in options else "\n".join(matched))
        if cmd in ("sort", "uniq"):
            lines = text(source()).splitlines()
            if cmd == "sort":
                lines = sorted(set(lines) if "u" in "".join(flags) else lines, reverse="r" in "".join(flags))
            else:
                counts = []
                for row in lines:
                    if counts and counts[-1][1] == row:
                        counts[-1][0] += 1
                    else:
                        counts.append([1, row])
                lines = [f"{n} {row}" if "-c" in flags else row for n, row in counts]
            return out("\n".join(lines))
        if cmd == "wc":
            data = source()
            counts = {"l": data.count(b"\n"), "w": len(data.split()), "c": len(data)}
            selected = "".join(flags).replace("-", "") or "lwc"
            return out(" ".join(str(counts[c]) for c in selected))
        if cmd == "diff":
            if len(args) != 2:
                raise ValueError("Usage: diff file1 file2")
            left, right = [text(self.read(arg)).splitlines(True) for arg in args]
            if max(len(left), len(right)) > 2000:
                raise ValueError("Demo diff supports up to 2000 lines")
            return "".join(difflib.unified_diff(left, right, fromfile=args[0], tofile=args[1])).encode()
        if cmd in ("base64", "base32", "hex", "rot13", "url"):
            data = source().strip() if "-d" in flags else source()
            if cmd == "base64":
                result = base64.b64decode(data, validate=True) if "-d" in flags else base64.b64encode(data)
            elif cmd == "base32":
                result = base64.b32decode(data) if "-d" in flags else base64.b32encode(data)
            elif cmd == "hex":
                result = bytes.fromhex(text(data)) if "-d" in flags else data.hex().encode()
            elif cmd == "rot13":
                result = codecs.encode(text(data), "rot13").encode()
            else:
                result = (urllib.parse.unquote(text(data)) if "-d" in flags else urllib.parse.quote(text(data), safe="")).encode()
            return result + (b"" if "-d" in flags or result.endswith(b"\n") else b"\n")
        if cmd == "strings":
            return out("\n".join(text(s) for s in re.findall(rb"[\x20-\x7e]{4,}", source())))
        if cmd == "xxd":
            data = source()
            if "-r" in flags:
                if "-p" not in flags:
                    raise ValueError("Use xxd -r -p for plain hex decoding")
                return bytes.fromhex(text(data))
            if "-p" in flags:
                return out(data.hex())
            return out("\n".join(f"{i:08x}: {data[i:i+16].hex(' '):47}  " + "".join(chr(c) if 32 <= c < 127 else "." for c in data[i:i+16]) for i in range(0, len(data), 16)))
        if cmd in ("md5sum", "sha1sum", "sha256sum"):
            algorithm = cmd.removesuffix("sum")
            return out("\n".join(f"{hashlib.new(algorithm, self.read(v)).hexdigest()}  {v}" for v in values)) if values else out(hashlib.new(algorithm, stdin).hexdigest() + "  -")
        if cmd == "jq":
            if not args or not re.fullmatch(r"\.(?:[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*)?", args[0]):
                raise ValueError("Demo jq supports . or .nested.path")
            values = args[1:]
            obj = json.loads(source())
            if args[0] != ".":
                for key in args[0][1:].split("."):
                    obj = obj[key]
            return out(json.dumps(obj, indent=2, ensure_ascii=True))
        if cmd in ("file", "stat"):
            rows = []
            for value in values:
                target = self.path(value)
                if cmd == "stat":
                    rows.append(f"{value}: {target.stat().st_size} bytes")
                else:
                    data = self.read(value)
                    kind = "PNG image" if data.startswith(b"\x89PNG") else "ZIP archive" if data.startswith(b"PK\x03\x04") else "ELF binary" if data.startswith(b"\x7fELF") else "data" if b"\x00" in data else "text"
                    rows.append(f"{value}: {kind}")
            return out("\n".join(rows))
        if cmd == "challenges":
            return out("\n".join(f"{'[solved]' if key in self.solved else '[ ]'} {key}: {value[0]}" for key, value in CHALLENGES.items()))
        if cmd == "hint":
            return out(CHALLENGES[args[0]][1])
        if cmd == "check":
            if len(args) != 2:
                raise ValueError("Usage: check ID 'CLITE{flag}'")
            if args[1] == CHALLENGES[args[0]][2]:
                self.solved.add(args[0])
                return out(f"Correct! {len(self.solved)}/{len(CHALLENGES)} solved.")
            return out("Not quite. Try hint " + args[0])
        if cmd == "score":
            return out(f"{len(self.solved)}/{len(CHALLENGES)} challenges solved in this session")
        raise ValueError(f"{cmd}: unavailable in practice mode. Type help; use Team Mode for full Linux tools.")


def main():
    try:
        import readline  # history and arrow keys on Linux; never used for execution
    except ImportError:
        pass
    shell = DemoShell(Path.cwd())
    print("\nCLite 2.0 | Public CTF practice | Tahmid Khan\nType help or challenges to start. Files stay in your temporary workspace.\n")
    while True:
        try:
            shown = shell.cwd.relative_to(shell.root).as_posix()
            prompt = "~" if shown == "." else "~/" + shown
            result = shell.run(input(f"\n\033[1;32mdemo:{prompt}$ \033[0m"))
            if result:
                # Keep uploaded control bytes from injecting terminal escape sequences.
                display = result.decode("utf-8", errors="replace")
                if result != b"\x1b[2J\x1b[H":
                    display = "".join(c if c in "\n\t" or ord(c) >= 32 and ord(c) != 127 else f"\\x{ord(c):02x}" for c in display)
                print(display, end="" if display.endswith("\n") else "\n")
        except EOFError:
            break
        except KeyboardInterrupt:
            print("^C")
        except (OSError, ValueError, KeyError, IndexError, TypeError, RecursionError) as error:
            print("demo:", str(error)[:300])


if __name__ == "__main__":
    main()
