import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readOneSync, writeConvar } from './cfg-convars';

const CFG_COMENTADO = [
  'endpoint_add_tcp "0.0.0.0:30120"',
  '## [Gestor CFG validator]: OneSync is managed by Gestor and MUST NOT be set in server.cfg.',
  '## [Gestor CFG validator]: onesync MUST only be set in the Gestor settings page.',
  '# set onesync on',
  'endpoint_add_udp "0.0.0.0:30120"',
  '# comentario del dueño que no se toca',
  'ensure mapmanager',
].join('\n');

test('readOneSync: sólo comentado es OneSync apagado y se sabe que está comentado', () => {
  const reading = readOneSync(CFG_COMENTADO);
  assert.equal(reading.mode, 'off');
  assert.equal(reading.commentedOnly, true);
});

test('writeConvar: activa OneSync en su sitio y se lleva las notas del validador', () => {
  const out = writeConvar(CFG_COMENTADO, 'onesync', 'on');
  const lines = out.split('\n');

  assert.ok(!/CFG validator/i.test(out), 'la nota diría que OneSync no puede estar en el cfg, y está');
  assert.equal(lines[1], 'set onesync on', 'se reescribe donde estaba, antes de los ensure');
  assert.ok(lines.includes('# comentario del dueño que no se toca'));
  assert.equal(readOneSync(out).mode, 'on');
});

test('writeConvar: las notas del validador sobre OTRO ajuste se quedan', () => {
  const cfg = '## [Gestor CFG validator]: sv_maxclients is managed elsewhere.\nset onesync legacy\n';
  const out = writeConvar(cfg, 'onesync', 'on');
  assert.match(out, /sv_maxclients is managed elsewhere/);
  assert.match(out, /^set onesync on$/m);
});

test('writeConvar: respeta los saltos de línea de Windows', () => {
  const out = writeConvar(CFG_COMENTADO.replace(/\n/g, '\r\n'), 'onesync', 'on');
  assert.ok(out.includes('\r\n'));
  assert.ok(!/(^|[^\r])\n/.test(out), 'no mezcla \\n sueltos en un cfg con \\r\\n');
});
