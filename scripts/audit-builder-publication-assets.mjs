import { pathToFileURL } from "node:url";

import { createBookAssetStorage } from "../lib/book-assets/storage.js";
import { findProductComponent } from "../src/data/bookProductCatalog.js";
import { ULTIMATE_B2_PRODUCT_RELEASE_COMPONENTS } from "../src/data/ultimate-b2/productPublication.js";
import { getBuilderSql } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { ComponentPublicationAssetError } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-assets.js";
import { resolvePublicationCompiler } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compilers.js";
import { freezeComponentPublicationAssetPins, safePublicationPinReport } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-pins.js";

function configuredComponents() {
  return ULTIMATE_B2_PRODUCT_RELEASE_COMPONENTS.map(({ componentSlug }) => {
    const component = findProductComponent("ultimate-b2", componentSlug);
    return { componentSlug, compiler: component?.publication?.readable && resolvePublicationCompiler(component.publication.compilerId) };
  });
}

export async function auditBuilderPublicationAssets({ sql = getBuilderSql(), storage = createBookAssetStorage(), logger = console, components = configuredComponents() } = {}) {
  const reports = [];
  for (const { componentSlug, compiler } of components) {
    if (!compiler) throw new Error("publication_compiler_unavailable");
    const compiled = compiler.compile(await compiler.collect(sql));
    const pins = await freezeComponentPublicationAssetPins(storage, {
      bookSlug: "ultimate-b2",
      componentSlug,
      assetManifest: compiled.assetManifest,
      nativeAssetSources: compiled.nativeAssetSources || [],
      concurrency: 4,
    });
    reports.push(...safePublicationPinReport(componentSlug, pins));
  }
  logger.log(JSON.stringify({ status: "verified", componentCount: components.length, assetCount: reports.length, assets: reports }));
  return reports;
}

async function main() {
  try { await auditBuilderPublicationAssets(); }
  catch (error) {
    const diagnostic = error instanceof ComponentPublicationAssetError
      ? { status: "failed", assetId: error.assetId, component: error.assetStage.replace(/^pin-/, ""), role: error.assetRole, failureClass: error.failureClass }
      : { status: "failed", failureClass: "audit_failed" };
    console.error(JSON.stringify(diagnostic));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
