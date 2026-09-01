export function subscribeAndSynchronizeNativeActivityFontEntries(entries, subscriber, beginLoad) {
  entries.forEach((entry) => entry.subscribers.add(subscriber));
  entries.forEach((entry) => beginLoad(entry));
  subscriber();
  return () => entries.forEach((entry) => entry.subscribers.delete(subscriber));
}
