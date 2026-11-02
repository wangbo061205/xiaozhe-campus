const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function harness({ legacy = false } = {}) {
  let page
  const listeners = new Set()
  const window = { windowWidth: 402, windowHeight: 874, screenHeight: 874 }
  const tab = { data: { active: 0, keyboardHidden: false }, setData(update) { Object.assign(this.data, update) } }
  const wx = {
    getStorageSync: () => '',
    getSystemInfoSync: () => ({ ...window }),
    onKeyboardHeightChange: listener => listeners.add(listener),
    offKeyboardHeightChange: listener => listeners.delete(listener)
  }
  if (!legacy) wx.getWindowInfo = () => ({ ...window })
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/chat/chat.js'), 'utf8'), {
    require: () => ({ get: async () => ({}) }),
    Page: definition => { page = definition },
    getApp: () => ({
      glassClass: () => '', ensureSession: async () => {},
      guestStorageKey: () => 'keyboard-test', globalData: { guestId: 'test' }
    }),
    wx
  })
  page.updates = 0
  page.setData = (update, callback) => {
    Object.assign(page.data, update)
    page.updates++
    if (callback) callback()
  }
  page.getTabBar = () => tab
  page.onLoad()
  page.onShow()
  return {
    page, tab, window, listeners,
    emit(height) { for (const listener of listeners) listener({ height }) },
    resize(height, screenHeight = window.screenHeight) {
      window.windowHeight = height
      window.screenHeight = screenHeight
      page.onResize({ size: { windowHeight: height, windowWidth: window.windowWidth } })
    }
  }
}

test('overlay keyboards keep the composer and send action in the visible viewport and restore navigation', () => {
  const h = harness()
  assert.equal(h.page.data.chatViewportHeight, 874)
  h.page.setData({ input: '这段草稿不能丢失' })
  const messages = JSON.stringify(h.page.data.messages)
  h.page.onInputFocus({ detail: { height: 312 } })
  assert.equal(h.page.data.chatViewportHeight, 562)
  assert.equal(h.page.data.keyboardOpen, true)
  assert.equal(h.tab.data.keyboardHidden, true)
  assert.equal(h.page.data.scrollTo, 'bottom-anchor')
  const updates = h.page.updates
  h.emit(312)
  assert.equal(h.page.updates, updates, 'duplicate native and input events must not move the composer twice')
  h.emit(368)
  assert.equal(h.page.data.chatViewportHeight, 506)
  h.page.onInputBlur()
  h.emit(0)
  assert.equal(h.page.data.chatViewportHeight, 874)
  assert.equal(h.page.data.keyboardOpen, false)
  assert.equal(h.tab.data.keyboardHidden, false)
  assert.equal(h.page.data.input, '这段草稿不能丢失')
  assert.equal(JSON.stringify(h.page.data.messages), messages)
})

test('resizing keyboards work in either event order without double subtraction or a leftover gap', () => {
  for (const resizeFirst of [true, false]) {
    for (const closeResizeFirst of [true, false]) {
      const h = harness()
      h.page.onInputFocus({ detail: { height: 0 } })
      if (resizeFirst) h.resize(574)
      h.emit(300)
      if (!resizeFirst) h.resize(574)
      assert.equal(h.page.chatFullHeight, 874)
      assert.equal(h.page.data.chatViewportHeight, 574)
      h.resize(534)
      h.emit(340)
      assert.equal(h.page.data.chatViewportHeight, 534)
      h.page.onInputBlur()
      if (closeResizeFirst) h.resize(874)
      h.emit(0)
      if (!closeResizeFirst) h.resize(874)
      assert.equal(h.page.data.chatViewportHeight, 874)
      assert.equal(h.tab.data.keyboardHidden, false)
    }
  }
})

