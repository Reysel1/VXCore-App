import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import WebSocket from 'ws';

import { createSession, type DiscordConfig } from './discord';

const AGENT_ENTRY = path.resolve(__dirname, 'index.ts');
const TSX_LOADER = pathToFileURL(require.resolve('tsx')).href;
const SESSION_SECRET = 'test-secret-'.padEnd(64, 'x');
const LOCAL_ORIGIN = 'http://localhost:3000';

interface Agent {
  url: string;
  port: number;
  dir: string;
  serverData: string;
  cfgPath: string;
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function prepareDir(files: Record<string, unknown> = {}): { dir: string; serverData: string; cfgPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-agent-'));
  const serverData = path.join(dir, 'server-data');
  const cfgPath = path.join(serverData, 'server.cfg');
  const resource = path.join(serverData, 'resources', 'myres');

  fs.mkdirSync(resource, { recursive: true });
  fs.writeFileSync(cfgPath, 'sv_hostname "Prueba"\nensure myres\n');
  fs.writeFileSync(path.join(resource, 'fxmanifest.lua'), "fx_version 'cerulean'\n");
  fs.writeFileSync(path.join(resource, 'client.lua'), 'print("hola")\n');
  fs.writeFileSync(path.join(dir, 'secreto.txt'), 'no me leas');

  fs.writeFileSync(
    path.join(dir, 'registered_servers.json'),
    JSON.stringify([
      {
        id: 'srv-test',
        name: 'Prueba',
        cfgPath,
        serverDataPath: serverData,
        rawContent: 'rcon_password "secreto"',
        dbConnection: 'mysql://root:secreto@localhost/fivem',
      },
    ])
  );
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(content));
  }
  return { dir, serverData, cfgPath };
}

