const api = require('./api')
const ORIGIN = 'https://xyadmin.tehii.top'
const METHODS = { 'jwxt.auth': 'post', 'jwxt.sync': 'post', 'jwxt.share-redeem': 'post',
  'jwxt.session-revoke': 'del', 'jwxt.share-revoke': 'del' }

function call(key, parameters, options) {
  // Only the educational account endpoints require a visitor session.
  if (!key.startsWith('jwxt.')) return api.publicGet('/api/v1/campus/' + key, parameters || {}, options)
  return api[METHODS[key] || 'get']('/api/v1/campus/' + key, parameters || {})
}

function list(data) {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  for (const key of ['list', 'records', 'items', 'rows', 'data', 'result', 'buildings', 'sites', 'categories']) {
    if (Array.isArray(data[key])) return data[key]
    if (data[key] && typeof data[key] === 'object' && data[key] !== data) {
      const nested = list(data[key])
      if (nested.length) return nested
    }
  }
  return []
}

function text(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}

function imageUrl(value) {
  if (Array.isArray(value)) return imageUrl(value[0])
  if (value && typeof value === 'object') return imageUrl(value.url || value.src || value.path)
  if (typeof value !== 'string' || !value.trim()) return ''
  if (/^https:\/\//i.test(value)) return value
  if (/^\/\//.test(value)) return 'https:' + value
  if (value[0] === '/') return ORIGIN + value
  return ''
}

function id(item) { return String(item && (item._id || item.id || item.siteId || item.buildingId) || '') }

function point(item) {
  if (!item || typeof item !== 'object') return null
  const raw = item.location || item.position || item.coordinate || item.coordinates || {}
  const latitude = Number(item.latitude != null ? item.latitude : (item.lat != null ? item.lat : (raw.latitude != null ? raw.latitude : (raw.lat != null ? raw.lat : raw[1]))))
  const longitude = Number(item.longitude != null ? item.longitude : (item.lng != null ? item.lng : (raw.longitude != null ? raw.longitude : (raw.lng != null ? raw.lng : raw[0]))))
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (!latitude && !longitude)) return null
  return { latitude, longitude }
}

function normalize(item, index) {
  item = item || {}
  return Object.assign({}, item, {
    id: id(item), viewKey: id(item) || 'row-' + index,
    title: text(item.clubName || item.dishName || item.title || item.name || item.siteName || item.buildingName || item.activityName || item.roomName || item.categoryName) || '未命名内容',
    description: text(item.summary || item.description || item.desc || item.introduction || item.intro || item.content || item.address || item.locationText),
    cover: imageUrl(item.cover || item.coverImage || item.coverUrl || item.image || item.imageUrl || item.img || item.images || item.picture || item.logoUrl || item.logo || item.url),
    subtitle: text(item.categoryName || item.category || item.campusName || item.locationText || item.address || item.mealType),
    dateText: dateText(item.startAt || item.startTime || item.startDate || item.publishedAt || item.createdAt),
    priceText: item.price == null || item.price === '' ? '' : String(item.price),
    point: point(item)
  })
}

function dateText(value) {
  if (!value) return ''
  if (typeof value === 'number' || /^\d{13}$/.test(String(value))) {
    const d = new Date(Number(value))
    if (!Number.isFinite(d.getTime())) return ''
    const pad = n => ('0' + n).slice(-2)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  }
  return text(value).slice(0, 16).replace('T', ' ')
}

function errorText(error) {
  const messages = {
    CLIENT_DISABLED: '校园数据服务待平台启用', FORBIDDEN_API: '该项校园服务暂未授权',
    CLIENT_EXPIRED: '校园数据服务授权已到期', IP_DENIED: '校园服务暂不可用，请联系管理员',
    INVALID_CLIENT: '校园数据服务配置需要更新', LOGIN_REQUIRED: '当前设备会话暂不可用，请重试',
    SHARE_REQUIRED: '请先关联教务或兑换授权码', JWXT_REAUTH_REQUIRED: '教务会话已失效，请重新关联',
    JWXT_SESSION_EXPIRED: '教务会话已过期，请重新关联', GRANT_SCOPE_DENIED: '当前授权不包含此项数据',
    SECURITY_BLOCKED: '请求过于频繁，请稍后重试', RATE_LIMITED: '操作过于频繁，请稍后重试',
    API_NOT_OPEN: '该项服务尚未开放'
  }
  return messages[error && error.code] || (error && error.message) || '校园服务暂时不可用'
}

function mapUrl(item) {
  return '/pages/map/map' + (item && item.id ? '?siteId=' + encodeURIComponent(item.id) : '')
}

module.exports = { call, list, text, imageUrl, id, point, normalize, errorText, mapUrl, dateText }
