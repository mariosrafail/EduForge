export function scoreAnswers(questions, answers) {
  return questions.map((question) => ({
    ...question,
    studentAnswer: answers[question.id] || "",
    correct: answers[question.id] === question.answer,
  }));
}
