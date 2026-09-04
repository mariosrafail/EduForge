export function pauseSiblingNativeMedia(element) {
  const scope = element?.closest?.("[data-native-media-scope]");
  scope?.querySelectorAll("audio, video").forEach((media) => {
    if (media !== element) media.pause();
  });
}
