const design = require('./utils/design-config')
const environment = require('./config')
const GUEST_STORAGE_PREFIX = 'campus.guest.identity.v1:'

App({
  globalData: {
    /* 后端地址：
       - 电脑模拟器：localhost 即可
       - 手机真机：使用 config.js 中的正式 HTTPS 合法域名
       - 局域网 HTTP 地址仅用于手机和电脑网络互通时的本地调试 */
    baseUrl: environment.baseUrl.replace(/\/+$/, ''),
    token: '',
    userName: '校园访客',
    guestId: '',

    /* ── 玻璃 UI 运行时指标 ── */
    statusBarHeight: 20,   // px
    glassQuality: 'high'   // high | low
  },

  onLaunch() {
    // Legacy account sessions must never become the anonymous device identity.
    this.globalData.token = ''
    this.globalData.userName = '校园访客'
    wx.removeStorageSync('token')
    wx.removeStorageSync('userName')
    wx.removeStorageSync('chatSid')
    this.detectGlassQuality()
    const saved = wx.getStorageSync(this.guestStorageKey())
    this.guestIdentity = saved && typeof saved === 'object' &&
      typeof saved.guestId === 'string' && saved.guestId &&
      typeof saved.guestSecret === 'string' && saved.guestSecret ? saved : null
    this.globalData.guestId = this.guestIdentity ? this.guestIdentity.guestId : ''
    // Failure stays retryable; the next action can retry without losing form data.
    this.ensureSession().catch(() => {})
  },

  /**
   * 判断是否降级玻璃效果。
   * backdrop-filter 很吃 GPU，模糊开到 60~120px 后低端机会掉帧；
   * 降级后模糊减半、底色加厚（见 app.wxss 的 .gq-low）。
   */
  detectGlassQuality() {
    let info = {}
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    } catch (e) {
      info = {}
    }

    if (typeof info.statusBarHeight === 'number') {
      this.globalData.statusBarHeight = info.statusBarHeight
    }

    // benchmarkLevel：Android 返回性能等级（越大越好），iOS 返回 -1（未知）
    let level = -1
    try {
      const base = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
      if (base.platform === 'devtools') this.globalData.baseUrl = environment.simulatorBaseUrl.replace(/\/+$/, '')
      if (typeof base.benchmarkLevel === 'number') level = base.benchmarkLevel
    } catch (e) {
      level = -1
    }

    const low = level >= 0 && level < 30
    this.globalData.glassQuality = low ? 'low' : 'high'
  },

  glassClass() {
    return (this.globalData.glassQuality === 'low' ? 'gq-low' : 'gq-high') +
      (design.tokens.reduceMotion ? ' motion-reduced' : '') + (design.tokens.highContrast ? ' high-contrast' : '')
  },

  ensureSession() {
    if (this.globalData.token) return Promise.resolve(this.globalData.token)
    if (this.sessionPromise) return this.sessionPromise
    const saved = this.guestIdentity
    const body = saved ? { guestId: saved.guestId, guestSecret: saved.guestSecret } : {}
    const pending = new Promise((resolve, reject) => {
      wx.request({
        url: this.globalData.baseUrl + '/api/v1/auth/guest', method: 'POST', data: body,
        header: { 'Content-Type': 'application/json; charset=utf-8' }, timeout: 30000,
        success: res => {
          const envelope = res.data
          const identity = envelope && envelope.data
          const secret = identity && (identity.guestSecret || (saved && saved.guestSecret))
          if (res.statusCode !== 200 || !envelope || envelope.code !== 0 || !identity ||
              identity.role !== 'GUEST' || typeof identity.token !== 'string' || !identity.token ||
              typeof identity.guestId !== 'string' || !identity.guestId ||
              typeof secret !== 'string' || !secret ||
              (saved && identity.guestId !== saved.guestId)) {
            const error = new Error(saved ? '当前设备记录暂时无法恢复，请稍后重试' : '校园服务暂不可用，请稍后重试')
            error.status = res.statusCode
            reject(error)
            return
          }
          const record = { guestId: identity.guestId, guestSecret: secret, userId: identity.userId }
          try { wx.setStorageSync(this.guestStorageKey(), record) }
          catch (error) { reject(new Error('无法保存当前设备身份，请检查存储空间后重试')); return }
          this.guestIdentity = record
          this.globalData.guestId = record.guestId
          this.globalData.token = identity.token
          this.globalData.userName = '校园访客'
          resolve(identity.token)
        },
        fail: () => reject(new Error('无法连接校园服务，请检查网络后重试'))
      })
    })
    this.sessionPromise = pending.then(token => {
      this.sessionPromise = null
      return token
    }, error => {
      this.sessionPromise = null
      throw error
    })
    return this.sessionPromise
  },

  renewSession(failedToken) {
    // A parallel request may already have renewed this token.
    if (this.globalData.token && this.globalData.token !== failedToken) return Promise.resolve(this.globalData.token)
    this.globalData.token = ''
    return this.ensureSession()
  },

  guestStorageKey() {
    return GUEST_STORAGE_PREFIX + encodeURIComponent(this.globalData.baseUrl)
  }
})
