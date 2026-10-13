# EZ PM2 GUI video scripts

Language: English. Target: two captioned 1080p videos of roughly 60–90 seconds, with separate narration and background tracks.

Pronunciation: say **E Z P M two G U I** and **T S L N**. Captions use the normal display spellings. Keep **Sample logs · simulated analysis** visible throughout the AI app walkthrough.

## AI log analysis in EZ PM2 GUI

Output: `ezpm2gui-ai-log-analysis.mp4`. Narration: 178 space-delimited words, including spelled-out acronym letters. Target duration: 85 seconds.

An English walkthrough of connecting a remote server, reviewing a redacted log snapshot, choosing a provider, investigating cited evidence, and continuing a saved conversation. Sample logs and simulated analysis are clearly labeled.

### 1. From noisy logs to a focused investigation

**Narration:** A wall of logs can hide useful clues. E Z P M two G U I turns a snapshot into a focused conversation. This walkthrough uses sample logs and simulated analysis.

**On screen:** AI log analysis / Evidence → investigation → follow-up / Sample logs · simulated analysis

**Visual:** Open on a dark cyan title card, then reveal the actual Log Streaming page. Keep a persistent sample-data disclosure during the app walkthrough.

### 2. Connect and open the process logs

**Narration:** Connect from the process sidebar. The list updates when the connection is ready. Open the service logs, then select Analyze logs to reveal the persistent right sidebar.

**On screen:** 1. Connect the server / 2. Open the service logs / 3. Analyze logs

**Visual:** Show disconnected office-server and its Connect button, connect it, highlight the updated process list, select booking-manager, and click Analyze logs. Frame the actual UI without browser chrome.

### 3. Choose the provider and model

**Narration:** Expand AI Settings and choose an available provider: Ollama local or cloud models, or an installed cloud-connected command-line provider. For cloud analysis, review the sharing notice and explicitly allow the snapshot and conversation to be sent.

**On screen:** AI Settings / Local or cloud model / Review cloud sharing

**Visual:** Show actual AI Settings expanded, a local Ollama selection, then a cloud selection and its sharing checkbox. Use short labeled zooms rather than a crowded full-page screenshot.

### 4. Review the snapshot and ask a question

**Narration:** Inspect the redacted snapshot before sending it. The preview shows captured lines and limits. Ask a concrete question: why is this service restarting? Then start the analysis.

**On screen:** Review the redacted snapshot / Why is this service restarting?

**Visual:** Expand Log snapshot, show numbered stdout/stderr sample lines and redaction metadata. Close it, type the example investigation in the composer, and show analysis progress.

### 5. Read the evidence and suggested checks

**Narration:** The Markdown response appears separately from your question. Follow cited lines, distinguish observations from hypotheses, and review suggested checks. Verify the evidence before changing the application.

**On screen:** Readable Markdown / Cited evidence / Observations · hypotheses · checks

**Visual:** Show the separate question and assistant cards, rendered headings and evidence bullets. Highlight a line citation and the distinction between observed facts and suspected causes.

### 6. Continue the investigation later

**Narration:** Choose a suggested follow-up to fill the composer, then send it when ready. Requests and responses are saved in SQLite. Reopen your conversation from history and continue with the same context.

**On screen:** Suggested follow-up questions / Saved requests and responses / Reopen and continue

**Visual:** Click a follow-up suggestion and show it filling the composer without automatic submission. Briefly show the next chat turn, close and reopen the analysis sidebar, then select the saved conversation in Conversation history. End on product name and documentation domain.

## Why EZ PM2 GUI uses TSLN

Output: `ezpm2gui-tsln-explained.mp4`. Narration: 184 space-delimited words, including spelled-out acronym letters. Target duration: 85 seconds.

An English explanation of the local TSLN log profile: adjacent repeated values, evidence preservation, redaction and round-trip verification, conditional JSON fallback, measured fixture bytes, and unchanged capture limits.

### 1. Why repetitive logs need a leaner representation

**Narration:** Logs can repeat timestamps, messages, and JSON field names hundreds of times. E Z P M two G U I uses a local T S L N based profile to reduce that repetition in AI prompts.

**On screen:** Why TSLN? / Repeated fields add text / A local log profile

**Visual:** Animate three repeated source log lines next to numbered JSON rows. Highlight duplicate stream, timestamp, separator, and message fields. Display the expanded name Time-Series Lean Notation.

### 2. Declare the schema once

