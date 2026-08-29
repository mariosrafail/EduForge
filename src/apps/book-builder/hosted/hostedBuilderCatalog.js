import { ultimateB2HostedBook } from "./catalog/ultimateB2HostedBook.js";
import { bookProductCatalog } from "../../../data/bookProductCatalog.js";

const identityPattern = /^[a-z0-9][a-z0-9-]{1,79}$/;

export function createHostedBuilderCatalog(books) {
  const bookIds = new Set();
  const componentIds = new Set();
  for (const book of books) {
    if (!identityPattern.test(book.slug) || bookIds.has(book.slug)) throw new Error(`Invalid or duplicate hosted Builder book: ${book.slug}`);
    bookIds.add(book.slug);
    for (const component of book.components || []) {
      const identity = `${book.slug}/${component.slug}`;
      if (!identityPattern.test(component.slug) || componentIds.has(identity)) throw new Error(`Invalid or duplicate hosted Builder component: ${identity}`);
      componentIds.add(identity);
    }
    const packageToolIds = new Set();
    for (const tool of book.packageTools || []) {
      if (!identityPattern.test(tool.id) || packageToolIds.has(tool.id)) throw new Error(`Invalid or duplicate hosted Builder package tool: ${book.slug}/${tool.id}`);
      packageToolIds.add(tool.id);
    }
  }
  return Object.freeze(books.map((book) => Object.freeze(book)));
}

const hostedBooksBySlug = new Map([[ultimateB2HostedBook.slug, ultimateB2HostedBook]]);

export const hostedBuilderCatalog = createHostedBuilderCatalog(bookProductCatalog.map((book) => (
  hostedBooksBySlug.get(book.slug) || {
    ...book,
    status: "Registered — content pending",
    cover: null,
    components: book.components.map((component) => ({
      ...component,
      status: "Content and authoring adapter pending",
      cover: null,
      adapterId: component.authoringAdapterId,
    })),
  }
)));

export function findHostedBuilderBook(bookSlug) {
  return hostedBuilderCatalog.find((book) => book.slug === bookSlug) || null;
}

export function findHostedBuilderComponent(book, componentSlug) {
  return book?.components?.find((component) => component.slug === componentSlug) || null;
}
