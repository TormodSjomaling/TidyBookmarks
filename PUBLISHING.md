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
- [x] Automated — see [Releasing updates](#releasing-updates) below. `npm run build` copies only the runtime files (`manifest.json`, `src/`, `icons/*.png`) into `dist/`, and `npm run package` zips that into `tidy-bookmarks-<version>.zip`.

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

## Releasing updates

Releases are automated by `.github/workflows/release.yml`. It runs when a `v*` tag is pushed.

### Every release
```sh
npm version patch   # or minor / major — bumps package.json and creates the v<version> tag
git push --follow-tags
```
The workflow then:
1. Checks that the tag matches `package.json`'s version (and fails if it doesn't).
2. Runs `npm run build` + `npm run package`. The version in `package.json` is written into the bundled `manifest.json`.
3. Uploads the zip to the Chrome Web Store and submits it for review and publishing.
4. Creates a GitHub Release with the zip attached and notes generated from the commits.

Don't edit `"version"` in `manifest.json` by hand, because `package.json` is the source of truth. The Store also rejects a version number that isn't higher than the live one.

### One-time setup
1. **Get API credentials.** Follow the [chrome-webstore-upload-keys guide](https://github.com/fregante/chrome-webstore-upload-keys): create a Google Cloud project, enable the Chrome Web Store API, create an OAuth client, and generate a refresh token.
2. **Find your IDs.** The extension ID is in the Developer Dashboard URL and on the item's page. The publisher ID is under the Dashboard's account settings.
3. **Add repository secrets** under GitHub → Settings → Secrets and variables → Actions:
   - `CWS_EXTENSION_ID`
   - `CWS_PUBLISHER_ID`
   - `CWS_CLIENT_ID`
   - `CWS_CLIENT_SECRET`
   - `CWS_REFRESH_TOKEN`

### If a release fails
- **Tag/version mismatch**: delete the tag (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`), fix `package.json`, then tag again.
- **Upload or publish step fails** (expired token, item still in review, and so on): fix the cause, then re-run the failed job from the Actions tab. You can also upload the zip from the GitHub Release by hand in the Developer Dashboard.
