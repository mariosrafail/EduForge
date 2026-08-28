import { createBuilderPublicationHandler } from "../server/_builder-publication.js";
import { createBuilderProductPublicationHandler, parseBuilderProductPublicationRoute } from "../server/_builder-product-publication.js";

export function createBuilderPublicationFunction({
  componentHandler = createBuilderPublicationHandler(),
  productHandler = createBuilderProductPublicationHandler(),
} = {}) {
  return (event, context) => parseBuilderProductPublicationRoute(event)
    ? productHandler(event, context)
    : componentHandler(event, context);
}

export const handler = createBuilderPublicationFunction();
