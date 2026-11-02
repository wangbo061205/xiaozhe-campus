const api = require('../../utils/api')

Page({
  data: {
    gq: '',
    id: null,
    loading: true,
    error: '',
    item: {},
    typeName: '',
    expired: false,
    updatedText: '',
    publishedText: '',
    isGuide: false,
    materials: [],
    favorited: false,
    draftSheet: false,
    draftContext: '',
    draftText: '',
    draftLoading: false
  },

  onLoad(options) {
    this.setData({ gq: getApp().glassClass() })
    const id = options.id
    if (!id) {
      this.setData({ loading: false, error: '参数错误' })
      return
    }
    this.setData({ id: id })
    this.load(id)
  },

  load(id) {
    api.get('/api/v1/knowledge/' + id)
      .then((k) => {
        let materials = []
        if (k.materials) {
          try {
            const parsed = typeof k.materials === 'string' ? JSON.parse(k.materials) : k.materials
            if (Array.isArray(parsed)) materials = parsed
          } catch (e) {
            materials = []
          }
        }
        this.setData({
          loading: false,
          item: k,
          typeName: api.typeName(k.type),
          isGuide: k.type === 'GUIDE',
          materials: materials,
          expired: !!(k.expiresAt && new Date(k.expiresAt) < new Date()) || k.status === 'EXPIRED',
          publishedText: k.publishedAt ? api.shortDate(k.publishedAt) : (k.importKey ? '未注明' : ''),
          updatedText: api.shortDate(k.updatedAt)
        })
        api.get('/api/v1/favorites/check', { knowledgeId: id })
          .then((res) => this.setData({ favorited: !!res.favorited }))
          .catch(() => {})
      })
      .catch((err) => {
        this.setData({ loading: false, error: err.message || '内容不存在' })
      })
  },

  openSource() {
    const url = this.data.item.sourceUrl
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '原文链接已复制', icon: 'none' })
    })
  },

  toggleFav() {
    const id = this.data.id
    const fav = this.data.favorited
    const doIt = fav
      ? api.del('/api/v1/favorites/' + id)
      : api.post('/api/v1/favorites', { knowledgeId: Number(id) })
    doIt.then(() => {
      this.setData({ favorited: !fav })
      wx.showToast({ title: fav ? '已取消收藏' : '已收藏 ⭐', icon: 'none' })
    }).catch((err) => {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    })
  },

  startProcedure() {
    api.post('/api/v1/procedure-runs', { knowledgeId: Number(this.data.id) })
      .then((run) => {
        wx.navigateTo({ url: '/pages/procedure/procedure?id=' + run.id })
      })
      .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
  },

  openDraft() {
    this.setData({ draftSheet: true })
  },

  closeDraft() {
    this.setData({ draftSheet: false })
  },

  onDraftInput(e) {
    this.setData({ draftContext: e.detail.value })
  },

  onDraftEdit(e) {
    this.setData({ draftText: e.detail.value })
  },

  genDraft() {
    if (this.data.draftLoading) return
    this.setData({ draftLoading: true })
    api.post('/api/v1/drafts/generate', {
      knowledgeId: Number(this.data.id),
      context: this.data.draftContext || ''
    }).then((res) => {
      this.setData({ draftLoading: false, draftText: res.draft })
    }).catch((err) => {
      this.setData({ draftLoading: false })
      wx.showToast({ title: err.message || '生成失败，请稍后再试', icon: 'none' })
    })
  },

  copyDraft() {
    wx.setClipboardData({
      data: this.data.draftText,
      success: () => wx.showToast({ title: '草稿已复制', icon: 'success' })
    })
  },

  askAi() {
    wx.switchTab({ url: '/pages/chat/chat' })
  },

  onShareAppMessage() {
    const item = this.data.item
    return {
      title: item.title || '北民大校园助手',
      path: '/pages/detail/detail?id=' + this.data.id
    }
  }
})
