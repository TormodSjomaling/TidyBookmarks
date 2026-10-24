// Zips dist/ into tidy-bookmarks-<version>.zip, ready for the Chrome Web Store.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const out = `tidy-bookmarks-${pkg.version}.zip`;

const zip = new AdmZip();
zip.addLocalFolder(fileURLToPath(new URL('dist/', root)));
zip.writeZip(fileURLToPath(new URL(out, root)));

console.log(`Packaged ${out}`);
