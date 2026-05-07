import * as proto from "@proto/ytmusic";
import type { PopupToBackgroundMessage } from "../shared/messages";

let port: number = 16839;

chrome.runtime.onStartup.addListener(() => {
  console.log("hello!");
  attemptConnection();
});

function attemptConnection() {
  const client = new proto.YtMusicClientImpl(new proto.GrpcWebImpl(`localhost:${port}`, {}));
  return client;
}

chrome.runtime.onMessage.addListener((message: PopupToBackgroundMessage): void => {
  switch (message.type) {
    case "CHANGE_PORT":
      port = message.port;
      break;
    default:
      void (message.type satisfies never);
  }
});
