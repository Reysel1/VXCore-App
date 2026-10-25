import { test } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { buildServerCfg, copyBundledResource, parseLegacyListing } from './provision';

const BASE = {
  targetDir: 'C:\\servidores\\mi-rp',
  hostname: 'Mi servidor de rol',
  maxClients: 32,
  port: 30120,
  licenseKey: 'cfxk_test',
  ensures: ['mapmanager', 'chat', 'vxcore'],
};

test('RedM: lleva set gamename rdr3 y no fuerza gamebuild', () => {
  const cfg = buildServerCfg({ ...BASE, game: 'redm', build: 'legacy' });

  assert.match(cfg, /set gamename rdr3/);
  assert.doesNotMatch(cfg, /sv_enforceGameBuild/);
  const anon = buildServerCfg({ ...BASE, hostname: '', game: 'redm', build: 'legacy' });
  assert.match(anon, /Mi servidor de RedM/);
});

test('FiveM Legacy: ni gamename ni gamebuild forzado', () => {
  const cfg = buildServerCfg({ ...BASE, game: 'fivem', build: 'legacy' });

  assert.doesNotMatch(cfg, /gamename/);
  assert.doesNotMatch(cfg, /sv_enforceGameBuild/);
  const anon = buildServerCfg({ ...BASE, hostname: '', game: 'fivem', build: 'legacy' });
  assert.match(anon, /Mi servidor de FiveM/);
});

test('FiveM Enhanced: fuerza el gamebuild 372 y no mete gamename de RedM', () => {
  const cfg = buildServerCfg({ ...BASE, game: 'fivem', build: 'enhanced' });

  assert.match(cfg, /sv_enforceGameBuild 372/);
  assert.doesNotMatch(cfg, /gamename rdr3/);
});

test('RedM nunca acepta el build enhanced: se fuerza legacy al crearlo', () => {
  const cfg = buildServerCfg({ ...BASE, game: 'redm', build: 'enhanced' as 'legacy' | 'enhanced' });
  assert.doesNotMatch(cfg, /sv_enforceGameBuild/);
  assert.match(cfg, /set gamename rdr3/);
});

test('copyBundledResource: conserva config.lua y retira la estructura vieja', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'vxcore-recurso-'));
  const empaquetado = path.join(raiz, 'empaquetado');
  const instalado = path.join(raiz, 'instalado');

  const escribir = (base: string, relativo: string, contenido: string) => {
    fs.mkdirSync(path.dirname(path.join(base, relativo)), { recursive: true });
    fs.writeFileSync(path.join(base, relativo), contenido);
  };

  try {
    escribir(empaquetado, 'fxmanifest.lua', 'nuevo');
    escribir(empaquetado, 'config.lua', 'Config = { de_serie = true }');
    escribir(empaquetado, 'source/src/client/init.lua', '-- cliente');
    escribir(empaquetado, 'server/sv_menu.lua', '-- viejo');

    escribir(instalado, 'fxmanifest.lua', 'viejo');
    escribir(instalado, 'config.lua', 'Config = { del_dueno = true }');
    escribir(instalado, 'client/cl_admin.lua', '-- viejo');
    escribir(instalado, 'nui/index.html', '<html>');
    escribir(instalado, '.vxcore-version', '0.10.25');

    copyBundledResource(empaquetado, instalado);

    assert.equal(fs.readFileSync(path.join(instalado, 'fxmanifest.lua'), 'utf-8'), 'nuevo');
    assert.equal(fs.readFileSync(path.join(instalado, 'config.lua'), 'utf-8'), 'Config = { del_dueno = true }');
    assert.ok(fs.existsSync(path.join(instalado, 'source/src/client/init.lua')));
    assert.ok(!fs.existsSync(path.join(instalado, 'client')));
    assert.ok(!fs.existsSync(path.join(instalado, 'nui')));
    assert.ok(!fs.existsSync(path.join(instalado, 'server')));
    assert.ok(fs.existsSync(path.join(instalado, '.vxcore-version')));

    const nueva = path.join(raiz, 'nueva');
    copyBundledResource(empaquetado, nueva);
    assert.equal(fs.readFileSync(path.join(nueva, 'config.lua'), 'utf-8'), 'Config = { de_serie = true }');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

const LISTADO = `
<div class="panel-block">
<a href= "./35245-6efb47dff473c0e2a12fb50b08d74c0eb24a50d5/server.7z" class="button is-link is-primary">
LATEST RECOMMENDED (35245)
</a>&nbsp;
</div>
<a class="panel-block " href="./35945-0d8a2a6f78a9922445d8930305af82a7b1826980/server.7z" style="display: block;">
<div class="level"><div class="level-left"> 35945 </div>
<div class="level-right"><div class="level-item"> 2026-09-07 11:16:32 </div></div></div>
</a>
<a class="panel-block " href="./35245-6efb47dff473c0e2a12fb50b08d74c0eb24a50d5/server.7z" style="display: block;">
<div class="level"><div class="level-left"> 35245 </div>
<div class="level-right"><div class="level-item"> 2026-08-01 09:00:00 </div></div></div>
</a>
<a class="panel-block " href="./7290-a654bcc2adfa27c4e020fc915a1a6343c3b4f921/server.7z" style="display: block;">
<div class="level"><div class="level-left"> 7290 </div></div>
</a>
`;

test('parseLegacyListing: todas las builds, con su hash y su fecha, de la más nueva a la más vieja', () => {
  const builds = parseLegacyListing(LISTADO);
  assert.deepEqual(builds.map((b) => b.build), ['35945', '35245', '7290']);
  assert.equal(builds[0].hash, '0d8a2a6f78a9922445d8930305af82a7b1826980');
  assert.equal(builds[1].date, '2026-08-01 09:00:00');
  assert.equal(builds[2].date, undefined);
});
