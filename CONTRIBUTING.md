# Contributing

ASHA Sahayak is a synthetic-data demonstration. Use fictional beneficiaries and notes in code, fixtures, screenshots, and issue reports.

## Local development

1. Install Python 3.10+ and Node.js 22+ (Node is needed only for checks).
2. Run `python3 server.py` and open http://127.0.0.1:8000.
3. Edit the source files directly in `dist/`; no build step or npm installation is required.
4. Run the checks before opening a pull request:

```bash
npm test
npm run check
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

For UI changes, also check the affected flow in a browser. Service-worker caches may require an update or clearing site data; clearing site data removes local records.

## Pull requests

Describe the problem, the resulting behaviour, and how you verified it. Add focused regression tests when changing screening, extraction, persistence, or backup behaviour. Keep documentation consistent with the implementation.

Screening changes must preserve explicit uncertainty, worker confirmation, provenance, and the unreviewed-demo status. Code review and automated tests are not clinical approval.

Do not commit local databases, audio recordings, exports, credentials, or hosting account metadata. Report reproducible bugs with synthetic examples and browser/runtime versions.
