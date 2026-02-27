const cloudStore = require('./cloudStore.js');

const CLOUD_PREFIX = 'coffee';

function uploadImage(tempFilePath) {
  if (!tempFilePath) return Promise.reject(new Error('tempFilePath is required'));
  if (!wx.cloud || !wx.cloud.uploadFile) {
    return Promise.reject(new Error('云存储不可用'));
  }
  return cloudStore.ensureOpenId().then((openid) => {
    // 如果暂时拿不到 openid，不再阻塞上传，使用通用前缀即可
    const uid = openid || 'anonymous';
    const ext = (tempFilePath.match(/\.(jpeg|jpg|png|gif|webp)$/i) || [])[1] || 'jpg';
    const cloudPath = `${CLOUD_PREFIX}/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    return wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath
    }).then((res) => {
      if (res.fileID) return res.fileID;
      return Promise.reject(new Error(res.errMsg || '上传失败'));
    });
  });
}

/**
 * 删除云存储文件（打卡/咖啡架删除时同步清理后端，避免垃圾堆积）
 * @param {string[]} fileIDs - cloud:// 开头的 fileID 列表
 * @returns {Promise<void>}
 */
function deleteCloudFiles(fileIDs) {
  if (!fileIDs || !fileIDs.length) return Promise.resolve();
  if (!wx.cloud || !wx.cloud.deleteFile) return Promise.resolve();
  const list = [...new Set(fileIDs)].filter((id) => id && String(id).startsWith('cloud://'));
  if (!list.length) return Promise.resolve();
  // 单次最多 50 个
  const tasks = [];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    tasks.push(
      wx.cloud.deleteFile({ fileList: batch }).catch((err) => {
        console.warn('[cloudStorage] deleteCloudFiles fail', batch.length, err);
      })
    );
  }
  return Promise.all(tasks).then(() => {});
}

module.exports = {
  uploadImage,
  deleteCloudFiles
};
