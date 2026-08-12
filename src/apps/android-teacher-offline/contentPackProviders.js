import { validateReviewContentPack, validateTeacherContentPack } from "./packValidation.js";

class BundledContentPackProvider {
  constructor(pack, validate) {
    this.pack = pack;
    this.validate = validate;
  }

  async load() {
    const validation = await this.validate(this.pack);
    if (!validation.valid) {
      const error = new Error(validation.reason || "Content pack unavailable or damaged");
      error.code = "CONTENT_PACK_INVALID";
      throw error;
    }
    return this.pack;
  }
}

export class BundledTeacherContentPackProvider extends BundledContentPackProvider {
  constructor(pack) {
    super(pack, validateTeacherContentPack);
  }
}

export class BundledReviewContentPackProvider extends BundledContentPackProvider {
  constructor(pack) {
    super(pack, validateReviewContentPack);
  }
}

export class LocalFilesystemTeacherContentPackProvider {
  async load() {
    const error = new Error("Local content-pack import is not enabled in this MVP.");
    error.code = "CONTENT_PACK_PROVIDER_UNAVAILABLE";
    throw error;
  }
}
