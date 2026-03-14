const cloudStore = require('./utils/cloudStore.js');

App({
  onLaunch: function () {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-7gpp8b1d9fe0165b',
        traceUser: true
      });
      cloudStore.ensureOpenId();
    }
  },
  globalData: {
    userInfo: null,
    openid: null
  }
});
