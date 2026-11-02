const api = require('../../utils/api')
const campus = require('../../utils/campus')

Page({
  data: {
    gq: '', keyword: '', today: '', greeting: '',
    campuses: [], campusIndex: 0, campusName: '选择校区', cover: '/assets/campus-cover.jpg',
    loadingCampus: true, campusError: '', activities: [], todayCourses: [],
    quicks: [
      { icon: 'map', label: '校园地图', route: 'map', tone: 'green' },
      { icon: 'graduation-cap', label: '我的教务', route: 'academics', tone: 'blue' },
      { icon: 'utensils', label: '校园美食', type: 'food', tone: 'orange' },
      { icon: 'users', label: '社团招新', type: 'club', tone: 'purple' },
      { icon: 'calendar-days', label: '校园活动', type: 'activity', tone: 'blue' },
      { icon: 'building-2', label: '宿舍生活', type: 'dormitory', tone: 'orange' },
      { icon: 'book-open', label: '校园指南', type: 'schoolguide', tone: 'green' },
      { icon: 'backpack', label: '失物招领', route: 'lostfound', tone: 'purple' }
    ],
    hotWords: ['校园卡', '图书馆', '助学贷款', '宿舍报修']
  },
  onLoad() {
    const d = new Date()
    this.setData({ gq: getApp().glassClass(),
      today: (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()],
      greeting: d.getHours() < 11 ? '早上好' : (d.getHours() < 18 ? '下午好' : '晚上好') })
    this.refresh()
  },
  onShow() {
    if (this.getTabBar && this.getTabBar()) this.getTabBar().setData({ active: 1 })
    this.loadToday()
  },
  onPullDownRefresh() { this.refresh().finally(() => wx.stopPullDownRefresh()) },
  refresh() { return this.loadCampus() },
  loadCampus() {
    this.setData({ loadingCampus: true, campusError: '' })
    return Promise.allSettled([campus.call('campus.list'), campus.call('activity.home'), campus.call('media.list'), campus.call('campus.settings')])
      .then(results => {
        const update = { loadingCampus: false }
        if (results[0].status === 'fulfilled') {
          const campuses = campus.list(results[0].value).map(campus.normalize)
          const selected = wx.getStorageSync('selectedCampusId')
          const index = Math.max(0, campuses.findIndex(c => c.id === selected))
          Object.assign(update, { campuses, campusIndex: index, campusName: campuses[index] ? campuses[index].title : '选择校区' })
          getApp().globalData.campuses = campuses
          if (campuses[index]) wx.setStorageSync('selectedCampusId', campuses[index].id)
        } else update.campusError = campus.errorText(results[0].reason)
        if (results[1].status === 'fulfilled') {
          const home = results[1].value || {}
          update.activities = campus.list(home.recommended || home.upcoming || []).slice(0, 3).map(campus.normalize)
        }
        if (results[2].status === 'fulfilled') {
          const media = campus.list(results[2].value)[0] || {}
          update.cover = campus.imageUrl(media.carousel && (media.carousel[1] || media.carousel[0])) || '/assets/campus-cover.jpg'
        }
        if (results[3].status === 'fulfilled') getApp().globalData.campusSettings = results[3].value
        this.setData(update)
      })
  },
  onCampusChange(e) {
    const index = Number(e.detail.value)
    const selected = this.data.campuses[index]
    if (!selected) return
    this.setData({ campusIndex: index, campusName: selected.title })
    wx.setStorageSync('selectedCampusId', selected.id)
  },
  loadToday() {
    api.get('/api/v1/courses/today')
      .then(courses => this.setData({ todayCourses: courses }))
      .catch(() => {})
  },
  onInput(e) { this.setData({ keyword: e.detail.value }) },
  onCoverError() { this.setData({ cover: this.data.cover === '/assets/campus-cover.jpg' ? '' : '/assets/campus-cover.jpg' }) },
  onSearch() {
    const keyword = this.data.keyword.trim()
    wx.navigateTo({ url: '/pages/search/search' + (keyword ? '?q=' + encodeURIComponent(keyword) : '') })
  },
  onHot(e) { wx.navigateTo({ url: '/pages/search/search?q=' + encodeURIComponent(e.currentTarget.dataset.word) }) },
  onQuick(e) {
    const item = this.data.quicks[e.currentTarget.dataset.index]
    if (item.route === 'map' || item.route === 'lostfound') wx.switchTab({ url: '/pages/' + item.route + '/' + item.route })
    else if (item.route === 'academics') wx.navigateTo({ url: '/pages/academics/academics' })
    else wx.navigateTo({ url: '/pages/services/services?type=' + item.type })
  },
  goServices() { wx.navigateTo({ url: '/pages/services/services' }) },
  goCourses() { wx.navigateTo({ url: '/pages/courses/courses' }) },
  goAcademics() { wx.navigateTo({ url: '/pages/academics/academics' }) },
  goMine() { wx.switchTab({ url: '/pages/mine/mine' }) },
  goMap() { wx.switchTab({ url: '/pages/map/map' }) },
  openActivity(e) { wx.navigateTo({ url: '/pages/campus-detail/campus-detail?type=activity&id=' + encodeURIComponent(e.currentTarget.dataset.id) }) }
})
