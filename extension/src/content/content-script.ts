import type { BackgroundToContentMessage } from "../shared/messages";

chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage): void => {
  switch (message.type) {
    case "XIV_TO_YTMUSIC":
      break;
    default:
      void (message.type satisfies never);
  }
});
