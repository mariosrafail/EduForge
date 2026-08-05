# Hierarchy navigation

Dashboard and Overview show source-derived principal component cards for Students Book, Workbook, and Grammar Book, including Unit, page, activity, and unresolved-review counts. Components keeps both the friendly effective name and raw source name visible; supplementary resources remain separate.

Pages & Hotspots, Activities, and Review Queue use the same dependent navigator:

1. Select a logical component or book section.
2. The Unit/group selector becomes available.
3. Its options are derived only from the selected component.
4. Select a Unit/group to inspect exact owned evidence.

With no selected component, the Unit/group selector is disabled and no global numeric union is returned. Changing component clears an incompatible Unit and selected page/activity/review group. Component, Unit/group, and selected-item keys are stored in the hash query, so reload and browser back/forward preserve the hierarchy context.

Principal components display `Unit N`. Supplementary numeric components display `Group N` or another conservative structural label. Activities show a friendly hierarchy breadcrumb while retaining the raw source locator. Reviews can group by component or by parent-scoped Unit/group, so Workbook Unit 3 cannot be confused with Students Book Unit 3. Structural cluster browsing remains read-only and has no bulk action.

The layout keeps table overflow local and stacks hierarchy controls at tablet/mobile breakpoints. No mutation controls appear in read-only mode.
