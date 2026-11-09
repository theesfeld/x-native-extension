/**
 * Small status line in a shadow root so the host page's CSS does not restyle it.
 * Messages are assigned with textContent.
 */
export function createToaster() {
  const host = document.createElement("div");
  host.id = "x-native-extension-toast";
  host.style.cssText = "position:fixed;z-index:2147483646;inset:auto 16px 16px auto;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .stack { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; max-width: min(360px, calc(100vw - 32px)); }
      .toast {
        pointer-events: auto;
        background: #1f2933;
        color: #f4f0e6;
        border-radius: 10px;
        padding: 10px 12px;
        font: 13px/1.4 "Segoe UI", "Helvetica Neue", sans-serif;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      }
    </style>
    <div class="stack"></div>
  `;
  const stack = shadow.querySelector(".stack");

  function ensure() {
    const parent = document.documentElement || document.body;
    if (parent && !host.isConnected) parent.appendChild(host);
  }

  /** @param {string} message */
  function show(message) {
    if (!message || !stack) return;
    ensure();
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.textContent = message;
    stack.appendChild(el);
    while (stack.children.length > 3) stack.firstChild?.remove();
    setTimeout(() => el.remove(), 8000);
  }

  /** @param {boolean} hidden */
  function setHidden(hidden) {
    host.style.display = hidden ? "none" : "";
  }

  return { show, setHidden };
}
