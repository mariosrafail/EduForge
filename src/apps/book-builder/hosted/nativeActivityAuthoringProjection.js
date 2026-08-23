export function projectNativeActivityPublicForAuthoring(document) {
  const projected = structuredClone(document);
  projected.metadata.visibleInstructionText = "";
  return projected;
}
