export function restoreNativeMarkWordsResponses(document, input) {
  const result = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const item of document.parts[0].interaction.items) {
    const selected = input[item.id];
    if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some((id) => typeof id !== "string" || !item.words.some((word) => word.id === id))) continue;
    result[item.id] = item.words.filter((word) => selected.includes(word.id)).map((word) => word.id);
  }
  return result;
}

export function toggleNativeMarkWordsResponse(document, responses, itemId, wordId) {
  const current = restoreNativeMarkWordsResponses(document, responses);
  const item = document.parts[0].interaction.items.find((entry) => entry.id === itemId);
  if (!item?.words.some((word) => word.id === wordId)) return current;
  const selected = new Set(current[itemId] || []);
  if (selected.has(wordId)) selected.delete(wordId); else selected.add(wordId);
  return { ...current, [itemId]: item.words.filter((word) => selected.has(word.id)).map((word) => word.id) };
}
