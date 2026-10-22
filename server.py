#!/usr/bin/env python3
"""Local, single-user synthetic demo server. Standard library only."""
import argparse
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sqlite3
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get('ASHA_DB_PATH', str(ROOT / 'data' / 'asha.db')))
COLLECTIONS = ('households', 'beneficiaries', 'visits', 'flags', 'tasks', 'referrals', 'audit')

def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    for name in COLLECTIONS:
        db.execute(f'CREATE TABLE IF NOT EXISTS {name} (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    db.commit()
    return db

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed_host(self):
        # Prevent hostile Host / Origin headers and accidental remote access.
        host = self.headers.get('Host', '')
        if host not in {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}:
            return False
        origin = self.headers.get('Origin')
        return not origin or origin in {f'http://localhost:{self.server.server_port}', f'http://127.0.0.1:{self.server.server_port}'}

    def do_GET(self):
        if not self.allowed_host():
            return self.reply(403, {'error': 'Local access only'})
        if self.path == '/api/health':
            return self.reply(200, {'service': 'asha-sahayak-demo', 'storage': 'sqlite', 'mode': 'synthetic-only'})
        if self.path == '/api/backup':
            with connect() as db:
                row = db.execute('SELECT payload FROM backups WHERE id=1').fetchone()
            return self.reply(200 if row else 404, json.loads(row[0]) if row else {'error': 'No backup'})
        if self.path.startswith('/api/'):
            return self.reply(404, {'error': 'Unknown endpoint'})
        return super().do_GET()

    def do_POST(self):
        if not self.allowed_host():
            return self.reply(403, {'error': 'Local access only'})
        if self.path != '/api/sync':
            return self.reply(404, {'error': 'Unknown endpoint'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'error': 'JSON required'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 5_000_000:
                return self.reply(413, {'error': 'Backup must be under 5 MB'})
            payload = json.loads(self.rfile.read(size))
            state = payload['state']
            if not isinstance(state, dict) or state.get('schema_version') != 1:
                raise ValueError('Unsupported schema')
            for name in COLLECTIONS:
                rows = state[name]
                if not isinstance(rows, list) or len(rows) > 10000:
                    raise ValueError('Invalid collection')
                ids = set()
                for row in rows:
                    if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'] or row['id'] in ids:
                        raise ValueError('Invalid or duplicate record ID')
                    ids.add(row['id'])
            beneficiaries = {r['id'] for r in state['beneficiaries']}
            visits = {r['id'] for r in state['visits']}
            for collection in ('visits', 'tasks', 'referrals', 'flags'):
                if any(r.get('beneficiary_id') not in beneficiaries for r in state[collection]):
                    raise ValueError('Invalid beneficiary reference')
            if any(r.get('visit_id') not in visits for r in state['flags'] + state['referrals']):
                raise ValueError('Invalid visit reference')
        except (KeyError, ValueError, TypeError, json.JSONDecodeError):
            return self.reply(400, {'error': 'Invalid backup payload'})
        try:
            with connect() as db:
                for name in COLLECTIONS:
                    db.execute(f'DELETE FROM {name}')
                    db.executemany(f'INSERT INTO {name}(id,payload) VALUES (?,?)', [(row['id'], json.dumps(row)) for row in state[name]])
                db.execute('INSERT INTO backups(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=CURRENT_TIMESTAMP', (json.dumps(state),))
            return self.reply(200, {'ok': True, 'records': sum(len(state[n]) for n in COLLECTIONS)})
        except sqlite3.Error:
            return self.reply(500, {'error': 'Backup transaction failed; local records retained'})

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'ASHA Sahayak: http://127.0.0.1:{args.port} (synthetic demo only)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
