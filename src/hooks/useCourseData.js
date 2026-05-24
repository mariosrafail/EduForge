import { useCallback, useEffect, useMemo, useState } from "react";
import { cloneCourseDemo } from "../data/courseDemoData.js";
import { getCourse, submitLesson, updateActivity, updateCourse, updateLesson } from "../services/courseApi.js";

const unavailableMessage = "Database connection unavailable, using local demo content.";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeFeedback(feedback = {}) {
  return {
    ...feedback,
    correct: feedback.correct || "Good job. You chose the correct answer.",
    wrong: feedback.wrong || "Review the item and try again.",
    revision: feedback.revision || feedback.revisionGuidance || "Review the activity before trying again.",
  };
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
    const saveLocalActivity = () => {
      const savedAt = new Date().toISOString();
      let nextCourse = null;
      setCourse((current) => {
        nextCourse = {
          ...current,
          lesson: {
            ...current.lesson,
            activities: current.lesson.activities.map((activity) => (
              activity.id === activityId ? apiActivityPatchToUi(activity, patch) : activity
            )),
          },
        };
        return nextCourse;
      });
      setLastSavedAt(savedAt);
      return nextCourse;
    };

    if (!uuidPattern.test(activityId)) {
      setError(unavailableMessage);
      return saveLocalActivity();
    }

    try {
      const nextCourse = await updateActivity(activityId, patch);
      setCourse(nextCourse);
      setError("");
      setLastSavedAt(new Date().toISOString());
      return nextCourse;
    } catch (requestError) {
      console.warn(requestError);
      setError(unavailableMessage);
      return saveLocalActivity();
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
