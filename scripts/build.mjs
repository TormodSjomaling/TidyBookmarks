// Copies the extension's runtime files into dist/ and stamps package.json's
// version into dist/manifest.json, so package.json is the single source of
// truth for the version. In the React rewrite this is replaced by `vite build`.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);

const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
manifest.version = pkg.version;

await rm(dist, { recursive: true, force: true });
await mkdir(new URL('icons/', dist), { recursive: true });

await cp(new URL('src/', root), new URL('src/', dist), { recursive: true });
for (const file of await readdir(new URL('icons/', root))) {
  if (file.endsWith('.png')) {
    await cp(new URL(`icons/${file}`, root), new URL(`icons/${file}`, dist));
  }
}
await writeFile(new URL('manifest.json', dist), JSON.stringify(manifest, null, 2) + '\n');

console.log(`Built Tidy Bookmarks ${pkg.version} into dist/`);
