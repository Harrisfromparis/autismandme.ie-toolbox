# iLEARN launch candidate

This package combines:

- SAG v1.6.2 for source parsing, chunking, hashes and traceable evidence;
- OpenTutor adaptive difficulty, Socratic state, cognitive-load rules and FSRS;
- a protected Wix Velo web module for logged-in site members;
- a local accessible demonstration at `/demo`.

## Local verification

From the workspace root:

```bash
ILEARN_SERVICE_API_KEY=local-launch-key \
  sag/.venv/bin/uvicorn --app-dir ilearn_launch app:app --host 127.0.0.1 --port 8008
```

Open `http://127.0.0.1:8008/demo`.

Run tests:

```bash
ILEARN_SERVICE_API_KEY=test-key \
  sag/.venv/bin/python -m pytest -q ilearn_launch/test_app.py
```

## Production boundary

The browser never receives the service key. The Wix page calls the
`Permissions.SiteMember` web methods in `wix-backend/adaptiveDecision.web.js`.
That server-side module reads `ILEARN_SERVICE_URL` and `ILEARN_SERVICE_API_KEY`
from Wix Secrets and calls this service.

Use a long random production key. The `/health` endpoint returns
`launchSafe: false` while the local default key is active.

## Included Wix files

- `wix-backend/adaptiveDecision.web.js`: protected external-service adapter.
- `wix-page/macbeth-adaptive.js`: learner page event and accessibility logic.
- `WIX_ELEMENT_IDS.md`: exact elements needed on the page.
- `VALIDATION.md`: test results and live Wix staging record.
- `LAUNCH_CHECKLIST.md`: exact production release gates.
- `WIX_STAGING.json`: live site collection and item identifiers.

The live site CMS receives only launch configuration and public-domain pilot
content. Learner answers and member IDs must remain in protected backend data.