test('leaving the chat restores tabs, removes its listener and rejects late callbacks after returning', () => {
  const h = harness()
  assert.equal(h.listeners.size, 1)
  const stale = [...h.listeners][0]
  h.emit(312)
  h.page.onHide()
  assert.equal(h.listeners.size, 0)
  assert.equal(h.tab.data.keyboardHidden, false)
  assert.equal(h.page.data.keyboardOpen, false)
  const updates = h.page.updates
  stale({ height: 350 })
  h.page.onResize({ size: { windowHeight: 500 } })
  h.page.onInputFocus({ detail: { height: 350 } })
  assert.equal(h.page.updates, updates)
  h.page.onShow()
  assert.equal(h.listeners.size, 1)
  stale({ height: 350 })
  assert.equal(h.page.data.keyboardOpen, false)
  const current = [...h.listeners][0]
  h.emit(312)
  h.page.onUnload()
  assert.equal(h.listeners.size, 0)
  assert.equal(h.tab.data.keyboardHidden, false)
  const unloadedUpdates = h.page.updates
  current({ height: 350 })
  h.page.onKeyboardHeightChange({ detail: { height: 350 } })
  assert.equal(h.page.updates, unloadedUpdates)
})

test('a native window resize before input focus never subtracts the keyboard twice', () => {
  for (const focusFirst of [true, false]) {
    const h = harness()
    h.resize(574)
    if (focusFirst) h.page.onInputFocus({ detail: { height: 300 } })
    h.emit(300)
    if (!focusFirst) h.page.onInputFocus({ detail: { height: 300 } })
    assert.equal(h.page.chatFullHeight, 874)
    assert.equal(h.page.data.chatViewportHeight, 574)
    assert.equal(h.tab.data.keyboardHidden, true)
    h.page.onInputBlur()
    h.emit(0)
    h.resize(874)
    assert.equal(h.page.data.chatViewportHeight, 874)
    assert.equal(h.tab.data.keyboardHidden, false)
  }
})

test('returning to an already resized chat retains the full viewport and the draft', () => {
  const h = harness()
  h.page.setData({ input: '返回后继续写这条消息' })
  h.emit(300)
  h.page.onHide()
  h.window.windowHeight = 574
  h.page.onShow()
  h.emit(300)
  assert.equal(h.page.chatFullHeight, 874)
  assert.equal(h.page.data.chatViewportHeight, 574)
  assert.equal(h.page.data.input, '返回后继续写这条消息')
  assert.equal(h.tab.data.keyboardHidden, true)
})

test('external keyboards, normal window resizing and legacy window APIs keep usable layout', () => {
  const h = harness({ legacy: true })
  h.page.onInputFocus({ detail: { height: 0 } })
  assert.equal(h.page.data.keyboardOpen, false)
  assert.equal(h.tab.data.keyboardHidden, false)
  for (const height of [-1, NaN, Infinity, undefined]) h.emit(height)
  assert.equal(h.page.data.chatViewportHeight, 874)
  h.page.onInputBlur()
  h.resize(700)
  assert.equal(h.page.data.chatViewportHeight, 700)
  h.page.onInputFocus({ detail: { height: 260 } })
  assert.equal(h.page.data.chatViewportHeight, 440)
  h.window.windowWidth = 874
  h.resize(402, 402)
  h.emit(180)
  assert.equal(h.page.data.chatViewportHeight, 48, 'a changed screen preserves the existing viewport inset')
})

test('opening the keyboard scrolls to the end of a long conversation without replacing messages', () => {
  const h = harness()
  for (let i = 0; i < 20; i++) h.page.appendBot('一段较长的校园回答。'.repeat(30))
  const messages = JSON.stringify(h.page.data.messages)
  h.page.onInputFocus({ detail: { height: 312 } })
  assert.equal(h.page.data.scrollTo, 'bottom-anchor')
  assert.equal(JSON.stringify(h.page.data.messages), messages)
  h.emit(360)
  assert.equal(h.page.data.scrollTo, 'bottom-anchor')
})
