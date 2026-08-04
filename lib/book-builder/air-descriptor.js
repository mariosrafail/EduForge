import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { isPathWithin, portablePath } from "./path-safety.js";

export const AIR_DESCRIPTOR_RELATIVE_PATH = "Contents/Resources/META-INF/AIR/application.xml";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  allowBooleanAttributes: false,
  removeNSPrefix: true,
});

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value["#text"] === "string") return value["#text"].trim();
  return null;
}

function requireText(value, label) {
  const result = text(value);
  if (!result) throw new Error(`AIR descriptor is missing ${label}`);
  return result;
}

function optionalText(value) {
  return text(value);
}

export function parseAirDescriptorXml(xml) {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("AIR descriptor is empty");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("AIR descriptor declarations and external entities are not allowed");
  const xmlValidation = XMLValidator.validate(xml);
  if (xmlValidation !== true) throw new Error(`Malformed AIR descriptor XML: ${xmlValidation.err.msg}`);
  let parsed;
  try { parsed = parser.parse(xml); } catch (error) { throw new Error(`Malformed AIR descriptor XML: ${error.message}`); }
  const application = parsed?.application;
  if (!application || typeof application !== "object") throw new Error("AIR descriptor must contain an application root");
  const namespace = xml.match(/<\s*(?:\w+:)?application\b[^>]*\bxmlns\s*=\s*["']([^"']+)["']/i)?.[1] || null;
  const airVersion = namespace?.match(/\/application\/([^/]+)$/)?.[1] || null;
  const window = application.initialWindow || {};
  const mainSwfPath = requireText(window.content, "initialWindow.content").replaceAll("\\", "/");
  if (/^(?:[a-z]:\/|\/|\\\\)/i.test(mainSwfPath) || mainSwfPath.split("/").includes("..")) throw new Error("AIR descriptor main SWF path escapes Resources");
  return {
    sourceRelativePath: AIR_DESCRIPTOR_RELATIVE_PATH,
    namespace,
    airVersion,
    id: requireText(application.id, "id"),
    name: requireText(application.name, "name"),
    versionNumber: optionalText(application.versionNumber || application.version),
    versionLabel: optionalText(application.versionLabel),
    filename: optionalText(application.filename),
    requestedDisplayResolution: optionalText(application.requestedDisplayResolution),
    supportedProfiles: optionalText(application.supportedProfiles),
    renderMode: optionalText(window.renderMode || application.renderMode),
    mainSwfPath,
    initialWindow: {
      content: mainSwfPath,
      title: optionalText(window.title),
      aspectRatio: optionalText(window.aspectRatio),
      renderMode: optionalText(window.renderMode),
      depthAndStencil: optionalText(window.depthAndStencil),
      autoOrients: optionalText(window.autoOrients),
      fullScreen: optionalText(window.fullScreen),
      visible: optionalText(window.visible),
    },
    descriptorSha256: createHash("sha256").update(xml).digest("hex"),
  };
}

export async function readAirDescriptor(appRoot) {
  const resolvedAppRoot = path.resolve(appRoot);
  const descriptorAbsolutePath = path.join(resolvedAppRoot, ...AIR_DESCRIPTOR_RELATIVE_PATH.split("/"));
  const descriptorStat = await fs.lstat(descriptorAbsolutePath);
  if (descriptorStat.isSymbolicLink() || !descriptorStat.isFile()) throw new Error("AIR application descriptor must be a regular non-symlink file");
  const descriptor = parseAirDescriptorXml(await fs.readFile(descriptorAbsolutePath, "utf8"));
  const resourcesRoot = path.join(resolvedAppRoot, "Contents", "Resources");
  const mainSwfAbsolutePath = path.resolve(resourcesRoot, ...descriptor.mainSwfPath.split("/"));
  if (!isPathWithin(resourcesRoot, mainSwfAbsolutePath)) throw new Error("AIR descriptor main SWF path escapes Resources");
  const mainStat = await fs.lstat(mainSwfAbsolutePath);
  if (mainStat.isSymbolicLink() || !mainStat.isFile()) throw new Error("AIR descriptor main SWF must be a regular non-symlink file");
  const realResources = await fs.realpath(resourcesRoot);
  const realMain = await fs.realpath(mainSwfAbsolutePath);
  if (!isPathWithin(realResources, realMain)) throw new Error("AIR descriptor main SWF resolves outside Resources");
  return { descriptor, descriptorAbsolutePath, mainSwfAbsolutePath, mainSwfRelativePath: portablePath(path.relative(resolvedAppRoot, mainSwfAbsolutePath)) };
}
