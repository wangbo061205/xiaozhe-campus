const api = require('../../utils/api')

const FILTERS = [
  { label: '全部', value: '' },
  { label: '政策', value: 'POLICY' },
  { label: '办事指南', value: 'GUIDE' },
  { label: '部门', value: 'DEPARTMENT' },
  { label: '服务', value: 'SERVICE' },
  { label: '地点', value: 'PLACE' },
  { label: '常见问题', value: 'FAQ' }
]

Page({
  data: {
    gq: '',
    pageTitle: '搜索',
    q: '',
    type: '',
    filters: FILTERS,
    results: [],
    loading: false
  },

  onLoad(options) {
    const q = options.q ? decodeURIComponent(options.q) : ''
    const type = options.type || ''
    const title = options.title ? decodeURIComponent(options.title) : ''
    if (type === 'NOTICE') {
      wx.switchTab({ url: '/pages/chat/chat' })
      return
    }
    this.setData({
      gq: getApp().glassClass(),
      q: q,
      type: type,
      pageTitle: title || '搜索'
    }, () => {
      this.doQuery()
    })
  },

  onInput(e) {
    this.setData({ q: e.detail.value })
  },

  onSearch() {
    const q = (this.data.q || '').trim()
    if (!q) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }
    this.doQuery()
  },

  onFilter(e) {
    this.setData({ type: e.currentTarget.dataset.value }, () => {
      this.doQuery()
    })
  },

  doQuery() {
    const q = (this.data.q || '').trim()
    const type = this.data.type
    if (!q && !type) {
      this.setData({ results: [], loading: false })
      return
    }
    this.setData({ loading: true })
    let promise
    if (q) {
      const params = { q: q, limit: 30, excludeType: 'NOTICE' }
      if (type) params.type = type
      promise = api.get('/api/v1/search', params)
    } else {
      promise = api.get('/api/v1/knowledge/list', { type: type, limit: 30 })
    }

    promise
      .then((list) => {
        const results = list.filter(k => k.type !== 'NOTICE').map((k) => ({
          id: k.id,
          title: k.title,
          summary: k.summary || '',
          typeName: api.typeName(k.type),
          official: !!k.official,
          expired: !!k.expired,
          sourceName: k.sourceName || '来源未标注',
          dateText: api.shortDate(k.publishedAt) || ''
        }))
        this.setData({ results: results, loading: false })
      })
      .catch((err) => {
        this.setData({ loading: false })
        wx.showToast({ title: err.message || '查询失败', icon: 'none' })
      })
  },

  onTap(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id })
  }
})
