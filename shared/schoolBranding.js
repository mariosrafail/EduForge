export const ALLOWED_PRIMARY_COLORS = Object.freeze([
  { label: "Deep Orange", value: "#c2410c" },
  { label: "Burnt Orange", value: "#9a3412" },
  { label: "Dark Blue", value: "#1e3a8a" },
  { label: "Navy", value: "#172554" },
  { label: "Deep Purple", value: "#581c87" },
  { label: "Dark Green", value: "#166534" },
  { label: "Emerald Dark", value: "#065f46" },
  { label: "Burgundy", value: "#7f1d1d" },
  { label: "Slate", value: "#334155" },
  { label: "Charcoal", value: "#1f2937" },
]);

export const NEUTRAL_SCHOOL_BRAND = Object.freeze({
  schoolName: "School workspace",
  logo: "EF",
  primary: "#334155",
  secondary: "#0f172a",
});

export const hexColorPattern = /^#[0-9a-f]{6}$/i;

export function normalizeHexColor(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return hexColorPattern.test(normalized) ? normalized : null;
}

export function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const value = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

export function relativeLuminance({ r, g, b }) {
  const toLinear = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastWithWhite(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

export function isApprovedPrimaryColor(value) {
  const normalized = normalizeHexColor(value);
  return Boolean(
    normalized
    && ALLOWED_PRIMARY_COLORS.some((option) => option.value === normalized)
    && contrastWithWhite(normalized) >= 4.5,
  );
}

export function validateSchoolBrand(brand) {
  const schoolName = String(brand?.schoolName ?? "").trim();
  const logo = String(brand?.logo ?? "").trim();
  if (schoolName.length < 2 || schoolName.length > 160) return "School name must be 2-160 characters";
  if (logo.length > 240) return "School logo must be at most 240 characters";
  if (!isApprovedPrimaryColor(brand?.primary)) {
    return "Primary color must use an approved high-contrast palette value";
  }
  if (!normalizeHexColor(brand?.secondary)) return "Secondary color must be a six-digit hexadecimal value";
  return "";
}
