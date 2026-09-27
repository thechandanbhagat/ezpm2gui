# Documentation website

The active website is `index.html`, styled by `styles-new.css`. The illustrated user guide is available as both `userguides/index.html` and `userguides/user-guide.md`.

Preview from the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory ezpm2gui
```

Open `http://127.0.0.1:4173/`. This static website does not require the PM2 dashboard server to be running.

The demo uses [this YouTube video](https://youtu.be/u1ckawU-sg4), embedded through YouTube's privacy-enhanced player on the landing page and user guide. Each player also has a direct YouTube link.

When changing a workflow, update both guide formats, the landing-page summary if relevant, and the matching screenshot. Keep screenshot references relative so they work in both GitHub and static hosting. Files such as `index-old.html`, `styles.css`, and the older script variants are legacy alternatives; the active landing page does not load them.

## Screenshot sources

Screenshots `01-processes.png`, `03-remote-servers.png` through `18-cron-job-form.png` were captured from the locally built v1.11.4 app on 27 September 2026 at 1280 × 720 (the deployment capture is 1276 × 718). They use three isolated sample services: `api-gateway`, `background-worker`, and `event-stream`.

- The metrics history image shows the empty state before connecting a remote server. No remote history was fabricated.
- Deployment, remote connection, and cron creation forms were captured without submitting them.
- Process details use the Metrics tab so inherited environment values are not included.
- `00-lock-screen.png`, `02-monitoring.png`, and the other unreferenced historical captures are retained as legacy assets; the active guide uses the current screenshots listed above.

The revised guide is checked against the local v1.11.4 source and UI. It does not imply that this checkout is the latest npm release.
