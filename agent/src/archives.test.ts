import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { extractZipSkippingRoot, isInside, readZipEntryNames, zipEntryPath } from './archives';
import { storedZip } from './archives.fixture';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-archives-'));
after(() => fs.rmSync(work, { recursive: true, force: true }));

const BS = '\\';

test('isInside: dentro sí; fuera, el propio destino y la carpeta hermana con el mismo prefijo, no', () => {
  const root = path.join(work, 'srv');
  assert.ok(isInside(root, path.join(root, 'a', 'b.txt')));
  assert.ok(isInside(root, path.join(root, '..datos', 'x')), 'un nombre que empieza por dos puntos está dentro');
  assert.ok(!isInside(root, root));
  assert.ok(!isInside(root, path.join(root, '..', 'fuera.txt')));
  assert.ok(!isInside(root, `${root}-otro${path.sep}x.txt`), 'srv-otro empieza por srv y está fuera');
});

test('readZipEntryNames: lee el directorio central, con los nombres tal cual', () => {
  const file = path.join(work, 'names.zip');
  fs.writeFileSync(file, storedZip({ 'raiz/a.txt': 'a', [`raiz${BS}sub${BS}b.dll`]: 'b', 'raiz/ñandú.txt': 'c' }));
  assert.deepEqual(readZipEntryNames(file), ['raiz/a.txt', `raiz${BS}sub${BS}b.dll`, 'raiz/ñandú.txt']);
  assert.equal(zipEntryPath(`raiz${BS}sub${BS}b.dll`), 'raiz/sub/b.dll');
});

test('readZipEntryNames: lo que no es un zip entero da null, sin lanzar', () => {
  const zip = storedZip({ 'a.txt': 'hola' });
  const cut = path.join(work, 'cut.zip');
  fs.writeFileSync(cut, zip.subarray(0, zip.length - 10));
  assert.equal(readZipEntryNames(cut), null, 'a medio descargar');

  const text = path.join(work, 'text.zip');
  fs.writeFileSync(text, 'no soy un zip');
  assert.equal(readZipEntryNames(text), null);

  const empty = path.join(work, 'empty.zip');
  fs.writeFileSync(empty, '');
  assert.equal(readZipEntryNames(empty), null);
});

test('extractZipSkippingRoot: nada sale del destino y los nombres con dos puntos delante se respetan', async () => {
  const file = path.join(work, 'slip.zip');
  fs.writeFileSync(
    file,
    storedZip({
      '../evil.txt': 'x',
      [`..${BS}evil2.txt`]: 'x',
      'sub/../../evil3.txt': 'x',
      '..datos/config.json': '{}',
      '..gitkeep': '',
      'ok/inner.txt': 'ok',
    })
  );
  const dest = path.join(work, 'slip-dest');
  fs.mkdirSync(dest);
  await extractZipSkippingRoot(file, dest, false);

  for (const evil of ['evil.txt', 'evil2.txt', 'evil3.txt']) {
    assert.ok(!fs.existsSync(path.join(work, evil)), `${evil} no debe salir del destino`);
  }
  assert.ok(fs.existsSync(path.join(dest, '..datos', 'config.json')));
  assert.ok(fs.existsSync(path.join(dest, '..gitkeep')));
  assert.equal(fs.readFileSync(path.join(dest, 'ok', 'inner.txt'), 'utf8'), 'ok');
});

test('extractZipSkippingRoot: salta la carpeta raíz también con «\\» de Compress-Archive', async () => {
  const file = path.join(work, 'bs.zip');
  fs.writeFileSync(file, storedZip({ [`pkg${BS}fxmanifest.lua`]: 'fx', [`pkg${BS}client${BS}main.lua`]: 'main' }));
  const dest = path.join(work, 'bs-dest');
  fs.mkdirSync(dest);
  await extractZipSkippingRoot(file, dest, true);

  assert.equal(fs.readFileSync(path.join(dest, 'fxmanifest.lua'), 'utf8'), 'fx');
  assert.equal(fs.readFileSync(path.join(dest, 'client', 'main.lua'), 'utf8'), 'main');
});
