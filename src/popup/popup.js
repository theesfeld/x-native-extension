const toggle = document.querySelector("#paste");
const status = document.querySelector("#status");
const shortcut = document.querySelector("#shortcut");
const arm = document.querySelector("#arm");
const options = document.querySelector("#options");

const stored = await chrome.storage.local.get({ pasteAsTyped: true });
toggle.checked = stored.pasteAsTyped !== false;
renderStatus();

toggle.addEventListener("change", async () => {
  const pasteAsTyped = toggle.checked;
  await chrome.storage.local.set({ pasteAsTyped });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "settings", pasteAsTyped }).catch(() => {});
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

const commands = await chrome.commands.getAll();
const armCommand = commands.find((command) => command.name === "arm-native-paste");
if (armCommand?.shortcut) shortcut.textContent = armCommand.shortcut;
const shotCommand = commands.find((command) => command.name === "screenshot-post");
const shot = document.querySelector("#shot");
if (shotCommand?.shortcut && shot) shot.textContent = shotCommand.shortcut;

function renderStatus() {
  status.textContent = toggle.checked
    ? "Plain-text paste in a composer is inserted as typed text."
    : "Rewrite is off. Paste uses the browser's normal paste.";
}
