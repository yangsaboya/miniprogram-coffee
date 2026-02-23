const cloudStore = require('../../utils/cloudStore.js');

Page({
  data: {
    currentYear: 0,
    currentMonth: 0,
    weeks: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    logs: {},
    selectedDate: '',
    selectedLogs: [],
    monthTotal: 0,
    monthShopCount: 0
  },

  onLoad() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    this.setData({
      currentYear: year,
      currentMonth: month
    });
    this.loadLogs(year, month);
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) tabBar.setData({ selected: 0 });
    const today = new Date();
    const y = this.data.currentYear || today.getFullYear();
    const m = this.data.currentMonth || today.getMonth() + 1;
    this.loadLogs(y, m);
  },

  rawToLogs(raw) {
    const logs = {};
    if (!raw || typeof raw !== 'object') return logs;
    Object.keys(raw).forEach((date) => {
      const value = raw[date];
      if (Array.isArray(value) && value.length > 0) {
        logs[date] = value;
      } else if (value) {
        logs[date] = [value];
      }
    });
    return logs;
  },

  loadLogs(year, month) {
    const y = year ?? this.data.currentYear;
    const m = month ?? this.data.currentMonth;
    try {
      const raw = cloudStore.getJsonLocal('coffeeLogs') || {};
      const logs = this.rawToLogs(raw);
      this.setData({ logs });
      this.buildCalendar(y, m, logs);
      const todayStr = this.formatDate(new Date());
      this.selectDate(this.data.selectedDate || todayStr);
    } catch (e) {
      console.error('loadLogs local fail', e);
      this.setData({ logs: {} });
      this.buildCalendar(y, m, {});
      this.selectDate(this.formatDate(new Date()));
    }
    cloudStore.getJson('coffeeLogs').then((cloudRaw) => {
      if (cloudRaw && typeof cloudRaw === 'object') {
        wx.setStorageSync('coffeeLogs', cloudRaw);
        const cloudLogs = this.rawToLogs(cloudRaw);
        this.setData({ logs: cloudLogs });
        this.buildCalendar(this.data.currentYear, this.data.currentMonth, cloudLogs);
        if (this.data.selectedDate) this.selectDate(this.data.selectedDate);
      }
    }).catch(() => {});
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  buildCalendar(year, month, logsOverride) {
    let weeks = [];
    let monthTotal = 0;
    let monthShopCount = 0;
    try {
      const logs = logsOverride != null ? logsOverride : (this.data.logs || {});
      const firstDay = new Date(year, month - 1, 1);
      const firstWeekDay = firstDay.getDay();
      const daysInMonth = new Date(year, month, 0).getDate();

      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;

      const todayStr = this.formatDate(new Date());
      const cells = [];

      for (let i = 0; i < firstWeekDay; i++) {
        const day = daysInPrevMonth - firstWeekDay + 1 + i;
        const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const list = logs[dateStr];
        const cupCount = Array.isArray(list) ? list.length : 0;
        const cups = cupCount ? new Array(Math.min(cupCount, 3)).fill(1) : [];
        cells.push({
          day,
          dateStr,
          isCurrentMonth: false,
          hasLog: cupCount > 0,
          cupCount,
          cups,
          isToday: dateStr === todayStr
        });
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const list = logs[dateStr];
        const cupCount = Array.isArray(list) ? list.length : 0;
        const cups = cupCount ? new Array(Math.min(cupCount, 3)).fill(1) : [];
        cells.push({
          day: d,
          dateStr,
          isCurrentMonth: true,
          hasLog: cupCount > 0,
          cupCount,
          cups,
          isToday: dateStr === todayStr
        });
      }

      const totalCellsTarget = 42;
      let extraDay = 1;
      while (cells.length < totalCellsTarget) {
        const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(extraDay).padStart(2, '0')}`;
        const list = logs[dateStr];
        const cupCount = Array.isArray(list) ? list.length : 0;
        const cups = cupCount ? new Array(Math.min(cupCount, 3)).fill(1) : [];
        cells.push({
          day: extraDay,
          dateStr,
          isCurrentMonth: false,
          hasLog: cupCount > 0,
          cupCount,
          cups,
          isToday: dateStr === todayStr
        });
        extraDay += 1;
      }

      for (let i = 0; i < totalCellsTarget; i += 7) {
        const row = cells.slice(i, i + 7);
        weeks.push({
          days: row,
          hasCurrentMonth: row.some(function (cell) { return cell.isCurrentMonth; })
        });
      }

      const monthShops = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const list = logs[dateStr];
        if (Array.isArray(list)) {
          monthTotal += list.length;
          for (let i = 0; i < list.length; i++) {
            const entry = list[i];
            if (entry && typeof entry === 'object' && entry.source === '消费' && entry.shop) {
              const s = String(entry.shop).trim();
              if (s) monthShops[s] = true;
            }
          }
        }
      }
      monthShopCount = Object.keys(monthShops).length;
    } catch (e) {
      console.error('buildCalendar fail', e);
    }
    this.setData({
      weeks: weeks,
      monthTotal: monthTotal,
      monthShopCount: monthShopCount
    });
  },

  onPrevMonth() {
    let { currentYear: year, currentMonth: month } = this.data;
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    this.setData({
      currentYear: year,
      currentMonth: month
    });
    this.buildCalendar(year, month);
  },

  onNextMonth() {
    let { currentYear: year, currentMonth: month } = this.data;
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
    this.setData({
      currentYear: year,
      currentMonth: month
    });
    this.buildCalendar(year, month);
  },

  onSelectDate(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    this.selectDate(dateStr);
  },

  selectDate(dateStr) {
    const logs = this.data.logs || {};
    const list = logs[dateStr] || [];
    this.setData({
      selectedDate: dateStr,
      selectedLogs: list
    });
  },

  onAddCup() {
    const date = this.data.selectedDate;
    if (!date) {
      wx.showToast({
        title: '请先选择日期',
        icon: 'none'
      });
      return;
    }
    wx.navigateTo({
      url: `/pages/record/index?date=${date}`
    });
  },

  onEditCup(e) {
    const index = e.currentTarget.dataset.index;
    const date = this.data.selectedDate;
    if (index === undefined || !date) return;
    wx.navigateTo({
      url: `/pages/record/index?date=${encodeURIComponent(date)}&editIndex=${index}`
    });
  },

  onDeleteCup(e) {
    const index = e.currentTarget.dataset.index;
    const date = this.data.selectedDate;
    if (index === undefined || !date) return;

    let raw = cloudStore.getJsonLocal('coffeeLogs') || {};
    const value = raw[date];
    let list = [];
    if (Array.isArray(value)) {
      list = value;
    } else if (value) {
      list = [value];
    }

    if (index < 0 || index >= list.length) return;

    list.splice(index, 1);
    if (list.length === 0) {
      delete raw[date];
    } else {
      raw[date] = list;
    }
    wx.setStorageSync('coffeeLogs', raw);
    cloudStore.setJson('coffeeLogs', raw).catch(() => {});

    // 更新内存中的 logs
    const logs = this.data.logs || {};
    if (list.length === 0) {
      delete logs[date];
    } else {
      logs[date] = list;
    }
    this.setData({ logs });

    // 重新刷新当前月日历和选中日期数据
    this.buildCalendar(this.data.currentYear, this.data.currentMonth);
    this.selectDate(date);

    wx.showToast({
      title: '已删除这杯',
      icon: 'none'
    });
  },

});

