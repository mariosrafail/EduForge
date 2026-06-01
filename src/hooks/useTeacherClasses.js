import { useEffect, useMemo, useState } from "react";
import { listTeacherClasses } from "../services/classApi.js";
import { teacherPortalClasses } from "../components/lms/teacher/teacherPortalData.js";

const demoTeacherClasses = teacherPortalClasses.map((classItem) => ({ level: "B2", ...classItem }));

export function useTeacherClasses(currentUser = null) {
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [usingDemoClasses, setUsingDemoClasses] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadClasses() {
      setLoadingClasses(true);

      try {
        const databaseClasses = await listTeacherClasses(currentUser?.id || null);
        if (cancelled) return;
        setClasses(databaseClasses);
        setUsingDemoClasses(false);
      } catch (error) {
        console.warn("Using demo classes because database classes could not be loaded.", error);
        if (cancelled) return;
        setClasses(demoTeacherClasses);
        setUsingDemoClasses(true);
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    }

    loadClasses();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const classOptions = useMemo(() => classes.map((classItem) => classItem.name), [classes]);

  const addCreatedClass = (createdClass) => {
    setClasses((currentClasses) => [createdClass, ...currentClasses.filter((classItem) => classItem.id !== createdClass.id)]);
    setUsingDemoClasses(false);
  };

  return {
    classes,
    classOptions,
    loadingClasses,
    usingDemoClasses,
    addCreatedClass,
  };
}
