/**
 * 玻璃背景层
 * 作用：提供选定方案的纯色画布，让内容与浮动玻璃导航保持清晰层次。
 * 所有需要玻璃效果的页面，把 <glass-bg /> 放在最外层容器的第一个子节点。
 */
Component({
  options: { addGlobalClass: true },
  data: { gq: '' },
  lifetimes: {
    attached() {
      const app = getApp()
      this.setData({ gq: app && app.glassClass ? app.glassClass() : '' })
    }
  }
})
