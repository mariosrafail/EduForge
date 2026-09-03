export function createBuilderRelatedDocumentLoader({
  sql,
  resource,
  resolveResource,
  loadDocument,
  loadDocuments,
  allowedResources = null,
}) {
  const allowed = allowedResources ? new Set(allowedResources) : null;
  const assertAllowed = (relatedResource) => {
    if (allowed && !allowed.has(relatedResource)) throw new Error("Builder preview related resource was not declared.");
  };
  const loadRelated = async function loadRelated(relatedResource, relatedKey = "") {
    assertAllowed(relatedResource);
    const resolved = await resolveResource(resource.bookSlug, resource.componentSlug, relatedResource, relatedKey);
    return resolved ? loadDocument(sql, resolved) : null;
  };
  loadRelated.batch = async (relatedResource, relatedKeys) => {
    assertAllowed(relatedResource);
    if (!Array.isArray(relatedKeys)) throw new Error("Builder related document batch must be an array.");
    const keys = [...new Set(relatedKeys)];
    if (!keys.length) return new Map();
    if (typeof loadDocuments !== "function") throw new Error("Builder related document batch loader is unavailable.");
    const resources = await Promise.all(keys.map((key) => resolveResource(resource.bookSlug, resource.componentSlug, relatedResource, key)));
    if (resources.some((resolved) => !resolved)) throw new Error("Builder related document batch contains an unsupported resource.");
    return loadDocuments(sql, resources);
  };
  return loadRelated;
}
