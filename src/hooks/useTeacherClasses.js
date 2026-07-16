import { useEffect, useMemo, useState } from "react";
import { listTeacherClasses } from "../services/classApi.js";

export function addOrReplaceTeacherClass(classes = [], createdClass) {
  if (!createdClass?.id) return classes;
  return [createdClass, ...classes.filter((classItem) => classItem.id !== createdClass.id)];
}

export function useTeacherClasses(currentUser = null) {
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [classLoadError, setClassLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadClasses() {
      setLoadingClasses(true);

      try {
        const databaseClasses = await listTeacherClasses(currentUser?.id || null);
        if (cancelled) return;
        setClasses(databaseClasses);
        setClassLoadError("");
      } catch (error) {
        console.warn("Teacher classes could not be loaded.", error);
        if (cancelled) return;
        setClasses([]);
        setClassLoadError(error.message || "Classes could not be loaded.");
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
    setClasses((currentClasses) => addOrReplaceTeacherClass(currentClasses, createdClass));
  };

  return {
    classes,
    classOptions,
    loadingClasses,
    classLoadError,
    addCreatedClass,
  };
}
