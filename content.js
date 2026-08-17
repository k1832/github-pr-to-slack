const PR_PATH_RE = /\/pull\/(\d+)/;

const IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform);

// Default: Cmd+K on Mac, Ctrl+K elsewhere. Users can change it on the
// extension's options page; the choice is stored in chrome.storage.sync.
const DEFAULT_SHORTCUT = { code: "KeyK", meta: IS_MAC, ctrl: !IS_MAC, alt: false, shift: false };

let shortcut = DEFAULT_SHORTCUT;
chrome.storage.sync.get("shortcut", ({ shortcut: stored }) => {
  if (stored) shortcut = stored;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.shortcut) {
    shortcut = changes.shortcut.newValue || DEFAULT_SHORTCUT;
  }
});

// Capture phase so we see the key before GitHub's own handlers (it uses
// Cmd+K for its command palette) — but only act, and only preventDefault,
// when extractPrInfo() confirms we're on a PR page.
document.addEventListener("keydown", handleKeydown, true);

function handleKeydown(event) {
  if (
    event.code !== shortcut.code ||
    event.metaKey !== shortcut.meta ||
    event.ctrlKey !== shortcut.ctrl ||
    event.altKey !== shortcut.alt ||
    event.shiftKey !== shortcut.shift
  ) {
    return;
  }

  // Don't hijack the shortcut while typing: GitHub's markdown editors use
  // Cmd+K to insert a link.
  if (isEditableTarget(event)) return;

  const info = extractPrInfo();
  if (!info) return; // not a PR page — leave the key to GitHub

  event.preventDefault();
  event.stopImmediatePropagation();
  copyRichText(info.html, info.text);
}

function isEditableTarget(event) {
  const target = event.composedPath?.()[0] || event.target;
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function extractPrInfo() {
  const prMatch = window.location.pathname.match(PR_PATH_RE);
  if (!prMatch) return null;
  const number = prMatch[1];

  const titleEl =
    document.querySelector('bdi[data-testid="issue-title"]') ||
    document.querySelector('[data-testid="issue-title"] bdi') ||
    document.querySelector(".js-issue-title") ||
    document.querySelector("h1.gh-header-title bdi");

  let title = titleEl ? titleEl.textContent.trim() : document.title;
  // document.title (the fallback) is formatted by GitHub as:
  // "{title} by {username} · Pull Request #{number} · {owner}/{repo}"
  // Bot authors appear as e.g. "dependabot[bot]".
  title = title.replace(/\s*·\s*Pull Request.*$/i, "").trim();
  if (!titleEl) title = title.replace(/\s+by\s+[A-Za-z0-9-]+(\[bot\])?$/i, "").trim();
  if (!title) return null;

  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const linkText = `${title} #${number}`;
  // Drop any tab suffix (/files, /changes, /commits, ...) plus query string
  // and hash, so the link always points at the canonical PR page.
  const canonicalPath = window.location.pathname.slice(0, prMatch.index) + prMatch[0];
  const url = `${window.location.origin}${canonicalPath}`;

  // <code> rather than literal backticks, so Slack renders the counts as
  // inline code in the rich-text paste too.
  const diffStat = extractDiffStat();
  const htmlSuffix = diffStat ? ` <code>${escapeHtml(diffStat)}</code>` : "";
  const textSuffix = diffStat ? ` \`${diffStat}\`` : "";

  return {
    html: `<a href="${escapeHtml(url)}">${escapeHtml(linkText)}</a>${htmlSuffix}`,
    text: `${linkText}: ${url}${textSuffix}`,
  };
}

// "81 additions & 82 deletions" (PR header) or "... with 81 additions and
// 82 deletions" (Files changed tab).
const DIFF_STAT_RE = /(\d[\d,]*)\s+additions?\s*(?:&(?:amp;)?|and)\s*(\d[\d,]*)\s+deletions?/i;

const unformat = (n) => n.replace(/,/g, "");

// Returns "(+N, -N)", or "" when the page shows no diffstat (very narrow
// viewports hide it, and it isn't in the DOM until the header renders).
function extractDiffStat() {
  const stat = findDiffStatFromText() || findDiffStatFromCountSpans();
  return stat ? `(+${stat[0]}, -${stat[1]})` : "";
}

// GitHub spells the counts out for screen readers: a visually hidden span in
// the PR header, an aria-label on the classic .diffstat bar.
function findDiffStatFromText() {
  for (const el of document.querySelectorAll(".sr-only, .diffstat, [aria-label]")) {
    const source = el.getAttribute("aria-label") || el.textContent || "";
    const m = source.match(DIFF_STAT_RE);
    if (m) return [unformat(m[1]), unformat(m[2])];
  }
  return null;
}

// Fallback: the adjacent green "+81" / red "-82" spans.
function findDiffStatFromCountSpans() {
  for (const el of document.querySelectorAll("span")) {
    const additions = el.textContent.trim().match(/^\+(\d[\d,]*)$/);
    if (!additions) continue;
    const sibling = el.nextElementSibling;
    const deletions = sibling && sibling.textContent.trim().match(/^[-\u2212](\d[\d,]*)$/);
    if (deletions) return [unformat(additions[1]), unformat(deletions[1])];
  }
  return null;
}

async function copyRichText(html, text) {
  try {
    const item = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    });
    await navigator.clipboard.write([item]);
    showToast(true);
  } catch (err) {
    console.error("Copy PR Link: clipboard write failed", err);
    showToast(false);
  }
}

function showToast(success) {
  const el = document.createElement("div");
  el.textContent = success ? "PR link copied" : "Copy failed";
  el.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 2147483647;
    padding: 8px 14px; border-radius: 6px; font: 13px -apple-system, sans-serif;
    color: #fff; background: ${success ? "#1a7f37" : "#d1242f"};
    box-shadow: 0 2px 8px rgba(0,0,0,0.25); transition: opacity 0.2s;
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, 1200);
}
