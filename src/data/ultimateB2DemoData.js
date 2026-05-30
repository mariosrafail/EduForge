function lockedExercise({ id, title, component, unit, lesson, skill = "Practice", type = "Locked demo content", estimatedTime = "8 min" }) {
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

function lockedUnit({ id, title, unit, component, lessons }) {
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

export const ultimateB2Package = {
  packageTitle: "Ultimate B2",
  packageLabel: "Ultimate B2 package",
  level: "B2",
  publisher: "Hamilton House",
  demoSchool: "Hamilton House ELT Demo",
  activationCodeExample: "ULT-B2-DEMO-2026",
  classes: ["Ultimate B2 A", "Ultimate B2 B", "Ultimate B2 Exam Prep"],
  components: [
    {
      id: "students-book",
      title: "Ultimate B2 Students Book",
      subtitle: "Core classroom lessons and reading practice",
      type: "Students Book",
      coverTone: "orange",
      units: [
        lockedUnit({
          id: "sb-unit-1",
          title: "Unit 1 People and Places",
          unit: "Unit 1",
          component: "Students Book",
          lessons: [
            { title: "Vocabulary", slug: "vocabulary", skill: "Vocabulary", type: "Word building" },
            { title: "Reading", slug: "reading", skill: "Reading", type: "Comprehension" },
            { title: "Grammar", slug: "grammar", skill: "Grammar", type: "Practice" },
          ],
        }),
        {
          id: "sb-unit-2",
          title: "Unit 2 Reading",
          unit: "Unit 2",
          lessons: [
            {
              id: "sb-u2-reading",
              title: "Unit 2 Reading",
              exercises: [
                {
                  id: "sb-u2-reading-video-intro",
                  title: "Video intro",
                  component: "Students Book",
                  unit: "Unit 2",
                  lesson: "Reading",
                  skill: "Reading",
                  type: "Video",
                  estimatedTime: "4 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Available",
                  progressLabel: "Assigned to 1 class",
                  studentProgressLabel: "Available",
                  demoActivityKey: "video-intro",
                  description: "Introduce the Unit 2 reading topic before the exercises.",
                },
                {
                  id: "sb-u2-reading-ex3",
                  title: "Exercise 3",
                  component: "Students Book",
                  unit: "Unit 2",
                  lesson: "Reading",
                  skill: "Reading",
                  type: "Multiple choice",
                  estimatedTime: "8 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Assigned",
                  progressLabel: "14/18 submitted",
                  studentProgressLabel: "Assigned",
                  demoActivityKey: "reading-ex3",
                  description: "Check comprehension of the Unit 2 reading text.",
                },
                {
                  id: "sb-u2-reading-ex4",
                  title: "Exercise 4",
                  component: "Students Book",
                  unit: "Unit 2",
                  lesson: "Reading",
                  skill: "Reading",
                  type: "Matching",
                  estimatedTime: "10 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Completed",
                  progressLabel: "Avg. score 76%",
                  studentProgressLabel: "Teacher feedback ready",
                  demoActivityKey: "reading-ex4",
                  description: "Match reading questions with evidence-based strategies.",
                },
              ],
            },
          ],
        },
        lockedUnit({
          id: "sb-unit-3",
          title: "Unit 3 Making Choices",
          unit: "Unit 3",
          component: "Students Book",
          lessons: [
            { title: "Reading", slug: "reading", skill: "Reading", type: "Multiple choice" },
            { title: "Listening", slug: "listening", skill: "Listening", type: "Listening task" },
            { title: "Speaking", slug: "speaking", skill: "Speaking", type: "Pair work" },
          ],
        }),
        lockedUnit({
          id: "sb-unit-4",
          title: "Unit 4 The Natural World",
          unit: "Unit 4",
          component: "Students Book",
          lessons: [
            { title: "Vocabulary", slug: "vocabulary", skill: "Vocabulary", type: "Topic vocabulary" },
            { title: "Reading", slug: "reading", skill: "Reading", type: "Gapped text" },
            { title: "Writing", slug: "writing", skill: "Writing", type: "Essay planning" },
          ],
        }),
        lockedUnit({
          id: "sb-unit-5",
          title: "Unit 5 Review",
          unit: "Unit 5",
          component: "Students Book",
          lessons: [
            { title: "Progress review", slug: "review", skill: "Review", type: "Mixed practice" },
            { title: "Exam skills", slug: "exam-skills", skill: "Exam skills", type: "Strategy check" },
          ],
        }),
      ],
    },
    {
      id: "workbook",
      title: "Ultimate B2 Workbook",
      subtitle: "Extra listening and consolidation practice",
      type: "Workbook",
      coverTone: "blue",
      units: [
        lockedUnit({
          id: "wb-unit-1",
          title: "Unit 1 Consolidation",
          unit: "Unit 1",
          component: "Workbook",
          lessons: [
            { title: "Vocabulary practice", slug: "vocabulary", skill: "Vocabulary", type: "Practice" },
            { title: "Grammar practice", slug: "grammar", skill: "Grammar", type: "Gap fill" },
          ],
        }),
        {
          id: "wb-unit-2",
          title: "Unit 2 Listening",
          unit: "Unit 2",
          lessons: [
            {
              id: "wb-u2-listening",
              title: "Unit 2 Listening",
              exercises: [
                {
                  id: "wb-u2-listening-page-20",
                  title: "Workbook page 20",
                  component: "Workbook",
                  unit: "Unit 2",
                  lesson: "Listening",
                  skill: "Listening",
                  type: "Typed gap-fill",
                  estimatedTime: "10 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Assigned",
                  progressLabel: "14/21 submitted",
                  studentProgressLabel: "Assigned",
                  demoActivityKey: "listening-page-20",
                  description: "Listen to a guided tour of the River Thames and complete the sentence gaps.",
                },
              ],
            },
          ],
        },
        lockedUnit({
          id: "wb-unit-3",
          title: "Unit 3 Consolidation",
          unit: "Unit 3",
          component: "Workbook",
          lessons: [
            { title: "Reading practice", slug: "reading", skill: "Reading", type: "Short answers" },
            { title: "Writing practice", slug: "writing", skill: "Writing", type: "Paragraph writing" },
          ],
        }),
        lockedUnit({
          id: "wb-unit-4",
          title: "Unit 4 Consolidation",
          unit: "Unit 4",
          component: "Workbook",
          lessons: [
            { title: "Listening practice", slug: "listening", skill: "Listening", type: "Multiple choice" },
            { title: "Use of English", slug: "use-of-english", skill: "Use of English", type: "Transformation" },
          ],
        }),
      ],
    },
    {
      id: "grammar-book",
      title: "Ultimate B2 Grammar Book",
      subtitle: "Grammar explanations and controlled practice",
      type: "Grammar Book",
      coverTone: "green",
      units: [
        lockedUnit({
          id: "gb-unit-1",
          title: "Unit 1 Tenses Review",
          unit: "Unit 1",
          component: "Grammar Book",
          lessons: [
            { title: "Opening exercise", slug: "opening", skill: "Grammar", type: "Gap fill" },
            { title: "Exercise 4", slug: "exercise-4", skill: "Grammar", type: "Sentence transformation" },
          ],
        }),
        {
          id: "gb-unit-2",
          title: "Unit 2 Grammar",
          unit: "Unit 2",
          lessons: [
            {
              id: "gb-u2-grammar",
              title: "Unit 2 Grammar",
              exercises: [
                {
                  id: "gb-u2-grammar-opening",
                  title: "Opening exercise",
                  component: "Grammar Book",
                  unit: "Unit 2",
                  lesson: "Grammar",
                  skill: "Grammar",
                  type: "Gap fill",
                  estimatedTime: "7 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Available",
                  progressLabel: "Assigned to 2 classes",
                  studentProgressLabel: "Available",
                  demoActivityKey: "grammar-opening",
                  description: "Warm up the Unit 2 grammar point with controlled items.",
                },
                {
                  id: "gb-u2-grammar-ex4",
                  title: "Join the sentences",
                  component: "Grammar Book",
                  unit: "Unit 2",
                  lesson: "Grammar",
                  skill: "Grammar",
                  type: "Sentence joining",
                  estimatedTime: "12 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Assigned",
                  progressLabel: "Avg. score 72%",
                  studentProgressLabel: "Assigned",
                  demoActivityKey: "grammar-ex4",
                  description: "Join sentence pairs using past simple, past continuous and the connector in bold.",
                },
              ],
            },
          ],
        },
        lockedUnit({
          id: "gb-unit-3",
          title: "Unit 3 Modals and Meaning",
          unit: "Unit 3",
          component: "Grammar Book",
          lessons: [
            { title: "Rules and examples", slug: "rules", skill: "Grammar", type: "Grammar rules" },
            { title: "Controlled practice", slug: "practice", skill: "Grammar", type: "Practice" },
          ],
        }),
        lockedUnit({
          id: "gb-unit-4",
          title: "Unit 4 Clauses",
          unit: "Unit 4",
          component: "Grammar Book",
          lessons: [
            { title: "Opening exercise", slug: "opening", skill: "Grammar", type: "Gap fill" },
            { title: "Exam practice", slug: "exam-practice", skill: "Grammar", type: "Transformation" },
          ],
        }),
      ],
    },
    {
      id: "test-book",
      title: "Ultimate B2 Test Book",
      subtitle: "Timed quizzes and exam-style checks",
      type: "Test Book",
      coverTone: "slate",
      units: [
        lockedUnit({
          id: "tb-quiz-1",
          title: "Quiz 1",
          unit: "Quiz 1",
          component: "Test Book",
          lessons: [
            { title: "Timed test", slug: "timed-test", exerciseTitle: "Quiz 1 timed test", skill: "Test", type: "Timed test", estimatedTime: "20 min" },
          ],
        }),
        {
          id: "tb-quiz-2",
          title: "Quiz 2",
          unit: "Quiz 2",
          lessons: [
            {
              id: "tb-quiz-2-test",
              title: "Quiz 2",
              exercises: [
                {
                  id: "tb-quiz-2-timed-test",
                  title: "Timed test, 20 minutes",
                  component: "Test Book",
                  unit: "Quiz 2",
                  lesson: "Test",
                  skill: "Test",
                  type: "Timed test",
                  estimatedTime: "20 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Assigned",
                  progressLabel: "11/16 submitted",
                  studentProgressLabel: "Assigned",
                  demoActivityKey: "quiz-2",
                  description: "Complete a 20-minute timed Unit 2 progress check.",
                },
              ],
            },
          ],
        },
        lockedUnit({
          id: "tb-quiz-3",
          title: "Quiz 3",
          unit: "Quiz 3",
          component: "Test Book",
          lessons: [
            { title: "Timed test", slug: "timed-test", exerciseTitle: "Quiz 3 timed test", skill: "Test", type: "Timed test", estimatedTime: "20 min" },
          ],
        }),
        lockedUnit({
          id: "tb-midterm",
          title: "Mid-course test",
          unit: "Mid-course",
          component: "Test Book",
          lessons: [
            { title: "Exam-style paper", slug: "exam-paper", skill: "Test", type: "Exam paper", estimatedTime: "45 min" },
          ],
        }),
      ],
    },
  ],
};

export const ultimateB2ComponentTitles = ultimateB2Package.components.map((component) => component.title);

export function findUltimateB2Exercise(identifier) {
  for (const component of ultimateB2Package.components) {
    for (const unit of component.units) {
      for (const lesson of unit.lessons) {
        const exercise = lesson.exercises.find((item) => item.id === identifier || item.demoActivityKey === identifier);
        if (exercise) {
          return { component, unit, lesson, exercise };
        }
      }
    }
  }
  return null;
}
