import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCredentials } from './tunnel';

const CREDENTIALS = JSON.stringify({
  AccountTag: '0123456789abcdef0123456789abcdef',
  TunnelSecret: 'c2VjcmV0',
  TunnelID: '6ff42ae2-765d-4adf-8112-31c55c1551ef',
});

test('acepta el fichero que genera cloudflared', () => {
  assert.deepEqual(parseCredentials('https://Panel.Example.com/', CREDENTIALS), {
    hostname: 'panel.example.com',
    tunnelId: '6ff42ae2-765d-4adf-8112-31c55c1551ef',
    accountTag: '0123456789abcdef0123456789abcdef',
    tunnelSecret: 'c2VjcmV0',
  });
});

test('rechaza dominios y credenciales mal formados', () => {
  for (const host of ['', 'localhost', 'panel', 'panel.example.com\nx', 'pa nel.example.com', '-a.example.com', 42]) {
    assert.equal(parseCredentials(host, CREDENTIALS), null, `debería rechazar ${JSON.stringify(host)}`);
  }
  assert.equal(parseCredentials('panel.example.com', '{}'), null);
  assert.equal(parseCredentials('panel.example.com', 'no es json'), null);
  assert.equal(
    parseCredentials('panel.example.com', JSON.stringify({ ...JSON.parse(CREDENTIALS), TunnelID: 'x' })),
    null
  );
});
