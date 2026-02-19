Component({
  data: {
    list: [
      { pagePath: '/pages/history/index', text: '打卡日历', iconPath: '/images/tab-history.png', selectedIconPath: '/images/tab-history.png' },
      { pagePath: '/pages/map/index', text: '消费足迹', iconPath: '/images/tab-map.png', selectedIconPath: '/images/tab-map.png' },
      { pagePath: '/pages/shelf/index', text: '咖啡架', iconPath: '/images/tab-shelf.png', selectedIconPath: '/images/tab-shelf.png' }
    ]
  },
  methods: {
    onTap(e) {
      const path = e.currentTarget.dataset.path;
      if (path) {
        wx.switchTab({ url: path });
      }
    }
  }
});
