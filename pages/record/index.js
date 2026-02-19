const cloudStore = require('../../utils/cloudStore.js');
const cloudStorage = require('../../utils/cloudStorage.js');

Page({
  data: {
    today: '',
    log: {
      date: '',
      source: '自制',
      shop: '',
      mood: '',
      rating: 0,
      photos: []
    },
    todayCount: 0,
    editIndex: -1,
    punching: false,
    moodOptions: ['😀', '😌', '☕️', '😴', '😫'],
    stars: [1, 2, 3, 4, 5]
  },

  onLoad(options) {
    const passedDate = options && options.date;
    const editIndex = options.editIndex !== undefined ? parseInt(options.editIndex, 10) : -1;
    const baseDate = passedDate ? new Date(passedDate) : new Date();
    const today = this.formatDate(baseDate);
    this.setData({ editIndex: editIndex >= 0 ? editIndex : -1 });
    this.loadLog(today, editIndex);

    if (passedDate) {
      wx.setNavigationBarTitle({
        title: editIndex >= 0 ? '编辑咖啡打卡' : '咖啡打卡'
      });
    }
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  loadLog(date, editIndex) {
    let allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
    const value = allLogs[date];
    let logsOfDay = [];
    if (Array.isArray(value)) {
      logsOfDay = value;
    } else if (value) {
      logsOfDay = [value];
    }
    let log = {
      date,
      source: '自制',
      shop: '',
      mood: '',
      rating: 0,
      photos: []
    };
    if (editIndex >= 0 && editIndex < logsOfDay.length) {
      const entry = logsOfDay[editIndex];
      log = {
        date,
        source: entry.source || '自制',
        shop: entry.shop || '',
        mood: entry.mood || '',
        rating: entry.rating || 0,
        photos: Array.isArray(entry.photos) ? entry.photos : [],
        id: entry.id,
        createdAt: entry.createdAt
      };
      if (entry.location) log.location = entry.location;
    }
    this.setData({
      today: date,
      log,
      todayCount: logsOfDay.length
    });
    cloudStore.getJson('coffeeLogs').then((cloudRaw) => {
      if (cloudRaw && typeof cloudRaw === 'object') {
        wx.setStorageSync('coffeeLogs', cloudRaw);
      }
    }).catch(() => {});
  },

  onSourceTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    this.setData({
      'log.source': value,
      'log.shop': value === '消费' ? this.data.log.shop : ''
    });
  },

  onShopInput(e) {
    this.setData({
      'log.shop': e.detail.value
    });
  },

  onChooseLocation() {
    const that = this;
    const sys = wx.getSystemInfoSync();
    const isDevTools = sys.platform === 'devtools' || (sys.platform === 'windows' || sys.platform === 'mac');
    if (isDevTools) {
      wx.showToast({
        title: '选点请在手机微信中打开使用',
        icon: 'none',
        duration: 2500
      });
      return;
    }
    wx.chooseLocation({
      success(res) {
        const name = res.name || res.address || '';
        if (name) {
          that.setData({
            'log.shop': name,
            'log.location': {
              latitude: res.latitude,
              longitude: res.longitude,
              address: res.address
            }
          });
        }
      },
      fail(err) {
        if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
          wx.showToast({ title: '需要授权位置', icon: 'none' });
        } else {
          wx.showToast({ title: '选点失败，请用手机打开小程序', icon: 'none' });
        }
      }
    });
  },

  onMoodTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    this.setData({
      'log.mood': value
    });
  },

  onRatingTap(e) {
    const score = Number(e.currentTarget.dataset.score || 0);
    if (!score) return;
    this.setData({
      'log.rating': score
    });
  },

  onAddPhoto() {
    const that = this;
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照并保存到相册'],
      success(res) {
        if (res.tapIndex === 0) {
          that.chooseFromAlbum();
        } else if (res.tapIndex === 1) {
          that.takePhotoAndSave();
        }
      }
    });
  },

  chooseFromAlbum() {
    const that = this;
    wx.chooseImage({
      count: 6,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success(res) {
        that.appendPhotos(res.tempFilePaths);
      }
    });
  },

  takePhotoAndSave() {
    const that = this;
    wx.chooseImage({
      count: 3,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success(res) {
        const paths = res.tempFilePaths || [];
        that.appendPhotos(paths);
        paths.forEach((path) => {
          wx.saveImageToPhotosAlbum({
            filePath: path,
            fail() {
              // 用户拒绝授权或失败时，不打断整体流程
            }
          });
        });
      }
    });
  },

  onRemovePhoto(e) {
    const index = e.currentTarget.dataset.index;
    if (index == null) return;
    const photos = (this.data.log.photos || []).slice();
    if (index < 0 || index >= photos.length) return;
    photos.splice(index, 1);
    this.setData({ 'log.photos': photos });
  },

  appendPhotos(newPaths) {
    if (!newPaths || !newPaths.length) return;
    const that = this;
    const current = this.data.log.photos || [];
    const rest = 9 - current.length;
    if (rest <= 0) {
      wx.showToast({ title: '最多 9 张照片', icon: 'none' });
      return;
    }
    const paths = newPaths.slice(0, rest);
    wx.showLoading({ title: '上传中…' });
    Promise.all(paths.map((p) => cloudStorage.uploadImage(p)))
      .then((fileIDs) => {
        const newPhotos = fileIDs.map((fileID) => ({ url: fileID, remark: '' }));
        const photos = current.concat(newPhotos).slice(0, 9);
        that.setData({ 'log.photos': photos });
      })
      .catch((err) => {
        console.error('photo upload fail', err);
        wx.showToast({ title: '照片上传失败，请重试', icon: 'none' });
      })
      .finally(() => wx.hideLoading());
  },

  onPhotoRemarkInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = (e.detail && e.detail.value) || '';
    const photos = (this.data.log.photos || []).slice();
    if (index == null || index < 0 || index >= photos.length) return;
    photos[index] = { ...photos[index], remark: value };
    this.setData({ 'log.photos': photos });
  },

  async onPunch() {
    if (this.data.punching) return;
    this.setData({ punching: true });
    const log = this.data.log;
    const editIndex = typeof this.data.editIndex === 'number' && this.data.editIndex >= 0 ? this.data.editIndex : -1;
    if (log.source === '消费' && !log.shop) {
      this.setData({ punching: false });
      wx.showToast({ title: '请先填写店铺', icon: 'none' });
      return;
    }
    let allLogs = cloudStore.getJsonLocal('coffeeLogs') || {};
    const date = this.data.today;
    const value = allLogs[date];
    let logsOfDay = [];
    if (Array.isArray(value)) {
      logsOfDay = value;
    } else if (value) {
      logsOfDay = [value];
    }

    if (editIndex >= 0 && editIndex < logsOfDay.length) {
      const existing = logsOfDay[editIndex];
      logsOfDay[editIndex] = {
        ...log,
        date,
        id: existing.id || Date.now(),
        createdAt: existing.createdAt || Date.now()
      };
    } else {
      const newEntry = {
        ...log,
        date,
        id: log.id || Date.now(),
        createdAt: log.createdAt || Date.now()
      };
      logsOfDay.push(newEntry);
    }
    allLogs[date] = logsOfDay;
    wx.setStorageSync('coffeeLogs', allLogs);
    try {
      await cloudStore.setJson('coffeeLogs', allLogs);
    } catch (e) {
      console.error('cloud setJson fail', e);
      wx.showToast({ title: '已保存到本地，云端同步失败', icon: 'none' });
      this.setData({ punching: false });
      return;
    }

    // 清空输入，方便继续记录下一杯
    this.setData({
      log: {
        date,
        source: '自制',
        shop: '',
        mood: '',
        rating: 0,
        photos: []
      },
      todayCount: logsOfDay.length,
      editIndex: -1,
      punching: false
    });

    wx.showToast({
      title: editIndex >= 0 ? '已更新打卡' : '已记录一杯咖啡',
      icon: 'success',
      duration: 800
    });

    setTimeout(() => {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.redirectTo({
          url: '/pages/history/index'
        });
      }
    }, 800);
  },

});

