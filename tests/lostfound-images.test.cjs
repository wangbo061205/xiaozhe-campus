const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const media = require('../miniprogram/utils/lostfound-images')

function loadPage(name, { api = {}, wx = {}, images = media } = {}) {
  let page
  const timers = []
  vm.runInNewContext(fs.readFileSync(path.resolve('miniprogram/pages', name, name + '.js'), 'utf8'), {
    Page: value => { page = value },
    require: key => key.endsWith('/api') ? api : images,
    getApp: () => ({ glassClass: () => '' }),
    wx: { showToast() {}, ...wx },
    setTimeout: callback => { timers.push(callback) }
  })
  page.data = structuredClone(page.data)
  page.setData = (updates, callback) => {
    for (const [key, value] of Object.entries(updates)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      const last = parts.pop()
      let target = page.data
      for (const part of parts) target = target[part]
      target[last] = value
    }
    if (callback) callback()
  }
  return { page, timers }
}

const tap = (key, value) => ({ currentTarget: { dataset: { [key]: value } } })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('photo picker keeps existing photos on cancel and enforces six photos and 5MB', () => {
  let picker, preview
  const messages = []
  const { page } = loadPage('lf-publish', { wx: {
    chooseMedia: options => { picker = options },
    showToast: options => messages.push(options.title),
    previewImage: options => { preview = options }
  } })
  page.data.images = [{ key: 'first', path: '/tmp/first.png', uploadId: '' }]
  page.chooseImages()
  assert.equal(picker.count, 5)
  assert.deepEqual(Array.from(picker.sourceType), ['album', 'camera'])
  picker.fail({ errMsg: 'chooseMedia:fail cancel' }); picker.complete()
  assert.equal(page.data.images.length, 1)
  assert.equal(page.data.choosingImages, false)
  assert.equal(messages.length, 0)
  page.chooseImages()
  picker.success({ tempFiles: [
    { tempFilePath: '/tmp/too-large.png', size: media.MAX_BYTES + 1 },
    ...Array.from({ length: 6 }, (_, index) => ({ tempFilePath: '/tmp/' + index + '.png', size: 1024 }))
  ] })
  picker.complete()
  assert.equal(page.data.images.length, 6)
  assert.equal(page.data.images[0].path, '/tmp/first.png')
  assert.ok(!page.data.images.some(image => image.path.includes('too-large')))
  assert.match(messages[0], /5MB/)
  page.removeImage(tap('key', page.data.images[1].key))
  assert.equal(page.data.images.length, 5)
  page.previewImage(tap('index', 1))
  assert.equal(preview.current, page.data.images[1].path)
  assert.equal(preview.urls.length, 5)
})

test('failed upload preserves selected photos and retry reuses successful uploads in chosen order', async () => {
  const uploads = [], posts = []
  let failUpload = true, failPost = true, navigated = false
  const { page, timers } = loadPage('lf-publish', { api: {
    uploadImage: async file => {
      uploads.push(file)
      if (file === '/tmp/b.png' && failUpload) { failUpload = false; throw new Error('网络中断') }
      return { id: file === '/tmp/a.png' ? 'id-a' : 'id-b' }
    },
    post: async (url, body) => { posts.push({ url, body }); if (failPost) { failPost = false; throw new Error('服务暂不可用') } }
  }, wx: { navigateBack: () => { navigated = true } } })
  page.setData({ title: ' 蓝色笔记本 ', description: ' 图书馆捡到 ', images: [
    { key: 'a', path: '/tmp/a.png', uploadId: '' }, { key: 'b', path: '/tmp/b.png', uploadId: '' }
  ] })
  await page.submit()
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.images.length, 2)
  assert.equal(page.data.images[0].uploadId, 'id-a')
  assert.equal(page.data.images[1].uploadId, '')
  assert.equal(posts.length, 0)
  await page.submit()
  assert.equal(page.data.submitting, false)
  assert.deepEqual(uploads, ['/tmp/a.png', '/tmp/b.png', '/tmp/b.png'])
  await page.submit()
  assert.equal(uploads.length, 3)
  assert.equal(posts.length, 2)
  assert.equal(posts[1].url, '/api/v1/lost-found')
  assert.deepEqual(Array.from(posts[1].body.imageIds), ['id-a', 'id-b'])
  assert.equal(posts[1].body.title, '蓝色笔记本')
  assert.equal(page.data.submitting, true)
  await page.submit()
  assert.equal(posts.length, 2)
  timers[0]()
  assert.equal(navigated, true)
})

