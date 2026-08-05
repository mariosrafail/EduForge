# Milestone 4C1: component and Unit hierarchy

Milestone 4C1 normalizes publisher evidence as Book Project → source book root → source component → Unit or structural group → part/page → hotspot/activity. It is an authoring and navigation projection; it does not publish content, create runtime packages, or add manual structure creation.

## Real-source findings

Read-only audits of Ultimate English B2, Ultimate English B1 Plus, and the held-out Ultimate English B1 all selected `ultimate-air-v2` with confidence 1. Each title contained one source book root and separate principal components:

| Title | Students Book (`unit`) | Workbook (`work`) | Grammar Book (`grammar`) |
| --- | --- | --- | --- |
| Ultimate B2 | Units 1–10; 110 page spreads; 694 objects | Units 1–10; 65 page spreads; 259 objects | Units 1–10; 65 page spreads; 161 objects |
| Ultimate B1 Plus | Units 1–10; 110 page spreads; 670 objects | Units 1–10; 65 page spreads; 249 objects | Units 1–10; 57 page spreads; 173 objects |
| Ultimate B1 | Units 1–10; 105 page spreads; 684 objects | Units 1–10; 55 page spreads; 276 objects | Units 1–10; 53 page spreads; 242 objects |

The counts are derived from source inventory and IWB structure. Ten is not hardcoded. Tests, practice, review, reference, games, videos, banks, and worksheets remain separate components. In all three Ultimate titles the `test` component has numeric groups 1–17 and 28 page spreads; those numbers are structural groups, not Students Book Units. The `section` component has groups 1–46 but no page spreads.

English Journey 6 remains a `journey-air-v1` negative control. No Ultimate hierarchy is invented for it.

## Corrected diagnosis

The old Pages API built one numeric selector from every page spread, irrespective of component. The Students Book, Workbook, Grammar Book, and supplementary test page groups were unioned. Because tests reached group 17, the UI could misleadingly suggest a 17-Unit principal book. The new API returns no Unit options until a component is selected, then returns only parent-scoped options for that component.

## Boundaries and finding

The hierarchy audit uses source inventory, page, menu, hotspot, and IWB metadata without executing publisher binaries. A pre-existing duplicate response-field ID validation failure prevents a new full Ultimate B2 activity scan from completing; this is unrelated to hierarchy identity and is not relaxed or hidden by 4C1. Existing activity-capable projects and read-only structural audits remain sufficient to validate hierarchy projection.

The next milestone is Manual Activity Authoring Core. It is intentionally not implemented here.
