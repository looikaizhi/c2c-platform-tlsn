// packages/web/scripts/start-dev.js
// Mirrors packages/demo/scripts/start-dev.js but for the Next.js web app.
//
// Steps:
//   1. Copy plugin bundles from packages/demo/public/plugins → public/plugins
//   2. Run hardhat deploy-web.ts (writes .env.local with fresh contract addresses)
//   3. Start `next dev -p 3001`
//
// Requirements:
//   - A hardhat node MUST be running already:
//       cd packages/contracts && npx hardhat node
//
// All three steps share stdio with the parent terminal so logs are visible live.

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWin = process.platform === 'win32';
const webDir = path.resolve(__dirname, '..');
const contractsDir = path.resolve(__dirname, '../../contracts');
const demoPluginsDir = path.resolve(__dirname, '../../demo/public/plugins');
const webPluginsDir = path.resolve(__dirname, '../public/plugins');

// ─── Step 1: Copy plugins ────────────────────────────────────────────────────
console.log('\n📦 Copying plugins from demo/public/plugins...');
if (fs.existsSync(demoPluginsDir)) {
    fs.cpSync(demoPluginsDir, webPluginsDir, { recursive: true });
    console.log(`✅ Plugins copied to ${webPluginsDir}`);
} else {
    console.log(`⚠ No plugins found at ${demoPluginsDir}, skipping`);
}

// ─── Step 1.5: Stop any running web keeper ──────────────────────────────────
// A redeploy mints a fresh escrow (new address + deploymentBlock) and the
// deploy step wipes the keeper's state.json. A keeper still running would
//   (a) keep watching the OLD escrow address (read once at startup), and
//   (b) rewrite state.json on its next ~60s save — re-staling the cursor.
// So we terminate it here, forcing a clean restart against the new deploy.
// The web keeper is identified by its unique health port (default 9091).
// SIGKILL (fuser -k default) is deliberate: a graceful SIGTERM would trigger
// the keeper's shutdown save and recreate the stale state.json.
const KEEPER_HEALTH_PORT = process.env.KEEPER_HEALTH_PORT || '9091';
console.log(`\n🔪 Stopping any running web keeper on port ${KEEPER_HEALTH_PORT}...`);
try {
    if (isWin) {
        spawnSync(
            'powershell',
            [
                '-NoProfile',
                '-Command',
                `Get-NetTCPConnection -LocalPort ${KEEPER_HEALTH_PORT} -State Listen -ErrorAction SilentlyContinue | ` +
                    `Select-Object -ExpandProperty OwningProcess -Unique | ` +
                    `ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
            ],
            { stdio: 'inherit' },
        );
    } else {
        spawnSync('bash', ['-lc', `fuser -k ${KEEPER_HEALTH_PORT}/tcp 2>/dev/null || true`], {
            stdio: 'inherit',
        });
    }
    console.log('✅ Keeper stop signal sent (no-op if none was running)');
} catch (err) {
    console.warn('⚠ Could not stop keeper (continuing):', err);
}

// ─── Step 2: Deploy contracts (writes packages/web/.env.local) ───────────────
const deployStart = Date.now();
console.log(`\n[${new Date().toISOString()}] 🚀 Deploying contracts (hardhat run scripts/deploy-web.ts)...`);
const deployResult = spawnSync(
    'npx',
    ['hardhat', 'run', 'scripts/deploy-web.ts', '--network', 'localhost'],
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

// ─── Step 3: Start Next.js dev server (reads freshly written .env.local) ─────
console.log('\n🎨 Starting Next.js dev server on :3001\n');
const next = spawn('npx', ['next', 'dev', '-p', '3001'], {
    cwd: webDir,
    stdio: 'inherit',
    shell: isWin,
});

next.on('exit', (code) => process.exit(code ?? 0));

process.on('SIGINT', () => next.kill('SIGINT'));
process.on('SIGTERM', () => next.kill('SIGTERM'));
