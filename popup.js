// Treat a copy as "just happened" within this window; beyond it (e.g. the
// user clicks the toolbar icon later) the popup shows the idle hint instead.
const RECENT_MS = 5000;
const AUTO_CLOSE_MS = 2000;

const toggle = document.getElementById("diffstat-toggle");
const detail = document.getElementById("detail");
const statNote = document.getElementById("stat-note");
const statPreview = document.getElementById("stat-preview");

let copied = null; // recent payload: { base, withStat, hasStat }
let autoCloseTimer = null;

init();

async function init() {
  const [{ includeDiffStat }, { lastCopied }] = await Promise.all([
    chrome.storage.sync.get({ includeDiffStat: true }),
    chrome.storage.session.get("lastCopied"),
  ]);
  toggle.checked = includeDiffStat;

  if (lastCopied && Date.now() - lastCopied.at < RECENT_MS) {
    copied = lastCopied;
    document.getElementById("copied").hidden = false;
    detail.hidden = false;
    renderCopied();
    autoCloseTimer = setTimeout(() => window.close(), AUTO_CLOSE_MS);
    // Let the user reach the checkbox: any interaction cancels auto-close.
    document.addEventListener("pointermove", cancelAutoClose, { once: true });
    document.addEventListener("keydown", cancelAutoClose, { once: true });
  } else {
    document.getElementById("idle").hidden = false;
  }
}

function cancelAutoClose() {
  clearTimeout(autoCloseTimer);
}

function selectedVariant() {
  return toggle.checked && copied.hasStat ? copied.withStat : copied.base;
}

function renderCopied() {
  detail.textContent = selectedVariant().text;
  if (copied.hasStat) {
    const stat = copied.withStat.text.slice(copied.base.text.length).trim();
    statPreview.textContent = stat.replace(/`/g, "");
  } else {
    statNote.hidden = false;
  }
}

toggle.addEventListener("change", async () => {
  cancelAutoClose();
  chrome.storage.sync.set({ includeDiffStat: toggle.checked });
  if (!copied) return;

  // Rewrite the clipboard so the just-made copy matches the new choice.
  const { html, text } = selectedVariant();
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
    renderCopied();
  } catch (err) {
    console.error("Copy PR Link: clipboard rewrite failed", err);
  }
});
