import assert from "node:assert/strict";
import test from "node:test";

import { componentPagesErrorPresentation } from "../src/apps/book-builder/hosted/componentPagesErrorPresentation.js";

const error = (code, status = 409) => ({ status, payload: { error: code }, message: "Page library request failed." });

test("Page Library classifies lifecycle failures by response error code", () => {
  for (const code of ["revision_conflict", "hotspot_revision_conflict"]) {
    const presentation = componentPagesErrorPresentation(error(code));
    assert.equal(presentation.conflict, true);
    assert.match(presentation.message, /revision changed/);
  }

  const unsupported = componentPagesErrorPresentation(error("unsupported_page_reference"));
  assert.deepEqual(unsupported, {
    message: "This page has a reference that cannot be removed safely. Nothing was changed.",
    conflict: false,
  });
  assert.doesNotMatch(unsupported.message, /changed elsewhere/i);

  const schema = componentPagesErrorPresentation(error("page_lifecycle_schema_not_ready", 503));
  assert.equal(schema.conflict, false);
  assert.match(schema.message, /temporarily unavailable/);

  assert.match(componentPagesErrorPresentation(error("mutation_id_conflict")).message, /request identifier/);
  assert.match(componentPagesErrorPresentation(error("page_state_conflict")).message, /no longer in the state/);
  assert.match(componentPagesErrorPresentation(error("page_inactive")).message, /Restore it from Deleted pages/);
  assert.equal(componentPagesErrorPresentation(error("unknown_conflict")).conflict, false);
});
