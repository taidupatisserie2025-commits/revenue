/* data.js — LocalStorage & Cloud Firestore Instant Sync CRUD layer */
window.AppData = (function () {
  const K = AppConfig.KEYS;

  const COLLECTION_MAP = {
    [K.DAILY]: 'daily_reports',
    [K.LINEPAY]: 'linepay_payouts',
    [K.LINEPAY_BATCHES]: 'linepay_batches',
    [K.TAISHIN]: 'taishin_payouts',
    [K.UBER]: 'uber_weeks',
    [K.CASH]: 'cash_closes',
    [K.TRANSFER]: 'transfers',
    [K.CYBERBIZ]: 'cyberbiz_periods',
    [K.SETTINGS]: 'app_settings',
  };

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

  function getDocId(key, item) {
    if (!item) return 'general';
    return item.date || item.id || item.weekStart || 'general';
  }

  // Instant Item-level Firestore Write
  function writeDoc(key, item) {
    if (!window.db || !item) return;
    const collectionName = COLLECTION_MAP[key];
    const docId = getDocId(key, item);
    if (collectionName && docId) {
      window.db.collection(collectionName).doc(docId).set(item, { merge: true })
        .then(() => updateCloudStatus(true))
        .catch(err => console.warn('Instant Firestore write warning:', err));
    }
  }

  // Instant Item-level Firestore Delete
  function deleteDoc(key, docId) {
    if (!window.db || !docId) return;
    const collectionName = COLLECTION_MAP[key];
    if (collectionName) {
      window.db.collection(collectionName).doc(docId).delete()
        .then(() => updateCloudStatus(true))
        .catch(err => console.warn('Instant Firestore delete warning:', err));
    }
  }

  function updateCloudStatus(isOnline, msg) {
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');
    if (dot && text) {
      if (isOnline) {
        dot.style.background = 'var(--green)';
        text.textContent = '雲端連線正常 (即時寫入)';
      } else {
        dot.style.background = 'var(--red)';
        const rawMsg = (typeof msg === 'string') ? msg : (msg && msg.message ? msg.message : '');
        if (rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('insufficient')) {
          text.textContent = '⚠️ 權限不足 (請至 Console 改 Rules)';
        } else if (rawMsg.toLowerCase().includes('not-found') || rawMsg.toLowerCase().includes('database')) {
          text.textContent = '⚠️ 請至 Console 建立 Firestore Database';
        } else {
          text.textContent = rawMsg || '⚠️ 雲端資料庫連結失敗';
        }
      }
    }
  }

  async function syncToCloud() {
    if (!window.db) return AppUtils.toast('Firebase 尚未初始化，請確認網路與設定', 'error');
    AppUtils.toast('正在將全量資料上傳至 Firebase 雲端…', 'info');
    try {
      const keys = Object.values(K);
      for (const k of keys) {
        const collectionName = COLLECTION_MAP[k];
        if (!collectionName) continue;
        const localData = load(k);
        const localOne = loadOne(k);
        if (Array.isArray(localData) && localData.length > 0) {
          for (const item of localData) {
            const docId = getDocId(k, item);
            await window.db.collection(collectionName).doc(docId).set(item, { merge: true });
          }
        } else if (localOne) {
          await window.db.collection(collectionName).doc('general').set(localOne, { merge: true });
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
      const keys = Object.values(K);
      for (const k of keys) {
        const collectionName = COLLECTION_MAP[k];
        if (!collectionName) continue;
        const snapshot = await window.db.collection(collectionName).get();
        if (!snapshot.empty) {
          if (k === K.SETTINGS) {
            snapshot.forEach(doc => {
              if (doc.id === 'general') localStorage.setItem(k, JSON.stringify(doc.data()));
            });
          } else {
            const list = [];
            snapshot.forEach(doc => list.push(doc.data()));
            localStorage.setItem(k, JSON.stringify(list));
          }
        }
      }
      updateCloudStatus(true);
      AppUtils.toast('雲端數據已成功覆蓋並更新至本地！', 'success');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      console.error(err);
      AppUtils.toast('從 Firebase 下載失敗: ' + err.message, 'error');
    }
  }

  // Real-time Firestore Listeners for Multi-Device Live Sync
  let isListenerActive = false;
  setTimeout(() => {
    if (window.db && !isListenerActive) {
      isListenerActive = true;
      updateCloudStatus(true);

      Object.keys(COLLECTION_MAP).forEach(key => {
        const collectionName = COLLECTION_MAP[key];
        let isInitialLoad = true;

        window.db.collection(collectionName).onSnapshot(snapshot => {

          if (key === K.SETTINGS) {
            // Settings: single document mode
            snapshot.forEach(doc => {
              if (doc.id === 'general') {
                localStorage.setItem(key, JSON.stringify(doc.data()));
              }
            });
            if (window.App && typeof window.App.refreshCurrentPage === 'function') {
              window.App.refreshCurrentPage();
            }
            isInitialLoad = false;
            return;
          }

          // === Full merge strategy ===
          // 1. Get all docs currently in Firestore
          const cloudDocs = [];
          const cloudIds = new Set();
          snapshot.forEach(doc => {
            cloudDocs.push(doc.data());
            cloudIds.add(doc.id);
          });

          // 2. Get local-only docs (exist locally but not yet in Firestore)
          const localList = load(key) || [];
          const localOnlyDocs = localList.filter(item => {
            const id = getDocId(key, item);
            return id && !cloudIds.has(id);
          });

          // 3. Merged = Firestore wins for shared docs + keep local-only
          const merged = [...cloudDocs, ...localOnlyDocs];
          localStorage.setItem(key, JSON.stringify(merged));

          // 4. On first load: push local-only docs up to Firestore (auto-heal)
          if (isInitialLoad) {
            localOnlyDocs.forEach(item => writeDoc(key, item));
          }
          isInitialLoad = false;

          // 5. Refresh UI
          if (window.App && typeof window.App.refreshCurrentPage === 'function') {
            window.App.refreshCurrentPage();
          }

        }, err => {
          console.warn(`Firestore snapshot warning [${collectionName}]:`, err);
          updateCloudStatus(false, err.message);
        });
      });
    } else if (!window.db) {
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
      let target;
      if (idx >= 0) {
        target = { ...all[idx], ...report, updatedAt: now };
        all[idx] = target;
      } else {
        target = { ...report, createdAt: now, updatedAt: now };
        all.push(target);
      }
      save(K.DAILY, all);
      writeDoc(K.DAILY, target);
      return target;
    },
    delete(date) {
      save(K.DAILY, load(K.DAILY).filter(r => r.date !== date));
      deleteDoc(K.DAILY, date);
    },
  };

  /* ── LinePay Payouts (onsite) ── */
  const Linepay = {
    getAll() { return load(K.LINEPAY).sort((a,b) => b.date.localeCompare(a.date)); },
    getByDate(date) { return load(K.LINEPAY).find(r => r.date === date) || null; },
    upsert(payout) {
      const all = load(K.LINEPAY);
      const idx = all.findIndex(r => r.date === payout.date);
      let target;
      if (idx >= 0) { target = { ...all[idx], ...payout }; all[idx] = target; }
      else { target = payout; all.push(target); }
      save(K.LINEPAY, all);
      writeDoc(K.LINEPAY, target);
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
        writeDoc(K.LINEPAY, all[idx]);
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
        writeDoc(K.LINEPAY, all[idx]);
      }
    },
    delete(date) {
      save(K.LINEPAY, load(K.LINEPAY).filter(r => r.date !== date));
      deleteDoc(K.LINEPAY, date);
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
      let target;
      if (idx >= 0) { target = { ...all[idx], ...batch }; all[idx] = target; }
      else { target = batch; all.push(target); }
      save(K.LINEPAY_BATCHES, all);
      writeDoc(K.LINEPAY_BATCHES, target);
    },
    delete(id) {
      save(K.LINEPAY_BATCHES, load(K.LINEPAY_BATCHES).filter(b => b.id !== id));
      deleteDoc(K.LINEPAY_BATCHES, id);
    }
  };

  /* ── Taishin Payouts ── */
  const Taishin = {
    getAll() { return load(K.TAISHIN).sort((a,b) => b.date.localeCompare(a.date)); },
    getByDate(date) { return load(K.TAISHIN).find(r => r.date === date) || null; },
    upsert(payout) {
      const all = load(K.TAISHIN);
      const idx = all.findIndex(r => r.date === payout.date);
      let target;
      if (idx >= 0) { target = { ...all[idx], ...payout }; all[idx] = target; }
      else { target = payout; all.push(target); }
      save(K.TAISHIN, all);
      writeDoc(K.TAISHIN, target);
    },
    confirm(date, amount) {
      const all = load(K.TAISHIN);
      const idx = all.findIndex(r => r.date === date);
      if (idx >= 0) {
        all[idx].actualAmount = amount;
        all[idx].actualDate = AppUtils.today();
        all[idx].status = Math.abs(amount - all[idx].totalAmount) < 1 ? 'confirmed' : 'discrepancy';
        save(K.TAISHIN, all);
        writeDoc(K.TAISHIN, all[idx]);
      }
    },
    delete(date) {
      save(K.TAISHIN, load(K.TAISHIN).filter(r => r.date !== date));
      deleteDoc(K.TAISHIN, date);
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
        const item = {
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
        };
        all.push(item);
        save(K.UBER, all);
        writeDoc(K.UBER, item);
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
        writeDoc(K.UBER, all[idx]);
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
        writeDoc(K.UBER, all[idx]);
      }
    },
    delete(id) {
      save(K.UBER, load(K.UBER).filter(w => w.id !== id));
      deleteDoc(K.UBER, id);
    },
  };

  /* ── Cash Closes ── */
  const Cash = {
    getAll() { return load(K.CASH).sort((a,b) => b.date.localeCompare(a.date)); },
    getByDate(date) { return load(K.CASH).find(r => r.date === date) || null; },
    upsert(close) {
      const all = load(K.CASH);
      const idx = all.findIndex(r => r.date === close.date);
      let target;
      if (idx >= 0) { target = { ...all[idx], ...close }; all[idx] = target; }
      else { target = close; all.push(target); }
      save(K.CASH, all);
      writeDoc(K.CASH, target);
    },
    delete(date) {
      save(K.CASH, load(K.CASH).filter(r => r.date !== date));
      deleteDoc(K.CASH, date);
    },
  };

  /* ── Bank Transfers ── */
  const Transfer = {
    getAll() { return load(K.TRANSFER).sort((a,b) => a.expectedDate.localeCompare(b.expectedDate)); },
    getById(id) { return load(K.TRANSFER).find(t => t.id === id) || null; },
    add(t) {
      const all = load(K.TRANSFER);
      const target = { ...t, id: uid(), status: 'pending', createdAt: new Date().toISOString() };
      all.push(target);
      save(K.TRANSFER, all);
      writeDoc(K.TRANSFER, target);
    },
    confirm(id, amount, date) {
      const all = load(K.TRANSFER);
      const idx = all.findIndex(t => t.id === id);
      if (idx >= 0) {
        all[idx].actualAmount = amount;
        all[idx].actualDate = date;
        all[idx].status = 'received';
        save(K.TRANSFER, all);
        writeDoc(K.TRANSFER, all[idx]);
      }
    },
    delete(id) {
      save(K.TRANSFER, load(K.TRANSFER).filter(t => t.id !== id));
      deleteDoc(K.TRANSFER, id);
    },
    refreshStatus() {
      const all = load(K.TRANSFER);
      const today = AppUtils.today();
      let changed = false;
      all.forEach(t => {
        if (t.status === 'pending' && t.expectedDate < today) {
          t.status = 'overdue'; changed = true;
          writeDoc(K.TRANSFER, t);
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
      let target;
      if (idx >= 0) { target = { ...all[idx], ...period }; all[idx] = target; }
      else { target = period; all.push(period); }
      save(K.CYBERBIZ, all);
      writeDoc(K.CYBERBIZ, target);
    },
    confirmPayout(id, amount, date) {
      const all = load(K.CYBERBIZ);
      const idx = all.findIndex(p => p.id === id);
      if (idx >= 0) {
        all[idx].actualPayout = amount;
        all[idx].actualPayoutDate = date;
        all[idx].payoutStatus = 'received';
        save(K.CYBERBIZ, all);
        writeDoc(K.CYBERBIZ, all[idx]);
      }
    },
    delete(id) {
      save(K.CYBERBIZ, load(K.CYBERBIZ).filter(p => p.id !== id));
      deleteDoc(K.CYBERBIZ, id);
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
    save(s) {
      save(K.SETTINGS, s);
      writeDoc(K.SETTINGS, s);
    },
  };

  return { Daily, Linepay, LinepayBatches, Taishin, Uber, Cash, Transfer, Cyberbiz, Settings, syncToCloud, syncFromCloud };
})();
