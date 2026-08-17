const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

test("manifest is MV3 and declares the expected surfaces", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.version);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://github.com/*"]);
});

test("every file the manifest references exists", () => {
  const referenced = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...manifest.content_scripts.flatMap((cs) => cs.js),
    ...Object.values(manifest.icons),
  ];
  for (const file of referenced) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `missing file referenced by manifest: ${file}`);
  }
});

test("html pages only reference scripts that exist", () => {
  for (const page of ["popup.html", "options.html"]) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    for (const [, src] of html.matchAll(/<script src="([^"]+)">/g)) {
      assert.ok(fs.existsSync(path.join(ROOT, src)), `${page} references missing script: ${src}`);
    }
  }
});
