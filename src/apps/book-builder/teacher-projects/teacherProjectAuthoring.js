export const TEACHER_PROJECT_SECTIONS = Object.freeze([
  ["overview", "Overview"],
  ["shell", "Shell & Animation"],
  ["chrome", "Window Controls"],
  ["units", "Units"],
  ["editions", "Book Editions"],
  ["toolbar", "Teacher Toolbar"],
  ["assets", "Sounds & Assets"],
  ["build", "Build & Run"],
]);

function assignment(value, label, section, missing) {
  if (!value) missing.push({ label, section });
}

export function teacherShellProgress(shell) {
  const missing = [];
  assignment(shell.background, "Background", "shell", missing);
  assignment(shell.titleAnimation.gaf, "GAF title animation", "shell", missing);
  assignment(shell.titleAnimation.sdAtlases.length ? "assigned" : null, "GAF SD atlas", "shell", missing);
  assignment(shell.titleAnimation.hdAtlases.length ? "assigned" : null, "GAF HD atlas", "shell", missing);
  for (const [id, label] of [["settings", "Settings"], ["minimize", "Minimize"], ["close", "Close"]]) {
    assignment(shell.chrome[id].image, `${label} image`, "chrome", missing);
    assignment(shell.chrome[id].sound, `${label} sound`, "chrome", missing);
  }
  for (const section of ["units", "editions", "toolbar"]) {
    for (const item of shell[section]) {
      assignment(item.normal, `${item.label} normal image`, section, missing);
      assignment(item.active, `${item.label} active image`, section, missing);
      assignment(item.sound, `${item.label} sound`, section, missing);
    }
  }
  const sectionRequired = {
    shell: 4,
    chrome: Object.keys(shell.chrome).length * 2,
    units: shell.units.length * 3,
    editions: shell.editions.length * 3,
    toolbar: shell.toolbar.length * 3,
  };
  const sections = Object.fromEntries(Object.entries(sectionRequired).map(([id, required]) => {
    const missingCount = missing.filter((item) => item.section === id).length;
    return [id, { required, missingCount, configured: required - missingCount, complete: missingCount === 0 }];
  }));
  const requiredCount = Object.values(sectionRequired).reduce((sum, value) => sum + value, 0);
  return {
    complete: missing.length === 0,
    missing,
    missingCount: missing.length,
    requiredCount,
    configuredCount: requiredCount - missing.length,
    sections,
  };
}

export function teacherShellReferences(shell) {
  const entries = [];
  const add = (assetId, label, section, target = null) => { if (assetId) entries.push({ assetId, label, section, target }); };
  add(shell.background, "Background", "shell", "background");
  add(shell.titleAnimation.gaf, "GAF title animation", "shell", "animation.gaf");
  shell.titleAnimation.sdAtlases.forEach((id, index) => add(id, `SD atlas ${index + 1}`, "shell", `animation.sdAtlases.${index}`));
  shell.titleAnimation.hdAtlases.forEach((id, index) => add(id, `HD atlas ${index + 1}`, "shell", `animation.hdAtlases.${index}`));
  for (const [id, item] of Object.entries(shell.chrome)) {
    add(item.image, `${id} image`, "chrome", `chrome.${id}.image`);
    add(item.sound, `${id} sound`, "chrome", `chrome.${id}.sound`);
  }
  for (const section of ["units", "editions", "toolbar"]) for (const item of shell[section]) {
    for (const variant of ["normal", "active", "sound"]) add(item[variant], `${item.label} ${variant}`, section, `${section}.${item.id}.${variant}`);
  }
  return entries;
}

export function teacherAssetUsage(shell) {
  const usage = new Map();
  for (const reference of teacherShellReferences(shell)) {
    const list = usage.get(reference.assetId) || [];
    list.push(reference);
    usage.set(reference.assetId, list);
  }
  return usage;
}

export function assignTeacherTarget(shell, target, assetId) {
  if (target.key === "background") shell.background = assetId;
  else if (target.key === "animation.gaf") shell.titleAnimation.gaf = assetId;
  else if (target.section === "animation") {
    const key = target.variant === "sd" ? "sdAtlases" : "hdAtlases";
    shell.titleAnimation[key][target.index] = assetId;
    shell.titleAnimation[key] = shell.titleAnimation[key].filter(Boolean);
  } else if (target.section === "chrome") shell.chrome[target.slot][target.variant] = assetId;
  else {
    const item = shell[target.section].find((entry) => entry.id === target.slot);
    if (item) item[target.variant] = assetId;
  }
  return shell;
}

export function assignSoundGroup(shell, section, assetId, onlyEmpty) {
  if (section === "chrome") {
    for (const item of Object.values(shell.chrome)) if (!onlyEmpty || !item.sound) item.sound = assetId;
  } else {
    for (const item of shell[section]) if (!onlyEmpty || !item.sound) item.sound = assetId;
  }
  return shell;
}
