import { useCallback, useEffect, useState } from "react";
import { NEUTRAL_SCHOOL_BRAND } from "../../shared/schoolBranding.js";
import { getSchoolProfile } from "../services/schoolProfileApi.js";

export function brandForUser(record, currentUser) {
  return currentUser?.id && record.userId === currentUser.id
    ? record.brand
    : NEUTRAL_SCHOOL_BRAND;
}

export function useSchoolBrand(currentUser) {
  const [record, setRecord] = useState({ userId: null, brand: NEUTRAL_SCHOOL_BRAND });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const userId = currentUser?.id || null;

  useEffect(() => {
    const controller = new AbortController();
    setRecord({ userId, brand: NEUTRAL_SCHOOL_BRAND });
    setError("");
    if (!userId) {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    getSchoolProfile({ signal: controller.signal })
      .then(({ brand }) => {
        if (!controller.signal.aborted) setRecord({ userId, brand });
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setRecord({ userId, brand: NEUTRAL_SCHOOL_BRAND });
          setError(requestError.message || "School profile could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId]);

  const acceptPersistedBrand = useCallback((brand) => {
    if (userId) setRecord({ userId, brand });
  }, [userId]);

  return {
    brand: brandForUser(record, currentUser),
    brandLoading: Boolean(userId && record.userId !== userId) || loading,
    brandError: record.userId === userId ? error : "",
    acceptPersistedBrand,
  };
}
