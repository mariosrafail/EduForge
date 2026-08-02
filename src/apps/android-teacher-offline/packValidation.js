function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function exerciseIds(catalog) {
  return (catalog?.units || []).flatMap((unit) => (
    (unit.lessons || []).flatMap((lesson) => (
      (lesson.exercises || []).map((exercise) => exercise.stableActivityId)
    ))
  ));
}

export async function validateTeacherContentPack(pack) {
  try {
    const { manifest, catalog, activities, teacherSolutions, assetsManifest } = pack || {};
    if (!globalThis.crypto?.subtle) return { valid: false, reason: "Integrity verification is unavailable." };
    if (
      manifest?.schemaVersion !== 1
      || manifest.minimumSupportedContentSchemaVersion !== 1
      || manifest.minimumSupportedAppVersion !== "0.1.0"
    ) {
      return { valid: false, reason: "Unsupported content schema." };
    }
    if (manifest.packageId !== "ultimate-b2-students-book" || manifest.componentId !== "students-book") {
      return { valid: false, reason: "Unexpected content package identity." };
    }

    const records = {
      "catalog.json": catalog,
      "activities.json": activities,
      "teacher-solutions.json": teacherSolutions,
      "assets-manifest.json": assetsManifest,
    };
    for (const [name, value] of Object.entries(records)) {
      const expected = manifest.files?.[name]?.semanticSha256;
      if (!expected || await sha256(stableStringify(value)) !== expected) {
        return { valid: false, reason: `Integrity check failed for ${name}.` };
      }
    }

    const activityIds = (activities?.activities || []).map((activity) => activity.stableActivityId);
    if (
      activityIds.length !== 78
      || new Set(activityIds).size !== 78
      || exerciseIds(catalog).join("|") !== activityIds.join("|")
      || Object.keys(teacherSolutions?.solutions || {}).join("|") !== activityIds.join("|")
      || manifest.activityCountsByUnit?.["1"] !== 38
      || manifest.activityCountsByUnit?.["2"] !== 40
      || manifest.disabledActivityCount !== 12
    ) {
      return { valid: false, reason: "Content catalog counts or identities do not match." };
    }

    if (
      assetsManifest?.assets?.length !== manifest.assetCount
      || new Set(assetsManifest.assets.map((asset) => asset.logicalKey)).size !== manifest.assetCount
    ) {
      return { valid: false, reason: "Asset manifest is incomplete." };
    }
    return { valid: true, reason: "" };
  } catch {
    return { valid: false, reason: "Content pack validation failed." };
  }
}
