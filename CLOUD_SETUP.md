# 云开发配置说明

小程序已改为使用**微信云开发**存储打卡和咖啡架数据，换设备登录同一微信账号即可看到之前的记录。

## 1. 开通云开发

1. 用微信开发者工具打开本项目，顶部菜单 **「云开发」** → **「开通云开发」**。
2. 按提示创建环境（例如命名为 `coffee-env`），记下**环境 ID**（形如 `coffee-env-xxxx`）。
3. 在 **`app.js`** 里把 `YOUR_ENV_ID` 替换成你的环境 ID：
   ```js
   wx.cloud.init({
     env: 'coffee-env-xxxx',  // 换成你的环境 ID
     traceUser: true
   });
   ```

## 2. 创建云函数

1. 在开发者工具左侧找到 **「云开发」** → **「云函数」**。
2. 右键 **「云函数」** → **「新建 Node.js 云函数」**，名称填 **`getOpenId`**。
3. 用本项目里的 `cloudfunctions/getOpenId/index.js` 和 `cloudfunctions/getOpenId/config.json` 覆盖新建出来的文件（或把本项目的 `cloudfunctions/getOpenId` 整个文件夹复制到云函数目录）。
4. 右键云函数 **getOpenId** → **「上传并部署：云端安装依赖」**。

### 可选：咖啡架抠图（腾讯云数据万象 · 通用抠图）

若要使用咖啡架「抠图展示咖啡杯」功能（长按架上的照片 → 抠图展示），需额外部署云函数 **segmentImage**，并配置**腾讯云 COS + 数据万象**（数据在腾讯云内，适合无人物照片如咖啡杯）：

1. 右键 **「云函数」** → **「新建 Node.js 云函数」**，名称填 **`segmentImage`**。
2. 用本项目 `cloudfunctions/segmentImage/` 下 `index.js`、`config.json`、`package.json` 覆盖新建出的文件。
3. 在 [腾讯云控制台](https://console.cloud.tencent.com/) 完成：
   - **对象存储 COS**：创建一个存储桶，记下 **桶名称-APPID**（如 `mybucket-1234567890`）和 **地域**（如 `ap-guangzhou`）。
   - **数据万象**：在该桶上 [绑定并开通数据万象](https://cloud.tencent.com/document/product/460/46483)（通用抠图为付费能力，按量计费）。
   - **访问管理**：在 [API 密钥](https://console.cloud.tencent.com/cam/capi) 中获取 **SecretId**、**SecretKey**。
4. 在微信开发者工具中：云开发 → 云函数 → 选中 **segmentImage** → 右键 **「云函数配置」** → 在 **环境变量** 中新增：
   - `TENCENT_SECRET_ID`：腾讯云 SecretId  
   - `TENCENT_SECRET_KEY`：腾讯云 SecretKey  
   - `COS_BUCKET`：存储桶名称，格式为 `桶名称-APPID`  
   - `COS_REGION`（可选）：地域，默认 `ap-guangzhou`
5. 右键 **segmentImage** → **「上传并部署：云端安装依赖」**。

未配置或未部署 segmentImage 时，长按照片会提示「仅支持云存储照片抠图」或「抠图失败」，不影响其他功能。

## 3. 创建云数据库集合

1. 打开 **「云开发」** → **「数据库」**。
2. 点击 **「添加集合」**，集合名称填 **`user_data`**。
3. 进入该集合 → **「权限设置」** → 设为 **「仅创建者可读写」**（这样每个用户只能读写自己 openid 对应的那条记录）。

## 4. 首次使用与迁移

- 未开通云开发或未配置 env 时，仍会使用本地 `wx.setStorageSync`，行为与之前一致。
- 开通并配置好后，会先尝试从云库读；若云库没有数据而本地有，会**自动把本地数据上传到云**，之后以云为准，换设备也能看到。

## 数据结构说明

- **集合** `user_data`：每个用户一条文档，文档 ID = 该用户的 openid。
- 文档内容为键值对，例如：
  - `coffeeLogs`：打卡记录（按日期分组的列表）。
  - `shelfItems`：咖啡架「从相册添加」的照片列表；每项可有 `cutoutUrl`（抠图后的云存储 fileID），用于咖啡架抠图展示。
