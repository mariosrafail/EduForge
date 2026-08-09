export const TEACHER_PROJECT_CONTROL_IDS = Object.freeze({
  chrome: Object.freeze({ settings: "chrome:settings", minimize: "chrome:minimize", close: "chrome:close" }),
  unit: (id) => `unit:${id}`,
  edition: (id) => `edition:${id}`,
  toolbar: (id) => `toolbar:${id}`,
});

const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="60" viewBox="0 0 96 60"><rect width="96" height="60" rx="6" fill="#8b9298"/><path d="M12 12h72v36H12z" fill="none" stroke="#aeb4b9" stroke-width="2"/></svg>`;

export const TEACHER_PROJECT_PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(placeholderSvg)}`;

export function materializeTeacherProjectRuntime(project, resolveAsset) {
  const asset = (assetId) => assetId ? resolveAsset(assetId, project.assets[assetId]) : null;
  const image = (assetId) => asset(assetId) || TEACHER_PROJECT_PLACEHOLDER_IMAGE;
  const visual = (item, controlId) => ({
    ...item,
    normal: image(item.normal),
    active: image(item.active),
    sound: asset(item.sound),
    controlId,
  });
  const chrome = Object.fromEntries(Object.entries(project.shell.chrome).map(([id, item]) => [id, {
    image: image(item.image),
    sound: asset(item.sound),
    controlId: TEACHER_PROJECT_CONTROL_IDS.chrome[id],
  }]));
  const runtime = {
    schemaVersion: project.schemaVersion,
    projectId: project.projectId,
    displayName: project.displayName,
    revision: project.revision,
    background: image(project.shell.background),
    titleAnimation: {
      gaf: asset(project.shell.titleAnimation.gaf),
      sdAtlases: project.shell.titleAnimation.sdAtlases.map(asset),
      hdAtlases: project.shell.titleAnimation.hdAtlases.map(asset),
      accessibleLabel: project.displayName,
    },
    chrome,
    units: project.shell.units.map((item) => visual(item, TEACHER_PROJECT_CONTROL_IDS.unit(item.id))),
    editions: project.shell.editions.map((item) => visual(item, TEACHER_PROJECT_CONTROL_IDS.edition(item.id))),
    toolbar: project.shell.toolbar.map((item) => visual(item, TEACHER_PROJECT_CONTROL_IDS.toolbar(item.id))),
    content: {
      studentsBook: {
        units: project.content.studentsBook.units.map((unit) => ({
          id: unit.id,
          entries: unit.entries.map((entry) => entry.layout === "double-pair" ? {
            id: entry.id,
            sectionTitle: entry.sectionTitle,
            pageLabel: entry.pageLabel,
            layout: entry.layout,
            leftImage: image(entry.leftImage),
            rightImage: image(entry.rightImage),
          } : {
            id: entry.id,
            sectionTitle: entry.sectionTitle,
            pageLabel: entry.pageLabel,
            layout: entry.layout,
            image: image(entry.image),
          }),
        })),
      },
    },
  };
  runtime.soundMap = Object.fromEntries([
    ...Object.values(runtime.chrome).map((item) => [item.controlId, item.sound]),
    ...runtime.units.map((item) => [item.controlId, item.sound]),
    ...runtime.editions.map((item) => [item.controlId, item.sound]),
    ...runtime.toolbar.map((item) => [item.controlId, item.sound]),
  ].filter(([, source]) => source));
  return runtime;
}
