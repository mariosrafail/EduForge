import { Tag } from "../../../Shared.jsx";

export function FeedbackRows({ rows }) {
  const correctCount = rows.filter((row) => row.correct).length;
  const score = rows.length ? Math.round((correctCount / rows.length) * 100) : 0;

  return (
    <>
      <div className="ultimate-result-summary">
        <strong>{score}%</strong>
        <span>{correctCount}/{rows.length} correct</span>
        <Tag tone={score >= 70 ? "green" : "gold"}>{score >= 70 ? "Submitted" : "Review needed"}</Tag>
      </div>
      <div className="ultimate-feedback-list">
        {rows.map((row) => (
          <article key={row.id} className={row.correct ? "correct" : "wrong"}>
            <div>
              <strong>{row.question || row.prompt}</strong>
              <span>Student answer: {row.studentAnswer || "No answer"}</span>
              <small>Correct answer: {row.answer}</small>
              {row.feedback && <p>{row.feedback}</p>}
            </div>
            <b>{row.correct ? "Correct" : "Needs review"}</b>
          </article>
        ))}
      </div>
    </>
  );
}
