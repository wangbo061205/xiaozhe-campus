// CSS px from the design lab become 2rpx; runtime APIs use physical logical px.
function mapLayout(info, mapTop, safe, tokens) {
  const scale = info.windowWidth / 375
  const tabHeight = (tokens.navHeight + 20) * scale + safe
  const sheetMax = Math.max(140 * scale, info.windowHeight - mapTop - tabHeight - 150 * scale)
  const sheetMin = Math.min(sheetMax, tokens.mapSheetHeight * scale)
  const sheetMid = Math.min(sheetMax, Math.max(sheetMin, Math.round(info.windowHeight * .34)))
  return { tabHeight, sheetMin, sheetMid, sheetMax }
}
module.exports = { mapLayout }
