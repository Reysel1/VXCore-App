import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

import { storedZip } from './archives.fixture';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-open77-'));
const originalCwd = process.cwd();
process.chdir(work);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const o77 = require('./open77') as typeof import('./open77');

const serverDir = path.join(work, 'srv');
const exe = process.platform === 'win32' ? 'Open77.Server.exe' : 'Open77.Server';
const KEY = 'op77_live_abcdefghijkl';

before(() => {
  fs.mkdirSync(serverDir, { recursive: true });
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(work, { recursive: true, force: true });
});

test('parseJsonc: comentarios y comas finales fuera, sin romper URLs dentro de cadenas', () => {
  const parsed = o77.parseJsonc(`{
    // comentario
    "masterServer": { "url": "https://master.open2077.net/", /* bloque */ "enabled": true, },
    "identity": { "name": "Neon // District" },
  }`);
  assert.equal(parsed.masterServer.url, 'https://master.open2077.net/');
  assert.equal(parsed.identity.name, 'Neon // District');
});

test('createOpen77Server: sin el ejecutable en la carpeta, error claro', () => {
  const r = o77.createOpen77Server({
    serverDir, name: 'X', port: 11778, maxPlayers: 32, visibility: 'public', licenseKey: KEY,
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /Open77\.Server/);
});

test('createOpen77Server: rechaza una clave que no es op77_live_', () => {
  fs.writeFileSync(path.join(serverDir, exe), '');
  const r = o77.createOpen77Server({
    serverDir, name: 'X', port: 11778, maxPlayers: 32, visibility: 'public', licenseKey: 'cfxk_nope',
  });
  assert.equal(r.ok, false);
});

test('createOpen77Server: escribe server.jsonc sin la clave y la guarda aparte', () => {
  const r = o77.createOpen77Server({
    serverDir, name: 'Neon District RP', port: 11779, maxPlayers: 48, visibility: 'private',
    publicEndpoint: 'play.example.com:11779', licenseKey: KEY,
  });
  assert.equal(r.ok, true);
  const raw = fs.readFileSync(r.cfgPath!, 'utf8');
  assert.ok(!raw.includes('op77_live_'), 'la clave no puede acabar en server.jsonc');

  const info = o77.readOpen77Config(r.cfgPath!, { maxClients: 48 });
  assert.equal(info.name, 'Neon District RP');
  assert.equal(info.port, 11779);
  assert.equal(info.visibility, 'private');
  assert.equal(info.wardenUrl, 'http://127.0.0.1:11780');
  assert.equal(o77.getOpen77Secrets(r.cfgPath!)?.licenseKey, KEY);
});

test('createOpen77Server: respeta un server.jsonc que ya existe', () => {
  const r = o77.createOpen77Server({
    serverDir, name: 'Otro nombre', port: 1, maxPlayers: 1, visibility: 'public', licenseKey: 'op77_live_zzzzzzzzzzzz',
  });
  assert.equal(r.keptExistingConfig, true);
  assert.equal(o77.readOpen77Config(r.cfgPath!).name, 'Neon District RP');
  assert.equal(o77.getOpen77Secrets(r.cfgPath!)?.licenseKey, 'op77_live_zzzzzzzzzzzz');
});

test('buildOpen77Launch: sin asistente, RCON en loopback y secretos por entorno', () => {
  const cfg = path.join(serverDir, 'server.jsonc');
  const { args, env } = o77.buildOpen77Launch(cfg, { port: 11779, maxPlayers: 48 });
  assert.deepEqual(args, ['--no-setup', '--config', 'server.jsonc', '--max-players', '48']);
  assert.equal(env.OP77_CONFIG__RCON__ENABLED, 'true');
  assert.equal(env.OP77_CONFIG__RCON__BINDADDRESS, '127.0.0.1');
  assert.equal(env.OP77_CONFIG__NETWORK__PORT, '11779');
  assert.ok((env.OP77_RCON_PASSWORD || '').length >= 16);
  assert.ok(env.OP77_LICENSE_KEY?.startsWith('op77_live_'));
});

function frame(obj: unknown) {
  const payload = Buffer.from(JSON.stringify(obj));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

test('RCON: sonda, jugadores y comandos contra un servidor simulado', async () => {
  const cfg = path.join(serverDir, 'server.jsonc');
  const port = 20000 + Math.floor(Math.random() * 20000);
  const { rconPassword } = o77.saveOpen77Secrets(cfg, { rconPort: port });

  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let authed = false;
    const hello = frame({ type: 'hello', protocol: 'open77-rcon', version: 1 });
    sock.write(hello.subarray(0, 3));
    setTimeout(() => sock.write(hello.subarray(3)), 10);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (buf.length < 4 + len) break;
        const msg = JSON.parse(buf.subarray(4, 4 + len).toString());
        buf = buf.subarray(4 + len);
        if (msg.op === 'auth') {
          authed = msg.password === rconPassword;
          sock.write(frame({ id: msg.id, ok: authed }));
        } else if (!authed) {
          sock.write(frame({ id: msg.id, type: 'error', code: 'unauthorized', message: 'no' }));
        } else if (msg.op === 'request' && msg.path === '/api/players') {
          const body = Buffer.from(JSON.stringify([{ id: 7, name: 'V', ping: 33 }, { id: 9, name: 'Johnny' }]));
          sock.write(Buffer.concat([
            frame({ id: msg.id, type: 'response', status: 200 }),
            frame({ id: msg.id, type: 'data', data: body.subarray(0, 10).toString('base64') }),
            frame({ id: msg.id, type: 'data', data: body.subarray(10).toString('base64') }),
            frame({ id: msg.id, type: 'end', complete: true, error: null }),
          ]));
        } else if (msg.op === 'command') {
          sock.write(Buffer.concat([
            frame({ id: msg.id, type: 'response', status: 200 }),
            frame({ id: msg.id, type: 'data', data: Buffer.from(`ran: ${msg.command}`).toString('base64') }),
            frame({ id: msg.id, type: 'end', complete: true, error: null }),
          ]));
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  try {
    assert.equal((await o77.probeOpen77(cfg)).reachable, true);
    const players = await o77.getOpen77Players(cfg);
    assert.deepEqual(players.map((p) => p.name), ['V', 'Johnny']);
    const out = await o77.open77Command(cfg, 'status');
    assert.equal(out.ok, true);
    assert.equal(out.output, 'ran: status');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  assert.equal((await o77.probeOpen77(cfg, 500)).reachable, false);
});

const onWindows = { skip: !o77.OPEN77_ARCHIVE_SUPPORTED };
const BS = '\\';

function freshDir(name: string): string {
  const dir = path.join(work, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('findOpen77Archive: el zip del servidor se reconoce por dentro, también con «\\»', onWindows, () => {
  const downloads = freshDir('Downloads');
  fs.writeFileSync(path.join(downloads, 'otra-cosa.zip'), storedZip({ 'readme.txt': 'nada' }));
  fs.writeFileSync(path.join(downloads, 'a-medias.zip.crdownload'), storedZip({ 'x/Open77.Server.exe': 'MZ' }));
  assert.equal(o77.findOpen77Archive(downloads), null);

  fs.writeFileSync(path.join(downloads, 'build.zip'), storedZip({ [`Open77-Server-win-x64${BS}Open77.Server.exe`]: 'MZ' }));
  const found = o77.findOpen77Archive(downloads);
  assert.equal(found?.name, 'build.zip');
  assert.ok(Date.parse(found!.downloadedAt) > Date.now() - 60_000);
});

test('findOpen77Archive: un zip copiado cuenta desde que llegó, no desde su fecha de modificación', onWindows, () => {
  const downloads = freshDir('Downloads-copia');
  const file = path.join(downloads, 'copiado.zip');
  fs.writeFileSync(file, storedZip({ 'Open77.Server.exe': 'MZ' }));
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  fs.utimesSync(file, old, old);

  const found = o77.findOpen77Archive(downloads);
  assert.equal(found?.name, 'copiado.zip');
  assert.ok(Date.parse(found!.downloadedAt) > Date.now() - 60_000);
});

test('extractOpen77Archive: sin la capa raíz y sin pisar nunca otra carpeta', onWindows, async () => {
  const zip = path.join(freshDir('Downloads-extract'), 'build.zip');
  fs.writeFileSync(
    zip,
    storedZip({ [`Open77-Server-win-x64${BS}Open77.Server.exe`]: 'MZ', [`Open77-Server-win-x64${BS}Start.cmd`]: '@echo off' })
  );
  const desktop = freshDir('Escritorio');

  const target = path.join(work, 'mi-servidor');
  assert.deepEqual(await o77.extractOpen77Archive(zip, { targetDir: target, fallbackParent: desktop }), {
    ok: true,
    serverDir: target,
  });
  assert.ok(fs.existsSync(path.join(target, 'Open77.Server.exe')));
  assert.ok(fs.existsSync(path.join(target, 'Start.cmd')));

  assert.deepEqual(await o77.extractOpen77Archive(zip, { targetDir: target, fallbackParent: desktop }), {
    ok: true,
    serverDir: path.join(work, 'Open77-Server'),
  });

  const busy = freshDir('con-cosas');
  fs.writeFileSync(path.join(busy, 'notas.txt'), 'x');
  assert.deepEqual(await o77.extractOpen77Archive(zip, { targetDir: busy, fallbackParent: desktop }), {
    ok: true,
    serverDir: path.join(busy, 'Open77-Server'),
  });

  assert.deepEqual(await o77.extractOpen77Archive(zip, { targetDir: 'relativa', fallbackParent: desktop }), {
    ok: true,
    serverDir: path.join(desktop, 'Open77-Server'),
  });
  assert.deepEqual(await o77.extractOpen77Archive(zip, { fallbackParent: desktop }), {
    ok: true,
    serverDir: path.join(desktop, 'Open77-Server-2'),
  });
});

test('extractOpen77Archive: el ejecutable en una subcarpeta, y lo que no es el servidor, con su motivo', onWindows, async () => {
  const downloads = freshDir('Downloads-sub');
  const desktop = freshDir('Escritorio-sub');

  const nested = path.join(downloads, 'nested.zip');
  fs.writeFileSync(nested, storedZip({ 'LEEME.txt': 'x', 'Open77-1.2/bin/Open77.Server.exe': 'MZ' }));
  assert.deepEqual(await o77.extractOpen77Archive(nested, { fallbackParent: desktop }), {
    ok: true,
    serverDir: path.join(desktop, 'Open77-Server', 'Open77-1.2', 'bin'),
  });

  const other = path.join(downloads, 'otra.zip');
  fs.writeFileSync(other, storedZip({ 'readme.txt': 'x' }));
  const notServer = await o77.extractOpen77Archive(other, { fallbackParent: desktop });
  assert.equal(notServer.ok, false);
  assert.match(notServer.message!, /Open77\.Server\.exe/);

  const missing = await o77.extractOpen77Archive(path.join(downloads, 'no-existe.zip'), { fallbackParent: desktop });
  assert.equal(missing.ok, false);
  assert.match(missing.message!, /no-existe\.zip/);
  assert.doesNotMatch(missing.message!, /Open77\.Server\.exe/, 'no está: no es lo mismo que no ser el servidor');
});

test('extractOpen77Archive: si falla a medias no deja nada, y la siguiente funciona', onWindows, async () => {
  const downloads = freshDir('Downloads-roto');
  const desktop = freshDir('Escritorio-roto');

  const broken = storedZip({ 'Open77.Server.exe': 'MZ', 'datos.bin': 'contenido' });
  broken[broken.indexOf('contenido')] ^= 0xff;
  const file = path.join(downloads, 'roto.zip');
  fs.writeFileSync(file, broken);

  await assert.rejects(o77.extractOpen77Archive(file, { fallbackParent: desktop }));
  assert.ok(!fs.existsSync(path.join(desktop, 'Open77-Server')), 'ni el .exe que ya se había escrito');

  const good = path.join(downloads, 'bueno.zip');
  fs.writeFileSync(good, storedZip({ 'Open77.Server.exe': 'MZ' }));
  assert.deepEqual(await o77.extractOpen77Archive(good, { fallbackParent: desktop }), {
    ok: true,
    serverDir: path.join(desktop, 'Open77-Server'),
  });
});
