const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const source = path.resolve(__dirname, '../deploy/production')
const shell = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh'
const posix = file => process.platform === 'win32' ? file.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()) : file

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaozhe-deploy-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const deploy = path.join(root, 'deploy/production'), bin = path.join(root, 'bin')
  fs.mkdirSync(deploy, { recursive: true }); fs.mkdirSync(bin)
  for (const file of ['server-common.sh', 'deploy-baota.sh', 'backup-baota.sh', 'check-baota.sh', 'init-env.sh', '.env.example', 'compose.server.yml'])
    fs.copyFileSync(path.join(source, file), path.join(deploy, file))
  fs.mkdirSync(path.join(root, 'runtime')); fs.mkdirSync(path.join(root, 'knowledge'))
  fs.writeFileSync(path.join(root, 'runtime/campus-agent.jar'), 'test artifact')
  fs.writeFileSync(path.join(root, 'runtime/SHA256SUMS'), 'test manifest')
  if (options.env !== false) fs.writeFileSync(path.join(deploy, '.env'), 'CAMPUS_DOMAIN=xiaozhe.mxqi.cn\nDB_PASSWORD=keep-existing-password\nJWT_SECRET=keep-existing-jwt\nDEEPSEEK_API_KEY=local-test-only\nDANGEROUS=$(touch must-not-execute)\n')
  const log = path.join(root, 'calls.log')
  const write = (name, text) => fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nset -eu\n' + text, { mode: 0o755 })
  write('docker', `printf '%s\\n' "$*" >> "$TASK_CALLS"
case "$*" in
  'compose version'|'info') exit 0;;
  'volume inspect xiaozhe-campus_postgres_data') [ "$TASK_EXISTING" = true ];;
  'volume inspect xiaozhe-campus_uploads') [ "$TASK_UPLOADS" = true ];;
  'ps -aq --filter label=com.docker.compose.project=xiaozhe-campus') [ "$TASK_EXISTING" != true ] || printf old-container;;
  'inspect --format '*) printf '%s' "$TASK_MOUNT";;
  *' config --quiet') [ "$TASK_CONFIG_OK" = true ];;
  *' ps -a -q postgres'|*' ps -q postgres') [ "$TASK_EXISTING" != true ] || printf old-database;;
  *' pg_dump '*) [ "$TASK_BACKUP_OK" = true ] || exit 1; printf 'PGDMP-original-database';;
  *' psql '*) printf '8811';;
  *' up -d --build backend') [ "$TASK_BUILD_OK" = true ];;
  *' up -d postgres'|*' pg_isready '*|*' run --rm --no-deps knowledge-seed'|*' ps -a') exit 0;;
  'run --rm --network none '*) exit 0;;
  *) printf 'Unexpected docker command: %s\\n' "$*" >&2; exit 95;;
esac
`)
  write('sha256sum', 'printf "sha256-check\\n" >> "$TASK_CALLS"\n[ "$TASK_CHECKSUM_OK" = true ]\n')
  write('curl', `task_output=/dev/null
task_url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) task_output=$2; shift 2;;
    --connect-timeout|--max-time|--write-out) shift 2;;
    --silent|--show-error) shift;;
    *) task_url=$1; shift;;
  esac
done
printf 'curl %s\\n' "$task_url" >> "$TASK_CALLS"
case "$task_url" in
  https:*) task_code=$TASK_PUBLIC_STATUS;;
  *) task_code=200;;
esac
printf '{"code":0,"data":{"assistant":{"name":"小折"}}}' > "$task_output"
printf '%s' "$task_code"
`)
  const env = { ...process.env, TASK_CALLS: posix(log), TASK_EXISTING: 'true', TASK_UPLOADS: 'true',
    TASK_MOUNT: 'xiaozhe-campus_postgres_data', TASK_CONFIG_OK: 'true', TASK_BACKUP_OK: 'true',
    TASK_BUILD_OK: 'true', TASK_CHECKSUM_OK: 'true', TASK_PUBLIC_STATUS: '200', ...options.values }
  const invoke = script => spawnSync(shell, ['--noprofile', '--norc', '-c', 'export PATH="$1:$PATH"; exec sh "$2"', 'test', posix(bin), posix(path.join(deploy, script))], { env, encoding: 'utf8', timeout: 20000 })
  // POSIX sh does not accept Bash flags on Linux.
  const run = script => process.platform === 'win32' ? invoke(script) : spawnSync(shell,
    ['-c', 'export PATH="$1:$PATH"; exec sh "$2"', 'test', bin, path.join(deploy, script)], { env, encoding: 'utf8', timeout: 20000 })
  const calls = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''
  return { root, deploy, run, calls }
}

