import { useCallback, useEffect, useMemo, useState } from "react";
import { createActivity, getCourse, submitLesson, updateActivity, updateCourse, updateLesson } from "../services/courseApi.js";

const unavailableMessage = "Course data could not be loaded from the server.";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LESSON_META_STORAGE_KEY = "hh_lms_lesson_metadata";

function normalizeFeedback(feedback = {}) {
  return {
    ...feedback,
    correct: feedback.correct || "Good job. You chose the correct answer.",
    wrong: feedback.wrong || "Review the item and try again.",
    revision: feedback.revision || feedback.revisionGuidance || "Review the activity before trying again.",
  };
}

function readLessonMetadata() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LESSON_META_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLessonMetadata(lesson = {}) {
  if (typeof window === "undefined" || !lesson.id) return;
  const current = readLessonMetadata();
  current[lesson.id] = {
    estimatedTime: lesson.estimatedTime,
    objectives: Array.isArray(lesson.objectives) ? lesson.objectives : [],
  };
  window.localStorage.setItem(LESSON_META_STORAGE_KEY, JSON.stringify(current));
}

function applyLessonMetadata(course) {
  const metadata = readLessonMetadata();
  const applyToLesson = (lesson) => {
    const saved = metadata[lesson.id];
    return saved ? { ...lesson, ...saved } : lesson;
  };
  const lessons = course.lessons?.map(applyToLesson);
  const activeLesson = course.lesson ? applyToLesson(course.lesson) : lessons?.[0];
  return { ...course, lesson: activeLesson, lessons };
}

function apiActivityPatchToUi(activity, patch = {}) {
  const type = patch.type || activity.type;
  const feedback = normalizeFeedback(patch.feedback || activity.feedback || {});
  const base = {
    ...activity,
    title: patch.title ?? activity.title,
    instruction: patch.instructions ?? activity.instruction,
    skill: patch.skill ?? activity.skill,
    feedback,
    revisionGuidance: feedback.revision,
  };

  if (type === "gap_fill") {
    const prompts = patch.content?.prompts || [];
    const answers = patch.correct_answers?.answers || [];
    return {
      ...base,
      type: "gap-fill",
      wordBank: patch.content?.wordBank || answers.filter(Boolean),
      items: prompts.map((prompt, index) => ({
        id: activity.items?.[index]?.id || `gap-${index + 1}`,
        prompt,
        answer: String(answers[index] ?? ""),
      })),
    };
  }

  if (type === "line_matching") {
    return {
      ...base,
      type: "line-matching",
      leftItems: patch.content?.leftItems || activity.leftItems || [],
      rightItems: patch.content?.rightItems || activity.rightItems || [],
      shuffleRightItems: patch.content?.shuffleRightItems !== false,
      correctPairs: patch.correct_answers || activity.correctPairs || {},
    };
  }

  if (type === "multiple_choice") {
    return {
      ...base,
      type: "multiple-choice",
      questions: (patch.content?.questions || activity.questions || []).map((question) => ({
        ...question,
        answer: patch.correct_answers?.[question.id] || question.answer || "",
      })),
    };
  }

  if (type === "word_search") {
    return {
      ...base,
      type: "word-search",
      words: patch.content?.words || activity.words || [],
      directions: patch.content?.directions || patch.content?.allowedDirections || activity.directions || activity.allowedDirections || ["right", "down"],
      allowedDirections: patch.content?.directions || patch.content?.allowedDirections || activity.allowedDirections || ["right", "down"],
      gridSize: patch.content?.gridSize || activity.gridSize || 12,
      generatedGrid: patch.content?.generatedGrid || activity.generatedGrid || { grid: [] },
    };
  }

  return base;
}

export function useCourseData() {
  const [course, setCourseState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");

  const reloadCourse = useCallback(async () => {
    setLoading(true);
    try {
      const nextCourse = applyLessonMetadata(await getCourse());
      setCourseState(nextCourse);
      setError("");
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      setCourseState(null);
      return null;
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
      setCourseState(applyLessonMetadata(nextCourse));
      setError("");
      setLastSavedAt(new Date().toISOString());
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      throw requestError;
    }
  }, []);

  const saveLesson = useCallback(async (lessonId, patch) => {
    try {
      const nextCourse = await updateLesson(lessonId, patch);
      setCourseState(applyLessonMetadata(nextCourse));
      setError("");
      setLastSavedAt(new Date().toISOString());
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      throw requestError;
    }
  }, []);

  const saveActivity = useCallback(async (activityId, patch) => {
    if (!uuidPattern.test(activityId)) {
      try {
        const nextCourse = await createActivity(course?.lesson?.id, patch);
        setCourseState(applyLessonMetadata(nextCourse));
        setError("");
        setLastSavedAt(new Date().toISOString());
        return nextCourse;
      } catch (requestError) {
        console.warn(requestError);
        setError("Activity save failed. Check your access and database migration, then try again.");
        throw requestError;
      }
    }

    try {
      const nextCourse = await updateActivity(activityId, patch);
      setCourseState(applyLessonMetadata(nextCourse));
      setError("");
      setLastSavedAt(new Date().toISOString());
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError("Activity save failed. Check your access and database migration, then try again.");
      throw requestError;
    }
  }, [course?.lesson?.id]);

  const submitCourseLesson = useCallback(async (payload) => {
    try {
      return await submitLesson(payload);
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      throw requestError;
    }
  }, []);

  const setCourse = useCallback((nextCourseOrUpdater) => {
    setCourseState((current) => {
      const nextCourse = typeof nextCourseOrUpdater === "function" ? nextCourseOrUpdater(current) : nextCourseOrUpdater;
      if (nextCourse?.lesson) writeLessonMetadata(nextCourse.lesson);
      return nextCourse;
    });
  }, []);

  const resetCourse = useCallback(() => {
    setCourseState(null);
    setError("");
    setLastSavedAt("");
  }, []);

  return useMemo(() => ({
    course,
    setCourse,
    resetCourse,
    loading,
    error,
    lastSavedAt,
    reloadCourse,
    saveCourse,
    saveLesson,
    saveActivity,
    submitCourseLesson,
  }), [course, loading, error, lastSavedAt, reloadCourse, saveCourse, saveLesson, saveActivity, submitCourseLesson, setCourse, resetCourse]);
}
