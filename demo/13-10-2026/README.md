# EZ PM2 GUI v1.13.0 demo assets

Two English, captioned 1920 × 1080 videos prepared on 13 October 2026. These repository files are ready for upload; no YouTube URL has been assigned to either video.

| Video | Duration | Captions | Poster |
| --- | --- | --- | --- |
| [AI log analysis](videos/ezpm2gui-ai-log-analysis.mp4) | 76.83 seconds | [SRT](captions/ai-log-analysis.srt) | [PNG](posters/ai-log-analysis-poster.png) |
| [How and why TSLN is used](videos/ezpm2gui-tsln-explained.mp4) | 80.03 seconds | [SRT](captions/tsln-explained.srt) | [PNG](posters/tsln-explained-poster.png) |

The MP4s contain H.264 video at 30 fps, mixed AAC audio, and captions burned into the image. Separate SRT files can also provide selectable YouTube captions.

## Audio and scripts

Narration and instrumental background tracks were generated separately through ElevenLabs, then mixed with the music lowered and ducked beneath speech:

- AI walkthrough: [narration](audio/narration-ai.mp3) and [background music](audio/background-ai.mp3).
- TSLN explanation: [narration](audio/narration-tsln.mp3) and [background music](audio/background-tsln.mp3).
- [Readable scripts and scene descriptions](storyboard/scripts.md) and [structured storyboard](storyboard/scripts.json).

The scripts contain planned timing; the table above gives the measured final durations. Voice generation used **Jerry B. — Instructional & Tutorial**, `eleven_multilingual_v2`; music used `eleven_music_v2`. Captions were aligned using ElevenLabs Scribe, with acronym display spellings normalized.

## Demonstration data and claims

The AI walkthrough shows the application's interface using **fictional sample logs and simulated analysis**, as disclosed in its narration and on-screen label. It demonstrates the connection button, local/cloud provider settings, redacted snapshots, separate Markdown chats, follow-up suggestions, and saved conversation history. It does not present a real provider's diagnosis of a production incident.

The TSLN video explains EZ PM2 GUI's reversible local log profile. Repeated adjacent column values use `=`, unparsed timestamps use `∅`, and prepared evidence rows retain their exact timestamp strings and messages. The application redacts first, verifies an exact round trip, and compares the complete prompt in UTF-8 bytes before choosing TSLN or JSON. It does not increase the capture limit or alter saved snapshot rows.

The **87.9% byte reduction** shown is one synthetic 200-row repeated-log fixture, from 24,493 to 2,955 UTF-8 bytes. It is not a typical savings estimate or a guarantee of model token savings. Read the [implementation rationale](../../ezpm2gui/userguides/tsln-log-analysis.md) for the profile's distinctions and limits.

The [TSLN paper on engrXiv](https://doi.org/10.31224/6375) is by **Chandan Bhagat and Manas Mudbari**. The documentation site is [ezpm2gui.chandanbhagat.com.np](https://ezpm2gui.chandanbhagat.com.np/).

## Generation manifest

[generation-manifest.json](generation-manifest.json) records the date, ElevenLabs voice/model and generation identifiers, independently generated music, caption alignment, sample-data disclosure, and paper/documentation sources. Its `audioFiles` entries are filenames located in this directory's `audio/` folder. It contains no credentials or signed media download URLs.

EZ PM2 GUI maintainers own these notes. Review the videos and descriptions when analysis workflows or TSLN behavior changes, and by 13 January 2027. After upload, add the real YouTube URLs to the README and shared application video catalog; retain the earlier published 63-second demo as a separate video.
