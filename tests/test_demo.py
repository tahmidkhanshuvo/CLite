import importlib.util
import base64
import hashlib
import json
import re
import io
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


demo = load("demo", "demo-shell.py")
exporter = load("exporter", "export-workspace.py")
author = load("author", "build-story.py")


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / "templates" / "demo", self.root, dirs_exist_ok=True)
        self.shell = demo.DemoShell(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_challenges_and_pipelines(self):
        self.shell.run("cat challenges/encoded.txt | base64 -d > answer.txt")
        self.assertEqual(self.shell.run("cat answer.txt"), b"CLITE{layers_unwrapped}")
        self.assertIn(b"Correct", self.shell.run("check encoding 'CLITE{layers_unwrapped}'"))
        self.assertIn(b"Evidence recovered: 1", self.shell.run("score"))
        self.assertIn(b"CLITE{rotate_your_view}", self.shell.run("cat challenges/rotated.txt | rot13"))
        self.assertIn(b"CLITE{structured_evidence}", self.shell.run("jq .data.flag challenges/response.json"))
        self.assertIn(b"CLITE{follow_the_logs}", self.shell.run("grep 200 challenges/access.log | grep CLITE"))

    def test_notes_and_navigation(self):
        self.shell.run("mkdir -p work/output")
        self.shell.run("cd work")
        self.shell.run("echo 'first observation' > notes.txt")
        self.shell.run("echo 'second observation' >> notes.txt")
        self.assertEqual(self.shell.run("wc -l notes.txt").strip(), b"2")
        self.shell.run("cp notes.txt backup.txt")
        self.assertEqual(self.shell.run("diff notes.txt backup.txt"), b"")
        self.shell.run("cd ~")
        self.assertIn(b"notes.txt", self.shell.run("find work -name '*.txt'"))

    def test_traversal_and_execution_are_unavailable(self):
        for command in ["cat ../outside", "cat /etc/passwd", "cd ..", "echo secret > ../outside", "python3 -c 'import os'", "bash", "find . -exec bash"]:
            with self.subTest(command=command):
                if command.startswith("find"):
                    self.assertNotIn(b"root:", self.shell.run(command))
                else:
                    with self.assertRaises(ValueError):
                        self.shell.run(command)
        self.shell.run("echo '$(touch escape)' > literal.txt")
        self.assertFalse((self.root / "escape").exists())

    def test_symlinks_are_rejected(self):
        try:
            (self.root / "escape").symlink_to(self.root.parent, target_is_directory=True)
        except OSError:
            self.skipTest("Host does not allow symlink creation")
        with self.assertRaises(ValueError):
            self.shell.run("cat escape/outside")

    def test_limits_and_errors(self):
        with self.assertRaises(ValueError):
            self.shell.write("huge.txt", b"x" * (demo.LIMIT + 1))
        for command in ["cat |", "echo hi >", "echo hi || cat", "jq '.__class__' challenges/response.json", "base64 -d challenges/access.log"]:
            with self.subTest(command=command):
                with self.assertRaises((ValueError, KeyError)):
                    self.shell.run(command)

    def test_export_omits_packages_and_preserves_work(self):
        (self.root / ".venv").mkdir()
        (self.root / ".venv" / "secret").write_text("skip")
        self.shell.run("echo evidence > notes.txt")
        output = io.BytesIO()
        exporter.export(self.root, output)
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(archive.read("notes.txt"), b"evidence\n")
            self.assertNotIn(".venv/secret", archive.namelist())

    def test_linked_story_is_solvable_and_portable(self):
        entries, artifacts, headers = author.build()
        self.assertGreaterEqual(len(entries), 100)
        self.assertEqual(len({entry["id"] for entry in entries}), len(entries))
        self.assertEqual(len({entry["sha256"] for entry in entries}), len(entries))
        for entry in entries:
            with self.subTest(scene=entry["id"]):
                self.assertEqual(self.shell.current_case()["id"], entry["id"])
                if entry["surface"] == "website":
                    if entry["category"] == "headers":
                        raw = headers[entry["location"]][entry["header"]]
                    elif "note" in entry:
                        raw = entry["note"]
                    else:
                        raw = artifacts["public" + entry["location"]].decode()
                    flag = base64.b64decode(raw.split("base64:")[1].split("|")[0].strip()).decode()
                else:
                    location, kind = entry["location"], entry["category"]
                    if kind in ("base64", "base32", "hex", "url", "ascii"):
                        flag = self.shell.run(f"{kind} -d {location}").decode().strip()
                    elif kind == "rot13":
                        flag = self.shell.run(f"rot13 {location}").decode().strip()
                    elif kind == "layers":
                        flag = self.shell.run(f"cat {location} | base64 -d | base64 -d").decode().strip()
                    elif kind == "json":
                        flag = json.loads(self.shell.run(f"jq .evidence.verified.message {location}"))
                    elif kind == "logs":
                        flag = self.shell.run(f"grep status=verified {location}").decode().strip().split("evidence=")[1]
                    elif kind == "strings":
                        flag = self.shell.run(f"strings {location}").decode().strip()
                    elif kind == "reverse":
                        flag = self.shell.run(f"rev {location}").decode().strip()
                    elif kind == "caesar":
                        shift = re.search(r"caesar (\d+)", entry["hint"])[1]
                        flag = self.shell.run(f"caesar {shift} {location}").decode().strip()
                    elif kind == "xor":
                        key = re.search(r"Try xor ([0-9a-f]+)", entry["hint"])[1]
                        flag = self.shell.run(f"xor {key} {location}").decode().strip()
                    elif kind == "frames":
                        flag = self.shell.run(f"sort {location} | cut -d ':' -f 2 | tr -d '\\n'").decode()
                    elif kind == "hash":
                        folder = self.shell.path(location).parent
                        fingerprint = self.shell.read(location).decode().strip()
                        matches = [file.read_bytes().decode() for file in folder.glob("witness-*.txt") if hashlib.sha256(file.read_bytes()).hexdigest() == fingerprint]
                        self.assertEqual(len(matches), 1)
                        flag = matches[0]
                    elif kind == "json-layers":
                        flag = self.shell.run(f"jq .parcel.message {location} | tr -d '\"' | base64 -d | base64 -d").decode().strip()
                    else:
                        self.fail("Missing solver for " + kind)
                self.assertEqual(hashlib.sha256(flag.encode()).hexdigest(), entry["sha256"])
                self.assertIn(b"Evidence accepted", self.shell.run(f"check {entry['id']} '{flag}'"))
        self.assertIsNone(self.shell.current_case())
        self.assertIn(b"Case closed", self.shell.run("case"))
        restored = demo.DemoShell(self.root)
        self.assertIsNone(restored.current_case())
        author.main(check=True)


if __name__ == "__main__":
    unittest.main()
