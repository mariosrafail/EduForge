# Native composition and protected Image answers

Multi-Part is an owned inline activity (`multi-part.v1`). Its sections never create independent catalog entries, saved pairs, release identities or submissions. The root owns the public and Teacher revisions, placement, activity order, managed assets and shared media.

## Supported composition

| Child | Flow panel | Shared canvas | Existing behavior retained |
| --- | --- | --- | --- |
| Drag & Drop | One standard or text panel | Standard overlay with a reserved bank region | Text/image items, reusable choices, multiple target capacity, mappings |
| Multiple Choice | Text or one image panel | Image hotspots in parent coordinates | Single and multiple selection, bulk authoring, private correct options |
| Complete the Sentences | One image panel | Unsupported | Phrase answers, accepted answers, font and hotspot controls |
| Open Response | One visual panel | Unsupported | Semantic prompts, model answers, prompt/response membership, image layers |
| Mark the Words | Text or one image panel | Unsupported | Stable word identities, bulk authoring, click and mark geometry |
| Image | Image composition | Unsupported | Image layers, accessibility, optional private Sample answer |

Flow panels stack the selected child surfaces and scroll. A shared canvas renders its managed background once, with Drag & Drop and Multiple Choice overlays mounted simultaneously. Inactive overlay regions do not intercept another section's input. Active regions belonging to different sections, and all reserved answer banks, must not overlap. Child editors use their existing controls with an in-memory parent binding; only the parent saves. Each child owns one visual panel. Move additional visual content into another section or parent panel. Listening, Oldschool Listening and nested Multi-Part sections are unsupported.

Limits: 12 parent panels, 24 sections, 128 public managed asset references, 8,192-pixel parent dimensions, 262,144 UTF-8 bytes for each public/Teacher document, and 100,000 UTF-8 bytes for the complete response. Existing child limits remain enforced. Oversized documents are rejected before cloning or child normalization. These bounded compositions are intended for authored exercises, not arbitrary embedded activities.

The root provides Readable Text, Supplemental MP3, Video and its worksheet. Section editors do not save or manage independent supporting-media documents. Deleting a panel deletes its owned sections and matching private solutions. Duplication remaps child identities and private bindings. Removing an unused reference does not delete storage objects or historical release pins.

## Submission and review

The client submits one `native-multi-response.v1` envelope containing `{id, kind, response}` per answerable section. Each response uses the child's established contract. Image sections have no learner response. Unknown, duplicate, mismatched and Teacher-material-bearing entries are rejected. Section identity scopes otherwise identical question, target and word IDs.

The server normalizes and evaluates each child against the exact assigned release. Fully automatic activities sum correct and total scoring units before calculating the percentage. Mixed activities retain automatic section results but have no overall percentage until Teacher review. They remain `awaiting_review`. Review details carry section identity and title; existing review controls apply to the overall submitted activity. The stored envelope restores all child responses and preserves the original release through subsequent publications. Show next follows panel order, section order and each child's established reveal order, advancing exactly one child command.

## Existing activity extensions

Drag & Drop image items reference managed PNG, JPEG or WebP assets. Source and display dimensions are explicit; the item's text remains its accessible description. Optional captions are public. Upload, replacement, removal, drag proxy, placed targets, Teacher reveal and read-only responses share the item renderer. Text-only documents retain their previous normalized form.

Oldschool Listening Open Response uses the shared Open Response panel composition controls: independent prompt/response visibility, typography, geometry, managed image backgrounds/layers, lock, ordering, duplication, zoom and pan. Hiding a prompt preserves the semantic question and private answer. Restore uses the saved question identity. The Oldschool creation action for Show Text Hotspots is absent; legacy snippets, cues, transcript mappings and ordinary Listening behavior remain supported. These controls apply to its question panel, not its synchronized transcript page.

Image's optional Sample answer belongs exclusively to its Teacher solution. The button is positioned from the actual image surface outside its lower-right edge; a narrow viewport uses the space below the right edge. It opens a protected raster popup with the existing vertical scrolling controls. The same button, Close and Escape dismiss it; focus returns to the trigger. Images are requested only when opened. Student documents do not contain the configuration or protected descriptor.

## Protected asset and release boundary

Migration `058_native_teacher_answer_assets.sql` adds a distinct `native_teacher_answer` role to native uploads and immutable release pins. Ordinary raster deduplication is unchanged; protected and public uploads never deduplicate across roles. Protected source keys include `assets/teacher-answers/`. Asset ownership includes the activity, canonical slot, checksum and component. Raster inspection, MIME and dimensions are enforced through the existing upload pipeline. Before migration 058, preparing a protected upload fails explicitly with 503.

Draft preview requires a signed Teacher preview scope and a reference in that exact activity's private document. Published delivery requires Teacher/admin authorization, package entitlement and a published release; Builder release review requires its signed release/activity scope. Protected GET and HEAD routes proxy bytes with `private, no-store`, without issuing bearer storage redirects. Generic public/hash asset routes exclude the role. Pinned delivery binds the private reference, frozen owner, role, checksum and canonical object key; GET verifies the byte count and SHA-256. Replacement cannot alter an older release's pin.

The Students Book compiler adds `native-composition-expanded`; all historical variant descriptors remain frozen. New features cannot claim a historical compatibility identity. Managed-component compilers extend compatibility only when a new feature is present. Private image descriptors belong to the private manifest and Teacher projection, never public release assets.

Migration 058 has been tested only on isolated local PostgreSQL. Applying it to hosted databases is a separate operational prerequisite and is not performed by this task. Local browser fixtures do not certify real publisher content. Android APK checks certify the existing build profiles; the current offline providers do not establish a new native activity distribution mechanism.

## Normal validation entry points

`npm test` covers contracts, historical compatibility, response scoring and private delivery. `npm run test:integration` includes migration transition, protected pins and mixed Multi-Part assignment persistence/review. `npm run test:lms-native-drag-drop-layout` includes the native runtime suite and all six composed child surfaces. `npm run test:builder:hosted-native-activity` includes parent-only authoring, shared canvas save/reload and built Viewer acceptance, plus protected Image upload/save/reload.

The task's final gate additionally requires a clean candidate checkout, the unmodified CI sequence, actual Student/Teacher/generic Teacher APK builds, database cleanup, Cloudflare build/dry-run verification, and exact-SHA CI inspection after the one authorized push.
