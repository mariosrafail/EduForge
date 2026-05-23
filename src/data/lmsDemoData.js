export const brandPresets = [
  {
    schoolName: "Hamilton House ELT Demo",
    logo: "HH",
    primary: "#f97316",
    secondary: "#0b1f3a",
  },
  {
    schoolName: "Bright Path Language School",
    logo: "BP",
    primary: "#175cd3",
    secondary: "#f59e0b",
  },
  {
    schoolName: "Northstar English Institute",
    logo: "NE",
    primary: "#0f766e",
    secondary: "#7c3aed",
  },
];

export const schoolMetrics = [
  ["Active students", "1,284", "+8.6%"],
  ["Teachers", "72", "14 online"],
  ["Classes", "48", "6 new"],
  ["Assigned books", "19", "book-based practice"],
  ["Completion rate", "78%", "+4.2%"],
];

export const users = [
  { name: "Elena Markou", role: "Admin", level: "Operations", status: "Active" },
  { name: "Maria Antoniou", role: "Teacher", level: "B1 Junior", status: "Active" },
  { name: "Dimitris Voss", role: "Teacher", level: "B2 Senior", status: "Active" },
  { name: "Anna Georgiou", role: "Student", level: "B1 Junior", status: "Invited" },
  { name: "Nikos Stavrou", role: "Student", level: "B1 Junior", status: "Active" },
];

export const publisherIntelligence = [
  { label: "Activated book codes", value: "3,842", note: "B1 and B2 campaigns", accent: "#175cd3" },
  { label: "Most used book units", value: "Unit 4", note: "Travel Stories across 18 schools", accent: "#0f766e" },
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
  { name: "B1 Junior A", teacher: "Maria Antoniou", students: 21, book: "English Skills B1", completion: 74 },
  { name: "B1 Junior B", teacher: "Maria Antoniou", students: 18, book: "English Skills B1", completion: 68 },
  { name: "B2 Senior", teacher: "Dimitris Voss", students: 16, book: "Exam Focus B2", completion: 81 },
];

export const bookUnits = [
  {
    unit: "Unit 4",
    title: "Travel Stories",
    lessons: ["Reading: Island Routes", "Listening: Planning a trip", "Grammar: Past Simple vs Present Perfect", "Writing: A travel review"],
  },
  {
    unit: "Unit 5",
    title: "Future Cities",
    lessons: ["Reading: Smart transport", "Vocabulary: Urban life", "Writing: Opinion paragraph"],
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
  { title: "Unit 4 Reading Check", type: "Reading", target: "B1 Junior A", due: "Today", submitted: 16, total: 21 },
  { title: "Travel Plans Audio Drill", type: "Listening", target: "B1 Junior A", due: "Tomorrow", submitted: 11, total: 21 },
  { title: "Complete Unit 4 Test", type: "Mixed test", target: "B1 Junior B", due: "Friday", submitted: 8, total: 18 },
];

export const books = ["English Skills B1", "Exam Focus B2", "Young Learners A2"];

export const demoStudents = ["Anna Georgiou", "Nikos Stavrou", "Lea Karras"];

export const skillStats = [
  { label: "Reading", value: 76, accent: "#175cd3" },
  { label: "Listening", value: 64, accent: "#0f766e" },
  { label: "Writing", value: 58, accent: "#7c3aed" },
  { label: "Vocabulary", value: 82, accent: "#dc6803" },
  { label: "Grammar", value: 69, accent: "#c2410c" },
];

export const submittedWork = [
  { student: "Anna Georgiou", score: "72%", mistakes: "Present Perfect, travel collocations", recommendation: "Revise: Past Simple vs Present Perfect" },
  { student: "Nikos Stavrou", score: "84%", mistakes: "Listening detail questions", recommendation: "Repeat audio drill at slower speed" },
  { student: "Lea Karras", score: "61%", mistakes: "Short answer evidence", recommendation: "Reading Strategy Booster" },
];

export const studentExercises = [
  { title: "Unit 4 Reading Check", status: "Due today", skill: "Reading", attempts: "1 of 2" },
  { title: "Travel Plans Audio Drill", status: "New", skill: "Listening", attempts: "0 of 2" },
  { title: "Write a Travel Review", status: "Teacher review", skill: "Writing", attempts: "Draft" },
];

export const fullTestSections = [
  {
    title: "Reading",
    duration: "18 min",
    status: "Ready",
    prompt: "Read a short travel article and identify supporting evidence.",
    mistake: "One answer uses general memory instead of evidence from paragraph 2.",
    revision: "Underline the sentence that proves each answer before submitting.",
  },
  {
    title: "Listening",
    duration: "12 min",
    status: "Audio locked",
    prompt: "Listen to a trip-planning dialogue and answer detail questions.",
    mistake: "Two date and time details need another listen at normal speed.",
    revision: "Replay once, then note numbers and time expressions before choosing.",
  },
  {
    title: "Grammar / Vocabulary",
    duration: "15 min",
    status: "Ready",
    prompt: "Complete tense, collocation, and travel vocabulary items.",
    mistake: "Past Simple and Present Perfect are mixed in short-answer items.",
    revision: "Review time markers such as last summer, already, and ever.",
  },
  {
    title: "Writing",
    duration: "25 min",
    status: "Teacher review",
    prompt: "Write a short travel review with clear sequencing and opinion language.",
    mistake: "The paragraph needs clearer linking words and more precise adjectives.",
    revision: "Revise structure first, then improve vocabulary. Correct answers remain locked.",
  },
];
