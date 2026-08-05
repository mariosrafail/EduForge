# Publisher Review Studio UI

The Studio is a desktop-first publisher production tool with restrained Hamilton House identification, neutral surfaces, compact tables and explicit review states. It uses no recovered publisher book artwork as application decoration.

## Navigation

The dashboard route is `#/`. Project routes are `#/projects/:projectId/<view>`. Project and route IDs never contain filesystem paths. Direct reload and browser back/forward are supported. Unknown projects render a safe unavailable state; an invalid tab resolves to Overview.

Project tabs support keyboard focus plus Left/Right/Home/End navigation. Landmarks, breadcrumbs, logical headings, labeled native inputs/selects, live loading states, alerts, visible focus and meaningful empty states are present. Hotspot rectangles have a parallel keyboard-focusable candidate list.

## Page inspection

The page inspector fetches previews with the session header and displays them through temporary blob URLs. Only artifact-provided normalized geometry is overlaid. Users may show/hide overlays and adjust viewing zoom, but cannot drag, resize or edit candidates. Missing previews stay missing.

The preview and details columns align at their starts. The preview frame has an independent viewport-bounded height and keeps the page image near the inspector toolbar. Large accessible hotspot lists, including 48-entry pages, scroll in their own bounded region without hiding or truncating candidates. Native ordered-list semantics and keyboard-focusable rows are retained, and focusing an off-screen row scrolls it into the list viewport.

## Large collections

Activities and review items are filtered/paginated on the server. The client renders at most one response page plus one selected detail. Activity text is the Student-safe projection, with independent drag/target label lists that intentionally preserve no mapping. Review groups and structural clusters have no apply, approve, dismiss or edit controls.

## Responsive diagnostics

At tablet and mobile widths the page preview and hotspot details stack in one column, the preview is non-sticky, and the hotspot list keeps a smaller bounded scroll area. Normalized overlays remain within the rendered image basis at every tested viewport.

The layouts target 1280×720, 1440×900, 1920×1080 and 2560×1440, then collapse at tablet and mobile widths. At 768 px and approximately 390 px, panels stack, tabs remain scrollable, filters remain native and warnings remain visible. Tests assert no page-level horizontal overflow. Reduced-motion preferences disable nonessential animation.
