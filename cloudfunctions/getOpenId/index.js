// 云函数：返回当前用户的 openid，用于读写该用户自己的云数据库文档
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  return { openid: OPENID };
};
