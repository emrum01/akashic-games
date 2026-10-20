import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const checker = fileURLToPath(new URL('../scripts/check-static.mjs', import.meta.url));

async function runChecker(directory) {
  try {
    await execFileAsync(process.execPath, [checker, directory]);
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

async function makeOutput(metadata) {
  const directory = await mkdtemp(join(tmpdir(), 'hon-lion-static-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html>');
  await writeFile(join(directory, 'metadata.json'), JSON.stringify(metadata));
  return directory;
}

test('static checker allows HTTPS metadata URLs', async () => {
  const directory = await makeOutput({ source: 'https://example.com/scene.json' });
  try {
    assert.equal((await runChecker(directory)).ok, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('static checker rejects local absolute metadata paths', async () => {
  for (const source of ['/Users/example/private/scene.json', '/home/example/private/scene.json', 'C:\\Users\\example\\private\\scene.json']) {
    const directory = await makeOutput({ source });
    try {
      const result = await runChecker(directory);
      assert.equal(result.ok, false, source);
      assert.match(result.output, /local absolute path/, source);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('static checker rejects solution fixture text', async () => {
  const directory = await makeOutput({ note: '洋館は幻覚。耳に入った虫が自分の脳を食べている。' });
  try {
    const result = await runChecker(directory);
    assert.equal(result.ok, false);
    assert.match(result.output, /demo judging or solution fixture/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('static checker accepts browser audio formats but rejects source recordings', async () => {
  const directory = await makeOutput({});
  try {
    for (const extension of ['ogg', 'm4a']) await writeFile(join(directory, `door.${extension}`), '');
    assert.equal((await runChecker(directory)).ok, true);
    await writeFile(join(directory, 'source-recording.mp3'), '');
    assert.equal((await runChecker(directory)).ok, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
