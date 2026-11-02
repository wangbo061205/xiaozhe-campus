const campus = require('../../utils/campus')
const text = require('../../utils/text')

const DETAILS = { site: 'site.detail', club: 'club.detail', dormitory: 'dormitory.detail', activity: 'activity.detail', lottery: 'lottery.detail', 'comment-room': 'comment-room.detail' }
const LISTS = { food: 'food.list', schoolguide: 'schoolguide.list', channel: 'channel.categories', space: 'space.buildings' }
const LABELS = {
  department: '所属单位', location: '地点', address: '地址', shopName: '窗口', floor: '楼层', mealType: '餐别',
  bedType: '床位类型', floors: '楼层数', genderType: '宿舍类型', powerPolicy: '用电', powerLimitWatts: '限电功率（W）',
  networkPolicy: '网络', airCondition: '空调', roomTypes: '房型', spaceLevel: '空间', tips: '温馨提示',
  requirements: '招新要求', honors: '社团荣誉', contactPerson: '联系人', contactInfo: '联系方式',
  announcement: '公告', lifecycleLabel: '当前状态', rules: '规则', description: '介绍'
}

Page({
  data: { gq: '', type: '', pageTitle: '校园详情', loading: true, error: '', item: null,
    content: '', fields: [], images: [], related: [], relatedTitle: '', relatedError: '', floors: [], floorIndex: 0,
    comments: [], commentPage: 1, commentMore: false, commentLoading: false, canNavigate: false },
  onLoad(options) {
    this.id = options.id || ''
    const type = options.type || 'site'
    const tab = text.servicesTabs.find(t => t.key === type)
    this.setData({ gq: getApp().glassClass(), type, pageTitle: tab ? tab.label : (type === 'space' ? '室内建筑' : '地点详情') })
    this.load()
  },
  onUnload() { this.requestVersion = (this.requestVersion || 0) + 1 },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    const version = this.requestVersion = (this.requestVersion || 0) + 1
    this.setData({ loading: true, error: '', relatedError: '' })
    const type = this.data.type
    try {
      const selected = getApp().globalData.campusSelection
      let item = selected && selected.type === type && selected.item.id === this.id ? selected.item : null
      if (DETAILS[type]) item = await campus.call(DETAILS[type], { id: this.id })
      else if (!item && LISTS[type]) {
        const query = type === 'space' ? { campusId: wx.getStorageSync('selectedCampusId') } : { pageSize: 50 }
        item = campus.list(await campus.call(LISTS[type], query)).find(record => campus.id(record) === this.id)
      }
      if (version !== this.requestVersion) return
      if (!item) throw new Error('该内容暂不可用，请返回列表刷新')
      const normalized = campus.normalize(item)
      const fields = Object.keys(LABELS).filter(key => item[key] != null && item[key] !== '' && !['description', 'floors'].includes(key))
        .filter(key => !key.startsWith('contact') || item.showContact)
        .map(key => ({ label: LABELS[key], value: Array.isArray(item[key]) ? item[key].map(campus.text).join('、') : campus.text(item[key]) }))
        .filter(field => field.value)
      for (const [key, label] of [['startAt','开始时间'],['endAt','结束时间'],['deadline','招新截止']]) {
        if (item[key]) fields.push({ label, value: campus.dateText(item[key]) })
      }
      if (normalized.priceText) fields.unshift({ label: '参考价格', value: '¥' + normalized.priceText })
      if (typeof item.floors === 'number') fields.push({ label: '楼层数', value: String(item.floors) })
      const imageSource = [].concat(item.imageList || [], item.images || [], item.showcaseImages || [])
      const images = imageSource.map(campus.imageUrl).filter(Boolean)
      const floors = (Array.isArray(item.floors) ? item.floors : (Array.isArray(item.floorPlans) ? item.floorPlans : []))
        .map((floor, index) => ({ id: campus.id(floor) || String(index), label: floor.label || floor.name || (floor.level != null ? floor.level + 'F' : '楼层 ' + (index + 1)),
          image: campus.imageUrl(floor.planUrl || floor.imageUrl || floor.image || floor.plan || floor.url), rooms: campus.list(floor.rooms).map(campus.normalize) }))
      this.setData({ loading: false, item: normalized, fields, images, floors, floorIndex: 0,
        content: typeof (item.content || item.intro || item.desc) === 'string' ? (item.content || item.intro || item.desc) : '',
        canNavigate: !!(normalized.point || item.site_id) })
      if (['activity','lottery'].includes(type)) {
        const relatedTitle = type === 'activity' ? '活动公告' : '抽奖任务'
        try {
          const data = await campus.call(type + (type === 'activity' ? '.announcements' : '.tasks'), { id: this.id })
          if (version === this.requestVersion) this.setData({ related: campus.list(data).map(campus.normalize), relatedTitle })
        } catch (error) { if (version === this.requestVersion) this.setData({ relatedTitle, relatedError: campus.errorText(error) }) }
      }
      if (type === 'comment-room') await this.loadComments(false)
    } catch (error) { if (version === this.requestVersion) this.setData({ loading: false, error: campus.errorText(error) }) }
  },
  async loadComments(append) {
    if (this.data.commentLoading) return
    const page = append ? this.data.commentPage + 1 : 1
    this.setData({ commentLoading: true, relatedError: '' })
    try {
      const data = await campus.call('comment-room.comments', { id: this.id, current: page, size: 20 })
      const incoming = campus.list(data).map((item, i) => ({ id: campus.id(item) || page + '-' + i,
        name: campus.text(item.nickname || item.nickName || item.userName || item.displayName) || '匿名同学',
        content: campus.text(item.content || item.text), date: campus.dateText(item.createdAt) }))
      const comments = append ? this.data.comments.concat(incoming) : incoming
      this.setData({ comments, commentLoading: false, commentPage: page,
        commentMore: Number.isFinite(Number(data.total)) ? page * 20 < Number(data.total) : incoming.length === 20 })
    } catch (error) { this.setData({ commentLoading: false, relatedError: campus.errorText(error) }) }
  },
  moreComments() { this.loadComments(true) },
  preview(e) { const current = e.currentTarget.dataset.src; if (current) wx.previewImage({ current, urls: this.data.images.includes(current) ? this.data.images : [current] }) },
  goMap() {
    const item = this.data.item
    getApp().globalData.mapTarget = item.site_id ? { id: item.site_id } : (this.data.type === 'site' ? { id: item.id } : { keyword: item.title })
    wx.switchTab({ url: '/pages/map/map' })
  },
  onFloor(e) { this.setData({ floorIndex: Number(e.currentTarget.dataset.index) }) },
  onCoverError() { this.setData({ 'item.cover': '' }) }
})