async function startAgent(files: Record<string, unknown> = {}): Promise<Agent> {
  const { dir, serverData, cfgPath } = prepareDir(files);
  const port = await freePort();

  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('DISCORD_') || key.startsWith('FIVEOS_') || key.startsWith('VX_')) delete env[key];
  }
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, {
    PORT: String(port),
    HOST: '127.0.0.1',
    VX_TUNNEL_DISABLED: '1',
  });

  const child: ChildProcess = spawn(process.execPath, ['--import', TSX_LOADER, AGENT_ENTRY], {
    cwd: dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk) => (output += chunk));
  child.stderr?.on('data', (chunk) => (output += chunk));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) break;
    } catch {}
    if (child.exitCode !== null || Date.now() > deadline) {
      child.kill();
      throw new Error(`El agente no arrancó:\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return {
    url,
    port,
    dir,
    serverData,
    cfgPath,
    stop: async () => {
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve));
        child.kill('SIGKILL');
        await exited;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function call(
  agent: Agent,
  method: string,
  route: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${agent.url}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, data };
}

interface RawSocket {
  messages: string[];
  connected: Promise<string>;
  close: () => void;
}

function openSocket(agent: Agent, origin: string, token?: string): Promise<RawSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${agent.port}/socket.io/?EIO=4&transport=websocket`, { origin });
    const messages: string[] = [];
    let settle: (value: string) => void = () => {};
    const connected = new Promise<string>((done) => (settle = done));

    ws.on('error', reject);
    ws.on('message', (raw) => {
      const text = raw.toString();
      if (text.startsWith('0')) {
        ws.send(token ? `40${JSON.stringify({ token })}` : '40');
        resolve({ messages, connected, close: () => ws.terminate() });
        return;
      }
      if (text === '2') return ws.send('3');
      if (text.startsWith('40') || text.startsWith('44')) settle(text);
      messages.push(text);
    });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('agente en local, sin login exigido', () => {
  let agent: Agent;
  before(async () => {
    agent = await startAgent();
  });
  after(async () => {
    await agent?.stop();
  });

  test('save-cfg no escribe fuera de los servidores dados de alta', async () => {
    const secret = path.join(agent.dir, 'secreto.txt');
    const res = await call(agent, 'POST', '/api/server/save-cfg', { filePath: secret, cfgContent: 'pwned' });
    assert.equal(res.status, 403);
    assert.equal(res.data.code, 'UNKNOWN_SERVER');
    assert.equal(fs.readFileSync(secret, 'utf-8'), 'no me leas');

    const ok = await call(agent, 'POST', '/api/server/save-cfg', {
      filePath: agent.cfgPath,
      cfgContent: 'sv_hostname "Nuevo"\n',
    });
    assert.equal(ok.status, 200);
    assert.equal(fs.readFileSync(agent.cfgPath, 'utf-8'), 'sv_hostname "Nuevo"\n');
    assert.ok(fs.existsSync(`${agent.cfgPath}.bak`), 'debería dejar copia del cfg anterior');
  });

  test('read-cfg y parse-cfg sólo leen ficheros .cfg', async () => {
    const secret = path.join(agent.dir, 'secreto.txt');
    const read = await call(agent, 'POST', '/api/server/read-cfg', { cfgPath: secret });
    assert.equal(read.status, 400);
    assert.equal(read.data.rawContent, undefined);

    const parse = await call(agent, 'POST', '/api/server/parse-cfg', { filePath: secret });
    assert.equal(parse.status, 400);

    const good = await call(agent, 'POST', '/api/server/read-cfg', { cfgPath: agent.cfgPath });
    assert.equal(good.status, 200);
  });

  test('el editor no sale de los recursos del servidor', async () => {
    const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

    const traversal = await call(
      agent,
      'GET',
      `/api/resource/file?${qs({ name: '..', serverDataPath: agent.serverData, filePath: 'secreto.txt' })}`
    );
    assert.equal(traversal.status, 400);

    const otherFolder = await call(
      agent,
      'GET',
      `/api/resource/file?${qs({ name: 'server-data', serverDataPath: agent.dir, filePath: 'server.cfg' })}`
    );
    assert.equal(otherFolder.status, 403);

    const good = await call(
      agent,
      'GET',
      `/api/resource/file?${qs({ name: 'myres', serverDataPath: agent.serverData, filePath: 'client.lua' })}`
    );
    assert.equal(good.status, 200);
    assert.equal(good.data.content, 'print("hola")\n');

    const script = await call(agent, 'POST', '/api/resource/save-file', {
      resourceName: 'myres',
      serverDataPath: agent.serverData,
      filePath: 'run.cmd',
      content: 'calc.exe',
    });
    assert.equal(script.status, 400);
    assert.equal(fs.existsSync(path.join(agent.serverData, 'resources', 'myres', 'run.cmd')), false);

    const tree = await call(agent, 'GET', `/api/resource/tree?${qs({ serverDataPath: agent.dir })}`);
    assert.equal(tree.status, 403);
  });

  test('arrancar sólo acepta servidores del registro, nunca un ejecutable del cuerpo', async () => {
    const res = await call(agent, 'POST', '/api/server/start', {
      id: 'srv-inventado',
      cfgPath: path.join(agent.dir, 'otro.cfg'),
      fxServerBin: process.execPath,
    });
    assert.notEqual(res.status, 200);
    assert.equal(res.data.code, 'UNKNOWN_SERVER');
  });

  test('read-cfg no acepta rutas relativas', async () => {
    const res = await call(agent, 'POST', '/api/server/read-cfg', { cfgPath: 'server.cfg' });
    assert.equal(res.status, 400);
    assert.equal(res.data.rawContent, undefined);
  });

  test('el editor no sigue enlaces que salen del recurso', async () => {
    const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();
    const escape = await call(
      agent,
      'GET',
      `/api/resource/file?${qs({ name: 'myres', serverDataPath: agent.serverData, filePath: '../../../secreto.txt' })}`
    );
    assert.equal(escape.status, 400);

    const link = path.join(agent.serverData, 'resources', 'myres', 'fuera');
    fs.symlinkSync(agent.dir, link, 'junction');
    const linked = await call(
      agent,
      'GET',
      `/api/resource/file?${qs({ name: 'myres', serverDataPath: agent.serverData, filePath: 'fuera/secreto.txt' })}`
    );
    assert.equal(linked.status, 400);
    assert.notEqual(linked.data.content, 'no me leas');

    const write = await call(agent, 'POST', '/api/resource/save-file', {
      resourceName: 'myres',
      serverDataPath: agent.serverData,
      filePath: 'fuera/pwned.lua',
      content: 'x',
    });
    assert.equal(write.status, 400);
    assert.equal(fs.existsSync(path.join(agent.dir, 'pwned.lua')), false);
  });

  test('dar de alta exige un .cfg de verdad y no acepta carpetas sueltas', async () => {
    const bad = await call(agent, 'POST', '/api/server/register', {
      id: 'srv-malo',
      cfgPath: path.join(agent.dir, 'secreto.txt'),
    });
    assert.equal(bad.status, 400);

    const sneaky = await call(agent, 'POST', '/api/server/register', {
      id: 'srv-carpeta',
      serverDataPath: agent.dir,
    });
    assert.equal(sneaky.status, 200);
    const tree = await call(
      agent,
      'GET',
      `/api/resource/tree?${new URLSearchParams({ serverDataPath: agent.dir })}`
    );
    assert.equal(tree.status, 403);
  });

  test('los bans puestos desde el juego quedan registrados', async () => {
    const player = { license: 'license:abc123', license2: 'license2:def', tokens: ['3:tok'] };

    const offline = await call(agent, 'POST', '/api/sanctions/in-game', { ...player, reason: 'x' });
    assert.equal(offline.status, 404, 'no se banea a alguien que no está conectado');

    await call(agent, 'POST', '/api/server/telemetry', {
      players: 1,
      playersList: [{ source: 7, name: 'Tramposo', ping: 30, identifiers: player, tokens: player.tokens }],
    });

    const banned = await call(agent, 'POST', '/api/sanctions/in-game', {
      ...player,
      type: 'ban',
      reason: 'Aimbot',
      byName: 'Admin (in-game)',
    });
    assert.equal(banned.status, 200);
    assert.match(String(banned.data.message), /Aimbot/);

    const check = await call(agent, 'POST', '/api/sanctions/check', player);
    assert.equal(check.data.banned, true);
  });

  test('otra web no puede mandar órdenes ni abrir el canal en vivo', async () => {
    const res = await call(
      agent,
      'POST',
      '/api/server/command',
      { command: 'quit' },
      { Origin: 'https://evil.example' }
    );
    assert.equal(res.status, 403);
    assert.equal(res.data.code, 'ORIGIN_NOT_ALLOWED');

    await assert.rejects(openSocket(agent, 'https://evil.example'));
  });

  test('el panel local sigue abriendo el canal sin token', async () => {
    const socket = await openSocket(agent, LOCAL_ORIGIN);
    try {
      assert.match(await socket.connected, /^40/);
    } finally {
      socket.close();
    }
  });
});

describe('agente con login de Discord exigido', () => {
  const discord: Partial<DiscordConfig> = {
    clientId: 'client',
    clientSecret: 'secret',
    guildId: 'guild',
    owner: { id: '1', username: 'dueño' },
    requireLogin: true,
    sessionSecret: SESSION_SECRET,
    roles: { owner: [], admin: [], moderator: [] },
  };
  const config = { ...discord } as DiscordConfig;
  const ownerToken = createSession(config, { id: '1', username: 'dueño' }, 'owner');
  const guestToken = createSession(config, { id: '3', username: 'invitado' }, 'moderator', 'invite');

  let agent: Agent;
  before(async () => {
    agent = await startAgent({
      'discord-config.json': discord,
      'invites.json': {
        invites: [],
        members: [
          {
            userId: '3',
            username: 'invitado',
            level: 'moderator',
            inviteId: 'inv-1',
            joinedAt: new Date().toISOString(),
            sections: ['players'],
          },
        ],
      },
    });
  });
  after(async () => {
    await agent?.stop();
  });

  test('el canal en vivo pide sesión', async () => {
    const socket = await openSocket(agent, LOCAL_ORIGIN);
    try {
      const answer = await socket.connected;
      assert.match(answer, /^44/);
      assert.match(answer, /LOGIN_REQUIRED/);
    } finally {
      socket.close();
    }
  });

  test('un token falsificado no abre el canal', async () => {
    const forged = createSession({ ...config, sessionSecret: 'otro' }, { id: '1', username: 'dueño' }, 'owner');
    const socket = await openSocket(agent, LOCAL_ORIGIN, forged);
    try {
      assert.match(await socket.connected, /^44/);
    } finally {
      socket.close();
    }
  });

  test('la consola sólo llega a quien tiene la sección', async () => {
    const owner = await openSocket(agent, LOCAL_ORIGIN, ownerToken);
    const guest = await openSocket(agent, LOCAL_ORIGIN, guestToken);
    try {
      assert.match(await owner.connected, /^40/);
      assert.match(await guest.connected, /^40/);

      const res = await call(
        agent,
        'POST',
        '/api/server/command',
        { command: 'status' },
        { Authorization: `Bearer ${ownerToken}`, Origin: LOCAL_ORIGIN }
      );
      assert.equal(res.data.code, 'NO_CONSOLE');
      await sleep(400);

      const isLog = (m: string) => m.startsWith('42["server-log"');
      assert.ok(owner.messages.some(isLog), 'el dueño tiene que ver la consola');
      assert.equal(guest.messages.some(isLog), false, 'el invitado sin sección no debe verla');
    } finally {
      owner.close();
      guest.close();
    }
  });

  test('cambiar mayúsculas en la ruta no salta el inicio de sesión', async () => {
    for (const route of ['/API/server/command', '/Api/server/command', '/api/SERVER/command']) {
      const res = await call(agent, 'POST', route, { command: 'status' }, { Origin: LOCAL_ORIGIN });
      assert.notEqual(res.status, 200, route);
      assert.notEqual(res.data.code, 'NO_CONSOLE', route);
    }
  });

  test('un comando con saltos de línea no llega a la consola', async () => {
    const res = await call(
      agent,
      'POST',
      '/api/server/command',
      { command: 'status\nquit' },
      { Authorization: `Bearer ${ownerToken}`, Origin: LOCAL_ORIGIN }
    );
    assert.notEqual(res.data.code, 'NO_CONSOLE');
  });

  test('un moderador no recibe el server.cfg ni la cadena de la base de datos', async () => {
    const guest = await call(agent, 'GET', '/api/server/detect', undefined, {
      Authorization: `Bearer ${guestToken}`,
      Origin: LOCAL_ORIGIN,
    });
    assert.equal(guest.status, 200);
    const [server] = guest.data.servers as Record<string, unknown>[];
    assert.equal(server.rawContent, undefined);
    assert.equal(server.dbConnection, undefined);

    const owner = await call(agent, 'GET', '/api/server/detect', undefined, {
      Authorization: `Bearer ${ownerToken}`,
      Origin: LOCAL_ORIGIN,
    });
    const [full] = owner.data.servers as Record<string, unknown>[];
    assert.equal(full.dbConnection, 'mysql://root:secreto@localhost/fivem');
  });

  test('el API sigue exigiendo nivel: un moderador no edita scripts', async () => {
    const res = await call(
      agent,
      'POST',
      '/api/resource/save-file',
      { resourceName: 'myres', serverDataPath: agent.serverData, filePath: 'client.lua', content: 'x' },
      { Authorization: `Bearer ${guestToken}`, Origin: LOCAL_ORIGIN }
    );
    assert.equal(res.status, 403);
  });
});
