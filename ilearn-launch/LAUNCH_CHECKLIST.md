# Launch checklist

## Teacher approval

1. Review pull request https://github.com/Harrisfromparis/autismandme.ie-toolbox/pull/22.
2. Confirm the Leaving Certificate 2027 Macbeth scope and source excerpt.
3. Complete the repository's Quality Agent and teacher approval gates.
4. Merge only after the service and Wix acceptance checks below pass.

## Service deployment

1. Deploy this directory with `render.yaml` or the included `Dockerfile`.
2. Set `ILEARN_SERVICE_API_KEY` to a new long random value.
3. Confirm `GET /health` returns `launchSafe: true`.
4. Keep the service database volume mounted at `/data`.

## Wix backend

1. Add Wix Secrets named `ILEARN_SERVICE_URL` and `ILEARN_SERVICE_API_KEY`.
2. Add `wix-backend/adaptiveDecision.web.js` as a backend web module.
3. Add the page elements listed in `WIX_ELEMENT_IDS.md`.
4. Add `wix-page/macbeth-adaptive.js` to the members-only learner page.
5. Publish and test with a learner member account.

## Acceptance

- Supported Start shows a foundation question and only three learning blocks.
- Building Confidence shows an evidence question and the full standard view.
- Ready for Challenge asks for a defended judgement and counterargument.
- Every question displays source evidence.
- Teach-back reports missing concepts without exposing the service key.
- A logged-out visitor cannot call the Wix web method.
- A Junior Cycle programme value is rejected by this Leaving Certificate route.
