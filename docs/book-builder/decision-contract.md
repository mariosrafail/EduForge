# Durable decision contract

Durable decisions live in the Book Project `approvedDecisions` array. The containing Book Project stays at schema `1.0`; new decisions use internal decision contract `1.0`.

Current fields are:

- `schemaVersion`, `id`, `kind`, `targetType`, `targetId`;
- strictly validated `value` and `approvalState` (`draft`, `approved` or `rejected`);
- server-derived `dependencyFactIds`, `dependencyEvidenceHashes` and `resolvesReviewIds`;
- `stale`, bounded `staleReasons`, bounded `editorNote`, `createdAt` and `updatedAt`.

Identity is the deterministic digest of decision kind, target type and stable target ID. Updating a decision preserves `createdAt`. Unknown fields, unsafe identifiers, unknown kinds/targets/states, arbitrary values, absolute paths and answer-bearing keys or tokens fail validation. Existing Milestone 1–3 records without current target fields remain readable and retain their established normalized shape.

## Kind and value rules

| Kind | Target | Value boundary |
| --- | --- | --- |
| `component_role` | component candidate | canonical component-role allowlist |
| `printed_page_number` | page candidate | page integer, or validated inclusive `start`/`end` spread |
| `canonical_page_variant` | page candidate | one of that page's actual qualities |
| `activity_type` | Student-safe activity candidate | a normalized type present in current candidates |
| `activity_disposition` | Student-safe activity candidate | current activity disposition allowlist |
| `activity_audience_policy` | Student-safe activity candidate | `student_and_teacher`, `teacher_only`, `disabled` |
| `hotspot_candidate_disposition` | hotspot candidate | `accepted_candidate`, `rejected_candidate`, `deferred` |
| `review_disposition` | individual generated review | `deferred`, `not_applicable`, `accepted_risk` |

Audience decisions never copy Teacher/internal values into Student-safe artifacts. No decision may contain correct/accepted answers, model answers, answer records, drag/drop mappings, decoded XML or an IWB key.

## Effective review state

Only an approved, applicable and non-stale decision can resolve related reviews. Draft and rejected decisions do not resolve them. A stale decision produces `stale_resolution`; removing it returns the generated item to `open`. Generic review disposition affects only its target review. Summary states are open, resolved, deferred, not applicable, accepted risk and stale resolution, including a separate blocking-open count.
