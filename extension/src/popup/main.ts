import type { PopupToBackgroundMessage } from "../shared/messages";
import "./style.css";

const form = document.querySelector<HTMLFormElement>("#config-form");
const portInput = document.querySelector<HTMLInputElement>("#port-input");
const status = document.querySelector<HTMLOutputElement>("#status");

if (!form || !portInput || !status) {
  throw new Error("Required DOM elements not found");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const message: PopupToBackgroundMessage = {
    type: "CHANGE_PORT",
    port: portInput.valueAsNumber,
  };

  status.textContent = "Sending...";

  void chrome.runtime.sendMessage(message);
});
