import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/web');
const output = resolve(webRoot, 'public/ocr');
await mkdir(output, { recursive: true });
const packageRoot = (name) => dirname(require.resolve(name + '/package.json'));
const engineRoot = packageRoot('tesseract.js');
const coreRoot = packageRoot('tesseract.js-core');
await copyFile(resolve(engineRoot, 'dist/worker.min.js'), resolve(output, 'worker.min.js'));
// Include every hardware variant: baseline, SIMD and relaxed SIMD. Never fetch a CDN at runtime.
for (const file of await readdir(coreRoot)) {
  if (/\.wasm(?:\.js)?$/.test(file)) await copyFile(resolve(coreRoot, file), resolve(output, file));
}
for (const lang of ['chi_sim', 'eng']) {
  await copyFile(
    resolve(packageRoot('@tesseract.js-data/' + lang), '4.0.0', lang + '.traineddata.gz'),
    resolve(output, lang + '.traineddata.gz'),
  );
}
await copyFile(resolve(engineRoot, 'LICENSE.md'), resolve(output, 'TESSERACT-JS-LICENSE.txt'));
await copyFile(resolve(coreRoot, 'LICENSE'), resolve(output, 'TESSERACT-CORE-LICENSE.txt'));
await writeFile(
  resolve(output, 'LANGUAGE-DATA-NOTICE.txt'),
  'Language data: @tesseract.js-data/chi_sim and @tesseract.js-data/eng 1.0.0.\nSource: https://github.com/naptha/tessdata (package license MIT).\nTesseract models: https://github.com/tesseract-ocr/tessdata (Apache-2.0).\n',
);
console.log('Local OCR worker, CPU variants and Chinese/English models are ready.');