test('required text validation happens before uploading without a manual login gate', async () => {
  for (const scenario of [ { title: ' ', description: '特征' }, { title: '物品', description: '' } ]) {
    let uploaded = false
    const { page } = loadPage('lf-publish', { api: {
      uploadImage: () => { uploaded = true }
    } })
    page.setData({ title: scenario.title, description: scenario.description,
      images: [{ key: 'a', path: '/tmp/a.png', uploadId: '' }] })
    await page.submit()
    assert.equal(uploaded, false)
    assert.equal(page.data.submitting, false)
  }
})

test('leaving the publish page during upload prevents a background post', async () => {
  let finishUpload, posted = false
  const { page } = loadPage('lf-publish', { api: {
    uploadImage: () => new Promise(resolve => { finishUpload = resolve }),
    post: () => { posted = true }
  } })
  page.setData({ title: '测试物品', description: '物品特征', images: [{ key: 'a', path: '/tmp/a.png', uploadId: '' }] })
  const pending = page.submit()
  page.onUnload()
  finishUpload({ id: 'id-a' }); await pending
  assert.equal(posted, false)
})

test('upload wrapper rejects malformed and failed responses without hanging', async () => {
  let upload
  const sandbox = { module: { exports: {} }, getApp: () => ({ globalData: { baseUrl: 'https://campus.test' }, ensureSession: async () => 'fixture' }),
    wx: { uploadFile: options => { upload = options } } }
  vm.runInNewContext(fs.readFileSync(path.resolve('miniprogram/utils/api.js'), 'utf8'), sandbox)
  for (const response of [ { statusCode: 200, data: 'null' }, { statusCode: 200, data: 'not json' },
    { statusCode: 500, data: '{"code":500,"message":"上传暂不可用"}' } ]) {
    const pending = sandbox.module.exports.uploadImage('/tmp/a.png')
    await tick()
    assert.equal(upload.name, 'file')
    assert.equal(upload.header.Authorization, 'Bearer fixture')
    upload.success(response)
    await assert.rejects(pending)
  }
})

test('legacy image strings accept only local image endpoints', () => {
  const image = '/api/v1/lost-found/images/12345678-1234-1234-1234-123456789abc'
  assert.deepEqual(media.imagePaths(JSON.stringify([image, 'https://example.com/photo.png', 'javascript:alert(1)', '/api/v1/auth/login'])), [image])
  for (const value of [null, {}, 'bad json', '{"url":"unsafe"}']) assert.deepEqual(media.imagePaths(value), [])
})

test('late gallery downloads cannot reopen a dismissed detail or overwrite another post', async () => {
  const downloads = []
  const { page } = loadPage('lostfound', { images: { ...media,
    downloadImage: () => new Promise(resolve => downloads.push(resolve))
  } })
  page.data.shown = [{ id: 1, imagePaths: ['first'] }, { id: 2, imagePaths: ['second'] }]
  const first = page.onTap(tap('index', 0))
  page.closeDetail()
  downloads[0]('/tmp/first.png'); await first
  assert.equal(page.data.selected, null)
  assert.equal(page.data.detailImages.length, 0)
  const older = page.onTap(tap('index', 0))
  const current = page.onTap(tap('index', 1))
  downloads[2]('/tmp/second.png'); await current
  downloads[1]('/tmp/old.png'); await older
  assert.equal(page.data.selected.id, 2)
  assert.equal(page.data.detailImages[0], '/tmp/second.png')
})

test('late cover download cannot overwrite a refreshed list', async () => {
  let finishCover
  let response = [{ id: 1, kind: 'LOST', title: 'first', images: '["/api/v1/lost-found/images/12345678-1234-1234-1234-123456789abc"]' }]
  const { page } = loadPage('lostfound', { api: { get: async () => response }, images: {
    ...media, downloadImage: () => new Promise(resolve => { finishCover = resolve })
  } })
  page.load(); await tick()
  response = [{ id: 2, kind: 'FOUND', title: 'new list', images: null }]
  page.load(); await tick()
  finishCover('/tmp/stale.png'); await tick()
  assert.equal(page.data.shown[0].id, 2)
  assert.equal(page.data.shown[0].cover, '')
})
