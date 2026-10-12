# AI log analysis demo

A narrated 1080p walkthrough of the log analysis feature, recorded from the real built EZ PM2 GUI interface. Lucy — Fresh & Casual from ElevenLabs narrates the saved script, with the existing instrumental demo music mixed softly underneath.

[Watch the 63-second demo on YouTube](https://youtu.be/EPwORhBHupU), or open **Help** in the application's sidebar to play it within the demo library at `/help`.

The isolated fixture uses synthetic processes and logs. Provider availability and the diagnostic report are simulated and labelled on screen. The snapshot preview uses the package's actual redaction code. Recording never connects to PM2, reads a user's configuration, discovers installed agents, or invokes an AI provider. The sample report illustrates evidence and manual checks; it is not a claim that a real model diagnosed this incident.

## Deliverables

The MP4s, raw capture, screenshots, and mix reports are generated locally by the recording and rendering scripts. The published demo is available on YouTube; saved narration is included for rerendering.

- `ezpm2gui-log-analysis-demo.mp4`: finished 1920×1080, 30 fps walkthrough with narration and music.
- `ezpm2gui-log-analysis-demo-silent.mp4`: the same UI walkthrough without audio.
- `narration.txt`, `audio/lucy-voiceover.mp3`, and `provenance.json`: spoken script, selected saved take, and generation details.
- `stage.html` and `timeline.json`: recording presentation and measured chapter timings.
- `raw/walkthrough.webm`: the original browser recording.
- `screenshots/`, `frames/`, `poster.png`, and `contact-sheet.jpg`: images for visual verification.
- `render-report.json`: duration, video/audio stream details, loudness measurements, and fixture status.

The demo follows a failed `checkout-api` service through error logs, a redacted numbered snapshot, installed CLI choices, a downloaded Ollama model, explicit cloud consent, and an evidence-led diagnostic report. Users keep control of the suggested checks and changes.

## Reproduce

Build the current server and client first. Use Node 24 with this checkout's installed native dependencies.

```sh
npm run build
node scripts/demo/log-analysis-fixture.cjs
```

The fixture listens only on `127.0.0.1:3117`. Leave that terminal running and use another terminal for recording. Playwright and Chromium must be installed. `PLAYWRIGHT_MODULE` can point to an existing Playwright package, and `CHROMIUM_PATH` can point to its Chromium executable when they are outside the normal installation.

Recording also uses ffprobe to measure the actual video lead before the timed walkthrough begins.

```sh
node scripts/demo/record-log-analysis.cjs --inspect-only
node scripts/demo/record-log-analysis.cjs
node scripts/demo/render-log-analysis.cjs
```

Inspection checks the UI interactions and saves screenshots without producing a full recording. Recording writes the 63-second timeline and raw video. Rendering requires FFmpeg and ffprobe; optional `FFMPEG_PATH` and `FFPROBE_PATH` select their executables. It uses the saved Lucy take and `demo/audio/elevenlabs-music.mp3`, so rerendering does not generate or charge for new audio. `--silent-only` renders and verifies the footage before narration is available.

Rendering trims the measured initial browser lead, encodes H.264 at 1080p and 30 fps, and preserves that video stream when adding audio. Speech is normalized to -16 LUFS and delayed one second; the music is normalized to -30 LUFS, fades at both ends, and ducks during speech. The oversampled final limiter uses a -1 dB ceiling, and the encoded audio's true peak is checked. The voice is never stretched to fit the recording. If a new narration take is too long, extend the recording and update its timeline instead.

Stop the fixture with Ctrl+C in its terminal when finished. No PM2 daemon or application workloads are created by this workflow.
