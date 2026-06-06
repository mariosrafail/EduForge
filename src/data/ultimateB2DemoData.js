import page19Image from "../../selides/19.png";
import page20To21Image from "../../selides/20-21.png";
import page22To23Image from "../../selides/22-23.png";
import page24To25Image from "../../selides/24-25.png";
import page26Image from "../../selides/26.png";
import page27Image from "../../selides/27.png";
import page28To29Image from "../../selides/28-29.png";
import page30Image from "../../selides/30.png";
import page31Image from "../../selides/31.png";
import page32Image from "../../selides/32.png";
import page33Image from "../../selides/33.png";
import page34Image from "../../selides/34.png";

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

const ultimateB2StudentsBookPageUnits = [
  {
    id: "ub2-sb-unit-2-pages",
    title: "Unit 2",
    unit: "Unit 2",
    pages: [
      { id: "reading-19", title: "Reading", label: "pg 19", pageNumber: 19, images: [page19Image] },
      {
        id: "reading-20-21",
        title: "Reading",
        label: "pg 20-21",
        pageNumber: 20,
        images: [page20To21Image],
        continuesToVideo: true,
        actions: [
          { id: "video", label: "Video", top: "7%", left: "3.2%", width: "45%", height: "14%", ariaLabel: "Open video activity from page 20", target: "video" },
          { id: "text-audio", label: "Text + Audio", top: "22%", left: "3.4%", width: "46.2%", height: "66%", ariaLabel: "Open reading text with audio from page 20", target: "text-audio" },
          { id: "exercise-3", label: "Exercise 3", top: "8%", left: "53.2%", width: "43.5%", height: "38%", ariaLabel: "Open Exercise 3 missing sentences", target: "exercise-3", activityKey: "reading-ex3" },
          { id: "exercise-4", label: "Exercise 4", top: "48%", left: "53.3%", width: "43.4%", height: "29%", ariaLabel: "Open Exercise 4 circle the correct words", target: "exercise-4", activityKey: "reading-ex4" },
        ],
      },
      { id: "vocabulary-22-23", title: "Vocabulary in Use", label: "pg 22-23", pageNumber: 22, images: [page22To23Image] },
      { id: "grammar-24-25", title: "Grammar in Use", label: "pg 24-25", pageNumber: 24, images: [page24To25Image] },
      { id: "listening-26", title: "Listening", label: "pg 26", pageNumber: 26, images: [page26Image] },
      { id: "speaking-27", title: "Speaking", label: "pg 27", pageNumber: 27, images: [page27Image] },
      { id: "writing-28-29", title: "Writing", label: "pg 28-29", pageNumber: 28, images: [page28To29Image] },
      { id: "review-30", title: "Review 2", label: "pg 30", pageNumber: 30, images: [page30Image] },
      { id: "practice-31-32", title: "Practice 2", label: "pg 31-32", pageNumber: 31, images: [page31Image, page32Image] },
      { id: "progress-check-33-34", title: "Progress check 1", label: "pg 33-34", pageNumber: 33, images: [page33Image, page34Image] },
    ],
  },
];

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
      routeSlug: "students-book",
      title: "Ultimate B2 Students Book",
      subtitle: "Core classroom lessons and reading practice",
      type: "Students Book",
      coverTone: "orange",
      pageUnits: ultimateB2StudentsBookPageUnits,
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
      routeSlug: "workbook",
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
      routeSlug: "grammar-book",
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
      routeSlug: "test-book",
      title: "Ultimate B2 Test Book",
      subtitle: "Timed quizzes and exam-style checks",
      type: "Test Book",
      coverTone: "slate",
      units: [
        {
          id: "tb-quiz-1",
          title: "Quiz 1",
          unit: "Quiz 1",
          lessons: [
            {
              id: "tb-quiz-1-test",
              title: "Quiz 1",
              exercises: [
                {
                  id: "tb-quiz-1-unit-check",
                  title: "Quiz 1: Reading and Vocabulary",
                  component: "Test Book",
                  unit: "Quiz 1",
                  lesson: "Test",
                  skill: "Test",
                  type: "Timed test",
                  estimatedTime: "20 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Available",
                  progressLabel: "Ready to assign",
                  studentProgressLabel: "Available",
                  demoActivityKey: "quiz-1",
                  description: "Complete a 20-minute Unit 1 reading and vocabulary check.",
                },
              ],
            },
          ],
        },
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
