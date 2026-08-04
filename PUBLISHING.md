# Publishing checklist — Chrome Web Store

## Already done
- [x] Extension name and description finalized (`manifest.json`)
- [x] Icon set (16/48/128px, `icons/`)
- [x] Privacy policy drafted (`PRIVACY.md`)

## Still to do

### 1. Developer account
- [ ] Register a Chrome Web Store developer account (one-time $5 fee, per developer, not per extension) at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

### 2. Host the privacy policy
- [ ] The Store requires a **public URL** for your privacy policy, not just a file in the repo. Host `PRIVACY.md` somewhere public — a GitHub Pages page, a gist, or a simple static page — and note the URL for the listing form.

### 3. Package the extension
- [ ] Zip only the runtime files: `manifest.json`, `newtab.html/css/js`, `options.html/css/js`, `icons/*.png`. Leave out dev/doc files (`README.md`, `PRIVACY.md`, `PUBLISHING.md`, `CONTEXT.md`, `docs/`, `icons/icon.svg`) — they aren't needed to run and just bloat the package.
- [ ] Bump `"version"` in `manifest.json` before each new submission — the Store rejects re-uploading the same version number.

### 4. Store listing assets
- [ ] **Short description** (≤132 characters) — e.g. "A tidy new-tab bookmark dashboard that archives old client folders out of the way."
- [ ] **Detailed description** — can reuse/adapt the "Why this exists" and "Features" sections from `README.md`.
- [ ] **Screenshots** — at least 1, ideally 3-5, at 1280x800 or 640x400. Show: the new-tab tree view, the archive/collapse interaction, the "N archived" summary, and the Options page.
- [ ] **Small promo tile** (440x280) — optional but improves how the listing looks in search/category browsing.
- [ ] **Category**: Productivity.

### 5. Privacy practices tab (in the Dashboard)
For each permission, the Dashboard will ask you to justify why it's needed — use these:
- **`bookmarks`**: "Required to read and display the user's bookmark folders on the new-tab page, and to apply actions the user takes (rename, reorder, archive)."
- **`storage`**: "Used to store the user's own local preferences (which folders are archived/collapsed, and the favicon-only display setting) — never synced or transmitted."
- **`favicon`**: "Used to display each bookmark's site icon via Chrome's built-in favicon cache."
- Declare: no data is sold, no data is used for purposes unrelated to the extension's core function, no data is used to determine creditworthiness or for lending purposes. (All true here, since nothing is collected at all.)
- Link the hosted privacy policy URL from step 2.

### 6. New-tab override scrutiny
Extensions that override the new-tab page get closer review (this category has a history of ad/spyware abuse). Be ready for:
- A slower review cycle than a typical extension.
- Possible follow-up questions about data use — the answer is simple here ("no network requests, everything local"), but have `PRIVACY.md` and the permission justifications ready to paste into a response.

### 7. Submit and wait
- [ ] Submit for review. Typical turnaround is a few days to a couple of weeks.
- [ ] After approval, the listing goes live automatically (or on a scheduled date, if you set one).
