import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { readTar, writeTarEntries } from './blueprints';
import { paxRecord, tarball, tarEntry } from './archives.fixture';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-blueprints-'));
after(() => fs.rmSync(work, { recursive: true, force: true }));

const LONG = `repo-abc123/resources/${'x'.repeat(120)}.lua`;

const githubTarball = (...extra: Buffer[]) =>
  tarball(
    tarEntry('pax_global_header', paxRecord('comment', 'abc123'), 'g'),
    tarEntry('repo-abc123/', '', '5'),
    tarEntry('repo-abc123/resources/', '', '5'),
    tarEntry('repo-abc123/resources/qb-core/fxmanifest.lua', 'fx_version "cerulean"'),
    tarEntry('PaxHeader/long', paxRecord('path', LONG), 'x'),
    tarEntry('repo-abc123/resources/nombre-cortado', 'largo'),
    tarEntry('repo-abc123/README.md', '# repo'),
    ...extra
  );

test('readTar: cada entrada con su nombre, su contenido y el path largo de pax', () => {
  const entries = readTar(githubTarball());
  assert.deepEqual(
    entries.map((e) => e.name),
    ['repo-abc123/', 'repo-abc123/resources/', 'repo-abc123/resources/qb-core/fxmanifest.lua', LONG, 'repo-abc123/README.md']
  );
  assert.equal(entries[0].data, null, 'las carpetas no traen contenido');
  assert.equal(entries[2].data?.toString(), 'fx_version "cerulean"');
  assert.equal(entries[3].data?.toString(), 'largo');
});

test('writeTarEntries: sólo la subcarpeta pedida, sin la raíz del tarball', () => {
  const root = path.join(work, 'resources');
  writeTarEntries(githubTarball(), root, 'resources');

  assert.equal(fs.readFileSync(path.join(root, 'qb-core', 'fxmanifest.lua'), 'utf8'), 'fx_version "cerulean"');
  assert.ok(fs.existsSync(path.join(root, path.basename(LONG))));
  assert.ok(!fs.existsSync(path.join(root, 'README.md')), 'lo de fuera de resources/ no se escribe');
});

test('writeTarEntries: nada sale del destino, tampoco a una carpeta hermana con el mismo prefijo', () => {
  const root = path.join(work, 'qb-core');
  writeTarEntries(
    githubTarball(
      tarEntry('repo-abc123/resources/../qb-core-evil/x.lua', 'x'),
      tarEntry('repo-abc123/resources/../../evil.lua', 'x')
    ),
    root,
    'resources'
  );

  assert.ok(fs.existsSync(path.join(root, 'qb-core', 'fxmanifest.lua')));
  assert.ok(!fs.existsSync(path.join(work, 'qb-core-evil')), 'qb-core-evil empieza por qb-core y está fuera');
  assert.ok(!fs.existsSync(path.join(work, 'evil.lua')));
  assert.ok(!fs.existsSync(path.join(path.dirname(work), 'evil.lua')));
});
