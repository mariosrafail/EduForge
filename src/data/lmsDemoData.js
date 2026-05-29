export const brandPresets = [
  {
    schoolName: "Hamilton House ELT Demo",
    logo: "HH",
    primary: "#c2410c",
    secondary: "#0b1f3a",
  },
];

export const cefrLevels = ["Primary (Pre-A1)", "A1", "A2", "B1", "B1+", "B2", "C1", "C2"];

export const schoolMetrics = [
  ["Active students", "1,284", "+8.6%"],
  ["Teachers", "72", "14 online"],
  ["Classes", "48", "6 new"],
  ["Assigned books", "19", "book-based practice"],
  ["Completion rate", "78%", "+4.2%"],
];

export const users = [
  { name: "Elena Markou", role: "School Admin", level: "B2", status: "Active" },
  { name: "Paris Georgoulakis", role: "Teacher", level: "B2", status: "Active" },
  { name: "Sofia Laskari", role: "Teacher", level: "B2", status: "Active" },
  { name: "Anna Georgiou", role: "Student", level: "B2", status: "Invited" },
  { name: "Nikos Stavrou", role: "Student", level: "B2", status: "Active" },
];

export const publisherIntelligence = [
  { label: "Activated book codes", value: "3,842", note: "Ultimate B2 package campaign", accent: "#175cd3" },
  { label: "Most used book units", value: "Unit 2", note: "Ultimate B2 Unit 2 across demo classes", accent: "#0f766e" },
  { label: "Difficult skills", value: "Writing", note: "58% average across partner schools", accent: "#7c3aed" },
  { label: "Book engagement", value: "82%", note: "weekly active learners per adoption", accent: "#dc6803" },
  { label: "Adoption data", value: "CSV", note: "exportable by school, unit, and skill", accent: "#101828" },
];

export const rolloutActions = [
  "Create school",
  "Create class",
  "Generate book activation codes",
  "Assign teacher",
  "Import students",
];

export const integrationOptions = [
  "Moodle LTI",
  "Google Classroom",
  "Microsoft Teams / Zoom",
  "Website embed",
  "CSV / Excel import-export",
];

export const classes = [
  { name: "Ultimate B2 A", teacher: "Paris Georgoulakis", students: 21, book: "Ultimate B2 Students Book", completion: 74 },
  { name: "Ultimate B2 B", teacher: "Paris Georgoulakis", students: 18, book: "Ultimate B2 Workbook", completion: 68 },
  { name: "Ultimate B2 Exam Prep", teacher: "Paris Georgoulakis", students: 16, book: "Ultimate B2 Test Book", completion: 81 },
];

export const bookUnits = [
  {
    unit: "Unit 2",
    title: "Reading and grammar focus",
    lessons: ["Reading: Text comprehension", "Reading: Exercise 3", "Reading: Exercise 4", "Listening: Workbook page 20", "Grammar: Opening exercise", "Grammar: Exercise 4", "Quiz 2: Timed test"],
  },
  {
    unit: "Unit 3",
    title: "Skills extension",
    lessons: ["Vocabulary: Topic review", "Writing: Guided paragraph", "Speaking: Exam practice"],
  },
];

export const exerciseTypes = [
  "Multiple choice",
  "Fill in the blanks",
  "Matching",
  "Short answer",
  "Writing task",
  "Listening comprehension",
];

export const interactiveActivityTypes = [
  "Multiple Choice",
  "Matching",
  "Fill in the blanks",
  "Drag and Drop",
  "Listening",
  "Writing",
];

export const assignments = [
  { title: "Unit 2 Reading: Text comprehension", type: "Reading", target: "Ultimate B2 A", due: "Today", submitted: 16, total: 21 },
  { title: "Unit 2 Listening: Workbook page 20", type: "Listening", target: "Ultimate B2 A", due: "Tomorrow", submitted: 11, total: 21 },
  { title: "Quiz 2: Timed test", type: "Mixed test", target: "Ultimate B2 B", due: "Friday", submitted: 8, total: 18 },
];

export const books = ["Ultimate B2 Students Book", "Ultimate B2 Workbook", "Ultimate B2 Grammar Book", "Ultimate B2 Test Book"];

export const demoStudents = ["Anna Georgiou", "Nikos Stavrou", "Lea Karras"];

export const skillStats = [
  { label: "Reading", value: 76, accent: "#175cd3" },
  { label: "Listening", value: 64, accent: "#0f766e" },
  { label: "Writing", value: 58, accent: "#7c3aed" },
  { label: "Vocabulary", value: 82, accent: "#dc6803" },
  { label: "Grammar", value: 69, accent: "#c2410c" },
];

export const submittedWork = [
  { student: "Anna Georgiou", score: "72%", mistakes: "Text evidence, sentence transformation", recommendation: "Revise Unit 2 Reading: Exercise 4" },
  { student: "Nikos Stavrou", score: "84%", mistakes: "Listening detail questions", recommendation: "Repeat Unit 2 Listening: Workbook page 20" },
  { student: "Lea Karras", score: "61%", mistakes: "Short answer evidence", recommendation: "Reading Strategy Booster" },
];

export const studentExercises = [
  { title: "Unit 2 Reading: Text comprehension", status: "Due today", skill: "Reading", attempts: "1 of 2" },
  { title: "Unit 2 Listening: Workbook page 20", status: "New", skill: "Listening", attempts: "0 of 2" },
  { title: "Unit 2 Grammar: Exercise 4", status: "Teacher review", skill: "Grammar", attempts: "Draft" },
];

export const fullTestSections = [
  {
    title: "Reading",
    duration: "18 min",
    status: "Ready",
    prompt: "Read the Unit 2 text and identify supporting evidence.",
    mistake: "One answer uses general knowledge instead of evidence from paragraph 2.",
    revision: "Underline the sentence that proves each answer before submitting.",
  },
  {
    title: "Listening",
    duration: "12 min",
    status: "Audio locked",
    prompt: "Listen to the Unit 2 Workbook page 20 audio and answer detail questions.",
    mistake: "Two date and time details need another listen at normal speed.",
    revision: "Replay once, then note numbers and time expressions before choosing.",
  },
  {
    title: "Grammar / Vocabulary",
    duration: "15 min",
    status: "Ready",
    prompt: "Complete the Unit 2 opening exercise and Exercise 4 grammar items.",
    mistake: "Sentence transformation and tense control need more accuracy.",
    revision: "Review the Unit 2 Grammar Book notes before trying again.",
  },
  {
    title: "Writing",
    duration: "25 min",
    status: "Teacher review",
    prompt: "Write a short B2 paragraph with clear linking and precise examples.",
    mistake: "The paragraph needs clearer topic support and more precise B2 vocabulary.",
    revision: "Revise structure first, then improve vocabulary. Correct answers remain locked.",
  },
];
