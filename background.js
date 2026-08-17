// On a successful copy, the content script sends the copied payload here.
// We stash it in session storage (the popup reads it, and future popup
// checkboxes will rebuild the clipboard from it) and open the action popup
// next to the toolbar as the "URL copied!" confirmation.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "copied") return;
  (async () => {
    await chrome.storage.session.set({ lastCopied: { ...msg.payload, at: Date.now() } });
    try {
      // Requires Chrome 127+; on failure the content script falls back to
      // its in-page toast.
      await chrome.action.openPopup();
      sendResponse({ popupShown: true });
    } catch (err) {
      sendResponse({ popupShown: false });
    }
  })();
  return true; // keep sendResponse alive for the async work above
});
