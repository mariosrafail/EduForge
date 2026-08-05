# Content-gap review resolution

Generated review artifacts remain read-only evidence. The Studio computes an effective overlay from exact field decisions and generic review dispositions.

Field-gap reasons link to one exact editor target. A missing question prompt or response-field prompt resolves only when its field has detected content or an approved, non-stale manual override. Option, draggable and target gap reviews resolve only when all existing members required by that review are complete; a partial set remains open.

Draft and rejected overrides do not resolve reviews. A stale approved override produces a stale resolution instead of silently using the manual value. Removing an override reopens the exact gap when the detected value is still missing. Unrelated reviews are unchanged.

Generic `review_disposition` decisions remain independent. A field override does not create a generic disposition, and a generic disposition does not make missing Student content effective. Structural-cluster summaries stay read-only; Milestone 4B2A has no apply-to-all or bulk mutation.

The effective review overlay is deterministic and does not write `review-queue.json` or any generated activity-review artifact.
