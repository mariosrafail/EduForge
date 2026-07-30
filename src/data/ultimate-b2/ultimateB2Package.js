import { ultimateB2StudentsBookPageUnits } from "./ultimateB2PageUnits.js";
import { lockedUnit } from "./lockedContent.js";
import {
  ultimateB2StudentsBookCatalog,
  ultimateB2StudentsBookTeacherCatalog,
} from "./studentsBookCatalog.js";

const ultimateB2WorkbookPageUnits = [
  {
    id: "ub2-wb-unit-2-pages",
    title: "Unit 2",
    unit: "Unit 2",
    pages: [
      { id: "wb-listening-20", title: "Listening", label: "pg 20", pageNumber: 20, images: [] },
      { id: "wb-consolidation-21", title: "Consolidation", label: "pg 21", pageNumber: 21, images: [] },
    ],
  },
];

const ultimateB2GrammarBookPageUnits = [
  {
    id: "ub2-gb-unit-2-pages",
    title: "Unit 2",
    unit: "Unit 2",
    pages: [
      { id: "gb-grammar-opening", title: "Grammar opening", label: "pg 18", pageNumber: 18, images: [] },
      { id: "gb-grammar-exercise-4", title: "Join the sentences", label: "pg 19", pageNumber: 19, images: [] },
    ],
  },
];

const ultimateB2TestBookPageUnits = [
  {
    id: "ub2-tb-quiz-1-pages",
    title: "Quiz 1",
    unit: "Quiz 1",
    pages: [
      { id: "tb-quiz-1-reading-vocabulary", title: "Reading and Vocabulary", label: "pg 6", pageNumber: 6, images: [] },
    ],
  },
  {
    id: "ub2-tb-quiz-2-pages",
    title: "Quiz 2",
    unit: "Quiz 2",
    pages: [
      { id: "tb-quiz-2-progress-check", title: "Timed test", label: "pg 10", pageNumber: 10, images: [] },
    ],
  },
];

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
      catalogKind: "recovered-students-book",
      units: ultimateB2StudentsBookCatalog.units,
      teacherUnits: ultimateB2StudentsBookTeacherCatalog.units,
      catalogStats: {
        ...ultimateB2StudentsBookCatalog.stats,
        disabledActivityCount: ultimateB2StudentsBookTeacherCatalog.stats.disabledActivityCount,
      },
    },
    {
      id: "workbook",
      routeSlug: "workbook",
      title: "Ultimate B2 Workbook",
      subtitle: "Extra listening and consolidation practice",
      type: "Workbook",
      coverTone: "blue",
      pageUnits: ultimateB2WorkbookPageUnits,
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
                  status: "Available",
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
      pageUnits: ultimateB2GrammarBookPageUnits,
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
                  status: "Available",
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
      pageUnits: ultimateB2TestBookPageUnits,
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
                  status: "Available",
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

