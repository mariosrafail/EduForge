export const defaultCourseDemo = {
  id: "english-skills-b1",
  title: "English Skills B1",
  level: "B1",
  publisher: "Hamilton House Publishers",
  defaultBrand: "Hamilton House ELT Demo",
  className: "B1 Junior A",
  lesson: {
    id: "welcome-2-vocabulary-4",
    title: "Welcome 2 - Vocabulary 4",
    unit: "Welcome 2",
    section: "Vocabulary 4",
    estimatedTime: "18 min",
    status: "Assigned",
    objectives: [
      "Use days of the week accurately in short sentences.",
      "Match seasons with months in the UK.",
      "Choose simple weather vocabulary in context.",
    ],
    activities: [
      {
        id: "days-gap-fill",
        type: "gap-fill",
        title: "Activity 1",
        instruction: "Drag each word into the correct gap.",
        skill: "Days of the week",
        wordBank: ["Friday", "Monday", "Saturday", "Thursday", "Tuesday", "Wednesday"],
        items: [
          { id: "gap-1", prompt: "This is the first day of the school week.", answer: "Monday" },
          { id: "gap-2", prompt: "This is the second day of the school week.", answer: "Tuesday" },
          { id: "gap-3", prompt: "This is the day after Tuesday.", answer: "Wednesday" },
          { id: "gap-4", prompt: "This is the day after Wednesday.", answer: "Thursday" },
          { id: "gap-5", prompt: "This is the day before Sunday.", answer: "Saturday" },
          { id: "gap-6", prompt: "This is the day before Saturday.", answer: "Friday" },
        ],
      },
      {
        id: "uk-seasons-match",
        type: "line-matching",
        title: "Activity 2",
        instruction: "When are the seasons in the UK? Match.",
        skill: "Seasons and months",
        revisionGuidance: "Review the seasons and their months before trying again.",
        leftItems: [
          { id: "spring", label: "spring" },
          { id: "summer", label: "summer" },
          { id: "autumn", label: "autumn" },
          { id: "winter", label: "winter" },
        ],
        rightItems: [
          { id: "autumn-months", label: "September, October, November" },
          { id: "summer-months", label: "June, July, August" },
          { id: "winter-months", label: "December, January, February" },
          { id: "spring-months", label: "March, April, May" },
        ],
        correctPairs: {
          spring: "spring-months",
          summer: "summer-months",
          autumn: "autumn-months",
          winter: "winter-months",
        },
      },
      {
        id: "weather-choice",
        type: "multiple-choice",
        title: "Activity 3",
        instruction: "Choose the best word to complete each sentence.",
        skill: "Weather vocabulary",
        questions: [
          {
            id: "mc-1",
            prompt: "In winter, it is often ___ in the UK.",
            options: ["cold", "hot", "sunny all day"],
            answer: "cold",
          },
          {
            id: "mc-2",
            prompt: "In summer, many people go to the park because the days are ___.",
            options: ["longer", "shorter", "snowy"],
            answer: "longer",
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
