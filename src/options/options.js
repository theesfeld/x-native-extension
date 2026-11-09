const toggle = document.querySelector("#paste");
const status = document.querySelector("#status");
const stored = await chrome.storage.local.get({ pasteAsTyped: true });
toggle.checked = stored.pasteAsTyped !== false;
render();

toggle.addEventListener("change", async () => {
  const pasteAsTyped = toggle.checked;
  await chrome.storage.local.set({ pasteAsTyped });
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
  } catch {
    tabs = [];
  }
  await Promise.all(tabs.map((tab) => {
    if (!tab.id) return Promise.resolve();
    return chrome.tabs.sendMessage(tab.id, { type: "settings", pasteAsTyped }).catch(() => {});
  }));
  render();
});

function render() {
  status.textContent = toggle.checked
    ? "Rewrite is on. Shift-paste, or the next-paste shortcut, still uses a normal paste."
    : "Rewrite is off. Composers receive the browser's normal paste.";
}
