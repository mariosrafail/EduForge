const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl8sAAAAASUVORK5CYII=",
  "base64",
);

export const hostedTeacherUiPngFixture = Object.freeze({
  name: "task7-ui.png",
  mimeType: "image/png",
  buffer: onePixelPng,
});

export const invalidHostedTeacherUiPngFixture = Object.freeze({
  name: "invalid-task7-ui.png",
  mimeType: "image/png",
  buffer: Buffer.from("not a raster image", "utf8"),
});