test('an existing deployment without its original env stops before modifying services', t => {
  const h = fixture(t, { env: false }), r = h.run('deploy-baota.sh')
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /原 .env/)
  assert.doesNotMatch(h.calls(), / up -d /)
  assert.equal(fs.existsSync(path.join(h.deploy, '.env')), false)
})
test('a different database mount stops before creating an empty database', t => {
  const h = fixture(t, { values: { TASK_MOUNT: 'another-project-data' } }), r = h.run('deploy-baota.sh')
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /不同的数据目录/)
  assert.doesNotMatch(h.calls(), / up -d /)
})
test('a corrupt transfer or invalid configuration stops before updating services', t => {
  for (const values of [{ TASK_CHECKSUM_OK: 'false' }, { TASK_CONFIG_OK: 'false' }]) {
    const h = fixture(t, { values }), r = h.run('deploy-baota.sh')
    assert.equal(r.status, 1, r.stderr); assert.doesNotMatch(h.calls(), / up -d /)
  }
})
test('a failed backup prevents replacing the backend', t => {
  const h = fixture(t, { values: { TASK_BACKUP_OK: 'false' } }), r = h.run('deploy-baota.sh')
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /备份失败/)
  assert.doesNotMatch(h.calls(), / up -d --build backend/)
})
test('an upgrade preserves secrets, backs up first, and never starts Caddy or deletes volumes', t => {
  const h = fixture(t), envBefore = fs.readFileSync(path.join(h.deploy, '.env'), 'utf8')
  const r = h.run('deploy-baota.sh')
  assert.equal(r.status, 0, r.stderr)
  const calls = h.calls()
  assert.ok(calls.indexOf(' pg_dump ') < calls.indexOf(' up -d --build backend'))
  assert.match(calls, /xiaozhe-campus_uploads,dst=\/data,readonly/)
  assert.match(calls, / run --rm --no-deps knowledge-seed/)
  assert.doesNotMatch(calls, / down|volume rm|system prune| https(?:\s|$)|nginx|service /)
  assert.equal(fs.readFileSync(path.join(h.deploy, '.env'), 'utf8'), envBefore)
  assert.equal(fs.existsSync(path.join(h.deploy, 'must-not-execute')), false)
  assert.match(r.stdout, /还需完成宝塔反向代理/)
  const backup = path.join(h.deploy, 'backups', fs.readdirSync(path.join(h.deploy, 'backups'))[0])
  assert.equal(fs.readFileSync(path.join(backup, 'server.env'), 'utf8'), envBefore)
  assert.match(fs.readFileSync(path.join(backup, 'campus.dump'), 'utf8'), /^PGDMP/)
})
test('public 404 fails acceptance even when the local backend is healthy', t => {
  const h = fixture(t, { values: { TASK_PUBLIC_STATUS: '404' } }), r = h.run('check-baota.sh')
  assert.equal(r.status, 1, r.stderr); assert.match(r.stdout, /\[通过\] 本机校园服务/)
  assert.match(r.stdout, /\[未通过\] 公网接口/)
  assert.doesNotMatch(h.calls(), /auth\/guest|api\/v1\/chat| up |pg_dump/)
})
test('a complete local and HTTPS acceptance succeeds without sending paid chat requests', t => {
  const h = fixture(t), r = h.run('check-baota.sh')
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /基础部署检查通过/)
  assert.doesNotMatch(h.calls(), /auth\/guest|api\/v1\/chat| up |pg_dump/)
})
