import "./nativeSingleChoice.css";

export function NativeSingleChoiceTeacherSurface({ publicDocument, teacherDocument }) {
  const correct = new Map(teacherDocument.parts[0].solution.correctAnswers.map((answer) => [answer.questionId, answer.correctOptionId]));
  return <div className="native-single-choice-teacher">
    {publicDocument.parts[0].interaction.questions.map((question, questionIndex) => <section key={question.id}>
      <h3>{questionIndex + 1}. {question.prompt}</h3>
      <ul>{question.options.map((option) => <li key={option.id} data-correct={correct.get(question.id) === option.id ? "true" : undefined}>{option.text}{correct.get(question.id) === option.id ? " — Correct answer" : ""}</li>)}</ul>
    </section>)}
  </div>;
}
