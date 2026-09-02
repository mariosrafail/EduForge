export class NativeActivityPlacementError extends Error {
  constructor(message) {
    super(message);
    this.name = "NativeActivityPlacementError";
  }
}

export function isNativeActivityPlacementError(error) {
  return error instanceof NativeActivityPlacementError;
}
