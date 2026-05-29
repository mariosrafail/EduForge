export const defaultCourseDemo = {
  id: "ultimate-b2-students-book",
  title: "Ultimate B2 Students Book",
  subtitle: "Ultimate B2 package",
  level: "B2",
  publisher: "Hamilton House Publishers",
  defaultBrand: "Hamilton House ELT Demo",
  className: "Ultimate B2 A",
  bookCode: "ULT-B2-DEMO-2026",
  book_code: "ULT-B2-DEMO-2026",
  lesson: {
    id: "unit-2-reading-text-comprehension",
    title: "Unit 2 Reading: Text comprehension",
    unit: "Unit 2",
    section: "Reading",
    estimatedTime: "20 minutes",
    status: "Assigned",
    objectives: [
      "Identify text evidence for B2 reading comprehension questions.",
      "Complete Unit 2 reading exercises with accurate supporting details.",
      "Use Unit 2 grammar structures in controlled answers.",
    ],
    activities: [
      {
        id: "unit-2-reading-exercise-3",
        type: "gap-fill",
        title: "Unit 2 Reading: Exercise 3",
        instruction: "Drag each word into the correct gap.",
        skill: "Reading",
        wordBank: ["evidence", "inference", "context", "contrast", "purpose", "detail"],
        items: [
          { id: "gap-1", prompt: "Choose an answer only when there is clear ____ in the text.", answer: "evidence" },
          { id: "gap-2", prompt: "Use paragraph clues to make a logical ____.", answer: "inference" },
          { id: "gap-3", prompt: "Check the surrounding ____ before deciding what a word means.", answer: "context" },
          { id: "gap-4", prompt: "However signals a ____ between two ideas.", answer: "contrast" },
          { id: "gap-5", prompt: "The writer's ____ explains why the text was written.", answer: "purpose" },
          { id: "gap-6", prompt: "A specific fact from the text is a supporting ____.", answer: "detail" },
        ],
      },
      {
        id: "unit-2-reading-exercise-4",
        type: "line-matching",
        title: "Unit 2 Reading: Exercise 4",
        instruction: "Match each reading task with the best strategy.",
        skill: "Reading strategy",
        revisionGuidance: "Review Unit 2 reading strategies before trying again.",
        leftItems: [
          { id: "main-idea", label: "main idea question" },
          { id: "detail", label: "detail question" },
          { id: "vocabulary", label: "vocabulary in context" },
          { id: "writer-purpose", label: "writer purpose" },
        ],
        rightItems: [
          { id: "whole-text", label: "read the whole paragraph first" },
          { id: "line-evidence", label: "find the exact line evidence" },
          { id: "nearby-words", label: "check nearby words and phrases" },
          { id: "tone-reason", label: "notice tone and reason for writing" },
        ],
        correctPairs: {
          "main-idea": "whole-text",
          detail: "line-evidence",
          vocabulary: "nearby-words",
          "writer-purpose": "tone-reason",
        },
      },
      {
        id: "unit-2-grammar-opening-exercise",
        type: "multiple-choice",
        title: "Unit 2 Grammar: Opening exercise",
        instruction: "Choose the best word to complete each sentence.",
        skill: "Grammar",
        questions: [
          {
            id: "mc-1",
            prompt: "By the time the students arrived, the test ___.",
            options: ["had started", "has started", "starts"],
            answer: "had started",
          },
          {
            id: "mc-2",
            prompt: "This exercise is designed ___ students prepare for B2 reading tasks.",
            options: ["to help", "helping", "help"],
            answer: "to help",
          },
        ],
      },
    ],
  },
  submissions: [
    { student: "Anna Georgiou", score: 86, status: "Submitted", attempt: "1/2", submittedAt: "Today 10:14" },
    { student: "Nikos Stavrou", score: 74, status: "Needs review", attempt: "1/2", submittedAt: "Today 09:42" },
    { student: "Lea Karras", score: null, status: "In progress", attempt: "0/2", submittedAt: "Not submitted" },
  ],
};

export function cloneCourseDemo() {
  return structuredClone(defaultCourseDemo);
}
