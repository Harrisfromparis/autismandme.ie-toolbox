# iLEARN live state

Verified against the published Autism And Me Wix site on 22 August 2026.

## Live entry points

- `/ilearn` — whole-curriculum learner/teacher platform shell.
- `/learning-load-simulator` — standalone Learning Load Simulator.
- `/learner-dashboard`
- `/teacher-dashboard`
- `/create-pathway`
- `/my-pathways`
- `/pathway-preview`
- `/browse-resources`

## Wix custom embeds

The live platform currently uses these enabled Wix custom embeds:

- `iLEARN Live Platform Shell Styles v1` — revision 3.
- `iLEARN Live Platform Shell v1` — revision 4.
- `iLEARN Learning Load Simulator Live v1` — revision 4.

On 22 August 2026, both runtime embeds were repaired after the pathname normaliser had been stored as invalid JavaScript (`.replace(//+$/,'')`). The live source now uses `.replace(/\/+$/,'')`.

## Navigation

The current public Autism And Me header still exposes an older `iLearn Sign Up/Login` menu route rather than a direct `/ilearn` entry. The classic Wix Editor menu is not being treated as API-editable here. Do not claim that menu has been repaired until it is verified in Wix.

The iLEARN shell itself links to the learner dashboard, teacher dashboard, pathway creation, My Pathways, Browse Resources, and Learning Load Simulator.

## Legacy embeds

Do not mass-disable Macbeth or Jekyll/Hyde embeds. Several are enabled globally at the Wix embed level but self-guard using query parameters such as `ilearn-v2=macbeth` or `ilearn-premium=jekyll-hyde`.

`iLEARN JC English 2027 Text Universe Data` is disabled.

## Next safe priorities

1. Make the public Education Hub navigation expose `/ilearn` without removing any required member sign-in flow.
2. Browser-test `/ilearn` and `/learning-load-simulator` on desktop and mobile.
3. Audit remaining global iLEARN embeds for unnecessary page-wide observers, intervals, data and CSS.
4. Keep the GitHub previews and Wix live shell behaviour in parity.
