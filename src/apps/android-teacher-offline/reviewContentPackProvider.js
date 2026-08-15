import { validateReviewContentPack } from "./reviewPackValidation.js";

export class BundledReviewContentPackProvider {
  constructor(pack, policy) {
    this.pack = pack;
    this.policy = policy;
  }

  async load() {
    const validation = await validateReviewContentPack(this.pack, this.policy);
    if (!validation.valid) {
      const error = new Error(validation.reason || "Content pack unavailable or damaged");
      error.code = "CONTENT_PACK_INVALID";
      throw error;
    }
    return this.pack;
  }
}
