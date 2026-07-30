const endpoint = "/.netlify/functions/school-profile";

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function toBrand(school) {
  return {
    schoolName: school.name,
    logo: school.logo || "",
    primary: school.primaryColor,
    secondary: school.secondaryColor,
  };
}

async function request(options = {}) {
  const response = await fetch(endpoint, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", ...options.headers },
    ...options,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(payload.error || `School profile request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return { ...payload, brand: toBrand(payload.school) };
}

export function getSchoolProfile({ signal } = {}) {
  return request({ signal });
}

export function updateSchoolProfile(updates, { signal } = {}) {
  const body = {};
  if (Object.hasOwn(updates, "schoolName")) body.name = updates.schoolName;
  if (Object.hasOwn(updates, "logo")) body.logo = updates.logo;
  if (Object.hasOwn(updates, "primary")) body.primaryColor = updates.primary;
  if (Object.hasOwn(updates, "secondary")) body.secondaryColor = updates.secondary;
  return request({
    method: "PATCH",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
