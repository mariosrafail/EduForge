const offlineError = () => {
  const error = new Error("Server-backed book services are disabled in Android offline mode.");
  error.offline = true;
  return error;
};

export async function listBookActivities() {
  return [];
}

export async function getBookActivity() {
  throw offlineError();
}

export async function scoreBookActivity() {
  throw offlineError();
}

export async function createBookActivity() {
  throw offlineError();
}

export async function createBookMediaAsset() {
  throw offlineError();
}

export async function listBookPageHotspots() {
  return [];
}

export async function saveBookPageHotspots() {
  return [];
}
