const SHELF_ITEMS_KEY = 'shelfItems';
const cloudStore = require('../../utils/cloudStore.js');
const cloudStorage = require('../../utils/cloudStorage.js');

function formatDate(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

Page({
  data: {
    items: [],
    rows: []
  },

  onLoad() {
    this.loadShelf();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) tabBar.setData({ selected: 2 });
    this.loadShelf();
  },

  collectPhotosFromRaw(raw) {
    const list = [];
    const dates = Object.keys(raw).sort().reverse();
    dates.forEach((date) => {
      const value = raw[date];
      const arr = Array.isArray(value) ? value : (value ? [value] : []);
      arr.forEach((log) => {
        const photos = log.photos;
        if (!photos || !photos.length) return;
        photos.forEach((p) => {
          const url = p.url || p.path || (typeof p === 'string' ? p : '');
          if (url) {
            list.push({
              url,
              remark: p.remark || p.note || '',
              date,
              shop: log.shop || '',
              source: 'log'
            });
          }
        });
      });
    });
    return list;
  },

  loadShelf() {
    const localCoffee = cloudStore.getJsonLocal('coffeeLogs') || {};
    let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
    if (!Array.isArray(added)) added = [];
    const needMigrate = added.some((p) => !p.id);
    if (needMigrate && added.length) {
      added = added.map((p) => (p.id ? p : { ...p, id: 'shelf_' + Date.now() + '_' + Math.random().toString(36).slice(2) }));
      wx.setStorageSync(SHELF_ITEMS_KEY, added);
      cloudStore.setJson(SHELF_ITEMS_KEY, added).catch(() => {});
    }
    const fromLogs = this.collectPhotosFromRaw(localCoffee);
    const addedItems = added;
    const combined = [
      ...fromLogs.map((p, i) => ({ ...p, id: 'log_' + (p.date || '') + '_' + i })),
      ...addedItems.map((p) => ({
        id: p.id || 'shelf_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        url: p.url || p.path || p,
        remark: p.remark || p.note || '',
        date: p.date || '',
        source: 'shelf'
      }))
    ];
    const rows = this.toRows(combined, 4);
    this.setData({ items: combined, rows });

    Promise.all([cloudStore.getJson('coffeeLogs'), cloudStore.getJson(SHELF_ITEMS_KEY)]).then(([cloudCoffee, cloudAdded]) => {
      let updated = false;
      if (cloudCoffee && typeof cloudCoffee === 'object') {
        wx.setStorageSync('coffeeLogs', cloudCoffee);
        updated = true;
      }
      if (Array.isArray(cloudAdded)) {
        wx.setStorageSync(SHELF_ITEMS_KEY, cloudAdded);
        updated = true;
      }
      if (updated) this.loadShelf();
    }).catch(() => {});
  },

  toRows(items, perRow) {
    const rows = [];
    for (let i = 0; i < items.length; i += perRow) {
      rows.push(items.slice(i, i + perRow));
    }
    return rows;
  },

  addFromAlbum() {
    const that = this;
    wx.chooseImage({
      count: 9 - (that.data.items.length % 4 === 0 ? 0 : 1),
      sizeType: ['compressed'],
      sourceType: ['album'],
      async success(res) {
        const paths = res.tempFilePaths || [];
        if (!paths.length) return;
        wx.showLoading({ title: '上传中…' });
        try {
          const fileIDs = await Promise.all(paths.map((p) => cloudStorage.uploadImage(p)));
          let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
          if (!Array.isArray(added)) added = [];
          const next = added.slice();
          const base = Date.now();
          const today = formatDate(new Date());
          fileIDs.forEach((fileID, i) => {
            next.push({
              id: 'shelf_' + base + '_' + i + '_' + Math.random().toString(36).slice(2),
              url: fileID,
              remark: '',
              date: today
            });
          });
          wx.setStorageSync(SHELF_ITEMS_KEY, next);
          await cloudStore.setJson(SHELF_ITEMS_KEY, next);
          that.loadShelf();
          wx.showToast({ title: '已加入咖啡架', icon: 'none' });
        } catch (err) {
          console.error('shelf photo upload fail', err);
          wx.showToast({ title: '照片上传失败，请重试', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  onPreview(e) {
    const url = e.currentTarget.dataset.url;
    const list = this.data.items.map((i) => i.url);
    if (!url || !list.length) return;
    wx.previewImage({
      current: url,
      urls: list
    });
  },

  removeFromShelf(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || !id.startsWith('shelf_')) return;
    let added = cloudStore.getJsonLocal(SHELF_ITEMS_KEY);
    if (!Array.isArray(added)) added = [];
    const next = added.filter((p) => p.id !== id);
    wx.setStorageSync(SHELF_ITEMS_KEY, next);
    cloudStore.setJson(SHELF_ITEMS_KEY, next).catch(() => {});
    this.loadShelf();
    wx.showToast({ title: '已从架上移除', icon: 'none' });
  }
});
