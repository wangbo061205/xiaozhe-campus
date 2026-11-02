const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const SOURCE = path.resolve('miniprogram')
const BASE = 'https://campus.test'
const KEY = 'campus.guest.identity.v1:' + encodeURIComponent(BASE)
const GUEST = { guestId: 'guest_device-fixture', guestSecret: 'device-secret-fixture', userId: 71 }
const tick = () => new Promise(resolve => setImmediate(resolve))

function fixture(saved = {}) {
  let app
  const storage = new Map(Object.entries(saved))
  const calls = []
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    getWindowInfo: () => ({}), getDeviceInfo: () => ({ platform: 'test' }),
    request: options => calls.push({ kind: 'request', ...options }),
    uploadFile: options => calls.push({ kind: 'upload', ...options }),
    downloadFile: options => calls.push({ kind: 'download', ...options })
  }
  vm.runInNewContext(fs.readFileSync(path.join(SOURCE, 'app.js'), 'utf8'), {
    App: value => { app = value }, wx,
    require: key => key.includes('design-config') ? { tokens: {} } : { baseUrl: BASE, simulatorBaseUrl: BASE }
  })
  const apiBox = { module: { exports: {} }, wx, getApp: () => app }
  vm.runInNewContext(fs.readFileSync(path.join(SOURCE, 'utils/api.js'), 'utf8'), apiBox)
  const mediaBox = { module: { exports: {} }, wx, getApp: () => app, require: () => apiBox.module.exports }
  vm.runInNewContext(fs.readFileSync(path.join(SOURCE, 'utils/lostfound-images.js'), 'utf8'), mediaBox)
  const guestReply = (call, token = 'guest-token-fixture', changes = {}) => call.success({
    statusCode: 200, data: { code: 0, data: { ...GUEST, token, displayName: '校园访客', role: 'GUEST', ...changes } }
  })
  return { app, storage, calls, wx, api: apiBox.module.exports, media: mediaBox.module.exports, guestReply }
}

test('guest startup ignores legacy administrator tokens and shares one session request', async () => {
  const f = fixture({ token: 'legacy-admin-fixture', userName: '管理员' })
  f.app.onLaunch()
  const first = f.app.ensureSession(), second = f.app.ensureSession()
  assert.equal(first, second)
  assert.equal(f.calls.length, 1)
  assert.equal(f.app.globalData.token, '')
  assert.equal(f.storage.has('token'), false)
  assert.equal(f.storage.has('userName'), false)
  assert.equal(f.calls[0].url, BASE + '/api/v1/auth/guest')
  assert.deepEqual(Object.keys(f.calls[0].data), [])
  assert.equal(f.calls[0].header.Authorization, undefined)
  f.guestReply(f.calls[0])
  assert.equal(await first, 'guest-token-fixture')
  assert.equal(f.storage.get(KEY).guestId, GUEST.guestId)
  assert.equal(f.storage.get(KEY).guestSecret, GUEST.guestSecret)
  assert.equal(f.storage.get(KEY).token, undefined)
  assert.equal(f.app.globalData.userName, '校园访客')
})

test('guest identity restores with its secret and stays isolated from another backend', async () => {
  const f = fixture({ [KEY]: GUEST, ['campus.guest.identity.v1:' + encodeURIComponent('https://other.test')]: { guestId: 'other', guestSecret: 'other' } })
  f.app.onLaunch()
  assert.equal(f.calls[0].data.guestId, GUEST.guestId)
  assert.equal(f.calls[0].data.guestSecret, GUEST.guestSecret)
  f.guestReply(f.calls[0], 'restored-token')
  await f.app.ensureSession()
  assert.equal(f.app.globalData.guestId, GUEST.guestId)
  const other = fixture({ ['campus.guest.identity.v1:' + encodeURIComponent('https://other.test')]: GUEST })
  other.app.onLaunch()
  assert.deepEqual(Object.keys(other.calls[0].data), [])
  other.guestReply(other.calls[0])
  await other.app.ensureSession()
})

test('restoration failure preserves credentials and never silently creates a different guest', async () => {
  const f = fixture({ [KEY]: GUEST })
  f.app.onLaunch()
  const pending = f.app.ensureSession()
  f.calls[0].success({ statusCode: 401, data: { code: 401 } })
  await assert.rejects(pending, /恢复/)
  assert.equal(f.storage.get(KEY).guestSecret, GUEST.guestSecret)
  const retry = f.app.ensureSession()
  assert.equal(f.calls[1].data.guestId, GUEST.guestId)
  f.guestReply(f.calls[1], 'retry-token')
  await retry
})

