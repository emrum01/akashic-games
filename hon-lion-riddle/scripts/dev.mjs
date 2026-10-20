import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
if (!existsSync(wrangler)) {
  console.error('先に npm install を実行してください。');
  process.exit(1);
}
await import('./build-static.mjs');
console.log('ゲーム: http://127.0.0.1:8796/');
console.log('ローカルWorkerデモ: http://127.0.0.1:8796/?demo=1');
const child = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', '8796', '--var', 'HON_LION_DEMO:1'], {
  cwd: join(root, 'worker'), stdio: 'inherit',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('ゲームの配信を起動できませんでした。'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 0; });
