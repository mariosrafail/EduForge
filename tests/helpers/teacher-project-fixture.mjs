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

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function labeledPng(label, { width, height, colour = "#217399", active = false }) {
  const safe = escapeXml(label);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="${Math.min(18, height / 4)}" fill="${active ? "#ffd72e" : colour}" stroke="#fff" stroke-width="4"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-weight="700" font-size="${Math.max(14, Math.floor(height * .27))}" fill="${active ? "#12364b" : "#fff"}">${safe}</text></svg>`)).png().toBuffer();
}

export async function createCompleteTeacherProjectFixture({ projectId = "ultimate-b3", displayName = "Ultimate B3", distinctVisualAssets = false, withPageContent = true } = {}) {
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
  shell.background = await importAsset(distinctVisualAssets ? await labeledPng("GENERIC TEACHER SHELL", { width: 1920, height: 1080, colour: "#124d6a" }) : image, "background.png", { section: "background", slot: "main", variant: "image", index: null });
  shell.titleAnimation.gaf = await importAsset(await fs.readFile(path.join(trackedGafRoot, "logo.gaf")), "logo.gaf", { section: "animation", slot: "title", variant: "gaf", index: null });
  for (const [density, filenames] of Object.entries({ sd: ["logo_SD.png", "logo_SD_2.png"], hd: ["logo_HD.png", "logo_HD_2.png"] })) {
    for (let index = 0; index < filenames.length; index += 1) {
      const id = await importAsset(await fs.readFile(path.join(trackedGafRoot, filenames[index])), filenames[index], { section: "animation", slot: "title", variant: density, index });
      shell.titleAnimation[density === "sd" ? "sdAtlases" : "hdAtlases"].push(id);
    }
  }
  for (const id of ["settings", "minimize", "close"]) {
    const bytes = distinctVisualAssets ? await labeledPng(id.slice(0, 1).toUpperCase(), { width: 64, height: 64, colour: "#762a7e" }) : image;
    shell.chrome[id].image = await importAsset(bytes, `${id}.png`, { section: "chrome", slot: id, variant: "image", index: null });
  }
  for (const [section, items] of [["units", shell.units], ["editions", shell.editions], ["toolbar", shell.toolbar]]) {
    for (const item of items) for (const variant of ["normal", "active"]) {
      const dimensions = section === "toolbar" ? { width: 64, height: 64 } : section === "units" ? { width: 360, height: 93 } : { width: 301, height: 99 };
      const label = section === "toolbar" ? item.label.slice(0, 2).toUpperCase() : item.label;
      const bytes = distinctVisualAssets ? await labeledPng(label, { ...dimensions, active: variant === "active", colour: section === "units" ? "#6d2e83" : section === "editions" ? "#087d82" : "#234d88" }) : image;
      item[variant] = await importAsset(bytes, `${item.id}-${variant}.png`, { section, slot: item.id, variant, index: null });
    }
  }
  const sound = await importAsset(wavFixture(), "button-click.wav", { section: "audio", slot: "library", variant: "sound", index: null });
  Object.values(shell.chrome).forEach((item) => { item.sound = sound; });
  [...shell.units, ...shell.editions, ...shell.toolbar].forEach((item) => { item.sound = sound; });
  const content = structuredClone(project.content);
  if (withPageContent) {
    const page = async (label, width, height, colour) => importAsset(await labeledPng(label, { width, height, colour }), `${label}.png`, { section: "pages", slot: "library", variant: "image", index: null });
    const page5 = await page("page-5", 720, 960, "#1b7195");
    const spread = await page("reading-6-7", 1400, 800, "#7d318e");
    const left = await page("page-8", 640, 920, "#137b65");
    const right = await page("page-9", 700, 960, "#ad5a26");
    content.studentsBook.units[0].entries = [
      { id: "entry-00000000-0000-4000-8000-000000000101", sectionTitle: "", pageLabel: "5", layout: "single-page", image: page5 },
      { id: "entry-00000000-0000-4000-8000-000000000102", sectionTitle: "Reading", pageLabel: "6-7", layout: "double-wide", image: spread },
      { id: "entry-00000000-0000-4000-8000-000000000103", sectionTitle: "Practice 1", pageLabel: "8-9", layout: "double-pair", leftImage: left, rightImage: right },
    ];
  }
  project = await store.save(projectId, { displayName, expectedRevision: project.revision, shell, content });
  return {
    root,
    workspace,
    store,
    project,
    async cleanup() { await fs.rm(root, { recursive: true, force: true }); },
  };
}
