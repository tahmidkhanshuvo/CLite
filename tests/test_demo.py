import importlib.util
import io
import json
import hashlib
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

demo = load('demo', 'demo-shell.py')
exporter = load('exporter', 'export-workspace.py')

class DemoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'sample.txt').write_text('alpha\nbeta\nalpha\n')
        self.fixture_flag = 'CLITE{unit_test_fixture_only}'
        entries = [dict(id='fixture', title='Fixture', act='Test', sha256=hashlib.sha256(self.fixture_flag.encode()).hexdigest(), next='sealed', category='test', location='casebook/fixture/evidence.txt', hint='Unit-test fixture', surface='workspace'), dict(id='sealed', title='Sealed', act='Test', sha256='0'*64, next=None, category='test', location='casebook/sealed/evidence.txt', hint='Test', surface='workspace')]
        (self.root / '.case-data.json').write_text(json.dumps(dict(entries=entries, progressKey='01'*32)))
        for case in ['fixture', 'sealed']:
            (self.root / 'casebook' / case).mkdir(parents=True)
            (self.root / 'casebook' / case / 'evidence.txt').write_text('fixture evidence')
        self.shell = demo.DemoShell(self.root)
    def tearDown(self):
        self.temp.cleanup()
    def test_pipelines_files_and_literals(self):
        self.shell.run("echo 'hello' | base64 > encoded.txt")
        self.assertEqual(self.shell.run('base64 -d encoded.txt'), b'hello\n')
        self.shell.run("echo '$(touch escape)' > literal.txt")
        self.assertFalse((self.root / 'escape').exists())
        self.assertEqual(self.shell.run('grep alpha sample.txt | wc -l').strip(), b'2')
    def test_paths_and_execution(self):
        for command in ['cat ../outside', 'cat /etc/passwd', 'cd ..', 'cat .case-data.json', "python3 -c 'import os'", 'bash']:
            with self.subTest(command=command), self.assertRaises(ValueError):
                self.shell.run(command)
    def test_sealed_scenes_and_signed_progress(self):
        with self.assertRaises(ValueError):
            self.shell.run('cat casebook/sealed/evidence.txt')
        self.assertNotIn(b'sealed', self.shell.run('ls casebook'))
        self.assertIn(b'Evidence accepted', self.shell.run(f"check fixture '{self.fixture_flag}'"))
        restored = demo.DemoShell(self.root)
        self.assertEqual(restored.current_case()['id'], 'sealed')
        state = json.loads((self.root / 'case-progress.json').read_text())
        state['solved'].append('sealed')
        (self.root / 'case-progress.json').write_text(json.dumps(state))
        self.assertEqual(demo.DemoShell(self.root).current_case()['id'], 'fixture')
    def test_export_omits_private_seed_and_packages(self):
        (self.root / '.venv').mkdir()
        (self.root / '.venv' / 'cache').write_text('skip')
        output=io.BytesIO()
        exporter.export(self.root, output, practice=True)
        with zipfile.ZipFile(output) as archive:
            self.assertIn('sample.txt', archive.namelist())
            self.assertFalse(any(name.startswith('casebook/') for name in archive.namelist()))
            self.assertNotIn('.case-data.json', archive.namelist())
            self.assertNotIn('.venv/cache', archive.namelist())
    def test_limits(self):
        with self.assertRaises(ValueError):
            self.shell.write('huge', b'x'*(demo.LIMIT+1))
        for command in ['cat |', 'echo hi >', 'echo hi || cat']:
            with self.subTest(command=command), self.assertRaises(ValueError):
                self.shell.run(command)

if __name__ == '__main__':
    unittest.main()
