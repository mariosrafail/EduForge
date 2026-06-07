export function hexToRgb(hex) {
  const normalized = String(hex || "").trim().replace("#", "");
  if (normalized.length !== 6) return null;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export function relativeLuminance({ r, g, b }) {
  const toLinear = (channel) => {
    const n = channel / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastWithWhite(hexColor) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return 0;
  const l1 = 1;
  const l2 = relativeLuminance(rgb);
  return (l1 + 0.05) / (l2 + 0.05);
}
