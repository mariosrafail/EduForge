import classroomGlacier from "../../assets/books/ultimate-b2/legacy-classroom-ui/backgrounds/classroom-glacier.png";
import hamiltonHouseLogo from "../../assets/books/ultimate-b2/legacy-classroom-ui/branding/hamilton-house-logo.png";
import menuTitleGaf from "../../assets/books/ultimate-b2/legacy-classroom-ui/branding/menu-title-animation/logo.gaf?url";
import menuTitleAtlasSd1 from "../../assets/books/ultimate-b2/legacy-classroom-ui/branding/menu-title-animation/logo_SD.png";
import menuTitleAtlasHd1 from "../../assets/books/ultimate-b2/legacy-classroom-ui/branding/menu-title-animation/logo_HD.png";
import menuTitleAtlasSd2 from "../../assets/books/ultimate-b2/legacy-classroom-ui/branding/menu-title-animation/logo_SD_2.png";
import menuTitleAtlasHd2 from "../../assets/books/ultimate-b2/legacy-classroom-ui/branding/menu-title-animation/logo_HD_2.png";
import activityHotspot from "../../assets/books/ultimate-b2/legacy-classroom-ui/controls/activity-hotspot.png";
import backIcon from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/back.png";
import checkIcon from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/check.png";
import homeIcon from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/home.png";
import nextIcon from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/next.png";
import previousIcon from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/previous.png";
import closeIcon from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/dialogs/exit-btn-enabled.png";
import settingsIcon from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/navigation/navibar-settings-active.png";
import clearTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-clear.png";
import clearToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-clear-active.png";
import eraserTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-eraser.png";
import eraserToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-eraser-active.png";
import hideTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-hide.png";
import hideToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-hide-active.png";
import keyboardTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-keyboard.png";
import keyboardToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-keyboard-active.png";
import pencilTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-pencil.png";
import pencilToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-pencil-active.png";
import printTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-print.png";
import printToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-print-active.png";
import redoTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-redo.png";
import redoToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-redo-active.png";
import scoreTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-score.png";
import scoreToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-score-active.png";
import showTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-show.png";
import showToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-show-active.png";
import textTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-text.png";
import textToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-text-active.png";
import timerTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-timer.png";
import timerToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-timer-active.png";
import undoTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-undo.png";
import undoToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-undo-active.png";
import zoomTool from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-zoom.png";
import zoomToolActive from "../../assets/books/ultimate-b2/legacy-classroom-ui/icons/teacher-tools/button-zoom-active.png";
import buttonSound from "../../assets/books/ultimate-b2/legacy-classroom-ui/audio/ui/button.mp3";
import correctSound from "../../assets/books/ultimate-b2/legacy-classroom-ui/audio/ui/correct.mp3";
import incorrectSound from "../../assets/books/ultimate-b2/legacy-classroom-ui/audio/ui/incorrect.mp3";
import pageTurnSound from "../../assets/books/ultimate-b2/legacy-classroom-ui/audio/ui/page-turn.mp3";
import { createElement } from "react";

export const legacyClassroomAssets = Object.freeze({
  backgrounds: Object.freeze({ classroomGlacier }),
  branding: Object.freeze({
    hamiltonHouseLogo,
    menuTitle: Object.freeze({
      gaf: menuTitleGaf,
      sd: Object.freeze([menuTitleAtlasSd1, menuTitleAtlasSd2]),
      hd: Object.freeze([menuTitleAtlasHd1, menuTitleAtlasHd2]),
    }),
  }),
  controls: Object.freeze({ activityHotspot }),
  icons: Object.freeze({
    back: backIcon, check: checkIcon, close: closeIcon, home: homeIcon, next: nextIcon, previous: previousIcon, settings: settingsIcon,
    teacherTools: Object.freeze({
      clear: Object.freeze({ normal: clearTool, active: clearToolActive }),
      eraser: Object.freeze({ normal: eraserTool, active: eraserToolActive }),
      hide: Object.freeze({ normal: hideTool, active: hideToolActive }),
      keyboard: Object.freeze({ normal: keyboardTool, active: keyboardToolActive }),
      pencil: Object.freeze({ normal: pencilTool, active: pencilToolActive }),
      print: Object.freeze({ normal: printTool, active: printToolActive }),
      redo: Object.freeze({ normal: redoTool, active: redoToolActive }),
      score: Object.freeze({ normal: scoreTool, active: scoreToolActive }),
      show: Object.freeze({ normal: showTool, active: showToolActive }),
      text: Object.freeze({ normal: textTool, active: textToolActive }),
      timer: Object.freeze({ normal: timerTool, active: timerToolActive }),
      undo: Object.freeze({ normal: undoTool, active: undoToolActive }),
      zoom: Object.freeze({ normal: zoomTool, active: zoomToolActive }),
    }),
  }),
  sounds: Object.freeze({ button: buttonSound, correct: correctSound, incorrect: incorrectSound, pageTurn: pageTurnSound }),
});

export function LegacyClassroomIcon({ name, className = "", alt = "" }) {
  const source = legacyClassroomAssets.icons[name];
  return source ? createElement("img", { className: `legacy-classroom-icon ${className}`.trim(), "data-legacy-icon": name, src: source, alt, draggable: "false" }) : null;
}
