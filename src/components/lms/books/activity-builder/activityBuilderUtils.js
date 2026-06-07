export const activityTypeOptions = [
  { id: "multiple_choice", label: "Multiple choice" },
  { id: "open_answer", label: "Open answer" },
  { id: "typed_gap_fill", label: "Typed gap-fill" },
  { id: "media_video", label: "Video" },
  { id: "media_audio", label: "Audio" },
  { id: "text_panel", label: "Text panel" },
];

export function createQuestionId(prefix = "q") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

export function actionForActivity(activity) {
  if (!activity) return { actionType: "none", actionTargetId: null, actionPayload: {} };
  if (activity.type === "media_video") {
    return { actionType: "media_video", actionTargetId: activity.id, actionPayload: { activityId: activity.id, mediaId: activity.mediaId } };
  }
  if (activity.type === "media_audio") {
    return { actionType: "media_audio", actionTargetId: activity.id, actionPayload: { activityId: activity.id, mediaId: activity.mediaId } };
  }
  if (activity.type === "text_panel") {
    return { actionType: "text_panel", actionTargetId: activity.id, actionPayload: { activityId: activity.id } };
  }
  return { actionType: "activity", actionTargetId: activity.id, actionPayload: { activityId: activity.id, activityType: activity.type } };
}

export function buildActivityPayload({ type, title, instructions, packageSlug, componentSlug, pageId, pageNumber, mediaAsset, form }) {
  if (type === "multiple_choice") {
    const questions = (form.questions || []).map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options.filter(Boolean),
    }));
    const correctAnswers = Object.fromEntries((form.questions || []).map((question) => [question.id, question.correctOption || question.options[0] || ""]));
    return { content: { questions }, correctAnswers };
  }

  if (type === "open_answer") {
    const acceptedAnswers = String(form.acceptedAnswers || "").split("\n").map((item) => item.trim()).filter(Boolean);
    return {
      content: { prompt: form.prompt || "", acceptedAnswers },
      correctAnswers: { acceptedAnswers },
    };
  }

  if (type === "typed_gap_fill") {
    const items = (form.items || []).map((item) => ({
      id: item.id,
      prompt: item.prompt,
      answer: item.answer,
      acceptedAnswers: String(item.acceptedAnswers || item.answer || "").split("\n").map((answer) => answer.trim()).filter(Boolean),
    }));
    return { content: { items }, correctAnswers: Object.fromEntries(items.map((item) => [item.id, item.acceptedAnswers])) };
  }

  if (type === "media_video") {
    return {
      content: { mediaUrl: form.mediaUrl || mediaAsset?.publicUrl || "", posterUrl: form.posterUrl || "" },
      correctAnswers: {},
    };
  }

  if (type === "media_audio") {
    return {
      content: { mediaUrl: form.mediaUrl || mediaAsset?.publicUrl || "", transcript: form.transcript || "" },
      correctAnswers: {},
    };
  }

  if (type === "text_panel") {
    return { content: { body: form.body || "" }, correctAnswers: {} };
  }

  return { content: {}, correctAnswers: {} };
}

export function baseActivityPayload(context, type, title, instructions, mediaId, payload) {
  return {
    packageSlug: context.packageSlug,
    componentSlug: context.componentSlug,
    pageId: context.pageId,
    pageNumber: context.pageNumber,
    title,
    type,
    instructions,
    content: payload.content,
    correctAnswers: payload.correctAnswers,
    feedback: {},
    mediaId: mediaId || null,
    status: "published",
  };
}
