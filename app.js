// app.js
App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-7gpp8b1d9fe0165b',
        traceUser: true
      });
      wx.cloud.callFunction({ name: 'getOpenId' })
        .then((res) => {
          if (res.result && res.result.openid) {
            this.globalData.openid = res.result.openid;
          }
        })
        .catch((err) => console.error('getOpenId fail', err));
    }
  },
  globalData: {
    userInfo: null,
    openid: null
  }
})
