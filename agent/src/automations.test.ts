import { test } from 'node:test';
import assert from 'node:assert/strict';

import { noticeCommand, noticeReply } from './automations';

test('noticeCommand: una sola línea, para todos, con JSON legible', () => {
  const cmd = noticeCommand('Reinicio', 'El servidor se reinicia\nen 5 minutos', 'warning');

  assert.ok(!/[\r\n]/.test(cmd), 'la orden no puede llevar saltos de línea');
  assert.match(cmd, /^vxcore_event vxcore:notify \{/);

  const payload = JSON.parse(cmd.replace('vxcore_event vxcore:notify ', ''));
  assert.deepEqual(payload, {
    source: -1,
    title: 'Reinicio',
    message: 'El servidor se reinicia en 5 minutos',
    type: 'warning',
  });
});

test('noticeCommand: un tipo desconocido pasa a info y el título vacío tiene uno por defecto', () => {
  const payload = JSON.parse(noticeCommand('  ', 'Hola', 'urgente').replace('vxcore_event vxcore:notify ', ''));
  assert.equal(payload.type, 'info');
  assert.equal(payload.title, 'Aviso del servidor');
});

test('noticeCommand: el texto no puede cerrar el comando de consola', () => {
  const cmd = noticeCommand('Evento', 'Id al "garaje"; quit\\', 'info');
  assert.doesNotMatch(cmd, /\\|;/);
  const payload = JSON.parse(cmd.replace('vxcore_event vxcore:notify ', ''));
  assert.equal(payload.message, "Id al 'garaje', quit/");
});

test('noticeCommand: la duración se manda en milisegundos y recortada a 1-60 s', () => {
  const leer = (ms?: number) =>
    JSON.parse(noticeCommand('Anuncio', 'Hola', 'info', ms).replace('vxcore_event vxcore:notify ', ''));
  assert.equal(leer(10_000).duration, 10_000);
  assert.equal(leer(200).duration, 1_000);
  assert.equal(leer(600_000).duration, 60_000);
  assert.equal('duration' in leer(), false);
  assert.equal('duration' in leer(Number('diez')), false);
});

test('noticeReply: reconoce la confirmación del recurso y la falta de vxcore', () => {
  assert.equal(noticeReply('^2[VXCore]^7 Aviso enviado a todos: Reinicio en 5 minutos'), 'sent');
  assert.equal(noticeReply('No such command vxcore_event.'), 'missing');
  assert.equal(noticeReply("No such command 'vxcore_event'."), 'missing');
  assert.equal(noticeReply('No such command restart_all.'), null);
  assert.equal(noticeReply('[ info] [citizen-server-i] Started resource vxcore'), null);
});

test('noticeCommand: el sonido sólo va en la orden cuando se decide', () => {
  const leer = (sound?: boolean) =>
    JSON.parse(noticeCommand('Anuncio', 'Hola', 'info', 10_000, sound).replace('vxcore_event vxcore:notify ', ''));
  assert.equal(leer(true).sound, true);
  assert.equal(leer(false).sound, false);
  assert.equal('sound' in leer(), false);
});
