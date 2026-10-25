import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ruleFor } from './access';

test('lo que no está en la tabla es del dueño', () => {
  const rule = ruleFor('POST', '/api/algo-nuevo-sin-clasificar');
  assert.equal(rule.level, 'owner');
  assert.equal(rule.known, false);
});

test('el método cuenta: leer rutas es de admin, cambiarlas del dueño', () => {
  assert.equal(ruleFor('GET', '/api/paths').level, 'admin');
  assert.equal(ruleFor('POST', '/api/paths').level, 'owner');
});

test('los parámetros encajan un solo segmento', () => {
  assert.deepEqual(ruleFor('DELETE', '/api/sanctions/snc-123'), {
    level: 'admin',
    section: 'sanctions',
    known: true,
  });
  assert.equal(ruleFor('POST', '/api/sanctions/snc-123/revoke').level, 'moderator');
  assert.equal(ruleFor('DELETE', '/api/sanctions/a/b').known, false);
});

test('la configuración de Discord es del dueño: quien la edita se hace dueño', () => {
  assert.equal(ruleFor('POST', '/api/discord/config').level, 'owner');
  assert.equal(ruleFor('POST', '/api/discord/unlink').level, 'owner');
});

test('consola, SQL y editor exigen administrador', () => {
  assert.deepEqual(ruleFor('POST', '/api/server/command'), { level: 'admin', section: 'console', known: true });
  assert.equal(ruleFor('POST', '/api/db/query').level, 'admin');
  assert.equal(ruleFor('POST', '/api/resource/save-file').level, 'admin');
});

test('instalar código de internet y abrir el túnel es del dueño', () => {
  assert.equal(ruleFor('POST', '/api/marketplace/install').level, 'owner');
  assert.equal(ruleFor('POST', '/api/tunnel/enabled').level, 'owner');
  assert.equal(ruleFor('POST', '/api/server/firewall-allow').level, 'owner');
});

test('los puntos no son comodines', () => {
  assert.equal(ruleFor('GET', '/api/branding/bannerXpng').known, false);
});
