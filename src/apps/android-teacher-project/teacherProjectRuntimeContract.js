export const TEACHER_PROJECT_CONTROL_IDS = Object.freeze({
  chrome: Object.freeze({ settings: "chrome:settings", minimize: "chrome:minimize", close: "chrome:close" }),
  unit: (id) => `unit:${id}`,
  edition: (id) => `edition:${id}`,
  toolbar: (id) => `toolbar:${id}`,
});

export function materializeTeacherProjectRuntime(project, resolveAsset) {
  const asset = (assetId) => assetId ? resolveAsset(assetId, project.assets[assetId]) : null;
  const visual = (item, controlId) => ({
    ...item,
    normal: asset(item.normal),
    active: asset(item.active),
    sound: asset(item.sound),
    controlId,
  });
  const chrome = Object.fromEntries(Object.entries(project.shell.chrome).map(([id, item]) => [id, {
    image: asset(item.image),
    sound: asset(item.sound),
    controlId: TEACHER_PROJECT_CONTROL_IDS.chrome[id],
  }]));
  const runtime = {
    schemaVersion: project.schemaVersion,
    projectId: project.projectId,
    displayName: project.displayName,
    revision: project.revision,
    background: asset(project.shell.background),
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
            leftImage: asset(entry.leftImage),
            rightImage: asset(entry.rightImage),
          } : {
            id: entry.id,
            sectionTitle: entry.sectionTitle,
            pageLabel: entry.pageLabel,
            layout: entry.layout,
            image: asset(entry.image),
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
