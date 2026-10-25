import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDiscordId, resolveInGameAccess } from './ingame-access';

const config = {
  owner: { id: '100000000000000001', username: 'dueno' },
  roles: { owner: [], admin: ['rol-admin'], moderator: ['rol-mod', 'rol-mod-sanciones'] },
  roleSections: { 'rol-mod-sanciones': ['sanctions' as const] },
};

const base = { config, roleIds: null, invitedLevel: null, invitedSections: null };

test('sin Discord vinculado en FiveM no hay acceso por el panel', () => {
  assert.deepEqual(resolveInGameAccess({ ...base, discordId: null }), {
    allowed: false, level: 'none', sections: null, reason: 'sin_discord',
  });
});

test('la cuenta dueña del panel entra siempre, sin recortes', () => {
  const r = resolveInGameAccess({ ...base, discordId: '100000000000000001' });
  assert.equal(r.allowed, true);
  assert.equal(r.level, 'owner');
  assert.equal(r.sections, null);
});

test('el rol de Discord da su nivel, y sus secciones', () => {
  const admin = resolveInGameAccess({ ...base, discordId: '200000000000000002', roleIds: ['rol-admin'] });
  assert.deepEqual([admin.level, admin.sections], ['admin', null]);

  const limitado = resolveInGameAccess({ ...base, discordId: '200000000000000003', roleIds: ['rol-mod-sanciones'] });
  assert.deepEqual([limitado.level, limitado.sections], ['moderator', ['sanctions']]);
});

test('invitación y rol: gana el nivel más alto y las secciones se cruzan', () => {
  const r = resolveInGameAccess({
    config,
    discordId: '300000000000000004',
    roleIds: ['rol-mod-sanciones'],
    invitedLevel: 'admin',
    invitedSections: ['players', 'sanctions'],
  });
  assert.equal(r.level, 'admin');
  assert.deepEqual(r.sections, ['sanctions']);
});

test('sin rol ni invitación, no entra', () => {
  const r = resolveInGameAccess({ ...base, discordId: '400000000000000005', roleIds: ['otro-rol'] });
  assert.deepEqual([r.allowed, r.reason], [false, 'sin_rango']);
});

test('normalizeDiscordId acepta el identificador de FiveM con o sin prefijo', () => {
  assert.equal(normalizeDiscordId('discord:123456789012345678'), '123456789012345678');
  assert.equal(normalizeDiscordId('123456789012345678'), '123456789012345678');
  assert.equal(normalizeDiscordId('license:abc'), null);
  assert.equal(normalizeDiscordId(42), null);
});
