export async function fulfillManagedWorkerResponse(route, response, { managedStorageOrigin, draftUnitExtraBytes, managedStorageObjectRequests, managedStorageObjects }) {
  const location = response.headers.get("Location");
  if (response.status === 302 && location === `${managedStorageOrigin}/__draft-unit-extra.mp4`) {
    return route.fulfill({ status: 200, contentType: "video/mp4", body: draftUnitExtraBytes });
  }
  if (response.status === 302 && location?.startsWith(`${managedStorageOrigin}/__managed-page-storage/`)) {
    const objectKey = decodeURIComponent(new URL(location).pathname.slice("/__managed-page-storage/".length));
    managedStorageObjectRequests.push(objectKey);
    return route.fulfill(managedStorageObjects.has(objectKey)
      ? { status: 200, contentType: "image/png", body: managedStorageObjects.get(objectKey) }
      : { status: 404, contentType: "text/plain", body: "Not found" });
  }
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : undefined;
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), ...(body ? { body } : {}) });
}