**Narration:** T S L N means Time Series Lean Notation. Our profile declares the columns once, then writes one row per evidence line. An equals sign repeats the previous value in the same column.

**On screen:** Schema once / One row per evidence line / = repeats the previous column value

**Visual:** Transform the three-line source example into the exact profile schema and encoded example provided in visualData. Animate the second-row equals markers and the third-row changed message; retain line numbers 1, 2, and 3.

### 3. Preserve the diagnostic evidence

**Narration:** Every row, stream, and line number remains. Timestamps stay exact text, and the empty symbol marks an unparsed timestamp. Nothing is sorted, grouped, or dropped by compression, so repeated events remain countable.

**On screen:** Exact timestamp text / ∅ = no parsed timestamp / Order and evidence preserved

**Visual:** Show an exact timestamp close-up and a separate untimed stack-frame row using unquoted ∅. Return to three source rows and three decoded rows with matching line badges. Label separate streams without claiming cross-stream chronology.

### 4. Verify and compare before sending

**Narration:** The backend redacts first. It encodes and decodes the candidate, verifies an exact match, then compares complete prompt representations. Compression is selected only for fewer UTF eight bytes; otherwise, JSON stays.

**On screen:** Redact → encode → decode / Exact round-trip verification / Smaller representation, or JSON

**Visual:** Animate a pipeline from redacted rows to encoder to decoder to an exact-match check, followed by a size gate choosing TSLN or JSON. A mismatch branch stops analysis. Clearly separate this prompt transformation from saved storage.

### 5. Understand the savings and limits

**Narration:** Savings depend on the logs. Fewer bytes do not guarantee equivalent token savings. The captured tail stays bounded. Saved snapshots and the preview keep their original redacted rows.

**On screen:** Synthetic fixture · 200 repeated messages / 24,493 → 2,955 UTF-8 bytes / 87.9% fixture reduction / Capture limits stay unchanged

**Visual:** Animate the documented synthetic fixture byte comparison, explicitly labeled synthetic and not guaranteed. Show a fixed capture-window bracket that never expands, then separate Raw redacted preview and SQLite snapshot cards unchanged by prompt compression.

### 6. Read the explanation and paper

**Narration:** Open Help and demos for the implementation guide and the T S L N paper, published on engrXiv by Chandan Bhagat and Manas Mudbari.

**On screen:** Help and demos → TSLN / Implementation guide + paper / Chandan Bhagat · Manas Mudbari / doi.org/10.31224/6375

**Visual:** Show the actual Help and demos TSLN section, highlight the rendered guide and paper links, then end on a clean paper citation card with the documentation domain.

## Exact TSLN visual example

The three source rows and three encoded rows remain one-to-one. A changed message stays explicit.

```text
2026-10-13T12:04:50: No user context in headers
2026-10-13T12:04:50: No user context in headers
2026-10-13T12:04:50: Worker ready
```

```text
# TSLN-based log profile/1
# Schema: d:line s:stream i:timestamp i:separator i:message
---
1|"stdout"|"2026-10-13T12:04:50"|": "|"No user context in headers"
2|=|=|=|=
3|=|=|=|"Worker ready"
```

Untimed illustration, separate from that three-row example:

```text
4|=|∅|""|"    at worker.run (worker.ts:42:7)"
```

The unquoted `∅` marks no parsed timestamp; its separator is the empty quoted string `""`. The message remains exact text. Literal `"="` or `"∅"` strings remain message values. This three-row example illustrates the format; a tiny snapshot may stay JSON because the header and decoding instructions cost more than they save.

The benchmark card must say **synthetic fixture, 200 identical timestamped stdout messages**: 24,493 numbered JSON bytes versus 2,955 profile bytes including decoding instructions, a fixture reduction of 87.9%. Do not convert this into a token, cost, speed, or accuracy claim. Capture remains bounded to a 64 KiB tail / 200 recent nonblank lines per stream and up to 400 prepared rows within the 60 KiB serialized snapshot budget.

## References

- [Implementation guide](https://ezpm2gui.chandanbhagat.com.np/userguides/tsln-log-analysis.html).
- [TSLN paper on engrXiv, by Chandan Bhagat and Manas Mudbari](https://doi.org/10.31224/6375).
- Source of verified behavior: `src/client/src/components/LogAnalysisSidebar.tsx`, `LogAnalysisTranscript.tsx`, `LogAnalysisFollowupSuggestions.tsx`, and `ezpm2gui/userguides/tsln-log-analysis.md`.
