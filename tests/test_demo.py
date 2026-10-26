import importlib.util
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
        self.assertIn(b"1/5", self.shell.run("score"))
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


if __name__ == "__main__":
    unittest.main()
