import React from "react";
import { School } from "lucide-react";
import { PlatformCard, PlatformEmptyState, PlatformLoadingState } from "../components/PlatformUi.jsx";

export function ClassesSection({ data, loading }) {
  const rows = data.classes?.classes || [];
  return (
    <PlatformCard title="Class directory" description="A read-only cross-school view. Class changes remain inside each school.">
      {loading.classes && !data.classes ? <PlatformLoadingState label="Loading classes…" /> : rows.length === 0 ? (
        <PlatformEmptyState icon={School} title="No classes found">Classes will appear here after schools create them.</PlatformEmptyState>
      ) : (
        <div className="pa-table-wrap"><table><thead><tr><th>Class</th><th>School</th><th>Level</th><th>Teacher</th><th>Active students</th><th>Assignments</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.school_name}</td><td>{row.level}</td><td>{row.teacher_name || "Unassigned"}</td><td>{row.active_student_count}</td><td>{row.assignment_count}</td></tr>)}</tbody></table></div>
      )}
    </PlatformCard>
  );
}
