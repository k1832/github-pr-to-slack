const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

const PR_URL = "https://github.com/acme/repo/pull/123";
const TITLE_HTML = '<h1><bdi data-testid="issue-title">Fix the widget</bdi></h1>';
const STAT_HTML = '<span class="sr-only">Showing 81 additions and 82 deletions.</span>';

// Runs the real content script inside a jsdom page with a stubbed chrome API.
// Clipboard writes and runtime messages are captured for assertions.
function loadPage({ url = PR_URL, html = "", title = "", includeDiffStat = true, popupShown = true } = {}) {
  const dom = new JSDOM(`<body>${html}</body>`, { url, runScripts: "outside-only" });
  const { window } = dom;
  if (title) window.document.title = title;

  const messages = [];
  const clipboardWrites = [];
  window.chrome = {
    storage: {
      sync: { get: (defaults, cb) => cb({ ...defaults, includeDiffStat }) },
      onChanged: { addListener() {} },
    },
    runtime: {
      sendMessage: (msg, cb) => {
        messages.push(msg);
        cb?.({ popupShown });
      },
    },
  };
  window.Blob = class {
    constructor(parts) {
      this.content = parts.join("");
    }
  };
  window.ClipboardItem = class {
    constructor(items) {
      this.items = items;
    }
  };
  Object.defineProperty(window.navigator, "clipboard", {
    value: { write: async (items) => clipboardWrites.push(items) },
    configurable: true,
  });

  new vm.Script(SOURCE, { filename: "content.js" }).runInContext(dom.getInternalVMContext());
  return { window, messages, clipboardWrites };
}

function pressShortcut(window, init = {}) {
  // jsdom's navigator.platform is not Mac, so the default shortcut is Ctrl+K.
  const event = new window.KeyboardEvent("keydown", {
    code: "KeyK",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  window.document.body.dispatchEvent(event);
  return event;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("returns null off PR pages", () => {
  const { window } = loadPage({ url: "https://github.com/acme/repo/issues/5", html: TITLE_HTML });
  assert.equal(window.extractPrInfo(), null);
});

test("builds the link from the title element and canonical PR URL", () => {
  const { window } = loadPage({
    url: "https://github.com/acme/repo/pull/123/files#diff-abc123",
    html: TITLE_HTML,
  });
  const info = window.extractPrInfo();
  assert.equal(info.base.html, `<a href="${PR_URL}">Fix the widget #123</a>`);
  assert.equal(info.base.text, `Fix the widget #123: ${PR_URL}`);
});

test("escapes HTML special characters in the title", () => {
  const { window } = loadPage({
    html: '<h1><bdi data-testid="issue-title">A &lt;b&gt; &amp; "q"</bdi></h1>',
  });
  const info = window.extractPrInfo();
  assert.ok(info.base.html.includes("A &lt;b&gt; &amp; &quot;q&quot; #123"));
  assert.ok(info.base.text.startsWith('A <b> & "q" #123'));
});

test("falls back to document.title, stripping author and page suffix", () => {
  const { window } = loadPage({
    title: "My change by keita-morisaki · Pull Request #123 · acme/repo",
  });
  assert.equal(window.extractPrInfo().base.text, `My change #123: ${PR_URL}`);
});

test("strips bot authors from the document.title fallback", () => {
  const { window } = loadPage({
    title: "Bump lodash by dependabot[bot] · Pull Request #123 · acme/repo",
  });
  assert.equal(window.extractPrInfo().base.text, `Bump lodash #123: ${PR_URL}`);
});

test("keeps a legitimate trailing 'by ...' inside the actual title", () => {
  const { window } = loadPage({
    title: "Sort users by date by keita-morisaki · Pull Request #123 · acme/repo",
  });
  assert.equal(window.extractPrInfo().base.text, `Sort users by date #123: ${PR_URL}`);
});

test("reads the diffstat from screen-reader text", () => {
  const { window } = loadPage({ html: TITLE_HTML + STAT_HTML });
  const info = window.extractPrInfo();
  assert.equal(info.hasStat, true);
  assert.ok(info.withStat.html.endsWith("</a> <code>(+81, -82)</code>"));
  assert.ok(info.withStat.text.endsWith("`(+81, -82)`"));
});

test("unformats comma-grouped diffstat numbers", () => {
  const { window } = loadPage({
    html: TITLE_HTML + '<span class="sr-only">1,234 additions & 567 deletions</span>',
  });
  assert.ok(window.extractPrInfo().withStat.text.endsWith("`(+1234, -567)`"));
});

test("reads the diffstat from adjacent count spans as a fallback", () => {
  const { window } = loadPage({ html: TITLE_HTML + "<div><span>+81</span><span>-82</span></div>" });
  const info = window.extractPrInfo();
  assert.equal(info.hasStat, true);
  assert.ok(info.withStat.text.endsWith("`(+81, -82)`"));
});

test("reports no diffstat when the page shows none", () => {
  const { window } = loadPage({ html: TITLE_HTML });
  const info = window.extractPrInfo();
  assert.equal(info.hasStat, false);
  assert.equal(info.withStat.html, info.base.html);
  assert.equal(info.withStat.text, info.base.text);
});

test("shortcut copies the link with diffstat by default", async () => {
  const { window, clipboardWrites, messages } = loadPage({ html: TITLE_HTML + STAT_HTML });
  const event = pressShortcut(window);
  assert.equal(event.defaultPrevented, true);
  await settle();
  assert.equal(clipboardWrites.length, 1);
  const { items } = clipboardWrites[0][0];
  assert.equal(items["text/html"].content, `<a href="${PR_URL}">Fix the widget #123</a> <code>(+81, -82)</code>`);
  assert.equal(items["text/plain"].content, `Fix the widget #123: ${PR_URL} \`(+81, -82)\``);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "copied");
});

test("copies without diffstat when the preference is off", async () => {
  const { window, clipboardWrites } = loadPage({ html: TITLE_HTML + STAT_HTML, includeDiffStat: false });
  pressShortcut(window);
  await settle();
  assert.equal(clipboardWrites[0][0].items["text/html"].content, `<a href="${PR_URL}">Fix the widget #123</a>`);
});

test("ignores the shortcut while typing in a text field", async () => {
  const { window, clipboardWrites } = loadPage({ html: TITLE_HTML + "<textarea></textarea>" });
  const textarea = window.document.querySelector("textarea");
  const event = new window.KeyboardEvent("keydown", {
    code: "KeyK",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  textarea.dispatchEvent(event);
  await settle();
  assert.equal(event.defaultPrevented, false);
  assert.equal(clipboardWrites.length, 0);
});

test("ignores a different modifier combination", async () => {
  const { window, clipboardWrites } = loadPage({ html: TITLE_HTML });
  const event = pressShortcut(window, { ctrlKey: false, metaKey: true });
  await settle();
  assert.equal(event.defaultPrevented, false);
  assert.equal(clipboardWrites.length, 0);
});

test("ignores the shortcut on non-PR pages", async () => {
  const { window, clipboardWrites } = loadPage({ url: "https://github.com/acme/repo", html: TITLE_HTML });
  const event = pressShortcut(window);
  await settle();
  assert.equal(event.defaultPrevented, false);
  assert.equal(clipboardWrites.length, 0);
});

test("falls back to the in-page toast when the popup cannot open", async () => {
  const { window } = loadPage({ html: TITLE_HTML, popupShown: false });
  pressShortcut(window);
  await settle();
  const toast = [...window.document.querySelectorAll("div")].find((el) => el.textContent === "PR link copied");
  assert.ok(toast, "expected the fallback toast in the page");
});
