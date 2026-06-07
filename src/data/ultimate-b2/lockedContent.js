export function lockedExercise({ id, title, component, unit, lesson, skill = "Practice", type = "Locked demo content", estimatedTime = "8 min" }) {
  return {
    id,
    title,
    component,
    unit,
    lesson,
    skill,
    type,
    estimatedTime,
    assignable: false,
    availableToStudent: false,
    locked: true,
    status: "Locked",
    progressLabel: "Locked for demo",
    studentProgressLabel: "Locked for demo",
    description: "Full publisher content placeholder. This item is visible in the demo package but not active.",
  };
}

export function lockedUnit({ id, title, unit, component, lessons }) {
  return {
    id,
    title,
    unit,
    locked: true,
    lessons: lessons.map((lesson, index) => ({
      id: `${id}-lesson-${index + 1}`,
      title: lesson.title,
      locked: true,
      exercises: [
        lockedExercise({
          id: `${id}-${lesson.slug || `item-${index + 1}`}`,
          title: lesson.exerciseTitle || lesson.title,
          component,
          unit,
          lesson: lesson.title,
          skill: lesson.skill,
          type: lesson.type,
          estimatedTime: lesson.estimatedTime,
        }),
      ],
    })),
  };
}

