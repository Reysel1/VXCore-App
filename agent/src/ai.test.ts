import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addUsage, anthropicUsage, openAiUsage } from './ai';

test('Ollama: el frame de usage del stream se normaliza', () => {
  const usage = openAiUsage({
    prompt_tokens: 165,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens: 270,
    total_tokens: 435,
  });
  assert.deepEqual(usage, { input: 165, output: 270, cacheRead: undefined, rounds: 1 });
});

test('OpenAI: los tokens cacheados se separan', () => {
  const usage = openAiUsage({
    prompt_tokens: 3528,
    completion_tokens: 615,
    prompt_tokens_details: { cached_tokens: 1743 },
  });
  assert.equal(usage?.cacheRead, 1743);
});

test('Una pasarela sin usage, o con basura, no inventa números', () => {
  assert.equal(openAiUsage(undefined), undefined);
  assert.equal(openAiUsage(null), undefined);
  assert.equal(openAiUsage({}), undefined);
  assert.equal(openAiUsage({ prompt_tokens: '12', completion_tokens: null }), undefined);
});

test('Anthropic: la caché a null no aparece como 0', () => {
  const usage = anthropicUsage({
    input_tokens: 1200,
    output_tokens: 80,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
  });
  assert.deepEqual(usage, {
    input: 1200,
    output: 80,
    cacheRead: undefined,
    cacheWrite: undefined,
    rounds: 1,
  });
});

test('El bucle de herramientas suma una llamada por vuelta', () => {
  const vuelta1 = { input: 1742, output: 321, cacheRead: 1, rounds: 1 };
  const vuelta2 = { input: 1786, output: 294, cacheRead: 1742, rounds: 1 };
  const vuelta3 = { input: 4335, output: 450, rounds: 1 };

  const total = addUsage(addUsage(vuelta1, vuelta2), vuelta3);
  assert.deepEqual(total, {
    input: 7863,
    output: 1065,
    cacheRead: 1743,
    cacheWrite: undefined,
    rounds: 3,
  });
});

test('Sumar con una vuelta sin medida deja la otra intacta', () => {
  const medida = { input: 10, output: 5, rounds: 1 };
  assert.equal(addUsage(undefined, medida), medida);
  assert.equal(addUsage(medida, undefined), medida);
  assert.equal(addUsage(undefined, undefined), undefined);
});
