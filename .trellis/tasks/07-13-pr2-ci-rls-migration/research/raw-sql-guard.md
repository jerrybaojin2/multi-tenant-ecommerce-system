# Research: Raw SQL Guard for Tenant-Scoped Code

- **Query**: How to enforce a "no raw SQL in tenant-scoped code" guard in a Midway.js 3.x + TypeORM backend, with an allowlist for approved platform/infrastructure helpers, in a way that fits the repo's existing custom-script guard convention.
- **Scope**: mixed (internal repo context verified; external tooling knowledge from documented behavior of ESLint / ts-morph / TS Compiler API)
- **Date**: 2026-07-13

---

## Repo Context (verified by reading the files)

Before designing the guard, the following facts were confirmed against the current tree. These directly constrain the recommendation.

### Forbidden patterns per spec

`.trellis/spec/backend/database-guidelines.md` (lines 54-60) and `.trellis/spec/backend/quality-guidelines.md` (line 19) define the forbidden set:

- `repository.query(...)`
- `dataSource.query(...)`
- string-built / concatenated SQL
- using a global DB client directly in request-scoped business services
- accepting `tenantId` from client input for tenant-owned writes

Exceptions (database-guidelines.md lines 62-67) must satisfy ALL of:
- operation is platform-only OR genuinely cross-tenant
- method lives in a platform service or approved infrastructure helper
- method name or comment explains the intentional bypass
- a test proves merchant/app users cannot reach the path

`quality-guidelines.md` line 52 explicitly schedules the guard: *"Raw SQL guard: lint/review tooling 拒绝 tenant modules 中的 raw query usage"* and line 59 defers automated coverage to PR2 if PR0 couldn't deliver it.

### Existing guard convention = CUSTOM NODE SCRIPTS, not ESLint

The repo already has three guards, all regex-over-text `.mjs` scripts under `scripts/`:

| File | Technique | Wired into |
|---|---|---|
| `scripts/verify-backend-architecture.mjs` | `readFile` + `RegExp.test` on `src/configuration.ts`, `src/core/tenant/tenant-context.ts`, and `package.json` (e.g. `/AsyncLocalStorage/`, `/@cool-midway\|cool-admin\|@cool\//i`) | root `npm run guard:backend-architecture`; backend `npm run check` |
| `scripts/check-prod-config.mjs` | `readFile` + custom `propertyValues()` regex + a hand-written `braceBody()` brace-matcher to scope `exposeDevMetadata` to the `appMeta` block; `stripComments()` before matching | root `npm run guard:prod-config`; backend `npm run check` |
| `scripts/check-docker.mjs` | `spawnSync('docker', ...)` + `net.connect`; NON-gating (diagnostic only, exit 0) | root `npm run guard:docker` |

Key style facts to mirror:
- ESM (`import ... from 'node:fs/promises'`, `import.meta.url`, `pathToFileURL`).
- Each guard exports an async function returning `{ ok: boolean, errors: string[], details: string[] }` (or `{ ok, checks, errors }`) — see `verify-backend-architecture.mjs:59-65`, `check-prod-config.mjs:35-40`.
- CLI runner prints `OK <detail>` / `FAIL <error>` and sets `process.exitCode = 1` on failure.
- `check-prod-config.mjs:133-137` already has a `stripComments()` that strips `/* */` and `//` comments — reusable.
- Guards are unit-tested via `node:test` in `tests/guards.test.mjs` using `mkdtemp` + `writeFile` temp trees (see `createBackendCandidate`, lines 91-123).

### No ESLint; linting is `mwts`

`packages/backend/package.json:42-43` uses `"lint": "mwts check"` / `"lint:fix": "mwts fix"`. `mwts` (devDep `^1.3.0`) is Midway's tslint-based formatter; it does NOT support custom rules and does not ship a `no-restricted-syntax` equivalent. There is no `.eslintrc` anywhere in the backend.

### Where raw SQL legitimately lives today

