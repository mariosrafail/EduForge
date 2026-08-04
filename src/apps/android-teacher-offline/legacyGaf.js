const SIGNATURE_GAF = 0x00474146;
const SIGNATURE_GAC = 0x00474143;

class Cursor {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.position = 0;
  }

  u8() { const value = this.view.getUint8(this.position); this.position += 1; return value; }
  i8() { const value = this.view.getInt8(this.position); this.position += 1; return value; }
  bool() { return Boolean(this.u8()); }
  u16() { const value = this.view.getUint16(this.position, true); this.position += 2; return value; }
  i16() { const value = this.view.getInt16(this.position, true); this.position += 2; return value; }
  u32() { const value = this.view.getUint32(this.position, true); this.position += 4; return value; }
  i32() { const value = this.view.getInt32(this.position, true); this.position += 4; return value; }
  f32() { const value = this.view.getFloat32(this.position, true); this.position += 4; return value; }
  utf() {
    const length = this.u16();
    const value = new TextDecoder().decode(this.bytes.subarray(this.position, this.position + length));
    this.position += length;
    return value;
  }
}

async function inflateZlib(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error("This WebView cannot decompress the recovered GAF animation.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function skipFilter(cursor, type) {
  if (type === 0) { cursor.u32(); for (let index = 0; index < 5; index += 1) cursor.f32(); cursor.bool(); cursor.bool(); return; }
  if (type === 1) { cursor.f32(); cursor.f32(); return; }
  if (type === 2) { cursor.u32(); for (let index = 0; index < 3; index += 1) cursor.f32(); cursor.bool(); cursor.bool(); return; }
  if (type === 6) { for (let index = 0; index < 20; index += 1) cursor.f32(); return; }
  throw new Error(`Unsupported GAF filter ${type}`);
}

function readAtlas(cursor, tag, end) {
  const scale = cursor.f32();
  const sourceGroups = cursor.i8();
  const sources = [];
  for (let group = 0; group < sourceGroups; group += 1) {
    const atlasId = cursor.u32();
    const sourceCount = cursor.i8();
    for (let source = 0; source < sourceCount; source += 1) sources.push({ atlasId, name: cursor.utf(), csf: cursor.f32() });
  }
  const elementCount = cursor.u32();
  const elements = new Map();
  for (let index = 0; index < elementCount; index += 1) {
    const pivotX = cursor.f32(); const pivotY = cursor.f32();
    const x = cursor.f32(); const y = cursor.f32();
    let scaleX; let scaleY;
    if (tag === 1 || tag === 8) scaleX = scaleY = cursor.f32();
    const width = cursor.f32(); const height = cursor.f32();
    const atlasId = cursor.u32(); const id = cursor.u32();
    let rotated = false;
    if (tag === 8 || tag === 15) {
      if (cursor.bool()) { cursor.f32(); cursor.f32(); cursor.f32(); cursor.f32(); }
    }
    if (tag === 15) {
      scaleX = cursor.f32(); scaleY = cursor.f32(); rotated = cursor.bool(); cursor.utf();
    }
    elements.set(id, { id, atlasId, x, y, width, height, pivotX, pivotY, scaleX, scaleY, rotated });
  }
  cursor.position = end;
  return { scale, sources, elements };
}

function readObjects(cursor, tag, end) {
  const count = cursor.u32();
  const objects = new Map();
  for (let index = 0; index < count; index += 1) {
    const id = cursor.u32(); const regionId = cursor.u32();
    objects.set(id, { id, regionId, type: tag === 3 ? 0 : cursor.u16() });
  }
  cursor.position = end;
  return objects;
}

function readFrames(cursor, tag, end, frameCount) {
  const recordCount = cursor.u32();
  const frames = [];
  let previous = new Map();
  for (let record = 0; record < recordCount; record += 1) {
    const number = cursor.u32();
    const changes = tag === 4 ? true : cursor.bool();
    const actions = tag === 4 ? false : cursor.bool();
    while (frames.length < number - 1) frames.push([...previous.values()].sort((left, right) => left.zIndex - right.zIndex));
    const current = new Map(previous);
    if (changes) {
      const stateCount = cursor.u32();
      for (let state = 0; state < stateCount; state += 1) {
        const hasColorTransform = cursor.bool();
        const hasMask = cursor.bool();
        const hasEffect = cursor.bool();
        const id = cursor.u32();
        const zIndex = cursor.i32();
        const alpha = cursor.f32();
        const matrix = Array.from({ length: 6 }, () => cursor.f32());
        if (hasColorTransform) for (let value = 0; value < 7; value += 1) cursor.f32();
        if (hasEffect) {
          const filterCount = cursor.i8();
          for (let filter = 0; filter < filterCount; filter += 1) skipFilter(cursor, cursor.u32());
        }
        const maskId = hasMask ? cursor.u32() : null;
        if (alpha) current.set(id, { id, zIndex, alpha, matrix, maskId, hasColorTransform, hasEffect });
        else current.delete(id);
      }
    }
    if (actions) {
      const actionCount = cursor.u32();
      for (let action = 0; action < actionCount; action += 1) {
        cursor.u32(); cursor.utf();
        cursor.position += cursor.u32();
      }
    }
    previous = current;
    frames.push([...current.values()].sort((left, right) => left.zIndex - right.zIndex));
  }
  while (frames.length < frameCount) frames.push([...previous.values()].sort((left, right) => left.zIndex - right.zIndex));
  cursor.position = end;
  return frames;
}

export function parseGafPayload(payload, version) {
  const cursor = new Cursor(payload);
  const scales = Array.from({ length: cursor.u32() }, () => cursor.f32());
  const contentScaleFactors = Array.from({ length: cursor.u32() }, () => cursor.f32());
  const config = { version, scales, contentScaleFactors, stage: null, timeline: null, atlas: null, objects: new Map(), frames: [] };
  let inTimeline = false;
  while (cursor.position + 6 <= payload.length) {
    const tag = cursor.i16();
    const length = cursor.u32();
    const end = cursor.position + length;
    if (tag === 0) {
      if (inTimeline) { inTimeline = false; cursor.position = end; continue; }
      break;
    }
    if (tag === 9) {
      config.stage = { fps: cursor.i8(), color: cursor.i32(), width: cursor.u16(), height: cursor.u16() };
      cursor.position = end;
    } else if (tag === 13) {
      config.timeline = {
        id: cursor.u32(),
        frameCount: cursor.u32(),
        bounds: { x: cursor.f32(), y: cursor.f32(), width: cursor.f32(), height: cursor.f32() },
        pivot: { x: cursor.f32(), y: cursor.f32() },
      };
      if (cursor.bool()) config.timeline.linkage = cursor.utf();
      inTimeline = true;
    } else if ([1, 8, 15].includes(tag)) {
      config.atlas = readAtlas(cursor, tag, end);
    } else if ([3, 10].includes(tag)) {
      config.objects = readObjects(cursor, tag, end);
    } else if ([4, 12].includes(tag)) {
      config.frames = readFrames(cursor, tag, end, config.timeline.frameCount);
    } else {
      cursor.position = end;
    }
  }
  if (!config.stage || !config.timeline || !config.atlas || !config.frames.length) throw new Error("Recovered GAF animation is incomplete.");
  return config;
}

export async function parseGaf(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = header.getUint32(0, true);
  if (![SIGNATURE_GAF, SIGNATURE_GAC].includes(signature)) throw new Error("Recovered menu title has an invalid GAF signature.");
  const version = `${header.getInt8(4)}.${header.getInt8(5)}`;
  const declaredLength = header.getUint32(6, true);
  const payload = signature === SIGNATURE_GAC ? await inflateZlib(bytes.subarray(10)) : bytes.subarray(10);
  if (payload.length !== declaredLength) throw new Error("Recovered menu title has an invalid GAF length.");
  return parseGafPayload(payload, version);
}

export function renderGafFrame(context, config, atlases, frameIndex, contentScaleFactor = 1) {
  const { bounds } = config.timeline;
  const frame = config.frames[Math.max(0, Math.min(config.frames.length - 1, frameIndex))];
  const outputScale = context.canvas.width / bounds.width;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  for (const instance of frame) {
    const object = config.objects.get(instance.id);
    if (!object || object.type !== 0 || instance.maskId !== null) continue;
    const element = config.atlas.elements.get(object.regionId);
    const atlas = atlases[element?.atlasId - 1];
    if (!element || !atlas || element.rotated) continue;
    const [sa, sb, sc, sd, stx, sty] = instance.matrix;
    const pa = 1 / element.scaleX; const pd = 1 / element.scaleY;
    const ptx = -element.pivotX / element.scaleX; const pty = -element.pivotY / element.scaleY;
    const a = pa * sa; const b = pa * sb; const c = pd * sc; const d = pd * sd;
    const tx = ptx * sa + pty * sc + stx;
    const ty = ptx * sb + pty * sd + sty;
    context.setTransform(a * outputScale, b * outputScale, c * outputScale, d * outputScale, (tx - bounds.x) * outputScale, (ty - bounds.y) * outputScale);
    context.globalAlpha = instance.alpha;
    context.drawImage(
      atlas,
      element.x * contentScaleFactor,
      element.y * contentScaleFactor,
      element.width * contentScaleFactor,
      element.height * contentScaleFactor,
      0,
      0,
      element.width,
      element.height,
    );
  }
  context.globalAlpha = 1;
  context.setTransform(1, 0, 0, 1, 0, 0);
}
