import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Server } from 'socket.io';

import { ProcessManager, binaryVariant, escrowResources } from './process-manager';

const CWD = process.cwd();
const PATHS_FILE = path.join(CWD, 'paths.json');
let originalPaths: string | null = null;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vxcore-bin-test-'));

function makeServerDir(name: string, files: string[], marker?: { game?: string; build?: string }): string {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    fs.writeFileSync(path.join(dir, file), 'x');
  }
  if (marker) {
    fs.writeFileSync(path.join(dir, '.vxcore-game'), JSON.stringify(marker), 'utf-8');
  }
  return dir;
}

function makeCfg(dir: string, content: string): string {
  const cfg = path.join(dir, 'server.cfg');
  fs.writeFileSync(cfg, content, 'utf-8');
  return cfg;
}

const pm = new ProcessManager({} as unknown as Server);

before(() => {
  if (fs.existsSync(PATHS_FILE)) {
    originalPaths = fs.readFileSync(PATHS_FILE, 'utf-8');
  }
  fs.writeFileSync(
    PATHS_FILE,
    JSON.stringify({ scanRoots: [], extraCfgs: [], fxServerBin: null, cfxServerBin: null }),
    'utf-8'
  );
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (originalPaths === null) fs.rmSync(PATHS_FILE, { force: true });
  else fs.writeFileSync(PATHS_FILE, originalPaths, 'utf-8');
});

test('Enhanced con marcador: usa cfx-server.exe aunque haya FXServer.exe al lado', () => {
  const dir = makeServerDir('enhanced-marker', ['cfx-server.exe', 'FXServer.exe'], {
    game: 'fivem',
    build: 'enhanced',
  });
  const found = pm.findFxServerBinary(dir);
  assert.ok(found);
  assert.match(path.basename(found!), /^cfx-server\.exe$/);
});

test('Legacy con marcador: usa FXServer.exe aunque haya cfx-server.exe al lado', () => {
  const dir = makeServerDir('legacy-marker', ['cfx-server.exe', 'FXServer.exe'], {
    game: 'fivem',
    build: 'legacy',
  });
  const found = pm.findFxServerBinary(dir);
  assert.ok(found);
  assert.match(path.basename(found!), /^FXServer\.exe$/);
});

test('RedM: el marcador dice redm/legacy y arranca con el mismo FXServer.exe', () => {
  const dir = makeServerDir('redm-marker', ['FXServer.exe'], { game: 'redm', build: 'legacy' });
  const found = pm.findFxServerBinary(dir);
  assert.ok(found);
  assert.match(path.basename(found!), /^FXServer\.exe$/);
});

test('Sin marcador: un cfg que fuerza el build 372 + cfx-server.exe al lado se toma por Enhanced', () => {
  const dir = makeServerDir('enhanced-heuristic', ['cfx-server.exe', 'FXServer.exe']);
  const cfg = makeCfg(dir, 'endpoint_add_tcp "0.0.0.0:30120"\nsv_enforceGameBuild 372\n');
  const found = pm.findFxServerBinary(dir, cfg);
  assert.ok(found);
  assert.match(path.basename(found!), /^cfx-server\.exe$/);
});

test('Un build Legacy de cuatro cifras NO se toma por Enhanced', () => {
  for (const build of ['1604', '2372', '2802', '3095', '3258', '3407', '3570', '3788']) {
    const dir = makeServerDir(`legacy-${build}`, ['cfx-server.exe', 'FXServer.exe']);
    const cfg = makeCfg(dir, `endpoint_add_tcp "0.0.0.0:30120"\nsv_enforceGameBuild ${build}\n`);
    const found = pm.findFxServerBinary(dir, cfg);
    assert.ok(found, `sin binario para el build ${build}`);
    assert.match(
      path.basename(found!),
      /^FXServer\.exe$/,
      `el build ${build} es de Legacy y se le dio el binario de Enhanced`
    );
  }
});

test('Sin marcador ni cfg de Enhanced: prefiere FXServer.exe', () => {
  const dir = makeServerDir('legacy-heuristic', ['cfx-server.exe', 'FXServer.exe']);
  const cfg = makeCfg(dir, 'endpoint_add_tcp "0.0.0.0:30120"\n');
  const found = pm.findFxServerBinary(dir, cfg);
  assert.ok(found);
  assert.match(path.basename(found!), /^FXServer\.exe$/);
});

test('El cfg manda sobre el marcador: build de Legacy con marcador Enhanced', () => {
  const dir = makeServerDir('marcador-viejo', ['cfx-server.exe', 'FXServer.exe'], {
    game: 'fivem',
    build: 'enhanced',
  });
  const cfg = makeCfg(dir, 'endpoint_add_tcp "0.0.0.0:30120"\nsv_enforceGameBuild 3788\n');
  const found = pm.findFxServerBinary(dir, cfg);
  assert.ok(found);
  assert.match(path.basename(found!), /^FXServer\.exe$/);
});

test('Sin binario en ninguna parte: null', () => {
  const dir = makeServerDir('empty', [], { game: 'fivem', build: 'legacy' });
  assert.equal(pm.findFxServerBinary(dir), null);
});

