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
      ],
    },
    {
      id: "workbook",
      title: "Ultimate B2 Workbook",
      subtitle: "Extra listening and consolidation practice",
      type: "Workbook",
      coverTone: "blue",
      units: [
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
                  type: "Listening",
                  estimatedTime: "10 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Assigned",
                  progressLabel: "14/21 submitted",
                  studentProgressLabel: "Assigned",
                  demoActivityKey: "listening-page-20",
                  description: "Answer detail questions from the Unit 2 listening task.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "grammar-book",
      title: "Ultimate B2 Grammar Book",
      subtitle: "Grammar explanations and controlled practice",
      type: "Grammar Book",
      coverTone: "green",
      units: [
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
                  title: "Exercise 4",
                  component: "Grammar Book",
                  unit: "Unit 2",
                  lesson: "Grammar",
                  skill: "Grammar",
                  type: "Sentence transformation",
                  estimatedTime: "12 min",
                  assignable: true,
                  availableToStudent: true,
                  status: "Assigned",
                  progressLabel: "Avg. score 72%",
                  studentProgressLabel: "Assigned",
                  demoActivityKey: "grammar-ex4",
                  description: "Practise B2 sentence transformation for Unit 2 grammar.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "test-book",
      title: "Ultimate B2 Test Book",
      subtitle: "Timed quizzes and exam-style checks",
      type: "Test Book",
      coverTone: "slate",
      units: [
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
