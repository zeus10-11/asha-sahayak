"""Exercise HTTP handlers and SQLite transactions without opening sockets."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import types
import unittest
SPEC = importlib.util.spec_from_file_location('asha_server', Path(__file__).resolve().parents[1] / 'server.py')
server = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(server)
class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        server.DB_PATH = Path(self.temp.name) / 'test.db'
    def tearDown(self):
        self.temp.cleanup()
    def request(self, path, payload=None, origin=None, host='127.0.0.1:8000', content_type='application/json'):
        handler = object.__new__(server.Handler)
        body = json.dumps(payload).encode() if payload is not None else b''
        handler.path = path
        handler.server = types.SimpleNamespace(server_port=8000)
        handler.headers = {'Host': host, 'Content-Type': content_type, 'Content-Length': str(len(body))}
        if origin:
            handler.headers['Origin'] = origin
        handler.rfile = io.BytesIO(body)
        result = {}
        handler.reply = lambda status, data: result.update(status=status, data=data)
        (handler.do_POST if payload is not None else handler.do_GET)()
        return result
    def state(self):
        state = {'schema_version': 1, **{name: [] for name in server.COLLECTIONS}}
        state['beneficiaries'] = [{'id': 'b1'}]
        state['visits'] = [{'id': 'v1', 'beneficiary_id': 'b1'}]
        state['flags'] = [{'id': 'f1', 'beneficiary_id': 'b1', 'visit_id': 'v1'}]
        return state
    def test_health(self):
        self.assertEqual(self.request('/api/health')['data']['service'], 'asha-sahayak-demo')
    def test_backup_roundtrip(self):
        state = self.state()
        self.assertEqual(self.request('/api/sync', {'state': state})['status'], 200)
        self.assertEqual(self.request('/api/backup')['data'], state)
    def test_idempotent_backup(self):
        payload = {'state': self.state()}
        self.request('/api/sync', payload)
        self.request('/api/sync', payload)
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM visits').fetchone()[0], 1)
    def test_failed_backup_preserves_previous(self):
        state = self.state()
        self.request('/api/sync', {'state': state})
        invalid = self.state()
        invalid['flags'][0]['visit_id'] = 'missing'
        self.assertEqual(self.request('/api/sync', {'state': invalid})['status'], 400)
        self.assertEqual(self.request('/api/backup')['data'], state)
    def test_duplicate_ids_rejected(self):
        state = self.state()
        state['visits'].append(state['visits'][0])
        self.assertEqual(self.request('/api/sync', {'state': state})['status'], 400)
    def test_invalid_beneficiary_reference(self):
        state = self.state()
        state['visits'][0]['beneficiary_id'] = 'missing'
        self.assertEqual(self.request('/api/sync', {'state': state})['status'], 400)
    def test_foreign_origin_blocked(self):
        self.assertEqual(self.request('/api/sync', {'state': self.state()}, origin='https://example.com')['status'], 403)
    def test_foreign_host_blocked(self):
        self.assertEqual(self.request('/api/health', host='example.com')['status'], 403)
    def test_requires_json(self):
        self.assertEqual(self.request('/api/sync', {'state': self.state()}, content_type='text/plain')['status'], 415)
    def test_missing_backup(self):
        self.assertEqual(self.request('/api/backup')['status'], 404)
    def test_unsupported_schema(self):
        self.assertEqual(self.request('/api/sync', {'state': {'schema_version': 2}})['status'], 400)
    def test_unknown_endpoint(self):
        self.assertEqual(self.request('/api/missing')['status'], 404)
if __name__ == '__main__':
    unittest.main()
