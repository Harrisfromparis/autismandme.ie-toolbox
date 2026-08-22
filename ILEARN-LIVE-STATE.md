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
- `iLEARN Live Platform Shell v1` — revision 5, `loadOnce: false`.
- `iLEARN Learning Load Simulator Live v1` — revision 5, `loadOnce: false`.

The platform shell and simulator now run on each Wix page navigation rather than only the initial site render. Each runtime also removes its own full-screen root when the visitor leaves its route. This fixes the single-page-navigation failure mode where entering `/ilearn` or `/learning-load-simulator` after another Wix page could leave the experience missing or stale.

Both runtime pathname guards use the valid normaliser `.replace(/\/+$/,'')`.

## Learner UX

`iLEARN Explain It Back Launcher v1` is enabled at revision 2. Its route check is now limited to `/ilearn`, `/learner-dashboard`, `/my-pathways`, and `/pathway-preview` plus its existing pathway-content checks. The previous broad `education` path match was removed.

This makes Explain It Back available from the main iLEARN entry point without adding it across unrelated education pages.

## Navigation

The current public Autism And Me header still exposes an older `iLearn Sign Up/Login` menu route rather than a direct `/ilearn` entry. The classic Wix Editor menu is not being treated as API-editable here. Do not claim that menu has been repaired until it is verified in Wix.

The iLEARN shell itself links to the learner dashboard, teacher dashboard, pathway creation, My Pathways, Browse Resources, and Learning Load Simulator.

## Legacy embeds

Do not mass-disable Macbeth or Jekyll/Hyde embeds. Several are enabled globally at the Wix embed level but self-guard using query parameters such as `ilearn-v2=macbeth` or `ilearn-premium=jekyll-hyde`.

Two Macbeth helper runtimes that previously started on every page have now been tightened:

- `iLEARN Macbeth Semantic Journey Runtime v5` — revision 2; exits immediately unless `ilearn-v2=macbeth`.
- `iLEARN Semantic Lens Runtime v6` — revision 2; exits immediately unless `ilearn-v2=macbeth`.

The Semantic Lens had previously installed a document-wide MutationObserver while waiting for the Macbeth root, even on unrelated pages. That global observer is now avoided outside the Macbeth route.

`iLEARN JC English 2027 Text Universe Data` remains disabled.

## Next safe priorities

1. Make the public Education Hub navigation expose `/ilearn` without removing any required member sign-in flow.
2. Browser-test `/ilearn` and `/learning-load-simulator` on desktop and mobile.
3. Continue auditing global iLEARN CSS/data payloads that can be scoped without breaking premium Jekyll/Macbeth routes.
4. Keep the GitHub previews and Wix live shell behaviour in parity.
