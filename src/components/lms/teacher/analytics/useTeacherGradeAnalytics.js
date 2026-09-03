import { useCallback, useEffect, useState } from "react";
import { getTeacherGradeAnalytics } from "../../../../services/assignmentsApi.js";

const emptyFilters = Object.freeze({ classId: "", assignmentId: "", packageId: "", componentId: "", status: "all", window: "all" });

export function useTeacherGradeAnalytics(initialFilters = {}) {
  const [filters, setFilters] = useState(() => ({ ...emptyFilters, ...initialFilters }));
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    const assignmentId = initialFilters.assignmentId || "";
    setFilters((current) => current.assignmentId === assignmentId ? current : { ...current, assignmentId });
  }, [initialFilters.assignmentId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    getTeacherGradeAnalytics(filters, { signal: controller.signal }).then((data) => {
      if (active) setState({ loading: false, error: "", data });
    }).catch((error) => {
      if (!active || error.name === "AbortError") return;
      setState((current) => ({ loading: false, error: error.message || "Performance analytics could not be loaded.", data: current.data }));
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [filters, revision]);

  const updateFilter = useCallback((key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "classId" ? { assignmentId: "" } : {}),
      ...(key === "packageId" ? { componentId: "", assignmentId: "" } : {}),
      ...(key === "componentId" ? { assignmentId: "" } : {}),
    }));
  }, []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return { filters, updateFilter, state, refresh };
}
