---
title: Why EZ PM2 GUI uses TSLN for AI log analysis
owner: EZ PM2 GUI maintainers
last_reviewed: 2026-10-13
review_by: 2027-01-13
---

# Why EZ PM2 GUI uses TSLN for AI log analysis

EZ PM2 GUI uses a TSLN-based log profile to make AI log snapshots smaller while keeping the evidence needed to diagnose a problem. TSLN means **Time-Series Lean Notation**. The approach draws on the schema-first representation and repeat markers described in [the TSLN paper by Chandan Bhagat and Manas Mudbari](https://doi.org/10.31224/6375), published on engrXiv.

This explanation is for users and contributors who want to understand the choice, its safeguards, and its limits. Review it whenever the encoder, prompt format, or snapshot limits change.

## Why repeated logs benefit

A process can produce hundreds of identical messages, often with the same timestamp. Numbered JSON repeats field names such as `line`, `stream`, and `message` for every row. It also repeats the entire timestamp and message. Sending those repetitions gives the model more text to read without adding different evidence.

The log profile declares its columns once and uses an unquoted `=` when a field matches the previous row in the same column. Every captured row still has its own evidence line number. Repeated messages remain countable rather than disappearing into a summary.

For example, these two messages have the same timestamp, stream, and text:

```text
2026-10-13T12:04:50: No user context in headers
2026-10-13T12:04:50: No user context in headers
```

Their representation inside a larger compressed snapshot is:

```text
# TSLN-based log profile/1
# Schema: d:line s:stream i:timestamp i:separator i:message
---
1|"stdout"|"2026-10-13T12:04:50"|": "|"No user context in headers"
2|=|=|=|=
```

The model receives decoding instructions with the snapshot. Line 2 reconstructs the same full message as line 1. A two-row snapshot by itself usually stays JSON because the profile header and instructions cost more space than they save.

## How the application uses it

The server first collects and redacts the log snapshot. It then compares numbered JSON with the complete compressed prompt representation, including its header, instructions, and metadata labels. It selects the profile only when that representation uses fewer UTF-8 bytes; ties and larger representations stay JSON.

Compression happens when building the provider prompt, so all supported analysis providers use the same decision. The saved SQLite snapshot and the preview retain their redacted rows. Follow-up questions can use those saved rows without depending on a compressed storage format.

## Preserving diagnostic evidence

The profile preserves:

- Every prepared row, its stream, and its evidence line number.
- Exact timestamp text and the separator before the message.
- Untimed stack frames, whitespace, and message text.
- The original row order, including stdout followed by stderr.

Strings use JSON quoting and escaping. A literal `"="` is message text; an unquoted `=` is a repeat marker. The unquoted `∅` marks a missing timestamp, while a quoted `"∅"` remains literal text. Pipes, quotes, backslashes, and newlines inside quoted strings remain reversible.

Before dispatching compressed rows, the encoder decodes them and checks that they exactly match the original numbered evidence. A mismatch stops analysis rather than sending altered evidence to the provider. Redaction runs before compression, and all snapshot content remains untrusted data in the diagnostic prompt.

## Why this is a local TSLN profile

Application logs are irregular text. Some lines have timestamps without time zones; stack frames often have none. The current profile therefore keeps timestamps as text instead of converting them to numeric deltas, rounding them, or inferring a time zone.

It uses the type codes and repeat-marker idea from the [TSLN 1.0 reference](https://github.com/turboline-ai/tsln/blob/main/Reference.md), with explicit JSON string quoting for arbitrary log text. Its header identifies a local log profile. Compatibility with other TSLN encoders or decoders is not assumed.

## Measured savings and limits

The repository's synthetic test contains 200 identical timestamped stdout messages:

| Representation | UTF-8 bytes |
| --- | ---: |
| Numbered JSON rows | 24,493 |
| Local profile, including decoding instructions | 2,955 |
| Reduction | 87.9% |

These are measurements from that fixture, not guaranteed savings for production logs. Unique messages may compress less or stay JSON. Provider tokenizers differ, so byte reduction does not establish an equivalent token, price, latency, or diagnostic-accuracy improvement. Full prompt savings also depend on metadata, the question, and conversation history.

The capture window remains bounded: a 64 KiB tail of each log file supplies up to 200 recent nonblank lines per stream, then at most 400 prepared rows fit within a 60 KiB serialized snapshot budget. Compression cannot recover rows already omitted by those limits. Line numbers refer to the prepared excerpt, not positions in the full log file. Separate stdout and stderr tails do not establish cross-stream chronology.

## References and implementation

- [TSLN paper on engrXiv — DOI 10.31224/6375](https://doi.org/10.31224/6375).
- [Author repository's whitepaper copy](https://github.com/turboline-ai/tsln/blob/main/TSLN_Whitepaper.pdf).
- [TSLN 1.0 reference](https://github.com/turboline-ai/tsln/blob/main/Reference.md).
- [Log profile encoder and decoder](../../src/server/services/LogAnalysisTsln.ts).
- [Provider prompt selection](../../src/server/services/LogAnalysisService.ts).
- [Round-trip and size tests](../../tests/unit/log-analysis-tsln.test.ts), and [provider integration tests](../../tests/unit/log-analysis-tsln-prompt.test.ts).
