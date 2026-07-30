import { useEffect, useMemo, useRef, useState } from "react";
import { validateSchoolBrand } from "../../../../shared/schoolBranding.js";
import { updateSchoolProfile } from "../../../services/schoolProfileApi.js";

const brandKeys = ["schoolName", "logo", "primary", "secondary"];

export function brandsMatch(left, right) {
  return brandKeys.every((key) => String(left?.[key] ?? "") === String(right?.[key] ?? ""));
}

export function changedBrandFields(draft, persisted) {
  return Object.fromEntries(
    brandKeys
      .filter((key) => String(draft?.[key] ?? "") !== String(persisted?.[key] ?? ""))
      .map((key) => [key, draft[key]]),
  );
}

export function useSchoolBrandDraft({ persistedBrand, profileLoading, onBrandPersisted }) {
  const [draft, setDraft] = useState(persistedBrand);
  const [requestState, setRequestState] = useState({ saving: false, error: "", saved: false });
  const acceptedBrand = useRef(null);

  useEffect(() => {
    setDraft(persistedBrand);
    if (acceptedBrand.current && brandsMatch(acceptedBrand.current, persistedBrand)) {
      acceptedBrand.current = null;
      return;
    }
    setRequestState({ saving: false, error: "", saved: false });
  }, [persistedBrand]);

  const dirty = !brandsMatch(draft, persistedBrand);
  const validationError = useMemo(() => validateSchoolBrand(draft), [draft]);

  const changeDraft = (next) => {
    setDraft(next);
    setRequestState({ saving: false, error: "", saved: false });
  };

  const discard = () => {
    setDraft(persistedBrand);
    setRequestState({ saving: false, error: "", saved: false });
  };

  const save = async () => {
    if (profileLoading || requestState.saving || !dirty || validationError) return;
    setRequestState({ saving: true, error: "", saved: false });
    try {
      const { brand } = await updateSchoolProfile(changedBrandFields(draft, persistedBrand));
      acceptedBrand.current = brand;
      setDraft(brand);
      onBrandPersisted?.(brand);
      setRequestState({ saving: false, error: "", saved: true });
    } catch (error) {
      setRequestState({
        saving: false,
        error: error.message || "School profile could not be saved.",
        saved: false,
      });
    }
  };

  return {
    draft,
    dirty,
    validationError,
    saving: requestState.saving,
    saveError: requestState.error,
    saved: requestState.saved,
    changeDraft,
    discard,
    save,
  };
}
