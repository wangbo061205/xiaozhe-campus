const campus = require('../../utils/campus')
const text = require('../../utils/text')

const ENDPOINTS = { activity: 'activity.list', food: 'food.list', club: 'club.list', dormitory: 'dormitory.list',
  schoolguide: 'schoolguide.list', lottery: 'lottery.list', 'comment-room': 'comment-room.list',
  channel: 'channel.categories', media: 'media.list', realtime: 'realtime.data' }

Page({
  data: {
    gq: '', tabs: text.servicesTabs, type: 'activity', activeIcon: 'calendar-days', keyword: '',
    list: [], loading: true, loadingMore: false, hasMore: false, error: '', page: 1,
    categories: [], categoryId: '', mode: 'all', mealIndex: 0, meals: ['全部时段', '早餐', '午餐', '晚餐', '夜宵'],
    foodModes: [{ key: 'all', label: '全部' }, { key: 'hot', label: '人气' }, { key: 'new', label: '上新' }],
    dormModes: [{ key: 'all', label: '宿舍' }, { key: 'buildings', label: '楼栋' }, { key: 'sites', label: '地点' }],
    metrics: [], refreshAt: '', channelEnabled: false, updatedAt: ''
  },
  onLoad(options) {
    const type = ENDPOINTS[options.type] ? options.type : 'activity'
    this.setData({ gq: getApp().glassClass(), type, activeIcon: text.servicesTabs.find(t => t.key === type).icon })
    this.load()
  },
  onUnload() { this.requestVersion = (this.requestVersion || 0) + 1; clearTimeout(this.refreshTimer) },
  onHide() { clearTimeout(this.refreshTimer) },
  onShow() { if (this.data.type === 'realtime' && !this.data.loading) this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) this.load(true) },
  onTab(e) {
    const type = e.currentTarget.dataset.key
    if (type === this.data.type) return
    clearTimeout(this.refreshTimer)
    this.foodSections = null
    this.setData({ type, activeIcon: text.servicesTabs.find(t => t.key === type).icon,
      keyword: '', mode: 'all', categoryId: '', categories: [], mealIndex: 0, list: [], metrics: [] })
    this.load()
  },
  onKeyword(e) { this.setData({ keyword: e.detail.value }) },
  onSearch() { this.load() },
  onCategory(e) { this.setData({ categoryId: e.currentTarget.dataset.id }); this.load() },
  onMode(e) { this.setData({ mode: e.currentTarget.dataset.key }); this.load() },
  onMeal(e) { this.setData({ mealIndex: Number(e.detail.value), mode: 'all' }); this.foodSections = null; this.load() },
  async load(append) {
    if (append !== true) append = false
    const version = this.requestVersion = (this.requestVersion || 0) + 1
    const type = this.data.type
    const page = append ? this.data.page + 1 : 1
    this.setData({ loading: !append && !(type === 'realtime' && this.data.metrics.length), loadingMore: append, error: '' })
    try {
      const keyword = this.data.keyword.trim()
      const query = { page, pageSize: 20, current: page, size: 20 }
      if (type === 'activity') Object.assign(query, { keyword, categoryId: this.data.categoryId })
      if (['food', 'club', 'dormitory'].includes(type)) query.searchText = keyword
      if (type === 'food' && this.data.mealIndex > 0) query.mealType = this.data.meals[this.data.mealIndex]
      let endpoint = ENDPOINTS[type]
      if (type === 'dormitory' && this.data.mode === 'buildings') endpoint = 'dormitory.buildings'
      if (type === 'dormitory' && this.data.mode === 'sites') endpoint = 'dormitory.sites'
      const data = await campus.call(endpoint, query)
      if (version !== this.requestVersion) return
      let records = campus.list(data)
      let metrics = []
      if (type === 'media') {
        records = records.reduce((all, item) => all.concat((item.carousel || []).map((url, index) => ({
          id: campus.id(item) + '-' + index, title: '校园影像 ' + (index + 1), imageUrl: url
        }))), [])
      }
      if (type === 'realtime') {
        const labels = { online: '当前在线', pvToday: '今日浏览', pvTotal: '累计浏览', apiToday: '今日请求', apiTotal: '累计请求' }
        if (data && data.enabled) metrics = Object.keys(labels).filter(key => data[key] != null)
          .map(key => ({ label: labels[key], value: data[key] }))
        records = data && data.enabled ? (data.hotPages || []).map((item, i) => ({ id: String(i), title: item.title, description: item.online == null ? '' : item.online + ' 人在线' })) : []
        this.setData({ refreshAt: data && data.updatedAtText || '', updatedAt: campus.dateText(data && data.updatedAt) })
        clearTimeout(this.refreshTimer)
        if (data && data.enabled) this.refreshTimer = setTimeout(() => this.load(), Math.max(10, Number(data.refreshIntervalSec) || 30) * 1000)
      }
      if (type === 'channel') {
        const meta = await campus.call('channel.meta')
        if (version !== this.requestVersion) return
        this.setData({ channelEnabled: !!meta.enabled })
      }
      if (type === 'food' && !append && !this.foodSections) {
        try {
          this.foodSections = await campus.call('food.sections', { meal: this.data.mealIndex ? this.data.meals[this.data.mealIndex] : '全部' })
        } catch (e) { this.foodSections = {} }
        if (version !== this.requestVersion) return
      }
      if (type === 'food' && this.data.mode !== 'all') {
        records = campus.list(this.foodSections && this.foodSections[this.data.mode === 'hot' ? 'hotDishes' : 'newDishes'])
        if (keyword) records = records.filter(item => campus.normalize(item).title.includes(keyword))
      }
      if (['schoolguide', 'channel', 'media', 'realtime'].includes(type) && keyword) {
        records = records.filter(item => {
          const normalized = campus.normalize(item)
          return normalized.title.includes(keyword) || normalized.description.includes(keyword)
        })
      }
      const incoming = records.map(campus.normalize)
      const combined = append ? this.data.list.concat(incoming) : incoming
      const seen = new Set()
      const list = combined.filter(item => { const key = item.viewKey; if (seen.has(key)) return false; seen.add(key); return true })
      const total = Number(data && (data.total != null ? data.total : data.pagination && data.pagination.total))
      const paged = ['activity','food','club','dormitory','lottery','comment-room'].includes(type) && this.data.mode === 'all'
      const hasMore = paged && (typeof data.hasMore === 'boolean' ? data.hasMore : (Number.isFinite(total) ? page * 20 < total : records.length === 20))
      this.setData({ list, metrics, page, hasMore, loading: false, loadingMore: false,
        categories: type === 'activity' ? campus.list(data.categories).map(campus.normalize) : [] })
    } catch (error) {
      if (version === this.requestVersion) this.setData({ loading: false, loadingMore: false, error: campus.errorText(error) })
    }
  },
  openItem(e) {
    const item = this.data.list[e.currentTarget.dataset.index]
    if (!item) return
    if (this.data.type === 'media') {
      const urls = this.data.list.map(record => record.cover).filter(Boolean)
      if (urls.length) wx.previewImage({ current: item.cover, urls })
      return
    }
    if (this.data.type === 'realtime') return
    const type = this.data.type === 'dormitory' && this.data.mode === 'sites' ? 'site' : this.data.type
    getApp().globalData.campusSelection = { type, item }
    wx.navigateTo({ url: '/pages/campus-detail/campus-detail?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(item.id) })
  },
  onImageError(e) { this.setData({ ['list[' + e.currentTarget.dataset.index + '].cover']: '' }) }
})
