const cloudStore = require('../../utils/cloudStore.js');

Page({
  data: {
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 12,
    markers: [],
    markerDetails: {},
    showDetail: false,
    detailEntry: null,
    detailDate: '',
    totalShopCount: 0
  },

  onLoad() {
    this.loadMarkers();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) tabBar.setData({ selected: 1 });
    this.loadMarkers();
  },

  countUniqueShops(allLogs) {
    const shops = {};
    const keys = Object.keys(allLogs || {});
    for (let k = 0; k < keys.length; k++) {
      const list = allLogs[keys[k]];
      if (!Array.isArray(list)) continue;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || typeof item !== 'object') continue;
        if (item.source === '消费' && item.shop) {
          const s = String(item.shop).trim();
          if (s) shops[s] = true;
        }
      }
    }
    return Object.keys(shops).length;
  },

  buildMarkersFromLogs(allLogs) {
    const byLocation = {};
    const dates = Object.keys(allLogs || {}).sort();
    dates.forEach((date) => {
      const list = allLogs[date];
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        const loc = item.location;
        if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;
        const key = `${loc.latitude.toFixed(5)}_${loc.longitude.toFixed(5)}`;
        if (!byLocation[key] || date > byLocation[key].date) {
          byLocation[key] = { date, item };
        }
      });
    });
    const markers = [];
    const markerDetails = {};
    let firstLat = null;
    let firstLng = null;
    let id = 0;
    Object.keys(byLocation).forEach((key) => {
      const { date, item } = byLocation[key];
      const loc = item.location;
      id += 1;
      const titleParts = [];
      if (item.shop) titleParts.push(item.shop);
      if (loc.address && loc.address !== item.shop) titleParts.push(loc.address);
      const title = titleParts.join(' · ') || '咖啡打卡';
      markers.push({ id, latitude: loc.latitude, longitude: loc.longitude, title, width: 24, height: 24 });
      markerDetails[id] = { ...item, date };
      if (firstLat === null) {
        firstLat = loc.latitude;
        firstLng = loc.longitude;
      }
    });
    return { markers, markerDetails, firstLat, firstLng };
  },

  loadMarkers() {
    const allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
    const { markers, markerDetails, firstLat, firstLng } = this.buildMarkersFromLogs(allLogs);
    const totalShopCount = this.countUniqueShops(allLogs);
    if (firstLat !== null) {
      this.setData({ latitude: firstLat, longitude: firstLng, markers, markerDetails, totalShopCount });
    } else {
      this.setData({ markers: [], markerDetails: {}, totalShopCount });
    }
    cloudStore.getJson('coffeeLogs').then((cloudRaw) => {
      if (cloudRaw && typeof cloudRaw === 'object') {
        wx.setStorageSync('coffeeLogs', cloudRaw);
        const res = this.buildMarkersFromLogs(cloudRaw);
        const totalShopCount = this.countUniqueShops(cloudRaw);
        this.setData({
          latitude: res.firstLat !== null ? res.firstLat : this.data.latitude,
          longitude: res.firstLng !== null ? res.firstLng : this.data.longitude,
          markers: res.markers,
          markerDetails: res.markerDetails,
          totalShopCount
        });
      }
    }).catch(() => {});
  },

  onMarkerTap(e) {
    const markerId = e.detail.markerId;
    const details = this.data.markerDetails || {};
    const entry = details[markerId];
    if (entry) {
      this.setData({
        showDetail: true,
        detailEntry: entry,
        detailDate: entry.date || ''
      });
    }
  },

  closeDetail() {
    this.setData({
      showDetail: false,
      detailEntry: null,
      detailDate: ''
    });
  }
});

