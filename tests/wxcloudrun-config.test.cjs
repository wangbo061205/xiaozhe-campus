const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const vm = require('node:vm')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxcloudrun-config-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  const config = path.join(root, 'config.js'), backups = path.join(root, 'backups')
  const before = "module.exports = {\n  baseUrl: 'https://old.example.com',\n  simulatorBaseUrl: 'http://127.0.0.1:8080'\n}\n"
  fs.writeFileSync(config, before)
  const run = url => spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/configure-wxcloudrun.mjs'),
    '--url', url, '--config', config, '--backup-dir', backups], { encoding: 'utf8', timeout: 5000 })
  return { config, backups, before, run }
}

test('cloud configuration updates real device and simulator together and preserves the old file', t => {
  const h = fixture(t), r = h.run('https://demo.ap-shanghai.run.tcloudbase.com/')
  assert.equal(r.status, 0, r.stderr)
  const context = { module: { exports: {} } }
  vm.runInNewContext(fs.readFileSync(h.config, 'utf8'), context)
  assert.equal(context.module.exports.baseUrl, 'https://demo.ap-shanghai.run.tcloudbase.com')
  assert.equal(context.module.exports.simulatorBaseUrl, context.module.exports.baseUrl)
  const files = fs.readdirSync(h.backups)
  assert.equal(files.length, 1)
  assert.equal(fs.readFileSync(path.join(h.backups, files[0]), 'utf8'), h.before)
  assert.equal(h.run('https://demo.ap-shanghai.run.tcloudbase.com').status, 0)
  assert.equal(fs.readdirSync(h.backups).length, 1)
})

test('invalid or credential-bearing cloud addresses leave the configuration untouched', t => {
  const h = fixture(t)
  for (const url of ['http://example.com', 'https://127.0.0.1', 'https://localhost',
    'https://example.com/api', 'https://example.com?key=private', 'https://user:private@example.com',
    'https://example.com:8443', 'https://example.com/#fragment']) {
    assert.notEqual(h.run(url).status, 0, url)
    assert.equal(fs.readFileSync(h.config, 'utf8'), h.before)
  }
  assert.equal(fs.existsSync(h.backups), false)
})

test('ambiguous config keys are rejected without making a backup or a partial change', t => {
  const h = fixture(t)
  const before = h.before.replace("baseUrl: 'https://old.example.com',", "baseUrl: 'https://old.example.com', baseUrl: 'https://another.example.com',")
  fs.writeFileSync(h.config, before)
  assert.notEqual(h.run('https://cloud.example.com').status, 0)
  assert.equal(fs.readFileSync(h.config, 'utf8'), before)
  assert.equal(fs.existsSync(h.backups), false)
})
