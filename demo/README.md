# EZ PM2 GUI demo

A 1080p product walkthrough captured from the locally built application. It uses three isolated sample PM2 workloads; the displayed service names and log messages are demo data, while the process status and resource metrics come from the running application.

## Deliverables

[Watch the demo on YouTube](https://youtu.be/u1ckawU-sg4).

- `ezpm2gui-demo.mp4`: finished 1080p walkthrough with ElevenLabs narration and soft instrumental music.
- `ezpm2gui-demo-silent.mp4`: captioned walkthrough without audio.
- `narration.txt`: English script used for the ElevenLabs voiceover.
- `audio/`: generated narration sections and music, aligned narration, final mix, timings, and generation provenance.
- `stage.html`: title cards, chapter headings, and captions used during recording.
- `timeline.json`: chapter timings and browser error report.
- `screenshots/`: captured frames for visual verification.

The voiceover uses ElevenLabs' Sarah voice with `eleven_multilingual_v2`. The instrumental background was generated with `eleven_music_v2`: warm electric piano, airy pads, and restrained percussion. Narration sections align with the recorded chapters; the music is mixed softly and ducks further during speech. The original video stream is preserved during the final mux.

[Open the ElevenLabs source flow](https://elevenlabs.io/app/flows/3wzCXmWMLGbhXc20aHGH).

## Build

Use Node 24. The installed `better-sqlite3@12.9.0` declares support up to Node 25; the machine's default Node 26 is outside that supported range.

```sh
npm ci
npm test
npm run build
```

The dependency install already invokes the build via `prepare`.

## Reproduce the video

Use an isolated PM2 home for **both** the server and seed script so the recording never manages your normal PM2 processes:

```sh
PM2_HOME=/private/tmp/ezpm2gui-demo-pm2 HOST=127.0.0.1 PORT=3101 npm start
# In another terminal:
PM2_HOME=/private/tmp/ezpm2gui-demo-pm2 node scripts/demo/seed.cjs
```

Run with Playwright and Chromium available. `PLAYWRIGHT_MODULE` may point to an installed Playwright package; `CHROMIUM_PATH` may point to the Chromium executable. These are optional when the standard Playwright install is available.

```sh
node scripts/demo/record.cjs
node scripts/demo/render.cjs
```

The recording restarts only `api-gateway`, fills a deployment form without submitting it, and changes the temporary recording browser's theme. Rendering and mixing require FFmpeg and ffprobe. To reproduce the finished mix using the saved ElevenLabs takes and chapter timings:

```sh
node scripts/demo/mix-audio.cjs
```

This writes `ezpm2gui-demo.mp4` without generating or charging for new audio. It checks every narration section for chapter overlap, normalizes speech to -16 LUFS and music to -29 LUFS before ducking, and applies a final peak limiter. If you record new footage, update `audio/timing.json` to match it before mixing.

## Stop the demo

Stop the dashboard using Ctrl+C in its terminal, then stop the isolated PM2 daemon:

```sh
PM2_HOME=/private/tmp/ezpm2gui-demo-pm2 ./node_modules/.bin/pm2 kill
```

The sample services also exit after one hour and do not auto-restart.
