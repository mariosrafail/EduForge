const pageErrorPresentations = Object.freeze({
  revision_conflict: Object.freeze({ message: "The page library revision changed before this operation could be saved.", conflict: true }),
  hotspot_revision_conflict: Object.freeze({ message: "The page hotspot revision changed before this operation could be saved.", conflict: true }),
  unsupported_page_reference: Object.freeze({ message: "This page has a reference that cannot be removed safely. Nothing was changed.", conflict: false }),
  page_lifecycle_schema_not_ready: Object.freeze({ message: "Page deletion and restore are temporarily unavailable while the lifecycle service is being prepared. Nothing was changed.", conflict: false }),
  mutation_id_conflict: Object.freeze({ message: "This page request identifier was already used for a different change. Nothing was changed. Try the operation again.", conflict: false }),
  page_state_conflict: Object.freeze({ message: "This page is no longer in the state required for that operation. Nothing was changed. Refresh the page library to review its current state.", conflict: false }),
  page_inactive: Object.freeze({ message: "This page is inactive. Restore it from Deleted pages before replacing its image.", conflict: false }),
});

export function componentPagesErrorPresentation(error) {
  const code = String(error?.payload?.error || "");
  return pageErrorPresentations[code] || Object.freeze({
    message: error?.message || "Page operation failed.",
    conflict: false,
  });
}
