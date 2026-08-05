# Manual content override contract

Manual content decisions use the existing durable decision envelope. The browser sends only kind, target ID, proposed string, approval state, bounded editor note, expected revision and client mutation ID. The server resolves target type, owning activity, dependencies, evidence hashes and related reviews. Client-supplied dependencies and arbitrary target IDs are rejected.

| Decision kind | Exact target | Maximum characters | Maximum UTF-8 bytes |
| --- | --- | ---: | ---: |
| `activity_display_title` | activity | 300 | 1,200 |
| `activity_instruction_text` | activity | 4,000 | 16,000 |
| `question_prompt_text` | question | 4,000 | 16,000 |
| `option_display_text` | option | 1,000 | 4,000 |
| `draggable_display_label` | draggable | 1,000 | 4,000 |
| `target_display_label` | target | 1,000 | 4,000 |
| `response_field_prompt_text` | response field | 4,000 | 16,000 |

Each value is one normalized plain-text string. CRLF and CR become LF, outer whitespace is trimmed, and meaningful internal spacing, Unicode and punctuation are preserved. Approved empty values are invalid; an empty draft may be retained while editing.

Validation rejects unknown envelope fields, nested values, NUL and other forbidden control characters, HTML or active markup, script-bearing protocols, absolute local paths and answer-bearing fields. Ordinary educational wording is not rejected merely because it contains words such as “answer”.

Decision identity remains the deterministic digest of kind, target type and stable target ID. A successful write increments the project revision once. An identical idempotent retry returns the existing result, while a changed payload under the same client mutation ID fails. Removal uses the same expected-revision, lock, journal and history boundary.

Existing Milestone 4B1 decision records remain readable and keep their existing identities and dependencies.
