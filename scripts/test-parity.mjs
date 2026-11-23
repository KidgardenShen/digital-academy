import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const website = fileURLToPath(new URL('../', import.meta.url));
const upstream = resolve(process.env.JINGZHU_STANDARD ?? join(website, 'standards/jingzhu-duidu'));
const load = async path => JSON.parse(await readFile(path, 'utf8'));
for (const [local, original] of [
  ['edition.schema.json', 'schema/edition.schema.json'],
  ['fixtures/edition.json', 'tests/fixtures/edition.json'],
  ['fixtures/ai-chapters.json', 'tests/fixtures/ai-chapters.json'],
]) {
  assert.deepEqual(await load(join(website, 'standards', local)), await load(join(upstream, original)), local);
}

const result = spawnSync(process.env.PYTHON ?? 'python', [join(upstream, 'tests/test_translations.py')], {
  stdio: 'inherit',
  env: { ...process.env, NODE: process.execPath, EDITION_JS_CLI: join(website, 'scripts/validate.mjs'), PYTHONIOENCODING: 'utf-8' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
