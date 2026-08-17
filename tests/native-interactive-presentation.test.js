import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const activityId = "ultimate-b2-sb-u1-p1-o99";
const titleSentinel = "INTERACTIVE_METADATA_TITLE_SENTINEL";
const instructionSentinel = "INTERACTIVE_METADATA_INSTRUCTION_SENTINEL";
const asset = { assetId: "10000000-0000-4000-8000-000000000099", slot: "asset-image" };

function imageDocument({ images = [] } = {}) {
  return {
    activityId,
    kind: "image",
    metadata: { title: titleSentinel, visibleInstructionText: instructionSentinel },
    assets: images.length ? [asset] : [],
    parts: [{
      interaction: {
        kind: "image",
        surface: { width: 1024, height: 582 },
        images,
      },
    }],
  };
}

function image(id, overrides = {}) {
  return {
    id,
    assetSlot: asset.slot,
    area: { x: 128, y: 100, width: 512, height: 291 },
    order: 2,
    altText: "Authored diagram",
    decorative: false,
    fit: "cover",
    locked: false,
    ...overrides,
  };
}

async function withVite(run) {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    await run(vite);
  } finally {
    await vite.close();
  }
}

test("Native Image uses neutral read-only layers while preserving authored image presentation", async () => {
  await withVite(async (vite) => {
    const { NativeImageSurface } = await vite.ssrLoadModule("/src/components/native-image/NativeImageSurface.jsx");
    const document = imageDocument({ images: [image("image-1"), image("image-2", { decorative: true, altText: "", fit: "contain", order: 3 })] });
    const surface = NativeImageSurface({ document, assetUrl: () => "/fixture.png" });
    const layers = surface.props.children[0];

    assert.equal(layers.length, 2);
    assert.equal(layers[0].type, "div");
    assert.equal(layers[0].props.disabled, undefined);
    assert.equal(layers[0].props.onClick, undefined);
    assert.equal(layers[0].props.style.position, "absolute");
    assert.equal(layers[0].props.style.pointerEvents, "none");
    assert.deepEqual(
      { left: layers[0].props.style.left, top: layers[0].props.style.top, width: layers[0].props.style.width, height: layers[0].props.style.height, zIndex: layers[0].props.style.zIndex },
      { left: "12.5%", top: `${(100 / 582) * 100}%`, width: "50%", height: "50%", zIndex: 3 },
    );
    assert.equal(layers[0].props.children.type, "img");
    assert.equal(layers[0].props.children.props.alt, "Authored diagram");
    assert.equal(layers[0].props.children.props.style.objectFit, "cover");
    assert.equal(layers[1].props.children.props.alt, "");
    assert.equal(layers[1].props.children.props.style.objectFit, "contain");

    const markup = renderToStaticMarkup(surface);
    assert.doesNotMatch(markup, /<button|disabled=/);
    assert.match(markup, /<img[^>]+alt="Authored diagram"/);
    assert.match(markup, /pointer-events:none/);
  });
});

test("Native Image keeps selectable button behavior and locked state in authoring mode", async () => {
  await withVite(async (vite) => {
    const { NativeImageSurface } = await vite.ssrLoadModule("/src/components/native-image/NativeImageSurface.jsx");
    const selections = [];
    const onSelect = (id) => selections.push(id);
    const document = imageDocument({ images: [image("image-selected"), image("image-locked", { locked: true, order: 3 })] });
    const surface = NativeImageSurface({ document, assetUrl: () => "/fixture.png", onSelect, selectedId: "image-selected" });
    const layers = surface.props.children[0];

    assert.equal(layers[0].type, "button");
    assert.equal(layers[0].props.type, "button");
    assert.match(layers[0].props.className, /is-selected/);
    assert.equal(layers[0].props.style.pointerEvents, undefined);
    layers[0].props.onClick();
    assert.deepEqual(selections, ["image-selected"]);
    assert.equal(layers[1].type, "button");
    assert.equal(layers[1].props["data-locked"], true);
    assert.equal(layers[1].props.style.pointerEvents, "none");
    assert.match(layers[1].props["aria-label"], /\(locked\)$/);
  });
});

test("native runner metadata is default-on and can be suppressed without removing the activity surface", async () => {
  await withVite(async (vite) => {
    const [{ HostedNativeDraftActivityRunner }, { PublishedNativeActivityRunner }] = await Promise.all([
      vite.ssrLoadModule("/src/components/lms/activities/ultimate-b2/HostedNativeDraftActivityRunner.jsx"),
      vite.ssrLoadModule("/src/components/lms/activities/ultimate-b2/PublishedNativeActivityRunner.jsx"),
    ]);
    const document = imageDocument();
    const state = { kind: "ready", entry: { kind: "image", document }, teacher: { kind: "idle" } };
    const entry = { kind: "image", document };
    const publication = { releaseId: "10000000-0000-4000-8000-000000000098" };

    const hostedDefault = renderToStaticMarkup(React.createElement(HostedNativeDraftActivityRunner, { activityId, state }));
    const hostedInteractive = renderToStaticMarkup(React.createElement(HostedNativeDraftActivityRunner, { activityId, state, showMetadataHeader: false }));
    assert.match(hostedDefault, new RegExp(titleSentinel));
    assert.match(hostedDefault, new RegExp(instructionSentinel));
    assert.doesNotMatch(hostedInteractive, new RegExp(`${titleSentinel}|${instructionSentinel}`));
    assert.match(hostedInteractive, /hosted-native-draft-activity/);
    assert.match(hostedInteractive, /native-image-surface/);

    const publishedDefault = renderToStaticMarkup(React.createElement(PublishedNativeActivityRunner, { entry, publication }));
    const publishedInteractive = renderToStaticMarkup(React.createElement(PublishedNativeActivityRunner, { entry, publication, showMetadataHeader: false }));
    assert.match(publishedDefault, new RegExp(titleSentinel));
    assert.match(publishedDefault, new RegExp(instructionSentinel));
    assert.doesNotMatch(publishedInteractive, new RegExp(`${titleSentinel}|${instructionSentinel}`));
    assert.match(publishedInteractive, /published-native-activity/);
    assert.match(publishedInteractive, /native-image-surface/);
  });
});

test("canonical Interactive opts out of both metadata headers while LMS assignment keeps the safe default", async () => {
  const [interactive, assignment] = await Promise.all([
    readFile(new URL("../src/apps/android-teacher-offline/TeacherOfflineEmbeddedActivity.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/lms/student/portal/StudentAssignmentWorkspace.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(interactive, /<PublishedNativeActivityRunner[^>]+showMetadataHeader=\{false\}/);
  assert.match(interactive, /<HostedNativeDraftActivityRunner[^>]+showMetadataHeader=\{false\}/);
  assert.match(assignment, /<PublishedNativeActivityRunner/);
  assert.doesNotMatch(assignment, /showMetadataHeader/);
});
