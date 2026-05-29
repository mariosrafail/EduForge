export const studentDashboardCards = [
  {
    id: "books",
    title: "Books",
    description: "Open your activated Ultimate B2 books and practice exercises.",
    metric: "4 active components",
  },
  {
    id: "assignments",
    title: "Assignments",
    description: "Complete exercises assigned by your teacher.",
    metric: "3 pending",
  },
  {
    id: "grades",
    title: "Grades",
    description: "Review your scores, feedback, and corrected work.",
    metric: "78% average",
  },
];

export const studentAssignments = [
  {
    title: "Unit 2 Reading: Exercise 3",
    component: "Ultimate B2 Students Book",
    className: "Ultimate B2 A",
    dueStatus: "Due today",
    estimatedTime: "12 min",
    completionStatus: "In progress",
    demoActivityKey: "reading-ex3",
  },
  {
    title: "Unit 2 Reading: Exercise 4",
    component: "Ultimate B2 Students Book",
    className: "Ultimate B2 A",
    dueStatus: "Due tomorrow",
    estimatedTime: "15 min",
    completionStatus: "Not started",
    demoActivityKey: "reading-ex4",
  },
  {
    title: "Unit 2 Listening: Workbook page 20",
    component: "Ultimate B2 Workbook",
    className: "Ultimate B2 A",
    dueStatus: "This week",
    estimatedTime: "10 min",
    completionStatus: "Not started",
    demoActivityKey: "listening-page-20",
  },
  {
    title: "Quiz 2: Timed test",
    component: "Ultimate B2 Test Book",
    className: "Ultimate B2 A",
    dueStatus: "Friday",
    estimatedTime: "20 min",
    completionStatus: "Locked until assigned",
    demoActivityKey: "quiz-2",
  },
];

export const studentGradeRows = [
  {
    title: "Unit 2 Reading: Exercise 4",
    component: "Ultimate B2 Students Book",
    date: "May 28, 2026",
    score: "75%",
    status: "Corrected",
  },
  {
    title: "Unit 2 Grammar: Opening exercise",
    component: "Ultimate B2 Grammar Book",
    date: "May 27, 2026",
    score: "82%",
    status: "Corrected",
  },
  {
    title: "Unit 2 Listening: Workbook page 20",
    component: "Ultimate B2 Workbook",
    date: "May 26, 2026",
    score: "78%",
    status: "Reviewed",
  },
];

export const correctedExercise = {
  title: "Unit 2 Reading: Exercise 4",
  rows: [
    {
      question: "Which paragraph mentions the main character's decision?",
      studentAnswer: "Paragraph 1",
      correctAnswer: "Paragraph 3",
      feedback: "Check the paragraph where the decision is clearly stated.",
      correct: false,
    },
    {
      question: "What does the word 'reluctant' suggest in the text?",
      studentAnswer: "Not willing at first",
      correctAnswer: "Not willing at first",
      feedback: "Good use of context clues.",
      correct: true,
    },
    {
      question: "Which sentence gives evidence for the writer's opinion?",
      studentAnswer: "The final sentence of paragraph 4",
      correctAnswer: "The final sentence of paragraph 4",
      feedback: "Correct evidence from the text.",
      correct: true,
    },
  ],
  writing: {
    prompt: "Short answer: Explain why the character changes their plan.",
    studentAnswer: "The character changes the plan because it was better.",
    teacherComment: "Your answer is relevant, but it needs a clearer reason from the text.",
    suggestedImprovement: "The character changes the plan because new evidence shows the first option would not solve the problem.",
    finalScore: "7/10",
  },
};
