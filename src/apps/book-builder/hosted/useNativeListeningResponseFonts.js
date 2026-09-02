import { useEffect, useState } from "react";

import { mergeNativeManagedAssetReference, removeNativeManagedAssetReferenceIfUnused } from "../../../data/native-activities/nativeActivityPublic.js";
import { getBuilderFontLibrary } from "./builderNativeActivityApi.js";

export function useNativeListeningResponseFonts({ bookSlug, componentSlug, mutatePublic, selectedQuestionId, onMessage }) {
  const [fonts, setFonts] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    getBuilderFontLibrary({ bookSlug, componentSlug }, { signal: controller.signal })
      .then(setFonts)
      .catch((error) => {
        if (!controller.signal.aborted) onMessage(error.message);
      });
    return () => controller.abort();
  }, [bookSlug, componentSlug]);

  const recordUploadedFont = (font) => setFonts((current) => (
    current.some((entry) => entry.assetId === font.assetId) ? current : [...current, font]
  ));
  const setAnswerFont = (font) => mutatePublic((next) => {
    const target = next.parts[0].interaction.questions.find((question) => question.id === selectedQuestionId);
    if (!target) return;
    const presentation = target.responseRegion.presentation;
    const previousSlot = presentation.answerFontAssetSlot;
    if (font) {
      next.assets = mergeNativeManagedAssetReference(next.assets, { assetId: font.assetId, checksumSha256: font.checksumSha256, role: font.role, slot: font.slot });
      presentation.answerFontAssetSlot = font.slot;
    } else delete presentation.answerFontAssetSlot;
    if (previousSlot && previousSlot !== font?.slot) removeNativeManagedAssetReferenceIfUnused(next, previousSlot);
  });

  return { fonts, recordUploadedFont, setAnswerFont };
}
