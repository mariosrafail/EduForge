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

export const ultimateB2StudentsBookValidationPolicy = Object.freeze({
  packageId: "ultimate-b2-students-book",
  componentId: "students-book",
  activityCount: 78,
  activityCountsByUnit: Object.freeze({ "1": 38, "2": 40 }),
  disabledActivityCount: 12,
});

export function createContentPackValidationPolicy(policy) {
  if (!policy?.packageId || !policy?.componentId || !Number.isSafeInteger(policy.activityCount) || policy.activityCount < 0) {
    throw new TypeError("Content pack validation policy is invalid.");
  }
  return Object.freeze({
    packageId: String(policy.packageId),
    componentId: String(policy.componentId),
    activityCount: policy.activityCount,
    activityCountsByUnit: Object.freeze({ ...(policy.activityCountsByUnit || {}) }),
    disabledActivityCount: Number(policy.disabledActivityCount || 0),
  });
}

async function validateContentPack(pack, { requireTeacherSolutions, policy }) {
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
    if (manifest.packageId !== policy.packageId || manifest.componentId !== policy.componentId) {
      return { valid: false, reason: "Unexpected content package identity." };
    }

    const records = {
      "catalog.json": catalog,
      "activities.json": activities,
      "assets-manifest.json": assetsManifest,
    };
    if (requireTeacherSolutions) records["teacher-solutions.json"] = teacherSolutions;
    for (const [name, value] of Object.entries(records)) {
      const expected = manifest.files?.[name]?.semanticSha256;
      if (!expected || await sha256(stableStringify(value)) !== expected) {
        return { valid: false, reason: `Integrity check failed for ${name}.` };
      }
    }

    const activityIds = (activities?.activities || []).map((activity) => activity.stableActivityId);
    if (
      activityIds.length !== policy.activityCount
      || new Set(activityIds).size !== policy.activityCount
      || exerciseIds(catalog).join("|") !== activityIds.join("|")
      || (requireTeacherSolutions && Object.keys(teacherSolutions?.solutions || {}).join("|") !== activityIds.join("|"))
      || Object.entries(policy.activityCountsByUnit).some(([unit, count]) => manifest.activityCountsByUnit?.[unit] !== count)
      || Object.keys(manifest.activityCountsByUnit || {}).length !== Object.keys(policy.activityCountsByUnit).length
      || manifest.disabledActivityCount !== policy.disabledActivityCount
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

export function validateReviewContentPack(pack, policy = ultimateB2StudentsBookValidationPolicy) {
  return validateContentPack(pack, { requireTeacherSolutions: false, policy });
}

export function validateTeacherContentPack(pack, policy = ultimateB2StudentsBookValidationPolicy) {
  return validateContentPack(pack, { requireTeacherSolutions: true, policy });
}
