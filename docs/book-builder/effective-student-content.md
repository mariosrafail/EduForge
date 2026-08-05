# Effective Student-safe content

Effective activity text is a pure projection; it does not rewrite the detected candidate.

For every supported field the Studio exposes sanitized detected, manual and effective values together with origin, decision state, stale state and review state:

| Decision state | Effective value | Origin |
| --- | --- | --- |
| no decision | detected value, or missing | `detected` or `missing` |
| approved and non-stale | manual value | `manual_override` |
| draft | detected value, or missing | `detected` or `missing` |
| rejected | detected value, or missing | `detected` or `missing` |
| stale approved | detected value, or missing | `detected` or `missing` |
| removed | detected value, or missing | `detected` or `missing` |

The edit projection may display a draft or stale manual value separately so an editor can continue or explicitly reapprove it. The normal read-only effective projection never substitutes that value until it is approved and applicable.

Completeness is calculated over existing nodes only. Activity title and instructions are individual fields. A question prompt and response-field prompt are individually complete. Option, draggable and target groups report partial until every required existing member has detected or approved non-stale text. A stale member reports stale completeness and prevents the group from being treated as resolved.

Removing an override immediately returns that field to its detected or missing state without changing the generated activity candidate, evidence or review queue.
