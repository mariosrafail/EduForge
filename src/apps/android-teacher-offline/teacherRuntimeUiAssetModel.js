import { hostedTeacherUiAssetPath, normalizeHostedTeacherUiPreview } from "../../data/ultimate-b2/hostedTeacherUiDocument.js";

export function createTeacherRuntimeUiAssetModel({ authoring, resolveCanonicalAssetUrl, hostedPreview = null }) {
  if (!authoring || typeof resolveCanonicalAssetUrl !== "function") throw new TypeError("Teacher runtime UI asset factory requires canonical authoring and a URL resolver.");
  const overrides = hostedPreview ? normalizeHostedTeacherUiPreview(hostedPreview).assets : {};
  const url = (binding) => overrides[binding.id]
    ? hostedTeacherUiAssetPath(overrides[binding.id])
    : resolveCanonicalAssetUrl(binding);
  const artwork = (item) => Object.freeze({ id: item.id, label: item.label, controlId: item.controlId, destination: item.destination || null, normal: url(item.normal), hoverPressed: url(item.active) });
  const toolbarItems = Object.freeze(authoring.shell.toolbar.map((item) => Object.freeze({
    id: item.id, label: item.label, controlId: item.controlId, normal: url(item.normal), active: url(item.active), sound: url(item.sound),
  })));
  const classroom = Object.freeze({
    backgrounds: Object.freeze({ classroomGlacier: url(authoring.shell.background), studentsBookPartsBackground: url(authoring.shell.studentsBookPartsBackground) }),
    branding: Object.freeze({
      hamiltonHouseLogo: url(authoring.shell.publisherLogo),
      menuTitle: Object.freeze({ gaf: url(authoring.shell.titleAnimation.gaf), sd: Object.freeze(authoring.shell.titleAnimation.sd.map(url)), hd: Object.freeze(authoring.shell.titleAnimation.hd.map(url)) }),
      bookMenu: Object.freeze({
        units: Object.freeze(authoring.shell.units.map(artwork)),
        editions: Object.freeze(authoring.shell.editions.map(artwork)),
        extras: Object.freeze(authoring.shell.extras.map((item) => Object.freeze({ ...artwork(item), column: item.column, order: item.order }))),
      }),
    }),
    controls: Object.freeze({ activityHotspot: url(authoring.shell.activityHotspot) }),
    bookSwitches: Object.freeze(authoring.shell.bookSwitches.map((item) => Object.freeze({ id: item.id, controlId: item.controlId, label: item.label, source: url(item.asset) }))),
    revealControls: Object.freeze(Object.fromEntries(authoring.shell.revealControls.map((item) => [item.id, Object.freeze({ id: item.id, controlId: item.controlId, label: item.label, active: url(item.active), pressed: url(item.pressed), disabled: url(item.disabled) })]))),
    mediaPlayer: Object.freeze({
      background: url(authoring.shell.mediaPlayer.background),
      play: Object.freeze({ active: url(authoring.shell.mediaPlayer.playActive), pressed: url(authoring.shell.mediaPlayer.playPressed) }),
      pause: Object.freeze({ active: url(authoring.shell.mediaPlayer.pauseActive), pressed: url(authoring.shell.mediaPlayer.pausePressed) }),
      stop: Object.freeze({ active: url(authoring.shell.mediaPlayer.stopActive), pressed: url(authoring.shell.mediaPlayer.stopPressed) }),
    }),
    icons: Object.freeze({
      ...Object.fromEntries(Object.entries(authoring.shell.navigation).map(([id, binding]) => [id, url(binding)])),
      teacherTools: Object.freeze(Object.fromEntries([
        ...authoring.shell.toolbar.map((item) => [item.id, Object.freeze({ normal: url(item.normal), active: url(item.active) })]),
        ["keyboard", Object.freeze({ normal: url(authoring.assets["toolbar.keyboard.normal"]), active: url(authoring.assets["toolbar.keyboard.active"]) })],
      ])),
    }),
    sounds: Object.freeze(Object.fromEntries(Object.entries(authoring.shell.sounds).map(([id, binding]) => [id, url(binding)]))),
  });
  return Object.freeze({ classroom, toolbarItems });
}
