// packages/demo/scripts/start-dev.js
// ESM script — compatible with "type": "module" in package.json

import { spawn, spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(__dirname, '../../contracts');
const demoDir = resolve(__dirname, '..');
const isWin = process.platform === 'win32';

// ─── Step 1: Build plugins (synchronous) ────────────────────────────────────
console.log('\n📦 Building plugins...');
const buildResult = spawnSync('node', ['build-plugins.js'], {
  cwd: demoDir,
  stdio: 'inherit',
  shell: isWin,
});
if (buildResult.status !== 0) {
  console.error('❌ build:plugins failed');
  process.exit(1);
}

// ─── Step 2: Deploy contracts (synchronous — writes packages/demo/.env) ─────
const deployStart = Date.now();
console.log(`\n[${new Date().toISOString()}] 🚀 Deploying contracts...`);
const deployResult = spawnSync(
  'npx',
  ['hardhat', 'run', 'scripts/deploy-c2c-demo.ts', '--network', 'localhost'],
  { cwd: contractsDir, stdio: 'inherit', shell: isWin },
);
const deployMs = Date.now() - deployStart;
console.log(`\n[deploy] ✅ Total wall-clock time: ${deployMs}ms (${(deployMs / 1000).toFixed(1)}s)`);
if (deployResult.status !== 0) {
  console.error('❌ Deployment failed.');
  console.error('   请确保已在另一个终端运行：');
  console.error('   cd packages/contracts && npx hardhat node');
  process.exit(1);
}

// ─── Step 3: Start Vite dev server (reads freshly written .env) ──────────────
console.log('\n🎨 Starting Vite dev server...\n');
const vite = spawn('npx', ['vite'], {
  cwd: demoDir,
  stdio: 'inherit',
  shell: isWin,
});

vite.on('exit', (code) => {
  process.exit(code ?? 0);
});
