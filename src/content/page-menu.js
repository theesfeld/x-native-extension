import { MENU_ITEMS } from "../lib/messages.js";

/**
 * Visible actions for a right-click. Chrome nests several extension items
 * under the extension name, and X removes the browser menu entirely, so the
 * labels have to be on the page.
 * @param {{ onAction: (id: string) => void }} deps
 */
export function createPageMenu(deps) {
  const host = document.createElement("div");
  host.id = "x-native-extension-menu";
  host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;display:none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .card {
        width: min(280px, calc(100vw - 16px));
        background: #fffdf8;
        color: #1f2933;
        border: 1px solid #ddd4c4;
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(31, 41, 51, 0.2);
        padding: 8px;
        font: 14px/1.35 "Segoe UI", "Helvetica Neue", sans-serif;
      }
      .title { margin: 2px 6px 6px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #0f6e56; }
      button {
        display: block;
        width: 100%;
        text-align: left;
        border: 0;
        background: transparent;
        color: inherit;
        border-radius: 8px;
        padding: 8px 8px;
        cursor: pointer;
        font: inherit;
      }
      button:hover, button:focus { background: #e7f3ee; outline: none; }
      .note, .hint { margin: 6px 6px 2px; color: #3d4a45; font-size: 12px; }
    </style>
    <div class="card" role="menu" aria-label="X Native Extension">
      <div class="title">X Native Extension</div>
      <div class="actions"></div>
      <p class="note"></p>
      <p class="hint">Shift+right-click keeps X’s menu. Alt+right-click opens the browser menu. Alt+Shift+S screenshots this post.</p>
    </div>
  `;
  const actions = shadow.querySelector(".actions");
  const note = shadow.querySelector(".note");
  for (const item of MENU_ITEMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "menuitem";
    button.dataset.action = item.id;
    button.textContent = item.title;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deps.onAction(item.id);
    });
    actions.appendChild(button);
  }

  function ensure() {
    const parent = document.documentElement || document.body;
    if (parent && !host.isConnected) parent.appendChild(host);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {string[]} actionIds
   */
  function show(clientX, clientY, actionIds) {
    ensure();
    note.textContent = "";
    const visible = new Set(actionIds || []);
    let any = false;
    for (const button of actions.querySelectorAll("button")) {
      const on = visible.has(button.dataset.action || "");
      button.hidden = !on;
      button.style.display = on ? "block" : "none";
      if (on) any = true;
    }
    if (!any) {
      host.style.display = "none";
      return;
    }
    host.style.display = "block";
    const width = host.offsetWidth || 280;
    const height = host.offsetHeight || 210;
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    host.style.left = `${Math.min(Math.max(8, clientX), maxX)}px`;
    host.style.top = `${Math.min(Math.max(8, clientY), maxY)}px`;
  }

  function hide() {
    host.style.display = "none";
  }

  /** @param {string} message */
  function setNote(message) {
    note.textContent = message;
  }

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || host.style.display === "none") return;
    if (event.composedPath().includes(host)) return;
    hide();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && host.style.display !== "none") hide();
  }, true);

  return { show, hide, setNote, host };
}