| File | Raw-SQL surface | Why legitimate |
|---|---|---|
| `packages/backend/src/core/database/migrations/1783161600000-init-demo-resources.ts:15-35` | `queryRunner.query('CREATE EXTENSION ...')`, `queryRunner.query('CREATE TABLE ...')` | TypeORM `MigrationInterface` — the canonical place raw SQL is allowed. Spec: database-guidelines.md §迁移与数据库结构变更. |
| `packages/backend/src/core/database/seed.ts:15-38` | `dataSource.getRepository(...)` + `repo.save([...])` | Infrastructure seed script, runs out-of-request, explicitly documented (comment lines 7-11) as bypassing `TenantSubscriber` guard. |
| `packages/backend/src/core/database/data-source.ts:20-31` | `new DataSource({...})` | DataSource factory; no `.query()` calls but is global DB client construction. |

### Where raw SQL does NOT live today (clean baseline)

Grep over `packages/backend/src` for `\.query\(|dataSource\.query|repository\.query` returned matches ONLY inside `migrations/1783161600000-init-demo-resources.ts`. No `.query(` call exists yet in `modules/**`, `core/` (non-migration), `schedules/**`, or `integrations/**`. The guard starts from a green field.

### Planned (spec'd) but not yet present

`.trellis/spec/backend/directory-structure.md` (lines 36-41, 73-76) anticipates these files that do NOT yet exist: `core/database/rls.ts`, `core/tenant/platform-scope.ts`, `core/tenant/tenant.guard.ts`, `core/permissions/permission.guard.ts`. The guard design must anticipate `rls.ts` (a legitimate infrastructure helper that may issue `set_config('app.tenant_id', ...)` via raw SQL per database-guidelines.md §RLS 指南 lines 168-176).

---

## Findings: Enforcement Mechanisms Compared

### 1. Custom grep/regex-based Node `.mjs` guard (RECOMMENDED — fits repo convention)

**How it works.** A new `scripts/check-raw-sql.mjs` walks `.ts` files under a configured scan root, strips comments, and flags:
- `CallExpression`-shaped text `.query(` — catches `repo.query(...)`, `dataSource.query(...)`, `getManager().query(...)`, `queryRunner.query(...)`.
- SQL-keyword string literals (template literals + quoted strings) used in concatenation or passed to `.query(`/`createQueryBuilder().where(raw)` / `.raw(`.

Allowlist is two-layered:
- **Path-based excludes** for canonical infrastructure: `src/core/database/migrations/**`, `src/core/database/seed.ts`, `src/core/database/data-source.ts`.
- **Marker-comment escape hatch** for platform-only services: a `// raw-sql: platform-only <one-line reason>` comment on (or directly above) the offending line. The marker is itself constrained by a path rule — it is only honored when the file is under `src/modules/platform/**` OR `src/core/database/rls.ts` OR a small explicit `ALLOWED_RAW_SQL_PATHS` list.

**Pros**
- Identical toolchain, style, and test pattern as the three existing guards — zero new deps, zero new config format. Backend dev reviews the diff in 30 seconds.
- `stripComments()` + `braceBody()` primitives already exist in `check-prod-config.mjs` and can be reused/copied.
- Trivially testable with the `mkdtemp`/`writeFile` pattern already in `tests/guards.test.mjs`.
- Fails CI fast (<100ms for this codebase size).

**Cons / false-positive risk**
- Regex over text is not a real AST, so a `.query(` substring inside a string/comment would false-positive — mitigated by `stripComments()` and by matching `\.query\s*\(` (method-call shape, not bare word).
- Does not understand aliasing: `const q = repo.query; q('SELECT')` would slip through. Acceptable: the spec's threat model is "developer writes raw SQL in a tenant service", not adversarial obfuscation, and code review still exists.
- `queryRunner.query()` inside migrations must be path-excluded (it is the TypeORM-canonical raw-SQL surface). Done via glob.
- SQL-keyword-in-concatenation detection is inherently noisy; keep it narrowly scoped to template literals / `+` concatenation adjacent to a DB call, OR omit it in v1 and rely on the `.query(` ban alone (which covers the highest-risk surface).

**Scoping business code vs migrations.** The boundary is already physically expressed in the repo: migrations live under `src/core/database/migrations/`. The guard treats that directory (plus `seed.ts`, `data-source.ts`) as the allowlist root; everything else under `src/modules/**`, `src/core/**` (except migrations), `src/schedules/**`, `src/integrations/**` is scanned. This matches how mature projects draw the line (see §4).

---

### 2. ESLint custom rule (heavier — would require introducing ESLint)

