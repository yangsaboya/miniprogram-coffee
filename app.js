// app.js
var OPENID_TIMEOUT_MS = 12000;

function raceOpenId() {
  if (!wx.cloud) return Promise.resolve();
  var timeout = new Promise(function (resolve) {
    setTimeout(resolve, OPENID_TIMEOUT_MS);
  });
  var call = wx.cloud.callFunction({ name: 'getOpenId' })
    .then(function (res) {
      if (res.result && res.result.openid) {
        getApp().globalData.openid = res.result.openid;
      }
    })
    .catch(function (err) {
      console.error('getOpenId fail', err);
    });
  return Promise.race([call, timeout]);
}

App({
  onLaunch: function () {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-7gpp8b1d9fe0165b',
        traceUser: true
      });
      raceOpenId();
    }
  },
  globalData: {
    userInfo: null,
    openid: null
  }
})
