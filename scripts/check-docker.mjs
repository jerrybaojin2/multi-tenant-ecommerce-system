// 探测本机 Docker 与 PostgreSQL 可用性，用于 PR0 启动验证。
//
// 不是硬门禁（不阻塞 `npm run check`），仅作为 `npm run guard:docker` 的诊断输出，
// 告诉开发者当前环境是否能跑真实 PG 隔离测试。
//
// 输出：
//   OK docker: <version>
//   OK pg port 5432 open
//   或
//   WARN docker: not found (真实 PG 测试将跳过；参考 packages/backend/docker-compose.yml)

import { spawnSync } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';

function dockerVersion() {
  try {
    const res = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      return res.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

function pgPortOpen(host = '127.0.0.1', port = 5432) {
  return new Promise(resolve => {
    const socket = net.connect(port, host);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function main() {
  const docker = dockerVersion();
  if (docker) {
    console.log(`OK docker: ${docker}`);
  } else {
    console.log(
      'WARN docker: not found on PATH (真实 PG 测试将跳过；参考 packages/backend/docker-compose.yml 启动 PG)'
    );
  }

  const host = process.env.TEST_DB_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.TEST_DB_PORT || process.env.DB_PORT || 5432);
  const open = await pgPortOpen(host, port);
  if (open) {
    console.log(`OK pg port ${host}:${port} open`);
  } else {
    console.log(
      `WARN pg port ${host}:${port} closed (真实隔离测试 tests/real-tenant.test.mjs 将 skip)`
    );
  }

  // 非门禁：始终 exit 0，仅诊断。
  process.exitCode = 0;
}

await main();
