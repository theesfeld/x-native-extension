/* Generated from src by scripts/build.mjs. Edit the source, then rebuild. */

// src/popup/popup.js
var toggle = document.querySelector("#paste");
var status = document.querySelector("#status");
var shortcut = document.querySelector("#shortcut");
var arm = document.querySelector("#arm");
var options = document.querySelector("#options");
var stored = await chrome.storage.local.get({ pasteAsTyped: true });
toggle.checked = stored.pasteAsTyped !== false;
renderStatus();
toggle.addEventListener("change", async () => {
  const pasteAsTyped = toggle.checked;
  await chrome.storage.local.set({ pasteAsTyped });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "settings", pasteAsTyped }).catch(() => {
    });
  }
  renderStatus();
});
arm.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = "Open an x.com tab first.";
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "arm-native-paste" });
    status.textContent = "The next composer paste on this tab will be a normal paste.";
  } catch {
    status.textContent = "Open an x.com tab first. This page has no composer to update.";
  }
});
options.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
var commands = await chrome.commands.getAll();
var armCommand = commands.find((command) => command.name === "arm-native-paste");
if (armCommand?.shortcut) shortcut.textContent = armCommand.shortcut;
var shotCommand = commands.find((command) => command.name === "screenshot-post");
var shot = document.querySelector("#shot");
if (shotCommand?.shortcut && shot) shot.textContent = shotCommand.shortcut;
function renderStatus() {
  status.textContent = toggle.checked ? "Plain-text paste in a composer is inserted as typed text." : "Rewrite is off. Paste uses the browser's normal paste.";
}
