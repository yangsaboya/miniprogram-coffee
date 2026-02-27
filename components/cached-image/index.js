const imageCache = require('../../utils/imageCache.js');

Component({
  externalClasses: ['custom-class'],

  properties: {
    url: { type: String, value: '' },
    mode: { type: String, value: 'aspectFill' }
  },

  data: {
    displaySrc: ''
  },

  observers: {
    url(u) {
      this.resolve(u);
    }
  },

  lifetimes: {
    attached() {
      this.resolve(this.data.url);
    },
    detached() {
      this._resolveToken = 0;
      this._resolvingUrl = '';
    }
  },

  methods: {
    resolve(url) {
      if (!url) {
        if (this.data.displaySrc) this.setData({ displaySrc: '' });
        this._resolvingUrl = '';
        return;
      }
      if (url === this._resolvingUrl) return;
      this._resolvingUrl = url;
      this._resolveToken = (this._resolveToken || 0) + 1;
      const token = this._resolveToken;

      // 首帧就用同步缓存或原 url，避免先空白再弹出
      const initial = imageCache.getSync(url) || url;
      if (initial !== this.data.displaySrc) this.setData({ displaySrc: initial });

      const current = url;
      imageCache.get(url).then((resolvedSrc) => {
        if (token !== this._resolveToken) return;
        if (!resolvedSrc || this.data.url !== current) return;
        if (resolvedSrc === this.data.displaySrc) return;
        // 已显示云端 url 时不再切到本地路径，避免一次「重载」导致闪烁；下次进页 getSync 会直接命中
        const showingRemote = (this.data.displaySrc || '').startsWith('cloud://');
        if (showingRemote && imageCache.isLocalPath(resolvedSrc)) return;
        this.setData({ displaySrc: resolvedSrc });
      });
    }
  }
});
