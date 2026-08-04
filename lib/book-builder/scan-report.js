function list(items) {
  return items?.length ? items.map((item) => `  - ${item}`).join("\n") : "  - none";
}

export function createScanReport({ project, resolution, inventory, fingerprint }) {
  const profile = project.selectedProfile;
  const warnings = [...(project.validationSummary.warnings || []), ...resolution.diagnostics.map((item) => `${item.code}: ${item.path || item.message || ""}`)];
  return `# Book Builder source scan

## Source

- Source label: ${project.sourceDescriptor.label}
- Selected outer folder label: ${project.sourceDescriptor.selectedOuterLabel}
- Canonical application root: ${project.sourceDescriptor.canonicalAppRelativePath}
- Source kind: ${project.sourceDescriptor.kind}
- Application ID: ${project.sourceDescriptor.applicationId || "not available"}
- Application name/version: ${project.sourceDescriptor.applicationName || "not available"} ${project.sourceDescriptor.applicationVersion || ""}
- Main SWF: ${project.sourceDescriptor.mainSwfPath || "not available"}

## Profile

- Selected profile: ${profile.id}
- Confidence: ${profile.confidence}
- Detector version: ${profile.detectorVersion}
- Matched evidence:
${list(profile.matchedEvidence)}
- Missing evidence:
${list(profile.missingEvidence)}
- Conflicting evidence:
${list(profile.conflictingEvidence)}

## Inventory

- Files: ${inventory.summary.fileCount}
- Bytes: ${inventory.summary.totalBytes}
- Publisher resources: ${inventory.summary.publisherFileCount} files / ${inventory.summary.publisherBytes} bytes
- Framework/native or other resources: ${inventory.summary.fileCount - inventory.summary.publisherFileCount} files
- Deferred hashes: ${inventory.summary.deferredHashCount}
- Candidate components: ${fingerprint.features.componentDirectoryCount}
- Unit directories: ${fingerprint.features.unitDirectoryCount}
- Part directories: ${fingerprint.features.partDirectoryCount}
- Object directories: ${fingerprint.features.objectDirectoryCount}
- IWB metadata: ${fingerprint.features.iwbCount}
- Atlas metadata: ${inventory.summary.categoryCounts.atlas_metadata || 0}
- Audio: ${inventory.summary.categoryCounts.audio || 0}
- Video: ${inventory.summary.categoryCounts.video || 0}
- GAF packages: ${inventory.summary.categoryCounts.gaf_package || 0}
- Structural fingerprint: ${fingerprint.fingerprintSha256}
- Fingerprint kind: ${fingerprint.fingerprintKind} (not a complete cryptographic source checksum)

## Warnings and safety findings

${list(warnings)}

## Next step

Review detected foundation facts and approve semantic decisions before any future extraction or publication work. This milestone does not convert assets, activities, answers, pages, or media.
`;
}