**How it works.** Add `eslint` + `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` to backend devDeps, add an `.eslintrc.cjs`, and use:

- `no-restricted-syntax` with a selector string to ban `CallExpression[callee.property.name='query']` (and optionally `[callee.object.property.name='query']` for the `dataSource.query` shape).
- A small custom rule (a ~40-line `.js` file) to flag `BinaryExpression` whose operator is `+` and an operand contains SQL keywords, inside an `Argument` of a query call. The `@typescript-eslint` rule scaffold makes this a `CallExpression` visitor.

**Cost of introducing ESLint alongside `mwts`.** `mwts` (tslint-based) and ESLint can coexist but:
- Two linters means two config surfaces, two CI steps, and a real chance of conflicting style rules. `mwts` is a formatter-first tool with no rule plugin ecosystem; ESLint would become the actual "rule" linter, while `mwts` stays as formatter — workable but adds cognitive load.
- New devDeps: `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, plus a config extends chain. ~3-5 MB install footprint and a transitive dep tree to maintain.
- The backend currently has ZERO ESLint config; introducing it for a single rule is disproportionate.

**Pros over option 1**
- True AST: understands aliasing within a file (`const q = repo.query`), scoping, and call structure. Fewer false positives on `.query(` substrings inside strings.
- `no-restricted-syntax` is a first-class, well-documented ESLint feature; rule authors get auto-fix and per-line `// eslint-disable-next-line` escape hatches for free.

**Cons**
- Breaks the repo's single-tool convention (custom `.mjs` guards) for one rule.
- ESLint disable-comments (`// eslint-disable-next-line`) are a weaker escape hatch than a repo-specific marker — they are file-global knowledge, easy to cargo-cult, and ESLint's policy is "any developer can disable any rule". The custom-marker approach in option 1 lets the guard assert that the marker only works in platform paths.

**Verdict:** only worth it if the team plans 3+ more lint rules that genuinely need AST. For a single "ban `.query()` in tenant code" guard, option 1 is strictly lighter.

---

### 3. Other approaches (brief)

**ts-morph / TS Compiler API AST scan.** `ts-morph` (a structural wrapper around the TypeScript compiler API) gives a precise AST with type info. A `check-raw-sql.mjs` could use `project.getSourceFiles()` → `file.getDescendantsOfKind(ts.SyntaxKind.CallExpression)` → filter by `callee` text. This is the "AST precision without ESLint" path.

- Pro: real AST, understands `node.getExpression().getText()`, can resolve simple aliases, no ESLint toolchain.
- Con: adds `ts-morph` (and indirectly the TS compiler) as a guard-time devDep to a backend that currently has none of it; noticeably slower to cold-start than regex; overkill given the threat model. The existing guards prove the team is comfortable with regex-over-text and that the codebase is small enough for it.

**`eslint-plugin-no-unsanitized`-style rules.** That plugin targets DOM sinks (`innerHTML`, `document.write`), not SQL. There is no widely-adopted ESLint plugin that bans SQL strings; the closest pattern is hand-rolled `no-restricted-syntax` (option 2). Noting here to close the "is there an off-the-shelf rule?" question — there isn't.

**CodeQL / GitHub review-gate.** CodeQL has `js/sql-injection` queries that flag tainted SQL construction. But CodeQL flags injection (taint flow from user input to SQL), NOT "raw SQL exists at all" — a fully-hardened parameterized `repo.query('SELECT ... WHERE id = $1', [id])` would NOT be flagged by CodeQL, yet the spec still wants it banned in tenant modules because it bypasses the `TenantSubscriber` predicate. CodeQL also requires GitHub Advanced Security or a CodeQL CLI CI action — a heavier ops surface than this repo has today. Useful as defense-in-depth later, not as the primary tenant-scope guard.

---

### 4. How mature OSS multi-tenant SaaS draws the "migrations allowed, business code not" boundary

Surveyed pattern (common across TypeORM/Prisma/Drizzle multi-tenant projects):

- **Physical directory separation.** Migrations live in a dedicated, well-known folder (`src/migrations/`, `db/migrations/`, `prisma/migrations/`). Guards and lints scope to `src/**` minus that folder. This repo already follows the convention (`src/core/database/migrations/`).
- **Type-system gate on raw access.** Some projects export the DB client only from a single `db.ts` barrel and forbid deep imports via an import-boundary lint rule (e.g. `eslint-plugin-import` `no-restricted-paths`). The equivalent here would be: only `TenantAwareRepository` and `rls.ts` may import `DataSource`; services import `TenantAwareRepository`. This is complementary to the raw-SQL guard and is already half-expressed in `directory-structure.md`.
- **"Approved helper" allowlist with a mandatory comment.** Pattern: an explicit constant list of file globs that are allowed to use the raw client, and every entry must carry a `// why-raw: <reason>` comment. PR review enforces that the list only grows with platform/infra justification.
- **Migrations get a free pass by location**, never by marker — because a marker comment would be cargo-cultable into business code, whereas "this file is in `migrations/`" is a structural fact the reviewer can see at a glance.

The recommended guard below encodes exactly this: location-based allowlist for migrations/seed/data-source, location-restricted marker for platform services.

---

## Allowlist / Escape-Hatch Design (detailed)

The spec requires that a platform-only service CAN run raw SQL without tripping the guard. Concretely:

### How a platform-only service legitimately runs raw SQL

1. The service file lives under `src/modules/platform/**` (per `directory-structure.md` controller layout, platform APIs live under `/admin/platform/**` and `modules/platform/**`).
2. The raw-SQL line carries a marker comment in the exact form `// raw-sql: platform-only <reason>`. The reason is mandatory and short, e.g. `// raw-sql: platform-only cross-tenant aggregation report`.
3. The guard ONLY honors the marker when the file path matches one of:
   - `src/modules/platform/**`
   - `src/core/database/rls.ts` (anticipated RLS helper that issues `set_config('app.tenant_id', ...)`)
   - an explicit `ALLOWED_RAW_SQL_PATHS` constant in the guard script (reviewed on each PR that edits it).
4. If a marker appears in a non-allowed path, the guard still fails — the marker is not a universal escape hatch.

### How the escape hatch itself is guarded (defense-in-depth)

Per spec (database-guidelines.md lines 62-67, quality-guidelines.md lines 68-69), the bypass is gated by three independent layers BEYOND the lint marker:

1. **Runtime role guard.** The platform service method must call a platform-role check before issuing the raw query. Today the repo has `isPlatformContext()` / `requirePlatformContext()` in `tenant-repository.ts:149-158` (throws `BusinessError('PLATFORM_ONLY', ..., 403)`). The spec'd-but-not-yet-built `core/permissions/permission.guard.ts` and `core/tenant/platform-scope.ts` (directory-structure.md lines 33, 46-48) will be the durable home for this. The raw-SQL call site must be reachable only after that check.
2. **Mandatory test.** The PR adding the marker must include a test (jest under `packages/backend/test/integration/` or a `node:test` under `tests/`) proving that a merchant/app-role caller gets 403 / empty result on that path. This is the spec's "测试证明 merchant/app users 无法访问该路径" requirement.
3. **RLS as backstop (PR2+).** Once `rls.ts` lands and tenant tables carry RLS policies (database-guidelines.md §RLS 指南), even a stray raw query runs under the app role (not `BYPASSRLS`, not table owner, not superuser), so a platform-service raw query that accidentally targets a tenant table is still subject to `set_config('app.tenant_id', ...)` scope. The marker is the lint-time guard; RLS is the runtime backstop; the role check is the application-time guard.

This three-layer model is what the guard script's docstring should call out, so future developers don't treat the marker as "permission".

---

## Recommendation

**Use Option 1: a custom regex-based `.mjs` guard named `scripts/check-raw-sql.mjs`, wired into `npm run guard:raw-sql` and chained into both root `npm run check` and backend `npm run check`.** Reasons:

- It is the only option that matches the repo's existing guard convention (regex-over-text `.mjs`, `node:test`-unit-tested, `{ok,errors,details}` return shape, `stripComments()` reuse). The diff will look native.
- The threat model is "developer writes raw SQL in a tenant service by habit", not "adversarial obfuscation". Regex + path scoping is sufficient and the false-positive surface is small and already understood.
- The escape hatch (location-restricted marker) is stronger than ESLint's `eslint-disable-next-line` because the guard can assert the marker is only honored in platform paths.
- ESLint (Option 2) becomes worth it only if/when the team wants 3+ AST-level rules; that's a separate decision this task should not force.
- ts-morph (Option 3) is a reasonable upgrade path IF regex starts producing false positives as the codebase grows — but start lighter.

---

## Concrete Pseudo-code

### Guard script: `scripts/check-raw-sql.mjs`

Mirrors the style of `scripts/verify-backend-architecture.mjs` and `scripts/check-prod-config.mjs` (ESM, `readFile`, `stripComments`, `{ok,errors,details}` return, `pathToFileURL` CLI runner).

```js
// scripts/check-raw-sql.mjs
// 守卫：tenant-scoped 业务代码中禁止 raw SQL。
// 仅允许：migrations/ 目录、seed/data-source 等基础设施文件，
// 以及带 `// raw-sql: platform-only <reason>` 标记且位于 platform 路径的调用点。
// 见 .trellis/spec/backend/database-guidelines.md §Query 模式。

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SCAN_ROOT = 'packages/backend/src';

// 扫描这些目录（tenant-scoped 业务代码所在地）。
const SCAN_GLOBS = [
  'modules/**',
  'core/**',        // 注意：core/database/migrations 会在下面被排除
  'schedules/**',
  'integrations/**',
];

// 路径白名单：这些位置天然允许 raw SQL（TypeORM migration / infra 脚本）。
const PATH_EXCLUDES = [
  'core/database/migrations',
  'core/database/seed.ts',
  'core/database/data-source.ts',
];

// marker 注释只在以下路径生效 —— 这是「marker 不是通行证」的关键。
const MARKER_ALLOWED_ROOTS = [
  'modules/platform',
  'core/database/rls.ts', // 预留：RLS helper 将通过 set_config() 设 tenant
];

// 1. `.query(` 调用：匹配 repo.query / dataSource.query / getManager().query / queryRunner.query
const RAW_QUERY_CALL = /\.query\s*\(/;
// 2. SQL 关键字出现在模板字面量或字符串拼接中（保守启发，可选的 v2 检查）
const SQL_KEYWORDS = /\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|FROM\s+\w+|WHERE\s+\w+|CREATE\s+(TABLE|INDEX|EXTENSION)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX))\b/i;
const MARKER = /\/\/\s*raw-sql:\s*platform-only\b/;

