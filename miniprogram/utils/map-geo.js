const campus = require('./campus')

function calibrated(point, calibration, siteId) {
  if (!point || !calibration || !calibration.enabled) return point
  const override = calibration.siteOverrides && calibration.siteOverrides[siteId]
  const absolute = override && campus.point(override)
  if (absolute) return absolute
  const delta = override || calibration
  const latitude = point.latitude + (Number(delta.deltaLat) || 0)
  const longitude = point.longitude + (Number(delta.deltaLng) || 0)
  return campus.point({ latitude, longitude }) || point
}

function originalLocation(point, calibration) {
  if (!point || !calibration || !calibration.enabled) return point
  return { latitude: point.latitude - (Number(calibration.deltaLat) || 0),
    longitude: point.longitude - (Number(calibration.deltaLng) || 0) }
}

function routePoints(data) {
  const source = Array.isArray(data) ? data : []
  return source.map(p => campus.point(Array.isArray(p) ? { longitude: p[0], latitude: p[1] } : p)).filter(Boolean)
}

function distance(a, b) {
  if (!a || !b) return Infinity
  const rad = Math.PI / 180
  const x = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

module.exports = { calibrated, originalLocation, routePoints, distance }
