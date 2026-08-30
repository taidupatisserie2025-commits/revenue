/* data.js — LocalStorage CRUD layer */
window.AppData = (function () {
  const K = AppConfig.KEYS;

  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function loadOne(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ── Daily Reports ── */
  const Daily = {
    getAll() { return load(K.DAILY).sort((a,b) => b.date.localeCompare(a.date)); },
    getByDate(date) { return load(K.DAILY).find(r => r.date === date) || null; },
    upsert(report) {
      const all = load(K.DAILY);
      const idx = all.findIndex(r => r.date === report.date);
      const now = new Date().toISOString();
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...report, updatedAt: now };
      } else {
        all.push({ ...report, createdAt: now, updatedAt: now });
      }
      save(K.DAILY, all);
      return report;
    },
    delete(date) {
      save(K.DAILY, load(K.DAILY).filter(r => r.date !== date));
    },
  };

  /* ── LinePay Payouts (onsite) ── */
  const Linepay = {
    getAll() { return load(K.LINEPAY).sort((a,b) => b.date.localeCompare(a.date)); },
    getByDate(date) { return load(K.LINEPAY).find(r => r.date === date) || null; },
    upsert(payout) {
      const all = load(K.LINEPAY);
      const idx = all.findIndex(r => r.date === payout.date);
      if (idx >= 0) { all[idx] = { ...all[idx], ...payout }; }
      else { all.push(payout); }
      save(K.LINEPAY, all);
    },
    confirm(date, amount) {
      const all = load(K.LINEPAY);
      const idx = all.findIndex(r => r.date === date);
      if (idx >= 0) {
        all[idx].actualAmount = amount;
        all[idx].actualDate = AppUtils.today();
        all[idx].status = Math.abs(amount - all[idx].amount) < 1 ? 'confirmed' : 'discrepancy';
        save(K.LINEPAY, all);
      }
    },
    delete(date) {
      save(K.LINEPAY, load(K.LINEPAY).filter(r => r.date !== date));
    },
  };

  /* ── Taishin Payouts ── */
  const Taishin = {
    getAll() { return load(K.TAISHIN).sort((a,b) => b.date.localeCompare(a.date)); },
    getByDate(date) { return load(K.TAISHIN).find(r => r.date === date) || null; },
    upsert(payout) {
      const all = load(K.TAISHIN);
      const idx = all.findIndex(r => r.date === payout.date);
      if (idx >= 0) { all[idx] = { ...all[idx], ...payout }; }
      else { all.push(payout); }
      save(K.TAISHIN, all);
    },
    confirm(date, amount) {
      const all = load(K.TAISHIN);
      const idx = all.findIndex(r => r.date === date);
      if (idx >= 0) {
        all[idx].actualAmount = amount;
        all[idx].actualDate = AppUtils.today();
        all[idx].status = Math.abs(amount - all[idx].totalAmount) < 1 ? 'confirmed' : 'discrepancy';
        save(K.TAISHIN, all);
      }
    },
    delete(date) {
      save(K.TAISHIN, load(K.TAISHIN).filter(r => r.date !== date));
    },
  };

  /* ── Uber Weeks ── */
  const Uber = {
    getAll() { return load(K.UBER).sort((a,b) => b.weekStart.localeCompare(a.weekStart)); },
    getById(id) { return load(K.UBER).find(w => w.id === id) || null; },
    getByDate(date) {
      const [ws] = AppUtils.getWeekBounds(date);
      return load(K.UBER).find(w => w.weekStart === ws) || null;
    },
    upsertWeek(weekStart, weekEnd) {
      const all = load(K.UBER);
      const idx = all.findIndex(w => w.weekStart === weekStart);
      if (idx < 0) {
        all.push({
          id: 'uber_' + weekStart,
          weekStart, weekEnd,
          dailyOrders: [],
          totalOrderAmount: 0,
          commissionRate: AppConfig.UBER_DEFAULT_COMMISSION,
          estimatedPayout: 0,
          actualPayout: null,
          payoutDate: null,
          status: 'pending',
          notes: '',
        });
        save(K.UBER, all);
      }
    },
    addDayAmount(date, amount) {
      const [ws, we] = AppUtils.getWeekBounds(date);
      this.upsertWeek(ws, we);
      const all = load(K.UBER);
      const idx = all.findIndex(w => w.weekStart === ws);
      if (idx >= 0) {
        const dayIdx = all[idx].dailyOrders.findIndex(d => d.date === date);
        if (dayIdx >= 0) { all[idx].dailyOrders[dayIdx].amount = amount; }
        else { all[idx].dailyOrders.push({ date, amount }); }
        all[idx].totalOrderAmount = all[idx].dailyOrders.reduce((s,d) => s + (d.amount||0), 0);
        const rate = all[idx].commissionRate;
        all[idx].estimatedPayout = Math.round(all[idx].totalOrderAmount * (1 - rate));
        save(K.UBER, all);
      }
    },
    confirmPayout(id, amount, date, rate, notes) {
      const all = load(K.UBER);
      const idx = all.findIndex(w => w.id === id);
      if (idx >= 0) {
        all[idx].actualPayout = amount;
        all[idx].payoutDate = date;
        all[idx].commissionRate = rate;
        all[idx].notes = notes || '';
        all[idx].estimatedPayout = Math.round(all[idx].totalOrderAmount * (1 - rate));
        all[idx].status = 'confirmed';
        save(K.UBER, all);
      }
    },
    delete(id) {
      save(K.UBER, load(K.UBER).filter(w => w.id !== id));
    },
  };

  /* ── Cash Closes ── */
  const Cash = {
    getAll() { return load(K.CASH).sort((a,b) => b.date.localeCompare(a.date)); },
    getByDate(date) { return load(K.CASH).find(r => r.date === date) || null; },
    upsert(close) {
      const all = load(K.CASH);
      const idx = all.findIndex(r => r.date === close.date);
      if (idx >= 0) { all[idx] = { ...all[idx], ...close }; }
      else { all.push(close); }
      save(K.CASH, all);
    },
    delete(date) {
      save(K.CASH, load(K.CASH).filter(r => r.date !== date));
    },
  };

  /* ── Bank Transfers ── */
  const Transfer = {
    getAll() { return load(K.TRANSFER).sort((a,b) => a.expectedDate.localeCompare(b.expectedDate)); },
    getById(id) { return load(K.TRANSFER).find(t => t.id === id) || null; },
    add(t) {
      const all = load(K.TRANSFER);
      all.push({ ...t, id: uid(), status: 'pending', createdAt: new Date().toISOString() });
      save(K.TRANSFER, all);
    },
    confirm(id, amount, date) {
      const all = load(K.TRANSFER);
      const idx = all.findIndex(t => t.id === id);
      if (idx >= 0) {
        all[idx].actualAmount = amount;
        all[idx].actualDate = date;
        all[idx].status = 'received';
        save(K.TRANSFER, all);
      }
    },
    delete(id) {
      save(K.TRANSFER, load(K.TRANSFER).filter(t => t.id !== id));
    },
    // mark overdue based on expected date
    refreshStatus() {
      const all = load(K.TRANSFER);
      const today = AppUtils.today();
      let changed = false;
      all.forEach(t => {
        if (t.status === 'pending' && t.expectedDate < today) {
          t.status = 'overdue'; changed = true;
        }
      });
      if (changed) save(K.TRANSFER, all);
    },
  };

  /* ── CyberBiz Periods ── */
  const Cyberbiz = {
    getAll() { return load(K.CYBERBIZ).sort((a,b) => b.periodEnd.localeCompare(a.periodEnd)); },
    getById(id) { return load(K.CYBERBIZ).find(p => p.id === id) || null; },
    upsert(period) {
      const all = load(K.CYBERBIZ);
      const idx = all.findIndex(p => p.id === period.id);
      if (idx >= 0) { all[idx] = { ...all[idx], ...period }; }
      else { all.push(period); }
      save(K.CYBERBIZ, all);
    },
    confirmPayout(id, amount, date) {
      const all = load(K.CYBERBIZ);
      const idx = all.findIndex(p => p.id === id);
      if (idx >= 0) {
        all[idx].actualPayout = amount;
        all[idx].actualPayoutDate = date;
        all[idx].payoutStatus = 'received';
        save(K.CYBERBIZ, all);
      }
    },
    delete(id) {
      save(K.CYBERBIZ, load(K.CYBERBIZ).filter(p => p.id !== id));
    },
  };

  /* ── Settings ── */
  const Settings = {
    get() {
      return loadOne(K.SETTINGS) || {
        taishinPayoutDays: AppConfig.TAISHIN_BUSINESS_DAYS,
        uberPayoutDay: 'thursday', // default: Thursday
      };
    },
    save(s) { save(K.SETTINGS, s); },
  };

  return { Daily, Linepay, Taishin, Uber, Cash, Transfer, Cyberbiz, Settings };
})();
