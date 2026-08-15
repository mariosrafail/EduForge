export function createBuilderRelatedDocumentLoader({
  sql,
  resource,
  resolveResource,
  loadDocument,
  allowedResources = null,
}) {
  const allowed = allowedResources ? new Set(allowedResources) : null;
  return async function loadRelated(relatedResource, relatedKey = "") {
    if (allowed && !allowed.has(relatedResource)) throw new Error("Builder preview related resource was not declared.");
    const resolved = await resolveResource(resource.bookSlug, resource.componentSlug, relatedResource, relatedKey);
    return resolved ? loadDocument(sql, resolved) : null;
  };
}
