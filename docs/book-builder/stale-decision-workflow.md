# Stale decision workflow

A rescan compares each decision's recorded dependency hashes with current detected facts. Changed or removed dependencies mark only their dependent decisions stale; new unrelated facts do not override decisions. Rescan never automatically approves or silently refreshes a decision.

Stale decisions remain visible in project views, Source Diff and Decisions & History. They cannot count as effective review resolution and are reported as `stale_resolution`.

Explicit reapproval:

1. reloads the current target and generated evidence;
2. confirms that the selected decision is actually stale;
3. shows the existing value and current dependency impact in preview;
4. requires a deliberate user confirmation;
5. preserves the decision value and original creation time;
6. records current server-derived dependency hashes, clears stale state and increments revision once;
7. writes normal lock, journal and history records.

If the value itself should change, the editor creates a normal replacement decision after preview. Removing a stale or current decision is also explicit, preserves all evidence and reopens related effective reviews. No bulk reapproval or apply-to-cluster action exists in Milestone 4B1.
