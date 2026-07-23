import { validateTeacherContentPack } from "./packValidation.js";

export class BundledTeacherContentPackProvider {
  constructor(pack) {
    this.pack = pack;
  }

  async load() {
    const validation = await validateTeacherContentPack(this.pack);
    if (!validation.valid) {
      const error = new Error(validation.reason || "Content pack unavailable or damaged");
      error.code = "CONTENT_PACK_INVALID";
      throw error;
    }
    return this.pack;
  }
}

export class LocalFilesystemTeacherContentPackProvider {
  async load() {
    const error = new Error("Local content-pack import is not enabled in this MVP.");
    error.code = "CONTENT_PACK_PROVIDER_UNAVAILABLE";
    throw error;
  }
}
