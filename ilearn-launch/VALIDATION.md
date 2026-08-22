# iLEARN launch validation — 14 August 2026

## Components

- SAG repository commit: `54cf6ed2f86c2187d78695aa6ca3c9f3fe38b772`
- SAG release: `v1.6.2` (14 August 2026)
- zleap-sag engine: `0.7.1`
- OpenTutor commit: `47c23db3785ff8cb5e84a50968f16373074dc819`
- Wix site: Autism And Me (`d48b8926-fe97-4c1b-ac48-4fb1f362837f`)
- Integration repository: `Harrisfromparis/autismandme.ie-toolbox`
- Launch branch: `codex/ilearn-sag-opentutor-macbeth-20260814`
- Teacher-review pull request: https://github.com/Harrisfromparis/autismandme.ie-toolbox/pull/22

## Passed

- SAG upstream API suite: **474 passed, 1 skipped**.
- iLEARN combined-service suite: **5 passed**.
- SAG parsed the Macbeth fixture into **3 traceable chunks**.
- The real SAG API created source
  `e236c2cf9e404b4eb4cc4ceb57106d6a` and accepted document
  `729f9418e4f74a35bfe07992122eff46`.
- The adaptive API returned the expected supported-start result:
  `scaffold`, difficulty layer 1 and only chapter, notes and quiz blocks.
- Strict programme filtering rejected a Junior Cycle request against the
  Leaving Certificate endpoint.
- API-key authentication rejected an unauthenticated adaptive request.
- Teach-back and source search endpoints passed.
- Accessible local demonstration loaded at `/demo`.
- Wix CMS collection `iLearnAdaptiveLaunch` was created with admin-only writes.
- Three tested learner-profile records were inserted and queried successfully.
- No learner ID, answer, progress or private data was written to the public CMS
  collection.
- Fourteen launch files were committed to the connected repository and pull
  request 22 was opened against `main` for the required teacher approval gate.

## Live Wix records

| Profile | Item ID |
|---|---|
| Supported Start | `edffc904-82b2-4023-ba4a-3c411aaa74a7` |
| Building Confidence | `e9c36756-8e57-4ea8-9d49-ab4bdb272a72` |
| Ready for Challenge | `9f714a82-d337-4b59-b539-84ac9714080c` |

## Deliberate production gate

The combined service is ready to deploy, but it is not falsely marked as live.
The health endpoint reports `launchSafe: false` when the built-in local test key
is used and `launchSafe: true` only when `ILEARN_SERVICE_API_KEY` is replaced.

The final public connection requires a deployed HTTPS service URL and two Wix
Secrets: `ILEARN_SERVICE_URL` and `ILEARN_SERVICE_API_KEY`. The Velo adapter is
included and restricts calls to logged-in site members.

## Not changed

- Existing iLEARN collections and learner records.
- Existing protected teacher and learner page permissions.
- The published site layout.
- Any commercial textbook or commentary.
