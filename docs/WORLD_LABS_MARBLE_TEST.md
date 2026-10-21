# World Labs Marble test

The first test uses `marble-1.0-draft`. It is deliberately teacher-triggered and private.

## Wix page elements

Add these elements to the teacher-only Marble test section:

- `#programmeDropdown`
- `#subjectInput`
- `#yearGroupInput`
- `#topicInput`
- `#learningAimInput`
- `#marbleGenerateButton`
- `#marbleStatusText`
- `#marblePreviewImage`
- `#marbleOpenButton`

Copy `wix-backend/iLearn-WorldLabs.web.js` into the Wix backend and the page code from
`wix-pages/world-labs-marble-test.js` into the page. The existing Wix secret must be
named exactly `WORLD_LABS_API_KEY`.

The first useful test brief is:

- Programme: Junior Cycle
- Subject: English
- Year group: Second Year
- Topic: A Victorian street for exploring setting, atmosphere and social inequality
- Learning aim: Identify how physical setting can communicate mood, power and inequality before reading a Victorian novel extract.

The teacher reviews the Marble result before it is attached to a learner pathway. The
generated SPZ visual world and GLB collider remain separate from the iLEARN route,
symbol and stopping-point layer.
