import { createElement } from "react";

import { ultimateB2TeacherAppAuthoring } from "../../data/ultimate-b2/teacherAppAuthoring.js";
import { resolveUltimateB2AuthoredAssetUrl } from "../../data/ultimate-b2/ultimateB2AuthoredAssetUrls.js";

const authored = ultimateB2TeacherAppAuthoring;
const url = (binding) => resolveUltimateB2AuthoredAssetUrl(binding);
const artwork = (item) => Object.freeze({ id: item.id, label: item.label, controlId: item.controlId, destination: item.destination || null, normal: url(item.normal), hoverPressed: url(item.active) });
const toolbarItems = authored.shell.toolbar.map((item) => Object.freeze({
  id: item.id,
  label: item.label,
  controlId: item.controlId,
  normal: url(item.normal),
  active: url(item.active),
  sound: url(item.sound),
}));

export const ultimateB2TeacherToolbarItems = Object.freeze(toolbarItems);

export const legacyClassroomAssets = Object.freeze({
  backgrounds: Object.freeze({
    classroomGlacier: url(authored.shell.background),
    studentsBookPartsBackground: url(authored.shell.studentsBookPartsBackground),
  }),
  branding: Object.freeze({
    hamiltonHouseLogo: url(authored.shell.publisherLogo),
    menuTitle: Object.freeze({
      gaf: url(authored.shell.titleAnimation.gaf),
      sd: Object.freeze(authored.shell.titleAnimation.sd.map(url)),
      hd: Object.freeze(authored.shell.titleAnimation.hd.map(url)),
    }),
    bookMenu: Object.freeze({
      units: Object.freeze(authored.shell.units.map(artwork)),
      editions: Object.freeze(authored.shell.editions.map(artwork)),
      extras: Object.freeze(authored.shell.extras.map((item) => Object.freeze({ ...artwork(item), column: item.column, order: item.order }))),
    }),
  }),
  controls: Object.freeze({ activityHotspot: url(authored.shell.activityHotspot) }),
  bookSwitches: Object.freeze(authored.shell.bookSwitches.map((item) => Object.freeze({
    id: item.id,
    controlId: item.controlId,
    label: item.label,
    source: url(item.asset),
  }))),
  revealControls: Object.freeze(Object.fromEntries(authored.shell.revealControls.map((item) => [item.id, Object.freeze({
    id: item.id,
    controlId: item.controlId,
    label: item.label,
    active: url(item.active),
    pressed: url(item.pressed),
    disabled: url(item.disabled),
  })]))),
  mediaPlayer: Object.freeze({
    background: url(authored.shell.mediaPlayer.background),
    play: Object.freeze({ active: url(authored.shell.mediaPlayer.playActive), pressed: url(authored.shell.mediaPlayer.playPressed) }),
    pause: Object.freeze({ active: url(authored.shell.mediaPlayer.pauseActive), pressed: url(authored.shell.mediaPlayer.pausePressed) }),
    stop: Object.freeze({ active: url(authored.shell.mediaPlayer.stopActive), pressed: url(authored.shell.mediaPlayer.stopPressed) }),
  }),
  icons: Object.freeze({
    ...Object.fromEntries(Object.entries(authored.shell.navigation).map(([id, binding]) => [id, url(binding)])),
    teacherTools: Object.freeze(Object.fromEntries([
      ...authored.shell.toolbar.map((item) => [item.id, Object.freeze({ normal: url(item.normal), active: url(item.active) })]),
      ["keyboard", Object.freeze({ normal: url(authored.assets["toolbar.keyboard.normal"]), active: url(authored.assets["toolbar.keyboard.active"]) })],
    ])),
  }),
  sounds: Object.freeze(Object.fromEntries(Object.entries(authored.shell.sounds).map(([id, binding]) => [id, url(binding)]))),
});

export function LegacyClassroomIcon({ name, className = "", alt = "" }) {
  const source = legacyClassroomAssets.icons[name];
  return source ? createElement("img", { className: `legacy-classroom-icon ${className}`.trim(), "data-legacy-icon": name, src: source, alt, draggable: "false" }) : null;
}
