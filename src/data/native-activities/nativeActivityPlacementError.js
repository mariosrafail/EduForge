export class NativeActivityPlacementError extends Error {
  constructor(message, { pageId, placementIndex } = {}) {
    super(message);
    this.name = "NativeActivityPlacementError";
    if (typeof pageId === "string") this.pageId = pageId;
    if (Number.isInteger(placementIndex) && placementIndex >= 0) this.placementIndex = placementIndex;
  }
}

export function isNativeActivityPlacementError(error) {
  return error instanceof NativeActivityPlacementError;
}
