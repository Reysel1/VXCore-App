import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { findKnownDataPath, isSafeResourceName, MAX_CFG_BYTES, readImportableCfg } from './path-guards';

test('un nombre de recurso no puede ser una ruta', () => {
  for (const bad of ['', '   ', '.', '..', '../..', 'a/b', 'a\\b', 'x\0y', 'a'.repeat(201), 42, null]) {
    assert.equal(isSafeResourceName(bad), false, `debería rechazar ${JSON.stringify(bad)}`);
  }
  for (const good of ['qb-core', '[qb]', 'ox_lib', 'mi recurso', 'fiveos-resource']) {
    assert.equal(isSafeResourceName(good), true, `debería aceptar ${good}`);
  }
});

test('la carpeta tiene que ser la de un servidor dado de alta', () => {
  const base = path.resolve(os.tmpdir(), 'FXServer', 'server-data');
  const servers = [{ serverDataPath: base }, { serverDataPath: undefined }];

  assert.equal(findKnownDataPath(servers, base), base);
  if (process.platform === 'win32') assert.equal(findKnownDataPath(servers, base.toUpperCase()), base);
  assert.equal(findKnownDataPath(servers, path.join(base, 'resources')), null);
  assert.equal(findKnownDataPath(servers, path.dirname(base)), null);
  assert.equal(findKnownDataPath(servers, ''), null);
  assert.equal(findKnownDataPath(servers, 7), null);
});

test('importar sólo lee ficheros .cfg razonables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-guards-'));
  try {
    const cfg = path.join(dir, 'server.cfg');
    fs.writeFileSync(cfg, 'sv_hostname "Prueba"\n');
    const secret = path.join(dir, 'discord-config.json');
    fs.writeFileSync(secret, '{"sessionSecret":"no-me-leas"}');
    const folder = path.join(dir, 'carpeta.cfg');
    fs.mkdirSync(folder);
    const huge = path.join(dir, 'enorme.cfg');
    fs.writeFileSync(huge, Buffer.alloc(MAX_CFG_BYTES + 1, 'a'));

    const ok = readImportableCfg(cfg);
    assert.equal(ok.ok, true);
    assert.equal(ok.ok && ok.content, 'sv_hostname "Prueba"\n');

    const notCfg = readImportableCfg(secret);
    assert.equal(notCfg.ok, false);
    assert.equal(!notCfg.ok && notCfg.status, 400);

    assert.equal(readImportableCfg(path.join(dir, 'no-existe.cfg')).ok, false);
    assert.equal(readImportableCfg(folder).ok, false);
    assert.equal(readImportableCfg(huge).ok, false);
    assert.equal(readImportableCfg(undefined).ok, false);
    assert.equal(readImportableCfg('server.cfg').ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
