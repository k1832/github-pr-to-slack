const IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform);
const DEFAULT_SHORTCUT = { code: "KeyK", meta: IS_MAC, ctrl: !IS_MAC, alt: false, shift: false };

const input = document.getElementById("shortcut");
const resetBtn = document.getElementById("reset");
const status = document.getElementById("status");

chrome.storage.sync.get("shortcut", ({ shortcut }) => {
  input.value = label(shortcut || DEFAULT_SHORTCUT);
});

input.addEventListener("keydown", (event) => {
  event.preventDefault();
  // Ignore presses of a bare modifier key while building the combo.
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return;

  const shortcut = {
    code: event.code,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
  if (!shortcut.meta && !shortcut.ctrl && !shortcut.alt) {
    flash("Include Cmd, Ctrl, or Alt");
    return;
  }
  chrome.storage.sync.set({ shortcut }, () => {
    input.value = label(shortcut);
    flash("Saved");
  });
});

resetBtn.addEventListener("click", () => {
  chrome.storage.sync.remove("shortcut", () => {
    input.value = label(DEFAULT_SHORTCUT);
    flash("Reset");
  });
});

function label(s) {
  const parts = [];
  if (s.ctrl) parts.push(IS_MAC ? "⌃" : "Ctrl");
  if (s.alt) parts.push(IS_MAC ? "⌥" : "Alt");
  if (s.shift) parts.push(IS_MAC ? "⇧" : "Shift");
  if (s.meta) parts.push(IS_MAC ? "⌘" : "Win");
  parts.push(keyName(s.code));
  return parts.join(IS_MAC ? "" : "+");
}

function keyName(code) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

function flash(text) {
  status.textContent = text;
  setTimeout(() => (status.textContent = ""), 1500);
}
