# Book component hierarchy contract

`component-hierarchy.json` is a versioned, deterministic profile artifact. Book Project schema remains `1.0`.

The contract contains source book roots, source-relative locators, stable component keys, detected roles, conservative grouping kinds, parent-scoped Unit/group keys, part/page keys, counts, menu cross-checks, and diagnostics. It never contains absolute paths, source keys, decoded XML, asset bytes, answers, or Teacher solution data.

Stable identity does not use display text:

- source root key: digest of the raw source book-root name;
- component key: digest of source root plus raw component name;
- Unit/group key: digest of source root, raw component name, and source number;
- page key: digest of source root, raw component name, source number, and part.

This makes Students Book Unit 1, Workbook Unit 1, Grammar Book Unit 1, and Tests group 1 four different identities even though their visible source number is `1`. Identical raw component names under two source roots also remain distinct.

Detected roles remain generated evidence. An approved, non-stale `component_role` decision can supply the effective role and friendly display name. Draft, rejected, or stale decisions do not override current detected evidence. The raw component and decision state remain visible.

Grouping kinds are `numbered_units`, `numbered_groups`, `supplementary_collection`, `global_component`, and `unresolved`. Principal roles (`students_book`, `workbook`, `grammar_book`) project numbered source groups as pedagogical Units. Supplementary numeric directories use Group or Section terminology.
