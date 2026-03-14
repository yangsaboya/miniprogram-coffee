const cloudStore = require('../../utils/cloudStore.js');

// 默认北京，仅在没有定位且没有打卡点时使用
const DEFAULT_LAT = 39.9042;
const DEFAULT_LNG = 116.4074;

Page({
  data: {
    latitude: DEFAULT_LAT,
    longitude: DEFAULT_LNG,
    scale: 12,
    markers: [],
    markerDetails: {},
    showDetail: false,
    detailEntry: null,
    detailDate: '',
    totalShopCount: 0
  },

  onLoad() {
    this._freshLoad = true;
    this._mapReady = false;
    this.loadMarkers();
  },

  onMapUpdated() {
    if (!this._mapReady) {
      this._mapReady = true;
      this.moveToMyLocation();
    }
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) tabBar.setData({ selected: 1 });
    if (this._freshLoad) { this._freshLoad = false; return; }
    this.loadMarkers();
  },

  onLocateTap() {
    this.moveToMyLocation(true);
  },

  /** 用地图上下文把中心移到当前定位点（蓝点），需配合 map 的 show-location */
  moveToMyLocation(showSuccessToast) {
    const mapCtx = wx.createMapContext('footprintMap', this);
    if (!mapCtx || !mapCtx.moveToLocation) {
      wx.showToast({ title: '当前环境不支持定位', icon: 'none' });
      return;
    }
    mapCtx.moveToLocation({
      success: () => {
        if (showSuccessToast) wx.showToast({ title: '已移到我的位置', icon: 'none' });
      },
      fail: (err) => {
        console.error('moveToLocation fail', err);
        wx.showToast({ title: '定位失败，请检查是否授权位置', icon: 'none' });
      }
    });
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
      markers.push({
        id,
        latitude: loc.latitude,
        longitude: loc.longitude,
        title,
        width: 28,
        height: 28,
        callout: {
          content: item.shop || '咖啡打卡',
          color: '#6f4e37',
          fontSize: 12,
          borderRadius: 8,
          padding: 6,
          display: 'BYCLICK'
        }
      });
      markerDetails[id] = { ...item, date };
      if (firstLat === null) {
        firstLat = loc.latitude;
        firstLng = loc.longitude;
      }
    });
    return { markers, markerDetails, firstLat, firstLng };
  },

  loadMarkers() {
    this._markersReqId = (this._markersReqId || 0) + 1;
    const reqId = this._markersReqId;
    const allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
    const { markers, markerDetails } = this.buildMarkersFromLogs(allLogs);
    const totalShopCount = this.countUniqueShops(allLogs);
    // 只更新标记与统计，不改地图中心（中心由「当前定位」或默认北京决定）
    this.setData({ markers, markerDetails, totalShopCount });
    cloudStore.getJsonCached('coffeeLogs').then((cloudRaw) => {
      if (reqId !== this._markersReqId) return;
      if (cloudRaw && typeof cloudRaw === 'object') {
        const localNow = cloudStore.getJsonLocal('coffeeLogs') || {};
        const merged = cloudStore.mergeCoffeeLogs(cloudRaw, localNow);
        wx.setStorageSync('coffeeLogs', merged);
        const res = this.buildMarkersFromLogs(merged);
        const totalShopCount = this.countUniqueShops(merged);
        this.setData({ markers: res.markers, markerDetails: res.markerDetails, totalShopCount });
      }
    }).catch((e) => { console.warn('[map] cloud sync fail', e); });
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