test('session rejects an administrator response and retries after a network failure', async () => {
  const f = fixture()
  f.app.onLaunch()
  let pending = f.app.ensureSession()
  f.guestReply(f.calls[0], 'admin-response-fixture', { role: 'ADMIN' })
  await assert.rejects(pending)
  assert.equal(f.app.globalData.token, '')
  assert.equal(f.storage.has(KEY), false)
  pending = f.app.ensureSession()
  f.calls[1].fail({ errMsg: 'network down' })
  await assert.rejects(pending, /网络/)
  pending = f.app.ensureSession()
  f.guestReply(f.calls[2])
  await pending
  assert.equal(f.app.globalData.guestId, GUEST.guestId)
})

test('concurrent 401 responses renew once, reuse the new token, and replay each request once', async () => {
  const f = fixture({ [KEY]: GUEST })
  f.app.onLaunch(); f.guestReply(f.calls[0], 'old-token'); await f.app.ensureSession()
  const first = f.api.get('/api/v1/todos'), second = f.api.get('/api/v1/favorites')
  await tick()
  assert.equal(f.calls[1].header.Authorization, 'Bearer old-token')
  f.calls[1].success({ statusCode: 401, data: { code: 401 } })
  f.calls[2].success({ statusCode: 401, data: { code: 401 } })
  await tick()
  assert.equal(f.calls.filter(call => call.url.endsWith('/auth/guest')).length, 2)
  assert.equal(f.calls[3].data.guestSecret, GUEST.guestSecret)
  f.guestReply(f.calls[3], 'new-token')
  await tick()
  assert.equal(f.calls.length, 6)
  for (const call of f.calls.slice(4)) {
    assert.equal(call.header.Authorization, 'Bearer new-token')
    call.success({ statusCode: 200, data: { code: 0, data: [] } })
  }
  await Promise.all([first, second])
  const lateRenewal = await f.app.renewSession('old-token')
  assert.equal(lateRenewal, 'new-token')
  assert.equal(f.calls.length, 6)
})

test('401 retries stop after one replay and 403 never refreshes', async () => {
  const f = fixture({ [KEY]: GUEST })
  f.app.onLaunch(); f.guestReply(f.calls[0]); await f.app.ensureSession()
  const pending = f.api.post('/api/v1/todos', { title: '保留数据' })
  await tick(); f.calls[1].success({ statusCode: 401, data: { code: 401 } })
  await tick(); f.guestReply(f.calls[2], 'new-token')
  await tick()
  assert.equal(f.calls[3].data.title, '保留数据')
  f.calls[3].success({ statusCode: 401, data: { code: 401 } })
  await assert.rejects(pending, error => error.status === 401)
  assert.equal(f.calls.length, 4)
  const denied = f.api.get('/api/v1/favorites')
  await tick(); f.calls[4].success({ statusCode: 403, data: { code: 403 } })
  await assert.rejects(denied, error => error.status === 403)
  assert.equal(f.calls.length, 5)
})

test('image upload and private downloads establish a guest session and renew expired tokens', async () => {
  const f = fixture({ [KEY]: GUEST })
  f.app.onLaunch(); f.guestReply(f.calls[0], 'initial-token'); await f.app.ensureSession()
  const uploading = f.api.uploadImage('/tmp/chosen.png')
  await tick()
  assert.equal(f.calls[1].kind, 'upload')
  f.calls[1].success({ statusCode: 401, data: 'unauthorized' })
  await tick(); f.guestReply(f.calls[2], 'upload-token'); await tick()
  assert.equal(f.calls[3].filePath, '/tmp/chosen.png')
  assert.equal(f.calls[3].header.Authorization, 'Bearer upload-token')
  f.calls[3].success({ statusCode: 200, data: JSON.stringify({ code: 0, data: { id: 'photo-fixture' } }) })
  assert.equal((await uploading).id, 'photo-fixture')
  const downloading = f.media.downloadImage('/api/v1/lost-found/images/12345678-1234-1234-1234-123456789abc')
  await tick(); assert.equal(f.calls[4].header.Authorization, 'Bearer upload-token')
  f.calls[4].success({ statusCode: 401 })
  await tick(); f.guestReply(f.calls[5], 'download-token'); await tick()
  assert.equal(f.calls[6].header.Authorization, 'Bearer download-token')
  f.calls[6].success({ statusCode: 200, tempFilePath: '/tmp/downloaded.png' })
  assert.equal(await downloading, '/tmp/downloaded.png')
})
