const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

function fixture(baseUrl = 'http://10.0.0.5:8080') {
  const requests = [], timers = new Map()
  let nextTimer = 0, sessions = 0, aborts = 0
  const app = { globalData: { baseUrl }, ensureSession() { sessions++; return new Promise(() => {}) } }
  const context = { module: { exports: {} }, getApp: () => app,
    wx: { request(options) { requests.push(options); return { abort() { aborts++; options.fail({ errMsg: 'request:fail abort' }) } } } },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id }, clearTimeout(id) { timers.delete(id) } }
  vm.runInNewContext(fs.readFileSync(path.resolve('miniprogram/utils/api.js'), 'utf8'), context)
  const api = context.module.exports
  const campusContext = { module: { exports: {} }, require: () => api }
  vm.runInNewContext(fs.readFileSync(path.resolve('miniprogram/utils/campus.js'), 'utf8'), campusContext)
  return { api, campus: campusContext.module.exports, requests, timers,
    get sessions() { return sessions }, get aborts() { return aborts } }
}

test('public campus requests start immediately even when visitor login is stuck', async () => {
  const h = fixture()
  const privateRequest = h.campus.call('jwxt.schedule')
  assert.equal(h.sessions, 1)
  assert.equal(h.requests.length, 0)
  const pending = h.campus.call('road.plan', { end_lat: 38.49 }, { timeout: 8000 })
  assert.equal(h.requests.length, 1)
  assert.equal(h.sessions, 1)
  assert.equal(h.requests[0].timeout, 8000)
  assert.equal(h.requests[0].header.Authorization, undefined)
  assert.equal(h.requests[0].data.end_lat, 38.49)
  h.requests[0].success({ statusCode: 200, data: { code: 0, data: { distance: 31 } } })
  assert.equal((await pending).distance, 31)
  assert.equal(h.timers.size, 0)
  void privateRequest
})

test('a public request deadline aborts the network task and ignores late success', async () => {
  const h = fixture()
  const pending = h.campus.call('road.plan', {}, { timeout: 8000 })
  const rejected = assert.rejects(pending, error => error.code === 'REQUEST_TIMEOUT' && error.isNetworkError)
  ;[...h.timers.values()][0]()
  await rejected
  assert.equal(h.aborts, 1)
  assert.equal(h.timers.size, 0)
  h.requests[0].success({ statusCode: 200, data: { code: 0, data: { distance: 999 } } })
  await assert.rejects(pending, error => error.code === 'REQUEST_TIMEOUT')
})

test('explicit cancellation clears the deadline and never becomes a server response', async () => {
  const h = fixture()
  const pending = h.campus.call('road.plan', {}, { timeout: 8000 })
  pending.abort()
  await assert.rejects(pending, error => error.code === 'REQUEST_ABORTED')
  assert.equal(h.aborts, 1)
  assert.equal(h.timers.size, 0)
})

test('network errors retain diagnostics and distinguish Wi-Fi, domain, TLS and timeout failures', async () => {
  for (const [detail, code, copy] of [
    ['request:fail connect refused', 'NETWORK_UNREACHABLE', /同一 Wi-Fi/],
    ['request:fail url not in domain list', 'DOMAIN_NOT_ALLOWED', /域名/],
    ['request:fail ssl hand shake error', 'TLS_ERROR', /安全连接/],
    ['request:fail timeout', 'REQUEST_TIMEOUT', /超时/]
  ]) {
    const h = fixture()
    const pending = h.campus.call('campus.list')
    h.requests[0].fail({ errMsg: detail })
    await assert.rejects(pending, error => error.code === code && error.errMsg === detail && copy.test(error.message))
    assert.equal(h.timers.size, 0)
  }
  const h = fixture('https://campus.example.test')
  const pending = h.campus.call('campus.list')
  h.requests[0].fail({ errMsg: 'request:fail network unreachable' })
  await assert.rejects(pending, error => !/Wi-Fi/.test(error.message))
})
