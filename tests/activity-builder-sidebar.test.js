import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Activity Builder navigation releases desktop width without losing touch, focus, or reduced-motion access", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/apps/ultimate-b2-builder/hostedUltimateB2BuilderModern.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /matchMedia\?\.\("\(hover: hover\) and \(pointer: fine\)"\)/);
  assert.match(app, /if \(!query\.matches\) setNavigationExpanded\(true\)/);
  assert.match(app, /contains\(globalThis\.document\?\.activeElement\)/);
  assert.match(app, /setTimeout\([\s\S]*?, 250\)/);
  assert.match(app, /aria-controls="activity-builder-book-navigation"/);
  assert.match(app, /tabIndex=\{-1\}/);

  assert.match(css, /is-navigation-collapsed[^}]*grid-template-columns:\s*30px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(min-width: 769px\) and \(hover: none\), \(min-width: 769px\) and \(pointer: coarse\)/);
  assert.match(css, /@media \(min-width: 769px\)[^}]+[\s\S]*?activity-builder-navigation-toggle \{ display: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
