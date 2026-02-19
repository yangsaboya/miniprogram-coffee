const cloudStore = require('./cloudStore.js');

const CLOUD_PREFIX = 'coffee';

/**
 * 将本地临时图片上传到云存储，返回 fileID（换设备可访问）。
 * @param {string} tempFilePath - wx.chooseImage 等返回的临时路径
 * @returns {Promise<string>} fileID，失败时 reject
 */
function uploadImage(tempFilePath) {
  if (!tempFilePath) return Promise.reject(new Error('tempFilePath is required'));
  if (!wx.cloud || !wx.cloud.uploadFile) {
    return Promise.reject(new Error('云存储不可用'));
  }
  return cloudStore.ensureOpenId().then((openid) => {
    if (!openid) return Promise.reject(new Error('未获取到 openid'));
    const ext = (tempFilePath.match(/\.(jpeg|jpg|png|gif|webp)$/i) || [])[1] || 'jpg';
    const cloudPath = `${CLOUD_PREFIX}/${openid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    return wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath
    }).then((res) => {
      if (res.fileID) return res.fileID;
      return Promise.reject(new Error(res.errMsg || '上传失败'));
    });
  });
}

module.exports = {
  uploadImage
};
