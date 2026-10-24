# Autism & Me — Director Studio

A working, local Windows animation studio: upload character artwork, paste a script and storyboard, review the shot plan, use Director Mode, and export a voiced H.264 MP4 episode with captions.

## Start

On the prepared computer, double-click **Start Director Studio.cmd**, or run `npm start` in this directory. Open **http://127.0.0.1:4317**. Keep the server running while rendering. No Node package installation is needed.

On a fresh Windows computer:

1. Install Node.js 20+, Python 3.10+, PowerShell 7 and at least one Windows speech voice.
2. Run `node setup.mjs`. This installs the Python dependencies in the ignored `.runtime/packages` folder and writes a machine-specific, ignored `runtime.json`.
3. Run `npm start`, or use the launcher.

Setup accepts `--python <executable>` and `--powershell <executable>` if tools are not on PATH. Run under your normal Windows account; sandboxed accounts can enumerate voices yet be unable to synthesise them.

## Make an episode

1. Enter the episode and series names.
2. Upload PNG, JPG or WebP artwork. Transparent PNGs work best. Name the characters exactly as they appear in the script and assign voices.
3. Paste the script using `Character: dialogue`. Use `INT.`, `EXT.` or `SCENE 1` headings. Put action notes in brackets.
4. Paste one storyboard panel per line. Panels map to dialogue shots in order. Recognised `wide`, `medium`, `close-up` and `hold` instructions set initial camera/timing controls.
5. Create the storyboard. Edit the speaker, exact dialogue, framing, order and minimum duration of each shot.
6. Open Director Mode. Preview individual shots, choose framing and pace, add episode/shot backgrounds, optionally add MP3/WAV music, then create the finished episode.
7. Download the MP4, SRT captions and portable project backup. Backups embed artwork and audio; they can be opened with the top-right import control.

The renderer measures generated speech and extends shots when necessary. Episode settings include 720p/1080p, 24 fps, visible captions, speech, calm movement and speaking pace. Music is mixed at a fixed low level under speech.

## What this version actually animates

This is **deterministic cutout animation**: the uploaded character artwork is composited onto a backdrop with slight positional movement, framing changes, scene cuts, exact spoken dialogue, optional authored mouth shapes, titles and end card. Original illustrations remain intact. It does not generate new articulated poses, facial expressions, lip-accurate performances or interpret arbitrary action notes into movement. Director presets set colour and framing, and quick directions apply explicit shot controls. There is no hidden language-model service.

Optional mouth animation overlays a simple opening/closing mouth at an artist-set anchor; it is off by default. Near-white removal removes *all* near-white pixels, including those inside a character, and should be used selectively. A studio backdrop is supplied when no image background is uploaded.

Freeform storyboard actions are retained as production notes and shown in the editor. They are not presented as implemented model-generated actions. Full generative animation requires a separately connected video model/GPU service; this version does not claim one is connected. Do not present this as feature parity with OpenArt Director.

## Storage and architecture

- Dependency-free Node HTTP server, bound to `127.0.0.1` only, with same-origin POST checks.
- Vanilla JavaScript UI with a shared pure script planner and an editable shot model.
- PowerShell 7 / `System.Speech` generates per-line PCM WAV files with chosen installed voices.
- Pillow renders 24-fps frames. FFmpeg encodes H.264/AAC MP4 and mixes optional music.
- File-backed render jobs and JSON project records live in `data/`. Artwork is stored under `data/assets/`; generated films and subtitle files under `data/jobs/`.
- `runtime.json`, uploads, projects, generated media and dependencies are ignored by Git.
- Uploads are capped at 15 MB by the UI and requests at 80 MB by the server. Image formats are verified by signatures. Uploaded SVG/HTML is not served. Only recognised asset and finished-export paths are exposed.
- One render runs at a time. Progress is polled from durable status files. Jobs interrupted by a server restart are marked failed and may be rendered again. Keep the server running; there is no distributed queue or automatic unfinished-render resume.

This local app is intentionally separate from the repository's iLEARN learning pathways and publication workflow. It does not publish anything to learners or change the existing Wix integration. The root repository's `npm run director` command starts this app after setup.

## Verification

Run `npm test` in this directory. Planner tests cover scene boundaries, exact dialogue, speaker handling, storyboard mapping and timing. A complete two-character smoke render was verified locally with uploads, voice synthesis, animated video, MP4 playback and SRT contents. Renderer output was decoded with FFmpeg to verify H.264 video and AAC audio.

## Next production increment

Add a secure model adapter and a configured image-conditioned video workflow. Route a shot's approved keyframe, character references, audio and direction through that adapter, retain immutable takes, validate continuity and assemble accepted clips with the existing audio/export pipeline. Benchmark stylised characters before enabling an adapter as the default. Never silently drop conditioning images or substitute cutout output for an AI-motion request.

Dependency licences apply separately. FFmpeg is obtained through `imageio-ffmpeg`; inspect the shipped encoder build's licence before redistributing it. No model weights, provider credentials or user artwork are committed.
