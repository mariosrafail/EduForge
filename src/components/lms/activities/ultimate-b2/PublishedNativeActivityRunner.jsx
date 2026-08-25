import { PublishedNativeStudentActivityRunner } from "./PublishedNativeStudentActivityRunner.jsx";
import { PublishedNativeTeacherActivityRunner } from "./PublishedNativeTeacherActivityRunner.jsx";

export function PublishedNativeActivityRunner({ teacherMode = false, ...props }) {
  return teacherMode
    ? <PublishedNativeTeacherActivityRunner {...props} />
    : <PublishedNativeStudentActivityRunner {...props} />;
}