export async function checkRawSql(root = SCAN_ROOT) {
  const errors = [];
  const details = [];
  const absRoot = path.resolve(root);
  const files = await collectTsFiles(absRoot);

  for (const file of files) {
    const rel = path.relative(absRoot, file).replace(/\\/g, '/');
    if (isExcluded(rel)) {
      continue; // migrations / seed / data-source：物理位置即允许
    }

    const text = await readFileText(file);
    if (!text) continue;

    // 关键：先保留行级注释以识别 marker，再按行判断。
    // （check-prod-config.mjs 的 stripComments 会把 marker 也删掉，这里不要全删。）
    const raw = text; // 不 strip：我们需要 marker 行
    const lines = raw.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const hits = [];
      if (RAW_QUERY_CALL.test(line)) hits.push('`.query(` raw-SQL call');
      // v2（可选，默认关）：模板拼接 SQL
      // if (hasSqlConcat(line)) hits.push('SQL string concatenation');

      if (hits.length === 0) continue;

      const markerReason = markerOnLineOrAbove(lines, i);
      if (markerReason && isMarkerAllowedForPath(rel)) {
        details.push(`${rel}:${i + 1} ALLOWED via marker — ${markerReason}`);
        continue;
      }
      for (const h of hits) {
        if (markerReason && !isMarkerAllowedForPath(rel)) {
          errors.push(
            `${rel}:${i + 1} ${h} — marker present but path not in platform/rls allowlist`
          );
        } else {
          errors.push(`${rel}:${i + 1} ${h}`);
        }
      }
    }
  }

  return { ok: errors.length === 0, root: absRoot, errors, details };
}

