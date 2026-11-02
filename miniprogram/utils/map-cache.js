const bundled = require('../data/campus-map')
const KEY = 'campus-map-public-v1'
function valid(data) { return data && Array.isArray(data.campuses) && data.campuses.length && Array.isArray(data.categories) }
function read(api) {
  try { const saved = api.getStorageSync(KEY); if (valid(saved)) return saved } catch (error) {}
  return valid(bundled) ? bundled : null
}
function write(api, data) {
  if (!valid(data)) return
  // Only public campus metadata is cached; live user coordinates never enter this cache.
  try { api.setStorageSync(KEY, { source: '小北云校园开放平台', verifiedAt: new Date().toISOString(),
    campuses: data.campuses, categories: data.categories, calibrations: data.calibrations || {} }) } catch (error) {}
}
module.exports = { read, write }
