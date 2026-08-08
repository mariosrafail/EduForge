import back from "../../assets/teacher-shell/back.png";
import home from "../../assets/teacher-shell/home.png";
import next from "../../assets/teacher-shell/next.png";
import previous from "../../assets/teacher-shell/previous.png";
import TeacherBookNavigationCore from "../android-teacher-offline/TeacherBookNavigationCore.jsx";

const icons = Object.freeze({ back, home, next, previous });

export default function TeacherProjectNavigation(props) {
  return <TeacherBookNavigationCore {...props} renderIcon={(name) => <img className="legacy-classroom-icon" data-legacy-icon={name} src={icons[name]} alt="" draggable="false" />} />;
}
