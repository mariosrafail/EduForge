import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import { TeacherProjectStore } from "../../lib/teacher-project-builder/store.js";

const trackedGafRoot = path.resolve("src/assets/books/ultimate-b2/legacy-classroom-ui/branding/menu-title-animation");

function wavFixture() {
  const wav = Buffer.alloc(46);
  wav.write("RIFF", 0); wav.writeUInt32LE(38, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(8_000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
  wav.write("data", 36); wav.writeUInt32LE(2, 40); wav[44] = 128; wav[45] = 128;
  return wav;
}

export async function createCompleteTeacherProjectFixture({ projectId = "ultimate-b3", displayName = "Ultimate B3" } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hh-teacher-project-complete-"));
  const workspace = path.join(root, "workspace");
  await fs.mkdir(workspace);
  const store = new TeacherProjectStore({ workspace, now: () => "2026-08-08T12:00:00.000Z" });
  let project = await store.create({ projectId, displayName });
  const shell = structuredClone(project.shell);
  const image = await sharp({ create: { width: 320, height: 120, channels: 4, background: { r: 33, g: 115, b: 153, alpha: 1 } } }).png().toBuffer();
  const importAsset = async (bytes, originalFilename, descriptor) => {
    const result = await store.importAsset(projectId, { bytes, originalFilename, descriptor });
    project = result.project;
    return result.asset.assetId;
  };
  shell.background = await importAsset(image, "background.png", { section: "background", slot: "main", variant: "image", index: null });
  shell.titleAnimation.gaf = await importAsset(await fs.readFile(path.join(trackedGafRoot, "logo.gaf")), "logo.gaf", { section: "animation", slot: "title", variant: "gaf", index: null });
  for (const [density, filenames] of Object.entries({ sd: ["logo_SD.png", "logo_SD_2.png"], hd: ["logo_HD.png", "logo_HD_2.png"] })) {
    for (let index = 0; index < filenames.length; index += 1) {
      const id = await importAsset(await fs.readFile(path.join(trackedGafRoot, filenames[index])), filenames[index], { section: "animation", slot: "title", variant: density, index });
      shell.titleAnimation[density === "sd" ? "sdAtlases" : "hdAtlases"].push(id);
    }
  }
  for (const id of ["settings", "minimize", "close"]) {
    shell.chrome[id].image = await importAsset(image, `${id}.png`, { section: "chrome", slot: id, variant: "image", index: null });
  }
  for (const [section, items] of [["units", shell.units], ["editions", shell.editions], ["toolbar", shell.toolbar]]) {
    for (const item of items) for (const variant of ["normal", "active"]) {
      item[variant] = await importAsset(image, `${item.id}-${variant}.png`, { section, slot: item.id, variant, index: null });
    }
  }
  const sound = await importAsset(wavFixture(), "button-click.wav", { section: "audio", slot: "library", variant: "sound", index: null });
  Object.values(shell.chrome).forEach((item) => { item.sound = sound; });
  [...shell.units, ...shell.editions, ...shell.toolbar].forEach((item) => { item.sound = sound; });
  project = await store.save(projectId, { displayName, expectedRevision: project.revision, shell });
  return {
    root,
    workspace,
    store,
    project,
    async cleanup() { await fs.rm(root, { recursive: true, force: true }); },
  };
}