test('binaryVariant: cfx-server es Enhanced; FXServer.exe, run.cmd y run.sh son Legacy', () => {
  assert.equal(binaryVariant('C:\\VXCore\\FXServer-Enhanced\\139\\cfx-server.exe'), 'enhanced');
  assert.equal(binaryVariant('/opt/cfx-server/cfx-server'), 'enhanced');
  assert.equal(binaryVariant('C:\\server\\dlls\\FXServer.exe'), 'legacy');
  assert.equal(binaryVariant('C:\\server\\run.cmd'), 'legacy');
  assert.equal(binaryVariant('/home/fivem/server/run.sh'), 'legacy');
  assert.equal(binaryVariant('C:\\cfx-server\\FXServer.exe'), 'legacy');
});

test('escrowResources: cuenta los recursos con .fxap entrando en categorías, no en recursos', () => {
  const dir = makeServerDir('con-escrow', []);
  const res = path.join(dir, 'resources');
  const recurso = (rel: string, files: string[]) => {
    fs.mkdirSync(path.join(res, rel), { recursive: true });
    for (const file of files) fs.writeFileSync(path.join(res, rel, file), 'x');
  };

  recurso('[Encrypted]/[EscrowMaps]/mapa_cifrado', ['.fxap', 'fxmanifest.lua']);
  recurso('[Scripts]/script_cifrado', ['.fxap', 'fxmanifest.lua']);
  recurso('[Scripts]/script_libre', ['fxmanifest.lua']);
  recurso('suelto_cifrado', ['.fxap', 'fxmanifest.lua']);
  recurso('suelto_libre/stream', ['.fxap']);

  const found = escrowResources(dir);
  assert.equal(found.count, 3);
  assert.deepEqual([...found.names].sort(), ['mapa_cifrado', 'script_cifrado', 'suelto_cifrado']);
});

test('escrowResources: un servidor sin carpeta resources no tiene escrow', () => {
  const dir = makeServerDir('sin-resources', []);
  assert.deepEqual(escrowResources(dir), { count: 0, names: [] });
});

test('Una ruta de Legacy que apunta a cfx-server.exe se salta', () => {
  const enhancedDir = makeServerDir('artifact-enhanced', ['cfx-server.exe']);
  const dir = makeServerDir('ruta-cruzada', ['FXServer.exe']);
  const cfg = makeCfg(dir, 'endpoint_add_tcp "0.0.0.0:30120"\nset sv_enforceGameBuild 3788\n');

  const isolated = fs.readFileSync(PATHS_FILE, 'utf-8');
  try {
    fs.writeFileSync(
      PATHS_FILE,
      JSON.stringify({
        scanRoots: [],
        extraCfgs: [],
        fxServerBin: path.join(enhancedDir, 'cfx-server.exe'),
        cfxServerBin: null,
      }),
      'utf-8'
    );
    const found = pm.findFxServerBinary(dir, cfg);
    assert.ok(found);
    assert.equal(path.resolve(found!), path.resolve(dir, 'FXServer.exe'));
  } finally {
    fs.writeFileSync(PATHS_FILE, isolated, 'utf-8');
  }
});

test('force: legacy devuelve FXServer.exe aunque el marcador diga Enhanced', () => {
  const dir = makeServerDir('forzado', ['cfx-server.exe', 'FXServer.exe'], {
    game: 'fivem',
    build: 'enhanced',
  });
  const found = pm.findFxServerBinary(dir, undefined, 'legacy');
  assert.ok(found);
  assert.match(path.basename(found!), /^FXServer\.exe$/);
});

test('force: enhanced sin cfx-server.exe no ofrece el de Legacy', () => {
  const dir = makeServerDir('forzado-sin-enhanced', ['FXServer.exe'], { game: 'fivem', build: 'enhanced' });
  const original = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = makeServerDir('localappdata-vacio', []);
  try {
    assert.equal(pm.findFxServerBinary(dir, undefined, 'enhanced'), null);
  } finally {
    if (original === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = original;
  }
});

const emitir = (manager: ProcessManager, line: string) =>
  (manager as unknown as { emitLine: (l: string, s: 'stdout' | 'stderr') => void }).emitLine(line, 'stdout');

test('waitForLine: devuelve la línea que casa y deja de escuchar', async () => {
  const manager = new ProcessManager({ emit() {}, to() { return this; } } as unknown as Server);
  const espera = manager.waitForLine((l) => /Aviso enviado a todos/.test(l), 1000);

  emitir(manager, '[ info] [citizen-server-i] Started resource algo');
  emitir(manager, '^2[VXCore]^7 Aviso enviado a todos: Reinicio en 5 minutos');

  assert.match((await espera) ?? '', /Reinicio en 5 minutos/);
  const escuchando = (manager as unknown as { logListeners: unknown[] }).logListeners.length;
  assert.equal(escuchando, 0, 'no puede quedar un listener colgado por cada anuncio');
});

test('waitForLine: sin respuesta en plazo devuelve null y también deja de escuchar', async () => {
  const manager = new ProcessManager({ emit() {}, to() { return this; } } as unknown as Server);
  const resultado = await manager.waitForLine(() => false, 30);
  assert.equal(resultado, null);
  assert.equal((manager as unknown as { logListeners: unknown[] }).logListeners.length, 0);
});
