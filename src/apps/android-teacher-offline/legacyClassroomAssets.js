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
  icons: Object.freeze({ back: backIcon, check: checkIcon, home: homeIcon, next: nextIcon, previous: previousIcon }),
  sounds: Object.freeze({ button: buttonSound, correct: correctSound, incorrect: incorrectSound, pageTurn: pageTurnSound }),
});

export function LegacyClassroomIcon({ name, className = "", alt = "" }) {
  const source = legacyClassroomAssets.icons[name];
  return source ? createElement("img", { className: `legacy-classroom-icon ${className}`.trim(), "data-legacy-icon": name, src: source, alt, draggable: "false" }) : null;
}
