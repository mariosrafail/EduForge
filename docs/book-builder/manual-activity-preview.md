# Manual activity preview

The editor offers a non-writing validation preview before a mutation. Student preview renders only the Student-safe draft: prompts, options, inputs, scrollable content, image overlays, and allowlisted media. It does not request or open the Teacher solution artifact.

The Teacher editor and Teacher preview are separate, explicitly revealed surfaces available only in edit mode. They load through the protected Teacher route and display solution values only inside the marked Teacher boundary. Network and bundle tests assert that answer-bearing material does not appear in Student API bodies or the built Studio bundle.

Read-only Studio mode lists approved activities only, labels the view as an approved Student view, shows no create/save/archive/remove controls, exposes no detected-prefill choices, and denies Teacher routes. Asset content is served with a fixed approved MIME type, no-store headers, size limits, digest verification, loopback/same-origin checks, and no path-based URL.
