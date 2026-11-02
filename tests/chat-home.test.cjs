const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const miniRoot = path.join(__dirname, '../miniprogram')
const plain = value => JSON.parse(JSON.stringify(value))
const read = relative => fs.readFileSync(path.join(miniRoot, relative), 'utf8')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function createChat({ get = async () => ({}), post = async () => ({ reply: '我在听。' }) } = {}) {
  let page
  const storage = new Map()
  const requests = []
  const app = {
    glassClass: () => 'gq-high',
    ensureSession: () => Promise.resolve('device-token'),
    guestStorageKey: () => 'campus.guest.identity.v1:test-backend',
    globalData: { guestId: 'test-guest' }
  }
  vm.runInNewContext(read('pages/chat/chat.js'), {
    require: () => ({ get, post: (url, body) => { requests.push({ url, body }); return post(url, body) } }),
    Page: definition => { page = definition },
    getApp: () => app,
    wx: {
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value),
      removeStorageSync: key => storage.delete(key)
    }
  })
  page.updates = 0
  page.setData = (update, callback) => { page.updates++; Object.assign(page.data, update); if (callback) callback() }
  page.onLoad()
  return { page, storage, requests }
}

test('launch opens AI and all five tab selections agree with the visible navigation', () => {
  const manifest = JSON.parse(read('app.json'))
  let component
  vm.runInNewContext(read('custom-tab-bar/index.js'), { Component: definition => { component = definition } })
  assert.equal(manifest.pages[0], 'pages/chat/chat')
  assert.equal(manifest.tabBar.list[0].pagePath, manifest.pages[0])
  assert.equal(manifest.tabBar.list[1].text, '校园')
  assert.deepEqual(plain(component.data.list.map(item => ({ pagePath: item.pagePath.slice(1), text: item.text }))), manifest.tabBar.list)

  manifest.tabBar.list.forEach((item, index) => {
    let page, selected
    vm.runInNewContext(read(item.pagePath + '.js'), {
      require: () => ({}), Page: definition => { page = definition },
      getApp: () => ({ globalData: {}, glassClass: () => '' }), wx: {}, console
    })
    page.setData = update => Object.assign(page.data, update)
    page.getTabBar = () => ({ setData: update => { if ('active' in update) selected = update.active } })
    for (const method of ['loadAssistantSettings', 'loadToday', 'load', 'loadTodos', 'loadRuns', 'loadSubscriptions']) page[method] = () => {}
    page.onShow()
    assert.equal(selected, index, item.pagePath)
  })

  let nav, destination
  vm.runInNewContext(read('components/glass-nav/index.js'), {
    Component: definition => { nav = definition },
    getCurrentPages: () => [{}], wx: { switchTab: options => { destination = options.url } }
  })
  nav.methods.onBack()
  assert.equal(destination, '/pages/chat/chat')
})

test('published assistant settings refresh a welcome while preserving an ongoing conversation', async () => {
  let config = null
  const { page, storage, requests } = createChat({
    get: async () => { if (!config) throw new Error('offline'); return config },
    post: async url => url.endsWith('/reset') ? null : ({ sessionId: 'my-conversation', reply: '听起来你有些累，我们慢慢聊。', sources: [{ id: 7, title: '学习支持' }] })
  })
  const fallbackGreeting = page.data.greeting
  await page.onShow()
  assert.equal(page.data.messages[0].text, fallbackGreeting)

  config = { aiLabel: '内容由 AI 生成', modelName: 'test-model', assistant: { name: '小知', greeting: '欢迎来到校园，今天过得怎样？', suggestions: ['想聊聊心情', '了解校园服务'], emotionalSupportEnabled: true } }
  await page.onShow()
  assert.equal(page.data.assistantName, '小知')
  assert.equal(page.data.messages[0].text, config.assistant.greeting)
  assert.deepEqual(plain(page.data.suggestions), config.assistant.suggestions)
  assert.equal(page.data.modelName, 'test-model')

  page.setData({ input: '最近有点疲惫' })
  await page.send()
  assert.equal(storage.get(page.chatStorageKey()), 'my-conversation')
  assert.equal(page.data.messages.at(-1).sourceList[0].id, 7)
  const conversation = plain(page.data.messages)
  config = { assistant: { name: '校园小知', greeting: '新的欢迎语', suggestions: ['新的开场'], emotionalSupportEnabled: false } }
  await page.onShow()
  assert.equal(page.data.assistantName, '校园小知')
  assert.equal(page.data.emotionalSupportEnabled, false)
  assert.deepEqual(plain(page.data.messages), conversation)
  assert.equal(page.data.showSuggest, false)
  page.newChat()
  assert.equal(page.data.messages.length, 1)
  assert.equal(page.data.messages[0].text, '新的欢迎语')
  assert.equal(page.data.showSuggest, true)
  assert.equal(storage.has(page.chatStorageKey()), false)
  assert.equal(requests.at(-1).url, '/api/v1/chat/reset')
  assert.equal(requests.at(-1).body.sessionId, 'my-conversation')
})

test('late settings cannot replace a newer configuration or update an unloaded page', async () => {
  const queries = []
  const { page } = createChat({ get: () => { const request = deferred(); queries.push(request); return request.promise } })
  const first = page.onShow(), second = page.onShow()
  queries[1].resolve({ assistant: { name: '最新名称', greeting: '最新欢迎语', suggestions: ['新建议'] } })
  await second
  queries[0].resolve({ assistant: { name: '过期名称', greeting: '过期欢迎语' } })
  await first
  assert.equal(page.data.assistantName, '最新名称')
  assert.equal(page.data.messages[0].text, '最新欢迎语')
  const pending = page.onShow()
  page.onUnload()
  const updates = page.updates
  queries[2].resolve({ assistant: { name: '不应出现' } })
  await pending
  assert.equal(page.updates, updates)
})

test('late chat success or failure cannot pollute a new conversation or an unloaded page', async () => {
  for (const action of ['newChat', 'onUnload']) {
    for (const outcome of ['success', 'failure']) {
      const request = deferred()
      const { page, storage } = createChat({ post: () => request.promise })
      page.setData({ input: '旧问题' })
      const pending = page.send()
      page[action]()
      const snapshot = plain(page.data), updates = page.updates
      if (outcome === 'success') request.resolve({ sessionId: 'old-session', reply: '迟到回答' })
      else request.reject(new Error('迟到错误'))
      await pending
      assert.deepEqual(plain(page.data), snapshot, action + ':' + outcome)
      assert.equal(page.updates, updates)
      assert.equal(storage.size, 0)
    }
  }
})
