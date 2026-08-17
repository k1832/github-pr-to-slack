# Copy PR Link

Copies the current GitHub PR's title and URL as a rich-text hyperlink, so pasting into Slack shows a clean link with no preview unfurl.

## Install

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Use

On a GitHub PR page, press **Cmd+K** (Mac) or **Ctrl+K** (other), then paste into Slack.

To change the shortcut, open the extension's options: right-click the extension icon → **Options** (or `chrome://extensions` → Details → Extension options), click the box, and press your preferred combo.

## Notes

- The paste looks like Title #1234 `(+81, -82)`, with the line counts as inline code outside the link. They're read off the page, so they're omitted if GitHub isn't showing a diffstat (e.g. a very narrow window). The "URL copied!" popup has an **Include diff stats** checkbox (on by default): toggling it updates the clipboard right away and is remembered for future copies.
- On PR pages the shortcut overrides GitHub's own Cmd+K command palette (by design). It stays untouched while you're typing in a comment box or any other text field, so Cmd+K still inserts a markdown link there.
- After editing the extension's code, reload it on `chrome://extensions` **and** refresh any open GitHub tabs.
