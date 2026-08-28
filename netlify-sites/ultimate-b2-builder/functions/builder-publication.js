import { createBuilderPublicationHandler } from "../server/_builder-publication.js";
import { createBuilderProductPublicationHandler, parseBuilderProductPublicationRoute } from "../server/_builder-product-publication.js";

const componentHandler = createBuilderPublicationHandler();
const productHandler = createBuilderProductPublicationHandler();

export const handler = (event, context) => parseBuilderProductPublicationRoute(event)
  ? productHandler(event, context)
  : componentHandler(event, context);
