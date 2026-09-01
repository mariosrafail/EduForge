import assert from "node:assert/strict";
import test from "node:test";

import { subscribeAndSynchronizeNativeActivityFontEntries } from "../src/components/native-activity-assets/nativeActivityFontSubscription.js";

const notify = (entry) => [...entry.subscribers].forEach((subscriber) => subscriber());

for (const settledStatus of ["loaded", "error"]) {
  test(`a consumer resynchronizes after missing a font ${settledStatus} notification`, () => {
    const entry = { status: "loading", subscribers: new Set() };
    let observedStatus = entry.status;

    entry.status = settledStatus;
    notify(entry);

    const unsubscribe = subscribeAndSynchronizeNativeActivityFontEntries(
      [entry],
      () => { observedStatus = entry.status; },
      () => {},
    );

    assert.equal(observedStatus, settledStatus);
    assert.equal(entry.subscribers.size, 1);
    unsubscribe();
    assert.equal(entry.subscribers.size, 0);

    entry.status = "loading";
    notify(entry);
    assert.equal(observedStatus, settledStatus, "an unmounted consumer receives no later update");
  });
}

test("font entries are subscribed before an idle load begins", () => {
  const entry = { status: "idle", subscribers: new Set() };
  const observedStatuses = [];
  const unsubscribe = subscribeAndSynchronizeNativeActivityFontEntries(
    [entry],
    () => observedStatuses.push(entry.status),
    (fontEntry) => {
      assert.equal(fontEntry.subscribers.size, 1);
      fontEntry.status = "loading";
      notify(fontEntry);
    },
  );

  assert.deepEqual(observedStatuses, ["loading", "loading"]);
  unsubscribe();
});
