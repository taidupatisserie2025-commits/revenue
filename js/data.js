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
    saveToFirebase(key, data);
  }

  function saveToFirebase(key, data) {
    if (window.db) {
      window.db.collection('app_data').doc(key).set({
        data: data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(() => {
        updateCloudStatus(true);
      }).catch(err => {
        console.warn('Firebase save warning:', err);
        updateCloudStatus(false, err.message);
      });
    }
  }

  function updateCloudStatus(isOnline, msg) {
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');
    if (dot && text) {
      if (isOnline) {
        dot.style.background = 'var(--green)';
        text.textContent = '雲端連線正常';
      } else {
        dot.style.background = 'var(--amber)';
        text.textContent = msg || '雲端資料庫連結中...';
      }
    }
  }

  async function syncToCloud() {
    if (!window.db) return AppUtils.toast('Firebase 尚未初始化，請確認網路與設定', 'error');
    AppUtils.toast('正在將全量資料上傳至 Firebase 雲端…', 'info');
    try {
      const keys = Object.values(K);
      for (const k of keys) {
        const localData = load(k);
        const localOne = loadOne(k);
        const val = (localData && localData.length > 0) ? localData : (localOne || localData);
        if (val) {
          await window.db.collection('app_data').doc(k).set({
            data: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      updateCloudStatus(true);
      AppUtils.toast('全量資料成功同步至 Firebase 雲端！', 'success');
    } catch (err) {
      console.error(err);
      AppUtils.toast('上傳至 Firebase 失敗: ' + err.message, 'error');
    }
  }

  async function syncFromCloud() {
    if (!window.db) return AppUtils.toast('Firebase 尚未初始化，請確認網路與設定', 'error');
    AppUtils.toast('正在從 Firebase 下載最新雲端數據…', 'info');
    try {
      const snapshot = await window.db.collection('app_data').get();
      if (snapshot.empty) {
        AppUtils.toast('Firebase 雲端目前無任何備份資料', 'info');
        return;
      }
      snapshot.forEach(doc => {
        const key = doc.id;
        const val = doc.data()?.data;
        if (val) {
          localStorage.setItem(key, JSON.stringify(val));
        }
      });
      updateCloudStatus(true);
      AppUtils.toast('雲端數據已成功覆蓋並更新至本地！', 'success');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      console.error(err);
      AppUtils.toast('從 Firebase 下載失敗: ' + err.message, 'error');
    }
  }

  // Cloud Firestore listener init
  setTimeout(() => {
    if (window.db) {
      updateCloudStatus(true);
      window.db.collection('app_data').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'modified') {
            const key = change.doc.id;
            const val = change.doc.data()?.data;
            if (val) {
              localStorage.setItem(key, JSON.stringify(val));
            }
          }
        });
      }, err => {
        console.warn('Firestore snapshot error:', err);
        updateCloudStatus(false, err.message);
      });
    } else {
      updateCloudStatus(false, '未檢測到 Firebase 實體');
    }
  }, 1000);

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
    confirm(date, actualAmount, actualDate, batchId) {
      const all = load(K.LINEPAY);
      const idx = all.findIndex(r => r.date === date);
      if (idx >= 0) {
        all[idx].actualAmount = actualAmount;
        all[idx].actualDate = actualDate || AppUtils.today();
        all[idx].status = 'confirmed';
        all[idx].payoutBatchId = batchId || null;
        save(K.LINEPAY, all);
      }
    },
    unconfirm(date) {
      const all = load(K.LINEPAY);
      const idx = all.findIndex(r => r.date === date);
      if (idx >= 0) {
        all[idx].actualAmount = null;
        all[idx].actualDate = null;
        all[idx].status = 'pending';
        all[idx].payoutBatchId = null;
        save(K.LINEPAY, all);
      }
    },
    delete(date) {
      save(K.LINEPAY, load(K.LINEPAY).filter(r => r.date !== date));
    },
  };

  /* ── LinePay Payout Batches ── */
  const LinepayBatches = {
    getAll() { 
      return load(K.LINEPAY_BATCHES).sort((a,b) => (b.actualDate || b.expectedDate).localeCompare(a.actualDate || a.expectedDate)); 
    },
    getById(id) { 
      return load(K.LINEPAY_BATCHES).find(b => b.id === id) || null; 
    },
    upsert(batch) {
      const all = load(K.LINEPAY_BATCHES);
      const idx = all.findIndex(b => b.id === batch.id);
      if (idx >= 0) { all[idx] = { ...all[idx], ...batch }; }
      else { all.push(batch); }
      save(K.LINEPAY_BATCHES, all);
    },
    delete(id) {
      save(K.LINEPAY_BATCHES, load(K.LINEPAY_BATCHES).filter(b => b.id !== id));
    }
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

  return { Daily, Linepay, LinepayBatches, Taishin, Uber, Cash, Transfer, Cyberbiz, Settings, syncToCloud, syncFromCloud };
})();
