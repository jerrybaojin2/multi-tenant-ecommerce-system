// 守卫：tenant-scoped 业务代码中禁止 raw SQL 调用。
//
// 检测 `.query(` 形态的 raw-SQL 调用（repository.query / dataSource.query /
// queryRunner.query / getManager().query 等）出现在非注释代码中。
//
// 白名单两层：
//   1. 物理路径排除 — migrations/、data-source.ts、*.subscriber.ts 天然允许
//      raw SQL（TypeORM MigrationInterface / DataSource 工厂 / 全局订阅器）。
//   2. 路径受限标记 — `// raw-sql: platform-only <reason>` 注释，仅当文件位于
//      modules/platform/** 或 core/database/rls.ts 时才放行；标记出现在非允许
//      路径会产出独立错误（标记本身不是通行证，不能被 cargo-cult 到业务代码）。
//
// 检测分两套扫描：`.query(` 在去注释后的代码视图上判定，标记在原始注释行上判定，
// 两条规则的行号都来自原始源文件。
//
// 形态镜像 scripts/verify-backend-architecture.mjs / scripts/check-prod-config.mjs：
// ESM、去注释判定、`{ok,errors,details}` 返回、`OK/FAIL` 输出、失败时 `process.exitCode=1`。
//
// 详见 .trellis/spec/backend/database-guidelines.md §Query 模式 / §RLS 指南。

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_SCAN_ROOT = 'packages/backend/src';

// `.query(` 方法调用：覆盖 repo.query / dataSource.query / queryRunner.query 等。
// 要求点号紧跟 query 再跟左括号（中间允许空白），避免误伤 queryBuilder / getQuery()。
const RAW_QUERY_CALL = /\.query\s*\(/;
// 白名单标记：`// raw-sql: platform-only <简短理由>`。
const MARKER = /\/\/\s*raw-sql:\s*platform-only\b/;
const MARKER_REASON = /\/\/\s*raw-sql:\s*platform-only\s*(.*)$/;

/**
 * 扫描给定根目录下的 .ts 文件，检测 raw-SQL 调用。
 *
 * @param {string} [rootDir='packages/backend/src'] 扫描根（backend/src，或测试用的临时树）。
 * @returns {Promise<{ok: boolean, errors: string[], details: string[]}>}
 */
export async function checkRawSql(rootDir = DEFAULT_SCAN_ROOT) {
  const errors = [];
  const details = [];
  const absRoot = path.resolve(rootDir);

  let files;
  try {
    files = await collectTsFiles(absRoot);
  } catch (error) {
    return {
      ok: false,
      errors: [`scan root unreadable: ${absRoot} (${error.message})`],
      details: [],
    };
  }

  for (const file of files) {
    const rel = path.relative(absRoot, file).replace(/\\/g, '/');
    if (isExcluded(rel)) continue;

    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    const rawLines = text.split(/\r?\n/);
    // 去注释并保留行结构（行号与原文对齐）的代码视图，用于 `.query(` 检测；
    // 标记检测必须看注释，所以用原始行。
    const codeLines = stripCommentsKeepLines(text).split(/\r?\n/);
    const allowed = isMarkerAllowedForPath(rel);

    // 扫描一：`.query(` raw-SQL 调用。
    for (let i = 0; i < codeLines.length; i += 1) {
      if (!RAW_QUERY_CALL.test(codeLines[i])) continue;

      const reason = findMarkerAbove(rawLines, i);
      if (allowed && reason) {
        details.push(`${rel}:${i + 1} ALLOWED via raw-sql marker — ${reason}`);
      } else {
        errors.push(`${rel}:${i + 1} forbidden .query( raw-SQL call`);
      }
    }

    // 扫描二：标记出现在非允许路径 → 独立错误（标记不是通行证，不可静默放过）。
    if (!allowed) {
      for (let i = 0; i < rawLines.length; i += 1) {
        if (MARKER.test(rawLines[i])) {
          errors.push(
            `${rel}:${i + 1} raw-sql marker present but file not in platform/rls allowlist`
          );
        }
      }
    }
  }

  details.push(`scanned ${files.length} typescript file(s) under ${rootDir}`);
  return { ok: errors.length === 0, errors, details };
}

function isExcluded(rel) {
  const segments = rel.split('/');
  if (segments.includes('migrations')) return true;
  const base = segments[segments.length - 1];
  if (base === 'data-source.ts') return true;
  if (base.endsWith('.subscriber.ts')) return true;
  return false;
}

function isMarkerAllowedForPath(rel) {
  return rel === 'core/database/rls.ts' || rel.startsWith('modules/platform/');
}

/**
 * 从第 i 行向上回看（含本行，最多 4 行），查找最近的 raw-sql 标记并提取理由。
 * 标记必须紧贴违规行（本行或上方 ≤3 行），不接受文件级或下方标记，防止全局豁免。
 */
function findMarkerAbove(lines, i) {
  for (let j = i; j >= Math.max(0, i - 3); j -= 1) {
    const m = lines[j].match(MARKER_REASON);
    if (m) {
      const reason = (m[1] || '').trim();
      return reason || '<no reason given>';
    }
  }
  return null;
}

async function collectTsFiles(dir, acc = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectTsFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 去注释并保留行结构（行号与原文对齐），同时抹除字符串字面量内容，
 * 避免 `.query(` 子串仅仅出现在字符串中造成误报。模板字符串内 `${}` 插值不解析
 * （已知限制：插值中的真实 .query( 可能漏报，符合 regex-over-text 威胁模型，
 * 与现有三个 guard 脚本一致）。
 */
function stripCommentsKeepLines(text) {
  let out = '';
  let i = 0;
  let block = false;
  let quote = null; // '"' | "'" | '`'
  let escaped = false;
  while (i < text.length) {
    const ch = text[i];
    const nx = text[i + 1];
    if (ch === '\r') {
      i += 1;
      continue; // 归一化 CRLF：丢弃 \r，仅保留 \n，保证行号对齐
    }
    if (block) {
      if (ch === '*' && nx === '/') {
        block = false;
        i += 2;
        continue;
      }
      if (ch === '\n') out += '\n';
      i += 1;
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      // 抹除字符串正文，但保留换行（模板字符串可跨行）以维持行号。
      if (ch === '\n') out += '\n';
      i += 1;
      continue;
    }
    if (ch === '/' && nx === '*') {
      block = true;
      i += 2;
      continue;
    }
    if (ch === '/' && nx === '/') {
      // 行注释：跳到行尾（保留紧随其后的换行符）。
      const nl = text.indexOf('\n', i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

async function runCli() {
  try {
    const result = await checkRawSql(process.argv[2]);
    for (const d of result.details) console.log(`OK ${d}`);
    if (!result.ok) {
      for (const e of result.errors) console.error(`FAIL ${e}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
