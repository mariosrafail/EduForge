import { findProductBook } from "../../../../data/bookProductCatalog.js";

const packageTool = (bookSlug, id, title, description, status) => Object.freeze({
  id,
  title,
  description,
  status,
  adapterId: `${bookSlug}-${id === "ui" ? "page-ui" : id}`,
});

export function createManagedHostedBook(bookSlug) {
  const product = findProductBook(bookSlug);
  if (!product) throw new Error(`Unknown managed hosted Builder book: ${bookSlug}`);
  const studentsBookSlug = `${bookSlug}-students-book`;
  return Object.freeze({
    ...product,
    status: "In authoring",
    cover: null,
    review: Object.freeze({ defaultComponentSlug: studentsBookSlug }),
    packageTools: Object.freeze([
      packageTool(bookSlug, "ui", "Page UI Controller", `Controls shared ${product.title} Teacher graphics across all package components.`, "Editable"),
      packageTool(bookSlug, "sounds", "Sound Controller", `Inventories shared ${product.title} interface sounds and their effective source.`, "Read-only"),
    ]),
    components: Object.freeze(product.components.map((component) => Object.freeze({
      ...component,
      status: component.authoringState === "active" ? "In authoring" : "Authoring adapter pending",
      cover: null,
      adapterId: component.authoringAdapterId,
    }))),
  });
}
