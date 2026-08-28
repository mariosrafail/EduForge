export function markUnavailableReleaseMembers({ family, registry, unavailableReleaseMembers, updateComponentState, emptyComponentState }) {
  for (const member of family.members) {
    if (member.status !== "unavailable") continue;
    const resolution = registry.resolve("ultimate-b2", member.componentSlug);
    if (resolution.kind !== "installed") continue;
    const message = `${resolution.runtime.component.title} was not included in Release #${family.releaseNumber}.`;
    unavailableReleaseMembers.set(member.componentSlug, message);
    updateComponentState(resolution.runtime, { ...emptyComponentState("unavailable"), message });
  }
}

export function createHostedComponentPreparation({
  authorizationSession,
  componentIdentity,
  preparationCache,
  recordPreparation,
  signal,
  startupErrorMessage,
  unavailableReleaseMembers,
  updateComponentState,
  emptyComponentState,
}) {
  return (runtime) => {
    const unavailableMessage = unavailableReleaseMembers.get(runtime.componentSlug);
    if (unavailableMessage) return Promise.reject(Object.assign(new Error(unavailableMessage), { code: "RELEASE_MEMBER_UNAVAILABLE" }));
    const existing = preparationCache.get(runtime.key);
    if (existing) return existing;
    recordPreparation(runtime);
    updateComponentState(runtime, emptyComponentState("loading"));
    const pending = authorizationSession.ensure(componentIdentity(runtime)).then(async (runtimeContext) => {
      const [pack] = await Promise.all([
        runtime.contentPackProvider.load({ runtimeContext, signal }),
        runtime.hotspotProvider?.prepare?.({ runtimeContext, signal }) || Promise.resolve(),
      ]);
      const ready = { status: "ready", phase: "ready", progress: null, pack, error: null, message: "" };
      updateComponentState(runtime, ready);
      return ready;
    }).catch((error) => {
      if (!signal.aborted) updateComponentState(runtime, { ...emptyComponentState("error"), error, message: startupErrorMessage(error, runtime.startupAssets.hosted) });
      throw error;
    });
    preparationCache.set(runtime.key, pending);
    return pending;
  };
}
