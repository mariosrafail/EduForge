import { useCallback, useEffect, useMemo, useState } from "react";
import { cloneCourseDemo } from "../data/courseDemoData.js";
import { getCourse, submitLesson, updateActivity, updateCourse, updateLesson } from "../services/courseApi.js";

const unavailableMessage = "Database connection unavailable, using local demo content.";

export function useCourseData() {
  const [course, setCourse] = useState(() => cloneCourseDemo());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");

  const reloadCourse = useCallback(async () => {
    setLoading(true);
    try {
      const nextCourse = await getCourse();
      setCourse(nextCourse);
      setError("");
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      const fallback = cloneCourseDemo();
      setCourse((current) => current || fallback);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadCourse();
  }, [reloadCourse]);

  const saveCourse = useCallback(async (patch) => {
    try {
      const nextCourse = await updateCourse(patch);
      setCourse(nextCourse);
      setError("");
      setLastSavedAt(new Date().toISOString());
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      setCourse((current) => ({ ...current, ...patch }));
      throw requestError;
    }
  }, []);

  const saveLesson = useCallback(async (lessonId, patch) => {
    try {
      const nextCourse = await updateLesson(lessonId, patch);
      setCourse(nextCourse);
      setError("");
      setLastSavedAt(new Date().toISOString());
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      setCourse((current) => ({
        ...current,
        lesson: { ...current.lesson, ...patch },
        lessons: current.lessons?.map((lesson) => (lesson.id === lessonId ? { ...lesson, ...patch } : lesson)),
      }));
      throw requestError;
    }
  }, []);

  const saveActivity = useCallback(async (activityId, patch) => {
    try {
      const nextCourse = await updateActivity(activityId, patch);
      setCourse(nextCourse);
      setError("");
      setLastSavedAt(new Date().toISOString());
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      throw requestError;
    }
  }, []);

  const submitCourseLesson = useCallback(async (payload) => {
    try {
      return await submitLesson(payload);
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      return null;
    }
  }, []);

  return useMemo(() => ({
    course,
    setCourse,
    loading,
    error,
    lastSavedAt,
    reloadCourse,
    saveCourse,
    saveLesson,
    saveActivity,
    submitCourseLesson,
  }), [course, loading, error, lastSavedAt, reloadCourse, saveCourse, saveLesson, saveActivity, submitCourseLesson]);
}
