// Treat a copy as "just happened" within this window; beyond it (e.g. the
// user clicks the toolbar icon later) the popup shows the idle hint instead.
const RECENT_MS = 5000;
const AUTO_CLOSE_MS = 2000;

chrome.storage.session.get("lastCopied", ({ lastCopied }) => {
  if (lastCopied && Date.now() - lastCopied.at < RECENT_MS) {
    document.getElementById("copied").hidden = false;
    const detail = document.getElementById("detail");
    detail.textContent = lastCopied.text;
    detail.hidden = false;
    setTimeout(() => window.close(), AUTO_CLOSE_MS);
  } else {
    document.getElementById("idle").hidden = false;
  }
});