function isExcluded(rel) {
  return PATH_EXCLUDES.some(ex => rel === ex || rel.startsWith(ex + '/'));
}
function isMarkerAllowedForPath(rel) {
  return MARKER_ALLOWED_ROOTS.some(r => rel === r || rel.startsWith(r + '/'));
}
function markerOnLineOrAbove(lines, i) {
  // 同行或往上找最近一行带 marker 的注释；要求 marker 后带一句 reason。
  for (let j = i; j >= Math.max(0, i - 3); j -= 1) {
    const m = lines[j].match(/\/\/\s*raw-sql:\s*platform-only\s*(.*)$/);
    if (m) return (m[1] || '').trim() || '<no reason given>';
  }
  return null;
}
// async function collectTsFiles(absRoot) { /* walk SCAN_GLOBS, return .ts paths */ }
// async function readFileText(file) { try { return await readFile(file,'utf8'); } catch { return null; } }
// function hasSqlConcat(line) { return SQL_KEYWORDS.test(line) && /[+`]/.test(line); }

async function runCli() {
  const result = await checkRawSql(process.argv[2] || SCAN_ROOT);
  for (const d of result.details) console.log(`OK ${d}`);
  if (!result.ok) {
    for (const e of result.errors) console.error(`FAIL ${e}`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
```

### Allowlist marker contract

- **Form**: exactly `// raw-sql: platform-only <short reason>` (regex `/\/\/\s*raw-sql:\s*platform-only\b/`). The reason text is mandatory (an empty reason fails review, and the script surfaces it as `<no reason given>`).
- **Scope**: the marker is IGNORED unless the file lives under `src/modules/platform/**`, `src/core/database/rls.ts`, or a path in `MARKER_ALLOWED_ROOTS`. A marker in `modules/order/**` is a hard failure with a distinct error message ("marker present but path not in platform/rls allowlist").
- **Look-back**: the marker is honored on the offending line or up to 3 lines above it (to allow a multi-line raw query with the marker on the line above). It is NOT honored line-below or file-global, to prevent blanket disable.
- **Mandatory companions** (enforced by review checklist + test, not by this script):
  1. a runtime `requirePlatformContext()` / platform-role guard on the same call path;
  2. a jest/`node:test` test proving merchant+app roles get 403 / empty on this path.

### Wiring

```jsonc
// package.json (root) — add next to existing guard:* scripts
"scripts": {
  "guard:raw-sql": "node scripts/check-raw-sql.mjs",
  "check": "npm run guard:backend-architecture && npm run guard:prod-config && npm run guard:raw-sql && npm run test && npm run check:frontends"
}
```

```jsonc
// packages/backend/package.json — chain into backend's own check
"scripts": {
  "check": "cd ../.. && npm run guard:backend-architecture && npm run guard:prod-config -- packages/backend/src/config/config.prod.ts && npm run guard:raw-sql"
}
```

### Unit test (add to `tests/guards.test.mjs`, following `createBackendCandidate` style)

```js
import { checkRawSql } from '../scripts/check-raw-sql.mjs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';

test('raw-sql guard rejects .query() in tenant module', async () => {
  const root = await mkdtemp('raw-sql-');
  await mkdir(path.join(root, 'modules', 'order', 'service'), { recursive: true });
  await writeFile(
    path.join(root, 'modules', 'order', 'service', 'order.service.ts'),
    `export class OrderService {\n  findAll(repo) { return repo.query('SELECT * FROM orders'); }\n}\n`
  );
  const result = await checkRawSql(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /\.query\(/);
});

test('raw-sql guard ignores queryRunner.query() inside migrations/', async () => {
  const root = await mkdtemp('raw-sql-');
  await mkdir(path.join(root, 'core', 'database', 'migrations'), { recursive: true });
  await writeFile(
    path.join(root, 'core', 'database', 'migrations', '1234-x.ts'),
    `export class M { async up(qr) { await qr.query('CREATE TABLE x (id int)'); } }\n`
  );
  const result = await checkRawSql(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('raw-sql guard allows platform-only marker in modules/platform/**', async () => {
  const root = await mkdtemp('raw-sql-');
  await mkdir(path.join(root, 'modules', 'platform', 'service'), { recursive: true });
  await writeFile(
    path.join(root, 'modules', 'platform', 'service', 'report.service.ts'),
    `export class ReportService {\n  // raw-sql: platform-only cross-tenant revenue aggregation\n  agg(ds) { return ds.query('SELECT tenant_id, SUM(amount) FROM ...'); }\n}\n`
  );
  const result = await checkRawSql(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('raw-sql guard REJECTS marker in non-platform module', async () => {
  const root = await mkdtemp('raw-sql-');
  await mkdir(path.join(root, 'modules', 'order', 'service'), { recursive: true });
  await writeFile(
    path.join(root, 'modules', 'order', 'service', 'order.service.ts'),
    `export class OrderService {\n  // raw-sql: platform-only attempted smuggling\n  bad(repo) { return repo.query('SELECT * FROM orders'); }\n}\n`
  );
  const result = await checkRawSql(root);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /not in platform\/rls allowlist/);
});
```

---

## External References

> Note: this session did not have live web search available. The following are stable, canonical references for the tools discussed; URLs are well-known documentation locations and should be re-verified before being cited in a PR description.

- ESLint `no-restricted-syntax` — https://eslint.org/docs/latest/rules/no-restricted-syntax — the AST-selector rule that option 2 would use (e.g. `'CallExpression[callee.property.name="query"]'`). Confirms ESLint's escape hatch is `// eslint-disable-next-line`.
- `@typescript-eslint/parser` — https://typescript-eslint.io/architecture/parser/ — required to give ESLint a TS AST; the dependency that makes option 2 a "new toolchain".
- ts-morph — https://ts-morph.com/ — structural wrapper over the TS Compiler API (`SourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)`). The Option-3 upgrade path if regex false positives grow.
- TypeScript Compiler API — https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API — lower-level alternative to ts-morph.
- GitHub CodeQL `js/sql-injection` — https://codeql.github.com/codeql-query-help/javascript/js-sql-injection/ — documents that CodeQL targets taint-flow injection, NOT blanket raw-SQL banning (why CodeQL is the wrong primary tool here).
- TypeORM `QueryBuilder` / `QueryRunner` APIs — https://typeorm.io/query-builder and https://typeorm.io/migrations — confirm `queryRunner.query()` is the canonical migration raw-SQL surface and `dataSource.query()` / `repository.query()` are the request-path surfaces the spec wants banned.

---

## Related Specs

- `.trellis/spec/backend/database-guidelines.md` — §Query 模式 (lines 46-67) defines the forbidden set and exception conditions; §迁移与数据库结构变更 (lines 189-195) is why migrations are the canonical raw-SQL home; §RLS 指南 (lines 167-176) is why `rls.ts` will need marker access.
- `.trellis/spec/backend/quality-guidelines.md` — line 19 (forbidden), line 52 (schedules the raw-SQL guard as required test), lines 59 (PR2 deadline), line 67 (review checklist).
- `.trellis/spec/backend/directory-structure.md` — lines 36-41 (anticipated `rls.ts`, `platform-scope.ts`), lines 94-97 (`modules/platform/**` vs `modules/merchant/**` vs `modules/consumer/**`) — the path taxonomy the allowlist keys off.

---

## Caveats / Not Found

- **External URLs not live-verified** this session (no web search tool available); re-confirm before citing in PR/commit text. The ESLint/ts-morph/CodeQL behavioral claims are stable and from their documented feature set, not speculation.
- **No existing raw-SQL usage in business code** to calibrate false-positive rate against — the codebase is a walking skeleton. The regex `\.query\s*\(` is expected to have ~zero matches in `modules/**` today, so the guard will start green. First real false-positive data will come when domain modules land in PR3+; revisit then (optionally upgrade to ts-morph at that point).
- **SQL-string-concatenation detection** (the second half of the spec's forbidden set) is deliberately left as a commented-out v2 check in the pseudo-code. Detecting `'SELECT ... ' + userInput` reliably needs at minimum a template-literal + `+` operator heuristic and is noisy; the `.query(` ban alone covers the dominant risk surface (every TypeORM raw path goes through `.query()` or through `QueryBuilder` which is the approved helper). Recommend shipping v1 with only the `.query(` ban, and adding the concat check if a real miss appears.
- **`rls.ts` and `platform-scope.ts` do not exist yet.** The guard's `MARKER_ALLOWED_ROOTS` lists `core/database/rls.ts` proactively; if that file lands under a different name, the constant must be updated. The marker-on-platform path rule does not depend on those files existing.
- **`queryRunner.query()` outside migrations** (e.g. a future maintenance script that takes a `QueryRunner` for a transactional raw op) would NOT be caught by path exclusion alone. If such a script is added outside `migrations/`, it must either go through a platform-service marker or be added to `PATH_EXCLUDES` with review. Flagging this as a known edge case.
