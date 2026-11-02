const api = require('../../utils/api')

let msgSeq = 0
const DEFAULT_GREETING = '你好，我是小折，你的校园 AI 助手。\n学习生活、校园办事，或是想聊聊心情，都可以从这里开始。'
const DEFAULT_SUGGESTIONS = [
  '今天有点累，想找人聊聊',
  '临近期末，帮我理一理复习节奏',
  '校园卡丢了该怎么办？',
  '图书馆的信息去哪里查？'
]

function configuredText(value, fallback, maxLength) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback
}

Page({
  data: {
    gq: '',
    messages: [],
    input: '',
    sending: false,
    scrollTo: '',
    showSuggest: true,
    suggestions: DEFAULT_SUGGESTIONS,
    assistantName: '小折',
    greeting: DEFAULT_GREETING,
    emotionalSupportEnabled: true,
    chatSid: '',
    aiLabel: '内容由 AI 生成',
    modelName: '',
    chatViewportHeight: 0,
    keyboardOpen: false
  },

  onLoad() {
    this.unloaded = false
    this.setData({ gq: getApp().glassClass() })
    const version = this.chatVersion || 0
    getApp().ensureSession().then(() => {
      if (!this.unloaded && version === (this.chatVersion || 0) && !this.data.sending && this.data.messages.length <= 1) {
        this.setData({ chatSid: wx.getStorageSync(this.chatStorageKey()) || '' })
      }
    }).catch(() => {})
    this.appendGreeting()
  },

  onShow() {
    this.startKeyboardTracking()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 0, keyboardHidden: false })
    }
    return this.loadAssistantSettings()
  },

  onHide() {
    this.stopKeyboardTracking()
  },

  onUnload() {
    this.unloaded = true
    this.stopKeyboardTracking()
    this.chatVersion = (this.chatVersion || 0) + 1
    this.settingsVersion = (this.settingsVersion || 0) + 1
  },

  readChatWindow() {
    try {
      return (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}
    } catch (e) {
      return {}
    }
  },

  startKeyboardTracking() {
    this.chatVisible = true
    this.chatInputFocused = false
    this.chatKeyboardHeight = 0
    const info = this.readChatWindow()
    const sameScreen = info.screenHeight === this.chatScreenHeight && info.windowWidth === this.chatWindowWidth
    // A resumed Android page may still report the height left above its keyboard.
    const fullHeight = this.chatResumeKeyboard && sameScreen ? this.chatFullHeight : 0
    this.chatFullHeight = Math.max(Number(info.windowHeight) || 0, fullHeight || 0)
    this.chatScreenHeight = info.screenHeight || 0
    this.chatWindowWidth = info.windowWidth || 0
    this.chatResumeKeyboard = false
    this.chatPendingResize = null
    this.updateChatViewport(info)
    if (!this.chatKeyboardListener && wx.onKeyboardHeightChange) {
      const listener = event => {
        if (this.chatKeyboardListener === listener) this.onKeyboardHeightChange(event)
      }
      this.chatKeyboardListener = listener
      wx.onKeyboardHeightChange(listener)
    }
  },

  stopKeyboardTracking() {
    this.chatResumeKeyboard = this.chatKeyboardHeight > 0
    this.chatVisible = false
    this.chatInputFocused = false
    this.chatKeyboardHeight = 0
    this.chatPendingResize = null
    if (this.chatKeyboardListener && wx.offKeyboardHeightChange) {
      wx.offKeyboardHeightChange(this.chatKeyboardListener)
    }
    this.chatKeyboardListener = null
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ keyboardHidden: false })
    }
    if (!this.unloaded) {
      this.setData({ keyboardOpen: false, chatViewportHeight: this.chatFullHeight || 0 })
    }
  },

  updateChatViewport(info) {
    if (!this.chatVisible || this.unloaded) return
    const currentHeight = Number(info.windowHeight) || this.chatFullHeight
    if (!currentHeight) return
    if (!this.chatFullHeight) this.chatFullHeight = currentHeight
    const keyboardOpen = this.chatKeyboardHeight > 0
    // Android may already resize the window; never subtract the keyboard twice.
    const chatViewportHeight = Math.max(1, Math.min(currentHeight, this.chatFullHeight - this.chatKeyboardHeight))
    const keyboardChanged = keyboardOpen !== this.data.keyboardOpen
    if (keyboardChanged && typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ keyboardHidden: keyboardOpen })
    }
    if (keyboardChanged || chatViewportHeight !== this.data.chatViewportHeight) {
      this.setData({ chatViewportHeight, keyboardOpen }, () => {
        if (keyboardOpen) this.scrollChatToBottom()
      })
    }
  },

  onResize(event) {
    if (!this.chatVisible || this.unloaded) return
    const info = Object.assign({}, this.readChatWindow(), event.size || {})
    if (!this.chatKeyboardHeight && !this.chatInputFocused) {
      const sameScreen = info.screenHeight === this.chatScreenHeight && info.windowWidth === this.chatWindowWidth
      this.chatPendingResize = sameScreen && info.windowHeight < this.chatFullHeight
        ? { fullHeight: this.chatFullHeight, height: info.windowHeight, at: Date.now() } : null
      this.chatFullHeight = info.windowHeight || this.chatFullHeight
    } else if (info.screenHeight && this.chatScreenHeight && info.screenHeight !== this.chatScreenHeight) {
      // Preserve the viewport inset when the device rotates with the keyboard open.
      this.chatFullHeight += info.screenHeight - this.chatScreenHeight
    }
    this.chatScreenHeight = info.screenHeight || this.chatScreenHeight
    this.chatWindowWidth = info.windowWidth || this.chatWindowWidth
    this.updateChatViewport(info)
  },

  onKeyboardHeightChange(event) {
    if (!this.chatVisible || this.unloaded) return
    const detail = event.detail || event
    const height = Number(detail.height)
    if (!Number.isFinite(height) || height < 0) return
    const info = this.readChatWindow()
    const pending = this.chatPendingResize
    // Some devices resize before emitting focus and keyboard events.
    if (height > 0 && pending && Date.now() - pending.at < 1000 &&
        Number(info.windowHeight) === pending.height && Math.abs(pending.fullHeight - pending.height - height) <= 48) {
      this.chatFullHeight = pending.fullHeight
    }
    this.chatPendingResize = null
    this.chatKeyboardHeight = height
    this.updateChatViewport(info)
  },

  onInputFocus(event) {
    if (!this.chatVisible || this.unloaded) return
    this.chatInputFocused = true
    if (event.detail && typeof event.detail.height === 'number') this.onKeyboardHeightChange(event)
    this.scrollChatToBottom()
  },

  onInputBlur() {
    this.chatInputFocused = false
  },

  scrollChatToBottom() {
    if (!this.chatVisible || this.unloaded) return
    this.setData({ scrollTo: '' }, () => {
      if (this.chatVisible && !this.unloaded) this.setData({ scrollTo: 'bottom-anchor' })
    })
  },

  loadAssistantSettings() {
    const version = this.settingsVersion = (this.settingsVersion || 0) + 1
    return api.get('/api/v1/config/public').then(cfg => {
      if (this.unloaded || version !== this.settingsVersion) return
      cfg = cfg || {}
      const assistant = cfg.assistant || {}
      const suggestions = Array.isArray(assistant.suggestions) ? assistant.suggestions
        .filter(value => typeof value === 'string' && value.trim()).slice(0, 6)
        .map(value => value.trim().slice(0, 100)) : []
      const update = {
        assistantName: configuredText(assistant.name, this.data.assistantName, 40),
        greeting: configuredText(assistant.greeting, this.data.greeting, 1200),
        suggestions: suggestions.length ? suggestions : this.data.suggestions,
        emotionalSupportEnabled: typeof assistant.emotionalSupportEnabled === 'boolean'
          ? assistant.emotionalSupportEnabled : this.data.emotionalSupportEnabled,
        aiLabel: configuredText(cfg.aiLabel, '内容由 AI 生成', 100),
        modelName: typeof cfg.modelName === 'string' ? cfg.modelName.slice(0, 100) : ''
      }
      if (this.data.messages.length === 1 && this.data.messages[0].welcome && !this.data.sending) {
        update.messages = [Object.assign({}, this.data.messages[0], { text: update.greeting })]
      }
      this.setData(update)
    }).catch(() => {})
  },

  chatStorageKey() {
    return getApp().guestStorageKey() + ':chat:' + getApp().globalData.guestId
  },

  appendMsg(role, text, sources, welcome) {
    msgSeq += 1
    const key = 'm' + msgSeq
    const sourceList = (Array.isArray(sources) ? sources : []).filter(Boolean).map(function (s) {
      return { id: s.id, title: s.title }
    })
    const messages = this.data.messages.concat([{ key: key, role: role, text: text, sourceList: sourceList, welcome: !!welcome }])
    this.setData({ messages: messages, scrollTo: key })
  },

  appendBot(text, sources) {
    this.appendMsg('bot', text, sources)
  },

  appendGreeting() {
    this.appendMsg('bot', this.data.greeting, [], true)
  },

  onSourceTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + encodeURIComponent(id) })
    }
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  onSuggest(e) {
    this.setData({ input: e.currentTarget.dataset.q }, () => {
      this.send()
    })
  },

  send() {
    if (this.data.sending || this.unloaded) return
    const text = (this.data.input || '').trim()
    if (!text) return
    const version = this.chatVersion || 0
    this.setData({ input: '', sending: true, showSuggest: false })
    this.appendMsg('user', text)

    return api.post('/api/v1/chat', { sessionId: this.data.chatSid || null, message: text })
      .then((res) => {
        if (this.unloaded || version !== (this.chatVersion || 0)) return
        if (res.sessionId) {
          this.setData({ chatSid: res.sessionId })
          wx.setStorageSync(this.chatStorageKey(), res.sessionId)
        }
        this.setData({ sending: false })
        this.appendBot(res.reply, res.sources)
      })
      .catch((err) => {
        if (this.unloaded || version !== (this.chatVersion || 0)) return
        this.setData({ sending: false })
        if (!this.data.input) this.setData({ input: text })
        this.appendBot('出错了：' + (err.message || '请稍后再试'))
      })
  },

  newChat() {
    this.chatVersion = (this.chatVersion || 0) + 1
    const sid = this.data.chatSid
    if (sid) {
      api.post('/api/v1/chat/reset', { sessionId: sid }).catch(() => {})
    }
    this.setData({
      chatSid: '',
      messages: [],
      showSuggest: true,
      input: '',
      sending: false
    })
    wx.removeStorageSync(this.chatStorageKey())
    this.appendGreeting()
  },

  onShareAppMessage() {
    return { title: '小折 · 北方民族大学校园助手', path: '/pages/chat/chat' }
  }
})
