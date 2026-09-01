/* app.js — Main SPA: routing, all page renders, event handlers */
window.App = (function () {
  const U = AppUtils;
  const D = AppData;
  const C = AppConfig;

  let currentPage = 'dashboard';

  /* ═══════════════════════════════════════════
     ROUTER
  ═══════════════════════════════════════════ */
  function navigate(page, params) {
    location.hash = params ? page + '/' + params : page;
  }

  function handleRoute() {
    const hash = location.hash.replace('#', '') || 'dashboard';
    const [page, ...rest] = hash.split('/');
    currentPage = page;
    updateNav(page);
    renderPage(page, rest.join('/'));
  }

  function refreshCurrentPage() {
    handleRoute();
  }

  function updateNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  }

  function renderPage(page, params) {
    const el = U.el('page-content');
    if (!el) return;
    const pages = {
      dashboard:          renderDashboard,
      daily:              renderDailyList,
      'daily-form':       () => renderDailyForm(params),
      'linepay-onsite':   renderLinepayOnsite,
      taishin:            renderTaishin,
      uber:               renderUber,
      cash:               renderCash,
      transfer:           renderTransfer,
      cyberbiz:           renderCyberbiz,
      'cyberbiz-linepay': renderCyberbizLinepay,
      'cyberbiz-payments':renderCyberbizPayments,
      'cyberbiz-coins':   renderCyberbizCoins,
    };
    const fn = pages[page] || renderDashboard;
    el.innerHTML = `<div class="page-enter">${fn()}</div>`;
    setupPageEvents(page);
  }

  /* ═══════════════════════════════════════════
     TOAST
  ═══════════════════════════════════════════ */
  function toast(msg, type = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    U.el('toast-container').prepend(div);
    setTimeout(() => div.remove(), 3200);
  }

  /* ═══════════════════════════════════════════
     MODAL
  ═══════════════════════════════════════════ */
  function openModal(title, bodyHtml, wide) {
    U.el('modal-title').textContent = title;
    U.el('modal-body').innerHTML = bodyHtml;
    const box = U.el('modal-box');
    if (wide) box.classList.add('modal-box-lg');
    else box.classList.remove('modal-box-lg');
    U.el('modal-overlay').classList.remove('hidden');
  }

  function closeModal(e) {
    if (e && e.target !== U.el('modal-overlay')) return;
    U.el('modal-overlay').classList.add('hidden');
  }

  /* ═══════════════════════════════════════════
     PAGE: DASHBOARD
  ═══════════════════════════════════════════ */
  function renderDashboard() {
    D.Transfer.refreshStatus();
    const today = U.today();
    const reports = D.Daily.getAll();
    const todayReport = D.Daily.getByDate(today);
    const transfers = D.Transfer.getAll();

    // Month totals — 門市營業額 (from daily reports)
    const thisMonth = today.slice(0, 7);
    const monthReports = reports.filter(r => r.date.startsWith(thisMonth));
    const storeMonthTotal = monthReports.reduce((s, r) => {
      const o = r.onsite || {};
      return s + (o.cash||0) + (o.taishinCC||0) + (o.taishinAP||0) + (o.linePay||0) + (o.bankTransfer||0) + (o.uber||0);
    }, 0);

    // 官網訂單營業額 (from CyberBiz Excel uploads — sum of line pay gross + cyberpayments net per period)
    const cyberbizPeriods = D.Cyberbiz.getAll().filter(p => {
      // Include periods that overlap with current month
      return (p.periodStart || '').startsWith(thisMonth) || (p.periodEnd || '').startsWith(thisMonth);
    });
    let onlineOrderTotal = 0;
    cyberbizPeriods.forEach(p => {
      // Line Pay gross total (all payment amounts from linePay sheet)
      const lp = p.linePay || {};
      const lpTotal = Object.values(lp.daily || {}).reduce((s, d) => s + (d.grossTotal || 0), 0);
      // CyberBiz Payments net (payments + refunds, as signed amounts)
      const cp = p.cyberPayments || {};
      const cpTotal = cp.total || 0; // includes refund offsets
      onlineOrderTotal += lpTotal + cpTotal;
    });

    // 本月總業績 = 門市 + 官網
    const monthTotal = storeMonthTotal + onlineOrderTotal;

    // Pending LinePay
    const lp = D.Linepay.getAll();
    const lpPending = lp.filter(p => p.status === 'pending');
    const lpPendingTotal = lpPending.reduce((s,p) => s + (p.amount||0), 0);

    // LinePay due today or past due
    const lpDue = lpPending.filter(p => p.expectedPayoutDate <= today);

    // Pending Taishin
    const ts = D.Taishin.getAll();
    const tsDue = ts.filter(p => p.status === 'pending' && p.expectedPayoutDate <= today);

    // Overdue transfers
    const overdueTransfers = transfers.filter(t => t.status === 'overdue');

    // Pending Uber weeks
    const uberPending = D.Uber.getAll().filter(w => w.status === 'pending' && w.weekEnd < today);

    // Alerts
    const alerts = [];
    if (!todayReport) {
      alerts.push({ type: 'warning', icon: '📋', title: '今日尚未輸入報表', sub: '請記得在今天營業結束後填寫每日報表', page: 'daily-form', params: today });
    }
    lpDue.forEach(p => {
      alerts.push({ type: 'info', icon: '💚', title: `LinePay 今日應入帳 ${U.money(p.amount)}`, sub: `交易日 ${U.fmt(p.date)} → 預計撥款 ${U.fmt(p.expectedPayoutDate)}`, page: 'linepay-onsite' });
    });
    tsDue.forEach(p => {
      alerts.push({ type: 'info', icon: '💳', title: `台新信用卡今日應入帳 ${U.money(p.totalAmount)}`, sub: `交易日 ${U.fmt(p.date)}`, page: 'taishin' });
    });
    overdueTransfers.forEach(t => {
      alerts.push({ type: 'danger', icon: '🏦', title: `匯款逾期：${t.description}`, sub: `預計到帳 ${U.fmt(t.expectedDate)}，金額 ${U.money(t.expectedAmount)}`, page: 'transfer' });
    });
    uberPending.forEach(w => {
      alerts.push({ type: 'warning', icon: '🛵', title: `Uber 週結待確認：${U.fmtWeek(w.weekStart, w.weekEnd)}`, sub: `訂單總額 ${U.money(w.totalOrderAmount)}，預估實收 ${U.money(w.estimatedPayout)}`, page: 'uber' });
    });

    const alertsHtml = alerts.length ? alerts.map(a => `
      <div class="alert-item ${a.type}" onclick="App.navigate('${a.page}'${a.params ? `,'${a.params}'` : ''})">
        <span style="font-size:20px">${a.icon}</span>
        <div class="alert-text">
          <div class="alert-title">${a.title}</div>
          <div class="alert-sub">${a.sub}</div>
        </div>
        <span style="color:var(--text3)">›</span>
      </div>`).join('')
      : `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">目前沒有待處理項目</div></div>`;

    // Recent reports
    const recent = reports.slice(0, 5);
    const recentHtml = recent.length ? recent.map(r => {
      const o = r.onsite || {};
      const total = (o.cash||0)+(o.taishinCC||0)+(o.taishinAP||0)+(o.linePay||0)+(o.bankTransfer||0)+(o.uber||0);
      return `<tr>
        <td>${U.fmt(r.date)}${U.fmtWeekday(r.date)}</td>
        <td class="td-number text-green">${U.money(total)}</td>
        <td class="td-muted">${U.money(o.cash||0)}</td>
        <td class="td-muted">${U.money((o.taishinCC||0)+(o.taishinAP||0))}</td>
        <td class="td-muted">${U.money(o.linePay||0)}</td>
        <td class="td-muted">${U.money(o.uber||0)}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="App.navigate('daily-form','${r.date}')">✎ 編輯</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty-state" style="padding:24px"><div class="empty-text">尚無報表資料</div></div></td></tr>`;

    return `
    <div class="page-header row-between">
      <div>
        <div class="page-title">首頁總覽</div>
        <div class="page-subtitle">${U.fmt(today)}${U.fmtWeekday(today)}</div>
      </div>
      <button class="btn btn-primary" onclick="App.navigate('daily-form','${today}')">
        ＋ ${todayReport ? '編輯今日報表' : '輸入今日報表'}
      </button>
    </div>

    <!-- 業績三區 -->
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text3);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">📊 ${thisMonth.replace('-','年')}月 業績總覽</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">
        <div class="big-stat" style="cursor:pointer;border:1.5px solid rgba(124,58,237,0.15)" onclick="App.navigate('daily')">
          <div class="big-stat-label">🏪 門市營業額</div>
          <div class="big-stat-value text-amber">${U.money(storeMonthTotal)}</div>
          <div class="big-stat-sub">每日報表累計・${monthReports.length} 天</div>
        </div>
        <div class="big-stat" style="cursor:pointer;border:1.5px solid rgba(16,185,129,0.2)" onclick="App.navigate('cyberbiz')">
          <div class="big-stat-label">🌐 官網訂單營業額</div>
          <div class="big-stat-value text-green">${U.money(onlineOrderTotal)}</div>
          <div class="big-stat-sub">${cyberbizPeriods.length > 0 ? `已上傳 ${cyberbizPeriods.length} 期對帳單` : '尚未上傳官網對帳單'}</div>
        </div>
        <div class="big-stat" style="border:1.5px solid rgba(99,102,241,0.25);background:var(--bg2)">
          <div class="big-stat-label" style="color:var(--purple)">🏆 本月總業績</div>
          <div class="big-stat-value" style="color:var(--purple);font-size:clamp(22px,3vw,32px)">${U.money(monthTotal)}</div>
          <div class="big-stat-sub">門市 + 官網合計</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="big-stat">
        <div class="big-stat-label">LinePay 待入帳</div>
        <div class="big-stat-value text-amber">${U.money(lpPendingTotal)}</div>
        <div class="big-stat-sub">${lpPending.length} 筆待撥款</div>
      </div>
      <div class="big-stat">
        <div class="big-stat-label">逾期匯款</div>
        <div class="big-stat-value ${overdueTransfers.length > 0 ? 'text-red' : 'text-muted'}">${overdueTransfers.length}</div>
        <div class="big-stat-sub">${overdueTransfers.length > 0 ? '需要追蹤' : '無逾期'}</div>
      </div>
      <div class="big-stat">
        <div class="big-stat-label">今日報表</div>
        <div class="big-stat-value ${todayReport ? 'text-green' : 'text-amber'}">${todayReport ? '✅ 已填' : '⏳ 未填'}</div>
        <div class="big-stat-sub">${todayReport ? U.money((todayReport.onsite?.cash||0)+(todayReport.onsite?.taishinCC||0)+(todayReport.onsite?.taishinAP||0)+(todayReport.onsite?.linePay||0)+(todayReport.onsite?.bankTransfer||0)+(todayReport.onsite?.uber||0)) : '點擊右上角填寫'}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-header"><div class="section-title">🔔 待處理事項</div></div>
      <div class="alert-list">${alertsHtml}</div>
    </div>

    <div class="section">
      <div class="section-header">
        <div class="section-title">📋 近期報表</div>
        <button class="btn btn-ghost btn-sm" onclick="App.navigate('daily')">查看全部 ›</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>日期</th><th>當日總額</th><th>現金</th><th>信用卡/Apple Pay</th><th>LinePay</th><th>Uber</th><th></th>
          </tr></thead>
          <tbody>${recentHtml}</tbody>
        </table>
      </div>
    </div>`;
  }

  /* ═══════════════════════════════════════════
     PAGE: DAILY REPORT LIST
  ═══════════════════════════════════════════ */
  function renderDailyList() {
    const reports = D.Daily.getAll();
    const rows = reports.length ? reports.map(r => {
      const o = r.onsite || {};
      const total = (o.cash||0)+(o.taishinCC||0)+(o.taishinAP||0)+(o.linePay||0)+(o.bankTransfer||0)+(o.uber||0);
      return `<tr>
        <td><strong>${U.fmt(r.date)}</strong>${U.fmtWeekday(r.date)}</td>
        <td class="td-number text-green">${U.money(total)}</td>
        <td class="td-number">${U.money(o.cash||0)}</td>
        <td class="td-number">${U.money((o.taishinCC||0)+(o.taishinAP||0))}</td>
        <td class="td-number">${U.money(o.linePay||0)}</td>
        <td class="td-number">${U.money(o.bankTransfer||0)}</td>
        <td class="td-number">${U.money(o.uber||0)}</td>
        <td><div class="row" style="gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('daily-form','${r.date}')">✎ 編輯</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteDaily('${r.date}')">🗑</button>
        </div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty-state" style="padding:32px"><div class="empty-icon">📋</div><div class="empty-text">尚無報表</div><div class="empty-sub">點擊右上角新增今日報表</div></div></td></tr>`;

    return `
    <div class="page-header row-between">
      <div>
        <div class="page-title">📋 每日報表</div>
        <div class="page-subtitle">所有每日現場收款記錄</div>
      </div>
      <button class="btn btn-primary" onclick="App.navigate('daily-form','${U.today()}')">＋ 新增今日報表</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>日期</th><th>當日總額</th><th>現金</th><th>信用卡/Apple Pay</th><th>LinePay</th><th>匯款</th><th>Uber</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  /* ═══════════════════════════════════════════
     PAGE: DAILY FORM
  ═══════════════════════════════════════════ */
  function renderDailyForm(dateParam) {
    const date = dateParam || U.today();
    const existing = D.Daily.getByDate(date);
    const o = existing?.onsite || {};

    return `
    <div class="page-header row-between">
      <div>
        <div class="page-title">${existing ? '✎ 編輯報表' : '＋ 新增報表'}</div>
        <div class="page-subtitle">${U.fmt(date)}${U.fmtWeekday(date)}</div>
      </div>
    </div>

    <form id="daily-form" onsubmit="App.saveDailyForm(event)">
      <input type="hidden" name="date" value="${date}">

      <div class="form-section">
        <div class="form-section-title">📅 報表日期</div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">日期</label>
            <input type="date" class="form-input" name="dateInput" value="${date}" required>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">🏪 現場收款</div>
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label class="form-label">💵 現金</label>
            <div class="input-with-prefix">
              <span class="input-prefix">NT$</span>
              <input type="number" class="form-input input-money" name="cash" value="${o.cash||''}" min="0" placeholder="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">💳 台新信用卡</label>
            <div class="input-with-prefix">
              <span class="input-prefix">NT$</span>
              <input type="number" class="form-input input-money" name="taishinCC" value="${o.taishinCC||''}" min="0" placeholder="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label"> Apple Pay（台新）</label>
            <div class="input-with-prefix">
              <span class="input-prefix">NT$</span>
              <input type="number" class="form-input input-money" name="taishinAP" value="${o.taishinAP||''}" min="0" placeholder="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">💚 現場 LinePay</label>
            <div class="input-with-prefix">
              <span class="input-prefix">NT$</span>
              <input type="number" class="form-input input-money" name="linePay" value="${o.linePay||''}" min="0" placeholder="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">🏦 匯款</label>
            <div class="input-with-prefix">
              <span class="input-prefix">NT$</span>
              <input type="number" class="form-input input-money" name="bankTransfer" value="${o.bankTransfer||''}" min="0" placeholder="0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">🛵 Uber Eats 訂單金額</label>
            <div class="input-with-prefix">
              <span class="input-prefix">NT$</span>
              <input type="number" class="form-input input-money" name="uber" value="${o.uber||''}" min="0" placeholder="0">
            </div>
            <div class="form-hint">填入 Uber 後台顯示的原始訂單金額（含抽成前）</div>
          </div>
        </div>

        <div class="divider"></div>
        <div class="row-between" style="padding:4px 0">
          <span style="font-size:13px;color:var(--text2)">現場小計</span>
          <span id="onsite-total" style="font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--green)">NT$ 0</span>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">📝 備注</div>
        <div class="form-group">
          <textarea class="form-input" name="notes" rows="2" placeholder="特殊情況、說明…">${existing?.notes||''}</textarea>
        </div>
      </div>

      <div class="row-end" style="margin-top:8px">
        <button type="button" class="btn btn-ghost" onclick="App.navigate('daily')">取消</button>
        <button type="submit" class="btn btn-primary">💾 儲存報表</button>
      </div>
    </form>`;
  }

  function saveDailyForm(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const date = fd.get('dateInput') || fd.get('date');
    const onsite = {
      cash:         Number(fd.get('cash'))        || 0,
      taishinCC:    Number(fd.get('taishinCC'))   || 0,
      taishinAP:    Number(fd.get('taishinAP'))   || 0,
      linePay:      Number(fd.get('linePay'))      || 0,
      bankTransfer: Number(fd.get('bankTransfer')) || 0,
      uber:         Number(fd.get('uber'))         || 0,
    };

    D.Daily.upsert({ date, onsite, notes: fd.get('notes') || '' });

    // Auto-update LinePay payout entry (supports positive payments and negative refunds)
    if (onsite.linePay !== 0) {
      const expectedPayoutDate = U.addBusinessDays(date, C.LINEPAY_BUSINESS_DAYS);
      const existing = D.Linepay.getByDate(date);
      D.Linepay.upsert({
        date,
        amount: onsite.linePay,
        expectedPayoutDate,
        status: existing?.status || 'pending',
        actualAmount: existing?.actualAmount ?? null,
        actualDate: existing?.actualDate ?? null,
        payoutBatchId: existing?.payoutBatchId ?? null
      });
    } else {
      D.Linepay.delete(date);
    }

    // Auto-update Taishin payout entry
    const taishinTotal = onsite.taishinCC + onsite.taishinAP;
    if (taishinTotal > 0) {
      const settings = D.Settings.get();
      const expectedPayoutDate = U.addBusinessDays(date, settings.taishinPayoutDays || C.TAISHIN_BUSINESS_DAYS);
      const existing = D.Taishin.getByDate(date);
      D.Taishin.upsert({
        date,
        creditCardAmount: onsite.taishinCC,
        applePayAmount:   onsite.taishinAP,
        totalAmount:      taishinTotal,
        expectedPayoutDate,
        status: existing?.status || 'pending',
        actualAmount: existing?.actualAmount ?? null,
        actualDate: existing?.actualDate ?? null,
      });
    } else {
      D.Taishin.delete(date);
    }

    // Auto-update Uber week
    if (onsite.uber > 0) {
      D.Uber.addDayAmount(date, onsite.uber);
    }

    toast('報表已儲存', 'success');
    navigate('daily');
  }

  function deleteDaily(date) {
    if (!confirm(`確定刪除 ${U.fmt(date)} 的報表？`)) return;
    D.Daily.delete(date);
    D.Linepay.delete(date);
    D.Taishin.delete(date);
    toast('已刪除', 'info');
    navigate('daily');
  }

  /* ═══════════════════════════════════════════
     PAGE: LINEPAY ONSITE
  ═══════════════════════════════════════════ */
  function renderLinepayOnsite() {
    const payouts = D.Linepay.getAll();  // sorted desc by date
    const allBatches = D.LinepayBatches.getAll();
    const today = U.today();
    const feeRate = C.ONSITE_LINEPAY_FEE_RATE || 0.022;
    const taxRate = C.LINEPAY_TAX_RATE || 0.05;

    // Filter pending payouts. Backward compatibility: if no status, treat as pending
    const pendingPayouts = payouts.filter(p => p.status === 'pending' || !p.status);

    function calcFee(amount) {
      const rawFee = amount * feeRate;
      const fee = Math.round(rawFee);
      const tax  = Math.round(fee * taxRate);
      const feeAndTax = fee + tax;
      const payoutAmt = amount - feeAndTax;
      return { fee, tax, feeAndTax, payoutAmt };
    }

    // 1. Group pending payouts by expectedPayoutDate (N+2 工作日)
    const pendingGroups = {};
    pendingPayouts.forEach(p => {
      const payoutDate = p.expectedPayoutDate || U.addBusinessDays(p.date, C.LINEPAY_BUSINESS_DAYS);
      if (!pendingGroups[payoutDate]) pendingGroups[payoutDate] = [];
      const { feeAndTax, payoutAmt } = calcFee(p.amount || 0);
      pendingGroups[payoutDate].push({ ...p, payoutDate, feeAndTax, payoutAmt });
    });

    const sortedPendingDates = Object.keys(pendingGroups).sort((a,b) => b.localeCompare(a)); // newest first

    // 2. Summary stats
    const pendingGross = pendingPayouts.reduce((s, p) => s + (p.amount||0), 0);
    const pendingFee   = pendingPayouts.reduce((s, p) => s + calcFee(p.amount||0).feeAndTax, 0);
    const pendingPayout= pendingGross - pendingFee;
    const confirmedTotal = allBatches.reduce((s, b) => s + (b.actualNet||0), 0);
    const confirmedCount = allBatches.length;

    // Calculate total hand fee discrepancy
    const totalDiff = allBatches.reduce((s, b) => s + (b.feeAdjustment || 0), 0);

    // 3. Render pending rows
    const pendingRowsList = [];
    sortedPendingDates.forEach(payoutDate => {
      const group = pendingGroups[payoutDate];
      const groupSize = group.length;
      const combinedGross = group.reduce((s, p) => s + p.amount, 0);
      const combinedFee = group.reduce((s, p) => s + p.feeAndTax, 0);
      const combinedNet = combinedGross - combinedFee;
      const isDue = payoutDate <= today;
      const datesCsv = group.map(p => p.date).join(',');

      group.forEach((p, index) => {
        let rowHtml = `<tr>
          <td><strong>${U.fmt(p.date)}</strong>${U.fmtWeekday(p.date)}</td>
          <td class="td-number ${p.amount >= 0 ? 'text-green' : 'text-red'}">${p.amount >= 0 ? '+' : ''}${U.money(p.amount)}</td>
          <td class="td-number text-red">−${U.money(p.feeAndTax)}</td>`;

        if (index === 0) {
          rowHtml += `
          <td rowspan="${groupSize}" class="td-number text-purple" style="font-weight:700;vertical-align:middle;background:rgba(124,58,237,0.05)">
            ${U.money(combinedNet)}
            ${groupSize > 1 ? `<div style="font-size:10px;color:var(--text3);font-weight:normal">(${groupSize}日加總)</div>` : ''}
          </td>
          <td rowspan="${groupSize}" style="vertical-align:middle">
            <strong>${U.fmt(payoutDate)}</strong>${U.fmtWeekday(payoutDate)}
            ${isDue ? '<div style="margin-top:2px"><span class="badge badge-pending">應到帳</span></div>' : ''}
          </td>
          <td rowspan="${groupSize}" style="vertical-align:middle;text-align:center">
            <button class="btn btn-success btn-sm" onclick="App.confirmLinepayBatch('${payoutDate}',${combinedGross},'${datesCsv}')">確認撥款入帳</button>
          </td>`;
        }

        rowHtml += `</tr>`;
        pendingRowsList.push(rowHtml);
      });
    });

    const pendingTableBody = pendingRowsList.join('') || `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">🎉 當前無待核對之撥款項目</td></tr>`;

    // 4. Render confirmed batches
    const batchRows = [];
    allBatches.forEach(b => {
      const diff = b.feeAdjustment || 0;
      const diffHtml = diff === 0
        ? `<span class="badge badge-info">無差額</span>`
        : diff > 0
          ? `<span class="badge badge-success" title="實際手續費少扣（少付費或溢撥）">+${U.money(diff)}</span>`
          : `<span class="badge badge-danger" title="實際手續費多扣（多付費或折抵）">−${U.money(Math.abs(diff))}</span>`;

      const entityName = b.channel === 'card' ? '💳 連家網路 (信用卡)' : '📱 連家電子支付';

      batchRows.push(`<tr>
        <td><strong>${b.id.replace('lp_batch_card_', '').replace('lp_batch_account_', '')}</strong></td>
        <td><span style="font-size:12px">${entityName}</span></td>
        <td><strong>${U.fmt(b.actualDate)}</strong>${U.fmtWeekday(b.actualDate)}</td>
        <td class="td-number text-green">${U.money(b.grossAmount)}</td>
        <td class="td-number text-red">−${U.money(b.actualFee)}</td>
        <td class="td-number text-purple" style="font-weight:700">${U.money(b.expectedNet)}</td>
        <td class="td-number text-green" style="font-weight:700;background:rgba(16,185,129,0.03)">${U.money(b.actualNet)}</td>
        <td style="text-align:center">${diffHtml}</td>
        <td style="text-align:center">
          <button class="btn btn-ghost btn-sm text-red" onclick="App.deleteLinepayBatch('${b.id}')">撤銷核銷</button>
        </td>
      </tr>`);
    });

    const batchTableBody = batchRows.join('') || `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">無已核銷之批次記錄</td></tr>`;

    return `
    <div class="page-header">
      <div class="page-title">💚 現場 LinePay 對帳</div>
      <div class="page-subtitle">同一預期撥款日加總合併核對・不改變前端記帳習慣・支援雙公司撥款與手續費獨立分流</div>
    </div>

    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">待撥款總額 (日累計)</div>
        <div class="stat-value text-amber">${U.money(pendingGross)}</div>
        <div class="stat-foot">${pendingPayouts.length} 天待撥</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">預估費用</div>
        <div class="stat-value text-red">−${U.money(pendingFee)}</div>
        <div class="stat-foot">2.2% + 5% 營業稅</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">預估應入帳淨額</div>
        <div class="stat-value text-purple">${U.money(pendingPayout)}</div>
        <div class="stat-foot">預期實收總額</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已核對總入帳</div>
        <div class="stat-value text-green">${U.money(confirmedTotal)}</div>
        <div class="stat-foot">共核對 ${confirmedCount} 個分流批次</div>
      </div>
    </div>

    <div class="row-between" style="align-items:stretch;gap:14px;margin-bottom:16px">
      <div style="flex:1;font-size:12px;color:var(--text2);padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);line-height:1.6">
        📌 <strong>Line Pay 現場核銷指引：</strong><br>
        ・<strong>取消交易 (退款)</strong>：店員直接於日報表記入負數。退款會在此處的待撥日加總中自動扣抵。<br>
        ・<strong>分流核對</strong>：在點擊確認撥款入帳時，分別填入網銀收到的「連家網路」和「連家電支」入帳淨額與實際扣除手續費，系統會自動在後台存檔為兩筆獨立結算紀錄。<br>
        ・<strong>手續費與日期</strong>：手續費微小四捨五入誤差會自動歸入「手續費差額」；若銀行延期入帳，可在 Modal 中自行修改實際入帳日。
      </div>
      <div style="width:260px;min-width:240px;background:var(--bg2);border:1px solid ${totalDiff < 0 ? 'rgba(239,68,68,0.35)' : totalDiff > 0 ? 'rgba(16,185,129,0.35)' : 'var(--border)'};border-radius:var(--radius-sm);padding:14px 16px;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:12px;font-weight:600;color:var(--text2);display:flex;justify-content:space-between;align-items:center">
          <span>⚖️ 累計手續費差額</span>
          <span class="badge ${totalDiff === 0 ? 'badge-info' : totalDiff > 0 ? 'badge-success' : 'badge-danger'}">
            ${totalDiff === 0 ? '無差額' : totalDiff > 0 ? '累計溢收' : '累計溢付'}
          </span>
        </div>
        <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;margin:6px 0 2px;color:${totalDiff > 0 ? 'var(--green)' : totalDiff < 0 ? 'var(--red)' : 'var(--text)'}">
          ${totalDiff === 0 ? 'NT$ 0' : U.moneySign(totalDiff)}
        </div>
        <div style="font-size:11px;color:var(--text3);line-height:1.3">
          ${totalDiff < 0 ? '⚠️ 包含撥款四捨五入累積的多扣除額' : totalDiff > 0 ? '✨ 包含撥款四捨五入多預付補回' : '✅ 撥款手續費無累積差額'}
        </div>
      </div>
    </div>

    <!-- 待核對清單 -->
    <div class="section-title" style="margin:20px 0 8px;font-size:14px;font-weight:700">⏳ 待核對撥款 (依預計撥款日合併)</div>
    <div class="table-wrap" style="margin-bottom:28px">
      <table>
        <thead><tr>
          <th>交易日</th>
          <th>交易總額</th>
          <th>手續費+稅(估)</th>
          <th>預估合併淨額</th>
          <th>預計撥款日（N+2）</th>
          <th style="text-align:center">操作</th>
        </tr></thead>
        <tbody>${pendingTableBody}</tbody>
      </table>
    </div>

    <!-- 已核對批次 -->
    <div class="section-title" style="margin:20px 0 8px;font-size:14px;font-weight:700">✅ 已核銷之撥款批次紀錄</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>撥款批次日</th>
          <th>撥款主體</th>
          <th>實際入帳日</th>
          <th>該管道交易總額</th>
          <th>實際手續費+稅</th>
          <th>預估應收</th>
          <th>銀行實際入帳</th>
          <th style="text-align:center">手續費差額</th>
          <th style="text-align:center">操作</th>
        </tr></thead>
        <tbody>${batchTableBody}</tbody>
      </table>
    </div>
    `;
  }

  function confirmLinepayBatch(payoutDate, expectedGross, datesCsv) {
    const feeRate = C.ONSITE_LINEPAY_FEE_RATE || 0.022;
    
    // Estimates pre-filled for card (70%) and account (30%)
    const estCardGross = Math.round(expectedGross * 0.7);
    const estAccountGross = expectedGross - estCardGross;
    
    const estCardFee = Math.round(estCardGross * feeRate * 1.05);
    const estCardNet = estCardGross - estCardFee;
    
    const estAccountFee = Math.round(estAccountGross * feeRate * 1.05);
    const estAccountNet = estAccountGross - estAccountFee;

    openModal('確認現場 LinePay 撥款入帳', `
      <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--text2);line-height:1.6">
        預計撥款日：<strong style="color:var(--text)">${U.fmt(payoutDate)}${U.fmtWeekday(payoutDate)}</strong><br>
        包含交易日：<strong style="color:var(--purple-light)">${datesCsv.split(',').map(d => U.fmtShort(d)).join(', ')}</strong><br>
        預估交易總額：<strong style="color:var(--green)">${U.money(expectedGross)}</strong> (已扣除跨天退款)
      </div>
      
      <!-- 連家電支 -->
      <div style="border: 1px solid var(--border); border-radius:var(--radius-sm); padding: 12px; margin-bottom: 12px; background: rgba(16,185,129,0.02)">
        <div style="font-weight:700; font-size:12px; color:var(--green); margin-bottom:8px">📱 連家電子支付公司 (帳戶撥款)</div>
        <div class="form-grid form-grid-2">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:11px">實際入帳淨額</label>
            <div class="input-with-prefix">
              <span class="input-prefix" style="font-size:11px">NT$</span>
              <input type="number" id="lp-account-net" class="form-input form-input-sm" value="${estAccountNet}">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:11px">實際扣除手續費+稅</label>
            <div class="input-with-prefix">
              <span class="input-prefix" style="font-size:11px">NT$</span>
              <input type="number" id="lp-account-fee" class="form-input form-input-sm" value="${estAccountFee}">
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-top:8px; margin-bottom:0">
          <label class="form-label" style="font-size:11px">實際入帳日期</label>
          <input type="date" id="lp-account-date" class="form-input form-input-sm" value="${payoutDate}">
        </div>
      </div>

      <!-- 連家網路 -->
      <div style="border: 1px solid var(--border); border-radius:var(--radius-sm); padding: 12px; margin-bottom: 16px; background: rgba(59,130,246,0.02)">
        <div style="font-weight:700; font-size:12px; color:var(--blue); margin-bottom:8px">💳 連家網路公司 (信用卡撥款)</div>
        <div class="form-grid form-grid-2">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:11px">實際入帳淨額</label>
            <div class="input-with-prefix">
              <span class="input-prefix" style="font-size:11px">NT$</span>
              <input type="number" id="lp-card-net" class="form-input form-input-sm" value="${estCardNet}">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:11px">實際扣除手續費+稅</label>
            <div class="input-with-prefix">
              <span class="input-prefix" style="font-size:11px">NT$</span>
              <input type="number" id="lp-card-fee" class="form-input form-input-sm" value="${estCardFee}">
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-top:8px; margin-bottom:0">
          <label class="form-label" style="font-size:11px">實際入帳日期</label>
          <input type="date" id="lp-card-date" class="form-input form-input-sm" value="${payoutDate}">
        </div>
      </div>

      <div class="row-end">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-success" onclick="App.doConfirmLinepayBatch('${payoutDate}', ${expectedGross}, '${datesCsv}')">✅ 確認入帳</button>
      </div>`);
  }

  function doConfirmLinepayBatch(payoutDate, expectedGross, datesCsv) {
    const cardNet = Number(U.el('lp-card-net').value);
    const cardFee = Number(U.el('lp-card-fee').value);
    const cardDate = U.el('lp-card-date').value;
    
    const accountNet = Number(U.el('lp-account-net').value);
    const accountFee = Number(U.el('lp-account-fee').value);
    const accountDate = U.el('lp-account-date').value;

    if (!cardDate || !accountDate) return toast('請填入完整的入帳日期', 'error');
    if (isNaN(cardNet) || isNaN(cardFee) || isNaN(accountNet) || isNaN(accountFee)) {
      return toast('請填入有效的核銷金額', 'error');
    }

    const calculatedGross = cardNet + cardFee + accountNet + accountFee;
    const diff = Math.abs(calculatedGross - expectedGross);
    
    if (diff > 15) {
      if (!confirm(`核對總額 (NT$ ${calculatedGross}) 與預估交易總額 (NT$ ${expectedGross}) 存在 NT$ ${diff} 的差額，是否強制核銷？`)) {
        return;
      }
    }

    const cardBatchId = 'lp_batch_card_' + payoutDate;
    const accountBatchId = 'lp_batch_account_' + payoutDate;

    // 1. Create card batch
    const cardEstFee = Math.round((cardNet + cardFee) * (C.ONSITE_LINEPAY_FEE_RATE || 0.022) * 1.05);
    D.LinepayBatches.upsert({
      id: cardBatchId,
      channel: 'card',
      expectedDate: payoutDate,
      actualDate: cardDate,
      grossAmount: cardNet + cardFee,
      refundAmount: 0,
      actualFee: cardFee,
      actualTax: 0,
      expectedNet: cardNet + cardFee - cardEstFee,
      actualNet: cardNet,
      feeAdjustment: cardFee - cardEstFee,
      status: 'confirmed',
      transactionIds: datesCsv.split(',').map(d => `${d}_card`)
    });

    // 2. Create account batch
    const accountEstFee = Math.round((accountNet + accountFee) * (C.ONSITE_LINEPAY_FEE_RATE || 0.022) * 1.05);
    D.LinepayBatches.upsert({
      id: accountBatchId,
      channel: 'account',
      expectedDate: payoutDate,
      actualDate: accountDate,
      grossAmount: accountNet + accountFee,
      refundAmount: 0,
      actualFee: accountFee,
      actualTax: 0,
      expectedNet: accountNet + accountFee - accountEstFee,
      actualNet: accountNet,
      feeAdjustment: accountFee - accountEstFee,
      status: 'confirmed',
      transactionIds: datesCsv.split(',').map(d => `${d}_account`)
    });

    // 3. Mark individual days status as confirmed and store both batchIds
    const transactionDates = datesCsv.split(',');
    transactionDates.forEach(date => {
      const tx = D.Linepay.getByDate(date);
      if (tx) {
        D.Linepay.confirm(date, tx.amount, cardDate, `${cardBatchId},${accountBatchId}`);
      }
    });

    closeModal();
    toast('撥款雙渠道分流核銷成功', 'success');
    navigate('linepay-onsite');
  }

  function deleteLinepayBatch(batchId) {
    if (!confirm('確定要撤銷此撥款渠道的核銷嗎？這將會把此批次的入帳狀態重設為未核對。')) return;

    const batch = D.LinepayBatches.getById(batchId);
    if (batch) {
      const expectedDate = batch.expectedDate;
      D.LinepayBatches.delete(batchId);

      // Check if the other channel batch exists
      const otherChannel = batch.channel === 'card' ? 'account' : 'card';
      const otherBatchId = `lp_batch_${otherChannel}_${expectedDate}`;
      const otherExists = D.LinepayBatches.getById(otherBatchId) !== null;

      // If both channels are cleared, unconfirm the daily transaction
      if (!otherExists) {
        const allTx = D.Linepay.getAll();
        allTx.forEach(tx => {
          const payoutDate = tx.expectedPayoutDate || U.addBusinessDays(tx.date, C.LINEPAY_BUSINESS_DAYS);
          if (payoutDate === expectedDate) {
            D.Linepay.unconfirm(tx.date);
          }
        });
      }

      toast('已撤銷該渠道的核銷', 'info');
      navigate('linepay-onsite');
    }
  }

  // Legacy individual confirm (kept for backward-compat)
  function confirmLinepay(date, amount) { 
    confirmLinepayBatch(U.addBusinessDays(date, C.LINEPAY_BUSINESS_DAYS), amount, date); 
  }
  function doConfirmLinepay(date) { 
    const payoutDate = U.addBusinessDays(date, C.LINEPAY_BUSINESS_DAYS);
    const tx = D.Linepay.getByDate(date);
    if (tx) {
      const fee = Math.round(tx.amount * (C.ONSITE_LINEPAY_FEE_RATE || 0.022) * 1.05);
      const net = tx.amount - fee;
      
      D.LinepayBatches.upsert({
        id: 'lp_batch_card_' + payoutDate,
        channel: 'card',
        expectedDate: payoutDate,
        actualDate: payoutDate,
        grossAmount: tx.amount,
        refundAmount: 0,
        actualFee: fee,
        actualTax: 0,
        expectedNet: net,
        actualNet: net,
        feeAdjustment: 0,
        status: 'confirmed',
        transactionIds: [`${date}_card`]
      });
      D.Linepay.confirm(date, net, payoutDate, 'lp_batch_card_' + payoutDate);
    }
    toast('核對成功', 'success');
    navigate('linepay-onsite');
  }

  /* ═══════════════════════════════════════════
     PAGE: TAISHIN
  ═══════════════════════════════════════════ */
  function renderTaishin() {
    const payouts = D.Taishin.getAll();
    const today = U.today();
    const settings = D.Settings.get();

    const pending = payouts.filter(p => p.status === 'pending');
    const confirmed = payouts.filter(p => p.status === 'confirmed');
    const pendingTotal   = pending.reduce((s,p) => s + (p.totalAmount||0), 0);
    const confirmedTotal = confirmed.reduce((s,p) => s + (p.actualAmount||0), 0);

    const rows = payouts.length ? payouts.map(p => {
      const due = p.expectedPayoutDate <= today && p.status === 'pending';
      return `<tr>
        <td><strong>${U.fmt(p.date)}</strong>${U.fmtWeekday(p.date)}</td>
        <td class="td-number">${U.money(p.creditCardAmount||0)}</td>
        <td class="td-number">${U.money(p.applePayAmount||0)}</td>
        <td class="td-number text-green"><strong>${U.money(p.totalAmount||0)}</strong></td>
        <td>${U.fmt(p.expectedPayoutDate)}${U.fmtWeekday(p.expectedPayoutDate)} ${due ? '<span class="badge badge-danger" style="margin-left:6px">到期</span>' : ''}</td>
        <td>${U.statusBadge(p.status)}</td>
        <td class="td-number">${p.actualAmount != null ? U.money(p.actualAmount) : '—'}</td>
        <td>${p.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="App.confirmTaishin('${p.date}',${p.totalAmount})">確認入帳</button>` : ''}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty-state" style="padding:32px"><div class="empty-icon">💳</div><div class="empty-text">尚無台新信用卡資料</div><div class="empty-sub">請先在每日報表中輸入信用卡／Apple Pay 金額</div></div></td></tr>`;

    return `
    <div class="page-header row-between">
      <div>
        <div class="page-title">💳 台新信用卡 / Apple Pay 對帳</div>
        <div class="page-subtitle">T+${settings.taishinPayoutDays||1} 工作日撥款追蹤</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="App.openTaishinSettings()">⚙ 設定撥款天數</button>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">待撥款總額</div>
        <div class="stat-value text-amber">${U.money(pendingTotal)}</div>
        <div class="stat-foot">${pending.length} 筆</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已確認入帳</div>
        <div class="stat-value text-green">${U.money(confirmedTotal)}</div>
        <div class="stat-foot">${confirmed.length} 筆</div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>交易日</th><th>信用卡</th><th>Apple Pay</th><th>合計</th>
          <th>預計撥款日</th><th>狀態</th><th>實際入帳</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function openTaishinSettings() {
    const s = D.Settings.get();
    openModal('台新信用卡撥款設定', `
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">撥款工作天數（T+?）</label>
        <input type="number" id="ts-days" class="form-input" value="${s.taishinPayoutDays||1}" min="1" max="7">
        <div class="form-hint">依台新合約設定，通常為 T+1</div>
      </div>
      <div class="row-end">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveTaishinSettings()">儲存</button>
      </div>`);
  }

  function saveTaishinSettings() {
    const days = Number(U.el('ts-days').value);
    const s = D.Settings.get();
    s.taishinPayoutDays = days;
    D.Settings.save(s);
    closeModal();
    toast('設定已儲存', 'success');
    navigate('taishin');
  }

  function confirmTaishin(date, amount) {
    openModal('確認台新信用卡入帳', `
      <p style="color:var(--text2);font-size:13px;margin-bottom:16px">
        交易日 <strong>${U.fmt(date)}</strong>・應入帳 <strong>${U.money(amount)}</strong>
      </p>
      <div class="form-group">
        <label class="form-label">實際入帳金額</label>
        <div class="input-with-prefix">
          <span class="input-prefix">NT$</span>
          <input type="number" id="confirm-ts-amount" class="form-input input-money" value="${amount}">
        </div>
      </div>
      <div class="row-end" style="margin-top:20px">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-success" onclick="App.doConfirmTaishin('${date}')">✅ 確認入帳</button>
      </div>`);
  }

  function doConfirmTaishin(date) {
    const amount = Number(U.el('confirm-ts-amount').value);
    if (isNaN(amount)) return toast('請輸入有效金額', 'error');
    D.Taishin.confirm(date, amount);
    closeModal();
    toast('入帳已確認', 'success');
    navigate('taishin');
  }

  /* ═══════════════════════════════════════════
     PAGE: UBER EATS
  ═══════════════════════════════════════════ */
  function renderUber() {
    const weeks = D.Uber.getAll();

    const weekCards = weeks.length ? weeks.map(w => {
      const dailyRows = w.dailyOrders.sort((a,b) => a.date.localeCompare(b.date))
        .map(d => `<tr><td>${U.fmt(d.date)}${U.fmtWeekday(d.date)}</td><td class="td-number td-right">${U.money(d.amount)}</td></tr>`).join('');

      const commissionAmt = Math.round(w.totalOrderAmount * (w.commissionRate || C.UBER_DEFAULT_COMMISSION));
      const estimatedPayout = w.totalOrderAmount - commissionAmt;

      return `
      <div class="week-card">
        <div class="week-header">
          <div>
            <div class="week-title">${U.fmtWeek(w.weekStart, w.weekEnd)}</div>
            <div class="week-range" style="margin-top:2px">${U.fmtWeekday(w.weekStart).replace('（','').replace('）','')} 一 ～ 日</div>
          </div>
          <div class="row" style="gap:8px">
            ${U.statusBadge(w.status)}
            ${w.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="App.confirmUber('${w.id}',${w.totalOrderAmount},${w.commissionRate||C.UBER_DEFAULT_COMMISSION})">確認撥款</button>` : ''}
            <button class="btn btn-danger btn-sm btn-icon" onclick="App.deleteUberWeek('${w.id}')">🗑</button>
          </div>
        </div>
        <div class="week-stats">
          <div class="week-stat">
            <div class="week-stat-label">訂單總額</div>
            <div class="week-stat-value text-green">${U.money(w.totalOrderAmount)}</div>
          </div>
          <div class="week-stat">
            <div class="week-stat-label">Uber 抽成（${Math.round((w.commissionRate||C.UBER_DEFAULT_COMMISSION)*100)}%）</div>
            <div class="week-stat-value text-red">−${U.money(commissionAmt)}</div>
          </div>
          <div class="week-stat">
            <div class="week-stat-label">預估實收</div>
            <div class="week-stat-value text-amber">${U.money(estimatedPayout)}</div>
          </div>
          ${w.actualPayout != null ? `<div class="week-stat">
            <div class="week-stat-label">實際撥款</div>
            <div class="week-stat-value text-green">${U.money(w.actualPayout)}</div>
          </div>` : ''}
          ${w.actualPayout != null ? `<div class="week-stat">
            <div class="week-stat-label">差異</div>
            <div class="week-stat-value ${w.actualPayout-estimatedPayout >= 0 ? 'text-green' : 'text-red'}">${U.moneySign(w.actualPayout-estimatedPayout)}</div>
          </div>` : ''}
        </div>
        ${w.notes ? `<div style="font-size:12px;color:var(--text2);margin-bottom:12px">📝 ${w.notes}</div>` : ''}
        <details style="margin-top:4px">
          <summary style="font-size:12px;color:var(--text3);cursor:pointer;user-select:none">每日明細</summary>
          <div class="table-wrap" style="margin-top:8px">
            <table style="width:auto">
              <thead><tr><th>日期</th><th>訂單金額</th></tr></thead>
              <tbody>${dailyRows || '<tr><td colspan="2" style="color:var(--text3);text-align:center;padding:12px">無明細</td></tr>'}</tbody>
            </table>
          </div>
        </details>
      </div>`;
    }).join('') : `<div class="empty-state" style="padding:48px"><div class="empty-icon">🛵</div><div class="empty-text">尚無 Uber Eats 資料</div><div class="empty-sub">在每日報表輸入 Uber 訂單金額後自動出現</div></div>`;

    return `
    <div class="page-header">
      <div class="page-title">🛵 Uber Eats 對帳</div>
      <div class="page-subtitle">週結撥款追蹤（預設抽成 32%，活動期間可手動調整）</div>
    </div>
    ${weekCards}`;
  }

  function confirmUber(id, totalAmount, currentRate) {
    openModal('確認 Uber Eats 週結撥款', `
      <div class="form-grid" style="gap:14px">
        <div class="form-group">
          <label class="form-label">本週 Uber 抽成比例（%）</label>
          <input type="number" id="uber-rate" class="form-input" value="${Math.round(currentRate*100)}" min="1" max="99" step="1">
          <div class="form-hint">一般為 32%，買一送一活動期間可能不同</div>
        </div>
        <div class="form-group">
          <label class="form-label">Uber 實際撥款金額</label>
          <div class="input-with-prefix">
            <span class="input-prefix">NT$</span>
            <input type="number" id="uber-actual" class="form-input input-money" placeholder="實際撥款金額">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">撥款日期</label>
          <input type="date" id="uber-payout-date" class="form-input" value="${U.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">備注（選填）</label>
          <input type="text" id="uber-notes" class="form-input" placeholder="例：買一送一活動週">
        </div>
      </div>
      <div class="row-end" style="margin-top:20px">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-success" onclick="App.doConfirmUber('${id}',${totalAmount})">✅ 確認撥款</button>
      </div>`);
  }

  function doConfirmUber(id, totalAmount) {
    const rate   = Number(U.el('uber-rate').value) / 100;
    const actual = Number(U.el('uber-actual').value);
    const date   = U.el('uber-payout-date').value;
    const notes  = U.el('uber-notes').value;
    if (isNaN(actual) || actual <= 0) return toast('請輸入有效撥款金額', 'error');
    D.Uber.confirmPayout(id, actual, date, rate, notes);
    closeModal();
    toast('Uber 撥款已確認', 'success');
    navigate('uber');
  }

  function deleteUberWeek(id) {
    if (!confirm('確定刪除此週 Uber 資料？')) return;
    D.Uber.delete(id);
    toast('已刪除', 'info');
    navigate('uber');
  }

  /* ═══════════════════════════════════════════
     PAGE: CASH DAILY CLOSE
  ═══════════════════════════════════════════ */
  function renderCash() {
    const closes = D.Cash.getAll();
    const reports = D.Daily.getAll();

    const rows = closes.length ? closes.map(c => {
      const diff = (c.actualCash||0) - (c.reportedCash||0);
      const diffClass = diff > 0 ? 'text-green' : diff < 0 ? 'text-red' : 'text-muted';
      return `<tr>
        <td><strong>${U.fmt(c.date)}</strong>${U.fmtWeekday(c.date)}</td>
        <td class="td-number">${U.money(c.reportedCash)}</td>
        <td class="td-number">${U.money(c.actualCash)}</td>
        <td class="td-number ${diffClass}"><strong>${diff >= 0 ? '+' : ''}${U.money(diff)}</strong></td>
        <td class="td-muted">${c.notes || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="App.deleteCash('${c.date}')">🗑</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="6"><div class="empty-state" style="padding:32px"><div class="empty-icon">💵</div><div class="empty-text">尚無現金日結記錄</div></div></td></tr>`;

    // Date picker for adding close
    return `
    <div class="page-header row-between">
      <div>
        <div class="page-title">💵 現金日結</div>
        <div class="page-subtitle">每日打烊前點算現金，核對帳面金額</div>
      </div>
      <button class="btn btn-primary" onclick="App.openCashClose()">＋ 新增日結</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>日期</th>
          <th>帳面現金（報表）</th>
          <th>實際點算</th>
          <th>差異</th>
          <th>備注</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function openCashClose() {
    const today = U.today();
    const report = D.Daily.getByDate(today);
    const reportedCash = report?.onsite?.cash || 0;
    openModal('新增現金日結', `
      <div class="form-grid" style="gap:14px">
        <div class="form-group">
          <label class="form-label">日期</label>
          <input type="date" id="cc-date" class="form-input" value="${today}" onchange="App.loadCashReported()">
        </div>
        <div class="form-group">
          <label class="form-label">帳面現金（從報表自動帶入）</label>
          <div class="input-with-prefix">
            <span class="input-prefix">NT$</span>
            <input type="number" id="cc-reported" class="form-input input-money" value="${reportedCash}" readonly style="opacity:0.7">
          </div>
          <div class="form-hint">來自當日每日報表的現金欄位</div>
        </div>
        <div class="form-group">
          <label class="form-label">實際點算金額</label>
          <div class="input-with-prefix">
            <span class="input-prefix">NT$</span>
            <input type="number" id="cc-actual" class="form-input input-money" placeholder="0">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">備注</label>
          <input type="text" id="cc-notes" class="form-input" placeholder="說明差異原因…">
        </div>
      </div>
      <div class="row-end" style="margin-top:20px">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveCashClose()">💾 儲存</button>
      </div>`);
  }

  function loadCashReported() {
    const date = U.el('cc-date')?.value;
    if (!date) return;
    const report = D.Daily.getByDate(date);
    const reported = U.el('cc-reported');
    if (reported) reported.value = report?.onsite?.cash || 0;
  }

  function saveCashClose() {
    const date     = U.el('cc-date').value;
    const reported = Number(U.el('cc-reported').value) || 0;
    const actual   = Number(U.el('cc-actual').value)   || 0;
    const notes    = U.el('cc-notes').value;
    D.Cash.upsert({ date, reportedCash: reported, actualCash: actual, difference: actual - reported, notes });
    closeModal();
    toast('現金日結已儲存', 'success');
    navigate('cash');
  }

  function deleteCash(date) {
    if (!confirm(`確定刪除 ${U.fmt(date)} 的現金日結？`)) return;
    D.Cash.delete(date);
    toast('已刪除', 'info');
    navigate('cash');
  }

  /* ═══════════════════════════════════════════
     PAGE: BANK TRANSFER
  ═══════════════════════════════════════════ */
  function renderTransfer() {
    D.Transfer.refreshStatus();
    const transfers = D.Transfer.getAll();
    const pending  = transfers.filter(t => t.status === 'pending');
    const overdue  = transfers.filter(t => t.status === 'overdue');
    const received = transfers.filter(t => t.status === 'received');

    const pendingTotal  = pending.reduce((s,t) => s + (t.expectedAmount||0), 0);
    const overdueTotal  = overdue.reduce((s,t) => s + (t.expectedAmount||0), 0);
    const receivedTotal = received.reduce((s,t) => s + (t.actualAmount||0), 0);

    const rows = transfers.length ? transfers.map(t => {
      const statusClass = t.status === 'overdue' ? 'text-red' : t.status === 'received' ? 'text-muted' : '';
      return `<tr class="${statusClass}">
        <td><strong>${t.description || '—'}</strong></td>
        <td class="td-number">${U.money(t.expectedAmount)}</td>
        <td>${U.fmt(t.expectedDate)}</td>
        <td>${U.statusBadge(t.status)}</td>
        <td class="td-number">${t.actualAmount != null ? U.money(t.actualAmount) : '—'}</td>
        <td>${t.actualDate ? U.fmt(t.actualDate) : '—'}</td>
        <td class="td-muted" style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${t.notes||'—'}</td>
        <td><div class="row" style="gap:6px">
          ${t.status !== 'received' ? `<button class="btn btn-success btn-sm" onclick="App.confirmTransfer('${t.id}',${t.expectedAmount})">確認到帳</button>` : ''}
          <button class="btn btn-danger btn-sm btn-icon" onclick="App.deleteTransfer('${t.id}')">🗑</button>
        </div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty-state" style="padding:32px"><div class="empty-icon">🏦</div><div class="empty-text">尚無匯款追蹤記錄</div></div></td></tr>`;

    return `
    <div class="page-header row-between">
      <div>
        <div class="page-title">🏦 匯款追蹤</div>
        <div class="page-subtitle">追蹤待收的銀行匯款，逾期自動標紅</div>
      </div>
      <button class="btn btn-primary" onclick="App.openAddTransfer()">＋ 新增匯款</button>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">待收</div>
        <div class="stat-value text-amber">${U.money(pendingTotal)}</div>
        <div class="stat-foot">${pending.length} 筆</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">逾期未收</div>
        <div class="stat-value ${overdue.length > 0 ? 'text-red' : 'text-muted'}">${U.money(overdueTotal)}</div>
        <div class="stat-foot">${overdue.length} 筆</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已收到</div>
        <div class="stat-value text-green">${U.money(receivedTotal)}</div>
        <div class="stat-foot">${received.length} 筆</div>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>說明</th><th>預計金額</th><th>預計到帳日</th><th>狀態</th><th>實際金額</th><th>實際到帳</th><th>備注</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function openAddTransfer() {
    openModal('新增匯款追蹤', `
      <div class="form-grid" style="gap:14px">
        <div class="form-group">
          <label class="form-label">說明（客戶／訂單）</label>
          <input type="text" id="tr-desc" class="form-input" placeholder="例：客戶A 訂單 #1234">
        </div>
        <div class="form-group">
          <label class="form-label">預計金額</label>
          <div class="input-with-prefix">
            <span class="input-prefix">NT$</span>
            <input type="number" id="tr-amount" class="form-input input-money" placeholder="0">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">預計到帳日</label>
          <input type="date" id="tr-date" class="form-input" value="${U.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">備注（選填）</label>
          <input type="text" id="tr-notes" class="form-input" placeholder="">
        </div>
      </div>
      <div class="row-end" style="margin-top:20px">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-primary" onclick="App.saveTransfer()">儲存</button>
      </div>`);
  }

  function saveTransfer() {
    const desc   = U.el('tr-desc').value.trim();
    const amount = Number(U.el('tr-amount').value);
    const date   = U.el('tr-date').value;
    const notes  = U.el('tr-notes').value;
    if (!desc) return toast('請輸入說明', 'error');
    if (!amount) return toast('請輸入金額', 'error');
    D.Transfer.add({ description: desc, expectedAmount: amount, expectedDate: date, notes });
    closeModal();
    toast('匯款已新增', 'success');
    navigate('transfer');
  }

  function confirmTransfer(id, expectedAmount) {
    openModal('確認匯款到帳', `
      <div class="form-grid" style="gap:14px">
        <div class="form-group">
          <label class="form-label">實際到帳金額</label>
          <div class="input-with-prefix">
            <span class="input-prefix">NT$</span>
            <input type="number" id="tr-actual" class="form-input input-money" value="${expectedAmount}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">到帳日期</label>
          <input type="date" id="tr-actual-date" class="form-input" value="${U.today()}">
        </div>
      </div>
      <div class="row-end" style="margin-top:20px">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-success" onclick="App.doConfirmTransfer('${id}')">✅ 確認到帳</button>
      </div>`);
  }

  function doConfirmTransfer(id) {
    const amount = Number(U.el('tr-actual').value);
    const date   = U.el('tr-actual-date').value;
    D.Transfer.confirm(id, amount, date);
    closeModal();
    toast('匯款已確認到帳', 'success');
    navigate('transfer');
  }

  function deleteTransfer(id) {
    if (!confirm('確定刪除此匯款追蹤？')) return;
    D.Transfer.delete(id);
    toast('已刪除', 'info');
    navigate('transfer');
  }

  /* ═══════════════════════════════════════════
     PAGE: CYBERBIZ OVERVIEW
  ═══════════════════════════════════════════ */
  function renderCyberbiz() {
    const periods = D.Cyberbiz.getAll();

    const periodRows = periods.length ? periods.map(p => {
      const lp = p.linePay || {};
      const cp = p.cyberPayments || {};
      const coins = p.cyberCoins || {};
      return `<tr>
        <td><strong>${U.fmt(p.periodStart)} ～ ${U.fmt(p.periodEnd)}</strong></td>
        <td class="td-number">${U.money(lp.total||0)}</td>
        <td class="td-number">${U.money(cp.total||0)}</td>
        <td class="td-number text-red">−${U.money((lp.maintenanceFee||0)+(cp.txFee||0)+(cp.maintenanceFee||0))}</td>
        <td class="td-number text-red">−${U.money(coins.total||0)}</td>
        <td class="td-number text-green"><strong>${U.money(p.summaryPayout||0)}</strong></td>
        <td>${U.statusBadge(p.payoutStatus||'pending')}</td>
        <td class="td-number">${p.actualPayout != null ? U.money(p.actualPayout) : '—'}</td>
        <td><div class="row" style="gap:6px">
          ${p.payoutStatus !== 'received' ? `<button class="btn btn-success btn-sm" onclick="App.confirmCyberbizPayout('${p.id}',${p.summaryPayout||0})">確認撥款</button>` : ''}
          <button class="btn btn-danger btn-sm btn-icon" onclick="App.deleteCyberbiz('${p.id}')">🗑</button>
        </div></td>
      </tr>`;
    }).join('') : '';

    return `
    <div class="page-header">
      <div class="page-title">🌐 CyberBiz 官網對帳總覽</div>
      <div class="page-subtitle">每月兩次（15號、月底）上傳 CyberBiz 對帳 Excel</div>
    </div>

    <div class="section">
      <div class="upload-area" id="cb-upload-area" onclick="document.getElementById('cb-file-input').click()"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="App.handleCyberbizDrop(event)">
        <div class="upload-icon">📂</div>
        <div class="upload-label">點此選擇或拖曳上傳 CyberBiz 對帳 Excel (.xlsx)</div>
        <div class="upload-hint">如已修訂對帳規則，請重新選擇檔案上傳以套用最新計算</div>
      </div>
      <input type="file" id="cb-file-input" accept=".xlsx,.xls" style="display:none" onchange="App.handleCyberbizUpload(event)">
    </div>

    ${periods.length ? `
    <div class="section">
      <div class="section-header">
        <div class="section-title">歷史對帳期間</div>
        <button class="btn btn-warning btn-sm" onclick="App.clearCyberbizData()">🔄 清除舊紀錄並重新上傳</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>對帳期間</th><th>LinePay</th><th>信用卡/Apple Pay</th><th>手續費合計</th><th>Cyber幣</th><th>撥款金額</th><th>狀態</th><th>實際入帳</th><th></th>
          </tr></thead>
          <tbody>${periodRows}</tbody>
        </table>
      </div>
    </div>` : ''}`;
  }

  function handleCyberbizDrop(e) {
    e.preventDefault();
    U.el('cb-upload-area').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processCyberbizFile(file);
  }

  function handleCyberbizUpload(e) {
    const file = e.target.files[0];
    if (file) processCyberbizFile(file);
    e.target.value = '';
  }

  function processCyberbizFile(file) {
    if (!window.XLSX) return toast('XLSX 函式庫未載入', 'error');
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const parsed = U.parseCyberbizExcel(wb);

        if (!parsed.periodStart || !parsed.periodEnd) {
          toast('無法識別對帳期間，請確認檔案格式', 'error');
          return;
        }

        const id = 'cb_' + parsed.periodStart + '_' + parsed.periodEnd;
        D.Cyberbiz.upsert({
          id,
          periodStart:    parsed.periodStart,
          periodEnd:      parsed.periodEnd,
          uploadDate:     U.today(),
          linePay:        parsed.linePay,
          cyberPayments:  parsed.cyberPayments,
          cyberCoins:     parsed.cyberCoins,
          summaryPayout:  parsed.summaryPayout,
          rawSummary:     parsed.rawSummary,
          payoutStatus:   'pending',
          actualPayout:   null,
          actualPayoutDate: null,
        });

        toast(`已匯入 ${U.fmt(parsed.periodStart)} ～ ${U.fmt(parsed.periodEnd)} 對帳資料`, 'success');
        navigate('cyberbiz');
      } catch (err) {
        console.error(err);
        toast('解析失敗：' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function confirmCyberbizPayout(id, amount) {
    openModal('確認 CyberBiz 撥款', `
      <div class="form-grid" style="gap:14px">
        <div class="form-group">
          <label class="form-label">實際撥款金額</label>
          <div class="input-with-prefix">
            <span class="input-prefix">NT$</span>
            <input type="number" id="cb-actual" class="form-input input-money" value="${amount}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">撥款日期</label>
          <input type="date" id="cb-payout-date" class="form-input" value="${U.today()}">
        </div>
      </div>
      <div class="row-end" style="margin-top:20px">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-success" onclick="App.doConfirmCyberbiz('${id}')">✅ 確認</button>
      </div>`);
  }

  function doConfirmCyberbiz(id) {
    const amount = Number(U.el('cb-actual').value);
    const date   = U.el('cb-payout-date').value;
    D.Cyberbiz.confirmPayout(id, amount, date);
    closeModal();
    toast('CyberBiz 撥款已確認', 'success');
    navigate('cyberbiz');
  }

  function deleteCyberbiz(id) {
    if (!confirm('確定刪除此期對帳資料？')) return;
    D.Cyberbiz.delete(id);
    toast('已刪除', 'info');
    navigate('cyberbiz');
  }

  function clearCyberbizData() {
    if (!confirm('確定清除歷史 CyberBiz 解析紀錄？清除後只需重新點擊上傳 Excel 檔案即可套用最新計算。')) return;
    localStorage.removeItem(C.KEYS.CYBERBIZ);
    toast('已清除舊紀錄，請重新選擇 Excel 檔案上傳', 'info');
    navigate('cyberbiz');
  }

  /* ═══════════════════════════════════════════
     PAGE: CYBERBIZ LINEPAY (dedicated)
  ═══════════════════════════════════════════ */
  function renderCyberbizLinepay() {
    const periods = D.Cyberbiz.getAll();

    if (!periods.length) {
      return `
      <div class="page-header">
        <div class="page-title">💚 官網 LinePay 對帳</div>
        <div class="page-subtitle">N+2 撥款追蹤・LinePay 手續費於撥款時扣除・系統維護費另見 CyberBiz 月結帳單</div>
      </div>
      <div class="empty-state" style="padding:60px">
        <div class="empty-icon">📂</div>
        <div class="empty-text">請先上傳 CyberBiz 對帳 Excel</div>
        <div class="empty-sub" style="margin-top:10px">
          <button class="btn btn-primary btn-sm" onclick="App.navigate('cyberbiz')">前往上傳 ›</button>
        </div>
      </div>`;
    }

    const all = periods.map(p => {
      const lp = p.linePay || {};
      const daily = lp.daily || {};
      const sortedDays = Object.keys(daily).sort();

      // 1. Group days by payoutDate
      const payoutGroups = {};
      sortedDays.forEach(date => {
        const d = daily[date];
        const grossTotal    = d.grossTotal || d.amount || 0;
        const canceledAmt   = d.canceledAmount || 0;
        const systemAmt     = d.systemAmount !== undefined ? d.systemAmount : (grossTotal - canceledAmt);
        const uncanceledAmt = d.uncanceledAmount !== undefined ? d.uncanceledAmount : (d.payoutAmount || grossTotal);
        const feeAndTax     = d.lpTotalFee !== undefined ? d.lpTotalFee : Math.round(uncanceledAmt * 0.0294);
        const payoutAmt     = Math.max(0, uncanceledAmt - feeAndTax);
        const payoutDate    = U.addBusinessDays(date, C.LINEPAY_BUSINESS_DAYS);

        if (!payoutGroups[payoutDate]) {
          payoutGroups[payoutDate] = [];
        }
        payoutGroups[payoutDate].push({
          date,
          count: d.count || 0,
          grossTotal,
          canceledAmt,
          systemAmt,
          uncanceledAmt,
          feeAndTax,
          payoutAmt
        });
      });

      // 2. Calculate cumulative payout difference across confirmed batches in this period
      let periodTotalDiff = 0;
      let confirmedCount = 0;
      const sortedPayoutDates = Object.keys(payoutGroups).sort();
      const today = U.today();

      sortedPayoutDates.forEach(payoutDate => {
        const group = payoutGroups[payoutDate];
        const combinedPayout = group.reduce((sum, item) => sum + item.payoutAmt, 0);
        const key = 'cb_lp_payout_' + payoutDate;
        const cbLpData = JSON.parse(localStorage.getItem(key) || 'null');
        if (cbLpData && cbLpData.actual != null) {
          periodTotalDiff += (cbLpData.actual - combinedPayout);
          confirmedCount++;
        }
      });

      // 3. Render table rows with merged cells for same payoutDate
      const dayRowsList = [];

      sortedPayoutDates.forEach(payoutDate => {
        const group = payoutGroups[payoutDate];
        const groupSize = group.length;
        const combinedPayout = group.reduce((sum, item) => sum + item.payoutAmt, 0);
        const isDue = payoutDate <= today;

        const datesText = group.map(g => `${U.fmtShort(g.date)}${U.fmtWeekday(g.date)}`).join(', ');

        const key = 'cb_lp_payout_' + payoutDate;
        const cbLpData = JSON.parse(localStorage.getItem(key) || 'null');
        const status = cbLpData ? 'confirmed' : 'pending';

        group.forEach((item, index) => {
          let rowHtml = `<tr>
            <td><strong>${U.fmt(item.date)}</strong>${U.fmtWeekday(item.date)}</td>
            <td class="td-number">${item.count} 筆</td>
            <td class="td-number text-green">${U.money(item.grossTotal)}</td>
            <td class="td-number ${item.canceledAmt > 0 ? 'text-red' : 'td-muted'}">${item.canceledAmt > 0 ? '−' + U.money(item.canceledAmt) : 'NT$ 0'}</td>
            <td class="td-number">${U.money(item.systemAmt)}</td>
            <td class="td-number text-red" title="包含 2.8% 手續費及 5% 營業稅">−${U.money(item.feeAndTax)}</td>`;

          // Merged columns for the same Payout Date
          if (index === 0) {
            const batchDiff = cbLpData ? (cbLpData.actual - combinedPayout) : null;
            const diffHtml = batchDiff !== null
              ? (batchDiff === 0
                  ? `<span class="badge badge-info">無差額</span>`
                  : batchDiff > 0
                    ? `<span class="badge badge-success" title="實際多到帳（溢撥/補回）">+${U.money(batchDiff)} (溢撥)</span>`
                    : `<span class="badge badge-danger" title="實際少到帳（負數沖銷抵扣）">−${U.money(Math.abs(batchDiff))} (沖銷)</span>`)
              : '—';

            rowHtml += `
            <td rowspan="${groupSize}" class="td-number text-purple" style="font-weight:700;vertical-align:middle;background:rgba(124,58,237,0.05)">
              ${U.money(combinedPayout)}
              ${groupSize > 1 ? `<div style="font-size:10px;color:var(--text3);font-weight:normal">(${groupSize}日加總)</div>` : ''}
            </td>
            <td rowspan="${groupSize}" style="vertical-align:middle">
              <strong>${U.fmt(payoutDate)}</strong>${U.fmtWeekday(payoutDate)}
              ${isDue && status==='pending' ? '<div style="margin-top:2px"><span class="badge badge-pending">應到帳</span></div>' : ''}
            </td>
            <td rowspan="${groupSize}" style="vertical-align:middle">${U.statusBadge(status)}</td>
            <td rowspan="${groupSize}" class="td-number" style="vertical-align:middle">${cbLpData ? U.money(cbLpData.actual) : '—'}</td>
            <td rowspan="${groupSize}" style="vertical-align:middle;text-align:center">${diffHtml}</td>
            <td rowspan="${groupSize}" style="vertical-align:middle">
              ${status !== 'confirmed' ? `<button class="btn btn-success btn-sm" onclick="App.confirmCbLinepay('${payoutDate}',${combinedPayout},'${datesText}')">確認撥款入帳</button>` : ''}
            </td>`;
          }

          rowHtml += `</tr>`;
          dayRowsList.push(rowHtml);
        });
      });

      const dayRows = dayRowsList.join('');

      return `
      <div class="week-card" style="margin-bottom:20px">
        <div class="week-header">
          <div>
            <div class="week-title">📅 ${U.fmt(p.periodStart)} ～ ${U.fmt(p.periodEnd)}</div>
          </div>
          ${U.statusBadge(p.payoutStatus || 'pending')}
        </div>

        <div class="row-between" style="align-items:stretch;gap:14px;margin-bottom:16px">
          <div style="flex:1;font-size:12px;color:var(--text2);padding:12px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);line-height:1.6">
            📌 <strong>指標與跨期沖銷說明：</strong><br>
            ・<strong>負數沖銷機制</strong>：當日取消金額大於交易額時，負數餘額會由 LinePay 於後續撥款中扣除抵扣（產生撥款差額）。<br>
            ・<strong>同日撥款加總合併</strong>：五六日統一於週二撥款，【預估撥款金額】自動加總併欄核對。<br>
            ・<strong style="color:var(--green)">總交易額</strong>：原始付款總額 ｜ <strong style="color:var(--red)">已取消金額</strong>：當天入帳之退款總額
          </div>

          <div style="width:260px;min-width:240px;background:var(--bg2);border:1px solid ${periodTotalDiff < 0 ? 'rgba(239,68,68,0.35)' : periodTotalDiff > 0 ? 'rgba(16,185,129,0.35)' : 'var(--border)'};border-radius:var(--radius-sm);padding:14px 16px;display:flex;flex-direction:column;justify-content:center">
            <div style="font-size:12px;font-weight:600;color:var(--text2);display:flex;justify-content:space-between;align-items:center">
              <span>⚖️ 當下撥款差額 / 沖銷餘額</span>
              <span class="badge ${periodTotalDiff === 0 ? 'badge-info' : periodTotalDiff > 0 ? 'badge-success' : 'badge-danger'}">
                ${periodTotalDiff === 0 ? '無差額' : periodTotalDiff > 0 ? '溢撥/補回' : '沖銷抵扣中'}
              </span>
            </div>
            <div style="font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;margin:6px 0 2px;color:${periodTotalDiff > 0 ? 'var(--green)' : periodTotalDiff < 0 ? 'var(--red)' : 'var(--text)'}">
              ${periodTotalDiff === 0 ? 'NT$ 0' : U.moneySign(periodTotalDiff)}
            </div>
            <div style="font-size:11px;color:var(--text3);line-height:1.3">
              ${periodTotalDiff < 0 ? '⚠️ 包含負數沖銷抵扣 / 實際少到帳' : periodTotalDiff > 0 ? '✨ 包含多預付或前期沖銷補回' : '✅ 撥款無差額或尚未確認入帳'}
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>入帳日期</th>
              <th>筆數</th>
              <th>總交易額</th>
              <th>已取消金額</th>
              <th>當日系統金額</th>
              <th>預估手續費+稅</th>
              <th>合併撥款金額</th>
              <th>預計撥款日(N+2)</th>
              <th>狀態</th>
              <th>實際入帳</th>
              <th>撥款差額</th>
              <th></th>
            </tr></thead>
            <tbody>${dayRows || '<tr><td colspan="12" style="text-align:center;padding:20px;color:var(--text3)">無資料</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    }).join('');

    return `
    <div class="page-header">
      <div class="page-title">💚 官網 LinePay 對帳</div>
      <div class="page-subtitle">同一撥款日自動加總合併核對・N+2 工作日撥款</div>
    </div>
    ${all}`;
  }

  function confirmCbLinepay(payoutDate, expectedAmount, datesText) {
    openModal('確認官網 LinePay 撥款入帳', `
      <div style="background:var(--bg3);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--text2);line-height:1.6">
        預計撥款日：<strong style="color:var(--text)">${U.fmt(payoutDate)}${U.fmtWeekday(payoutDate)}</strong><br>
        包含入帳日：<strong style="color:var(--purple-light)">${datesText}</strong><br>
        預估撥款總額：<strong style="color:var(--green)">${U.money(expectedAmount)}</strong>
      </div>
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">LinePay 實際撥款金額（銀行入帳金額）</label>
        <div class="input-with-prefix">
          <span class="input-prefix">NT$</span>
          <input type="number" id="cb-lp-actual" class="form-input input-money" value="${expectedAmount}">
        </div>
        <div class="form-hint">請依銀行網路銀行或存摺實際入帳金額填入</div>
      </div>
      <div class="row-end">
        <button class="btn btn-ghost" onclick="App.closeModal()">取消</button>
        <button class="btn btn-success" onclick="App.doConfirmCbLinepay('${payoutDate}')">✅ 確認入帳</button>
      </div>`);
  }

  function doConfirmCbLinepay(payoutDate) {
    const actual = Number(U.el('cb-lp-actual').value);
    if (isNaN(actual)) return toast('請輸入有效金額', 'error');
    localStorage.setItem('cb_lp_payout_' + payoutDate, JSON.stringify({ actual, confirmedAt: new Date().toISOString() }));
    closeModal();
    toast('官網 LinePay 撥款已確認入帳', 'success');
    navigate('cyberbiz-linepay');
  }

  /* ═══════════════════════════════════════════
     PAGE: CYBERBIZ PAYMENTS (credit/apple)
  ═══════════════════════════════════════════ */
  function renderCyberbizPayments() {
    const periods = D.Cyberbiz.getAll();

    if (!periods.length) {
      return `
      <div class="page-header">
        <div class="page-title">💳 官網信用卡 / Apple Pay 對帳</div>
      </div>
      <div class="empty-state" style="padding:60px">
        <div class="empty-icon">📂</div><div class="empty-text">請先上傳 CyberBiz 對帳 Excel</div>
        <div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="App.navigate('cyberbiz')">前往上傳 ›</button></div>
      </div>`;
    }

    const periodSections = periods.map(p => {
      const cp = p.cyberPayments || {};
      const breakdown = cp.breakdown || {};

      const breakdownRows = Object.entries(breakdown).map(([method, data]) => {
        const name = method.replace('CYBERBIZ PAYMENTS ','');
        const netAmt = (data.total||0) - (data.txFee||0) - (data.maintenanceFee||0);
        return `
        <tr>
          <td><strong>${name}</strong> ${data.refundCount > 0 ? `<span class="badge badge-info" style="font-size:10px;margin-left:4px">含 ${data.refundCount} 筆退款沖銷</span>` : ''}</td>
          <td class="td-number">${data.count || 0} 筆</td>
          <td class="td-number text-green">${U.money(data.total||0)}</td>
          <td class="td-number text-red">−${U.money1(data.txFee||0)}</td>
          <td class="td-number text-red">−${U.money1(data.maintenanceFee||0)}</td>
          <td class="td-number" style="font-weight:700">${U.money1(netAmt)}</td>
        </tr>`;
      }).join('');

      const totalFee = (cp.txFee||0) + (cp.maintenanceFee||0);
      const netPayout = (cp.total||0) - totalFee;

      return `
      <div class="week-card" style="margin-bottom:20px">
        <div class="week-header">
          <div class="week-title">📅 ${U.fmt(p.periodStart)} ～ ${U.fmt(p.periodEnd)}</div>
          ${U.statusBadge(p.payoutStatus || 'pending')}
        </div>

        <div class="week-stats" style="margin-bottom:16px">
          <div class="week-stat">
            <div class="week-stat-label">代收淨額</div>
            <div class="week-stat-value text-green">${U.money(cp.total||0)}</div>
          </div>
          <div class="week-stat">
            <div class="week-stat-label">金流手續費 (1.8%)</div>
            <div class="week-stat-value text-red">−${U.money1(cp.txFee||0)}</div>
          </div>
          <div class="week-stat">
            <div class="week-stat-label">系統維護費 (1%)</div>
            <div class="week-stat-value text-red">−${U.money1(cp.maintenanceFee||0)}</div>
          </div>
          <div class="week-stat">
            <div class="week-stat-label">本期淨撥款</div>
            <div class="week-stat-value text-purple">${U.money1(netPayout)}</div>
          </div>
          <div class="week-stat">
            <div class="week-stat-label">CyberBiz 總表撥款額</div>
            <div class="week-stat-value text-green">${U.money(p.summaryPayout||0)}</div>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>付款方式</th><th>筆數</th><th>交易金額</th><th>金流手續費</th><th>系統維護費</th><th>實到淨額</th>
            </tr></thead>
            <tbody>${breakdownRows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3)">無資料</td></tr>'}</tbody>
          </table>
        </div>

        ${p.payoutStatus !== 'received' ? `
        <div class="row-end" style="margin-top:14px">
          <button class="btn btn-success btn-sm" onclick="App.confirmCyberbizPayout('${p.id}',${p.summaryPayout||0})">✅ 確認 CyberBiz 撥款到帳</button>
        </div>` : `
        <div style="font-size:12px;color:var(--green);margin-top:12px">✅ 已於 ${U.fmt(p.actualPayoutDate)} 確認入帳 ${U.money(p.actualPayout)}</div>`}
      </div>`;
    }).join('');

    return `
    <div class="page-header">
      <div class="page-title">💳 官網信用卡 / Apple Pay 對帳</div>
      <div class="page-subtitle">Apple Pay 與 信用卡金流手續費及維護費精準計算至小數點後 1 位</div>
    </div>
    ${periodSections}`;
  }

  /* ═══════════════════════════════════════════
     PAGE: CYBERBIZ COINS
  ═══════════════════════════════════════════ */
  function renderCyberbizCoins() {
    const periods = D.Cyberbiz.getAll();
    const allCoins = [];
    const catTotalsMap = {};
    let totalFromCat = 0;

    periods.forEach(p => {
      if (p.cyberCoins) {
        if (p.cyberCoins.items) {
          p.cyberCoins.items.forEach(item => {
            allCoins.push({ ...item, period: `${U.fmtShort(p.periodStart)}~${U.fmtShort(p.periodEnd)}` });
          });
        }
        if (p.cyberCoins.categoryTotals) {
          p.cyberCoins.categoryTotals.forEach(ct => {
            catTotalsMap[ct.name] = (catTotalsMap[ct.name] || 0) + ct.amount;
            totalFromCat += ct.amount;
          });
        }
      }
    });
    allCoins.sort((a,b) => String(b.time).localeCompare(String(a.time)));

    const grandTotal = totalFromCat > 0 ? totalFromCat : allCoins.reduce((s,c) => s + (c.amount||0), 0);

    const summaryCardsHtml = Object.entries(catTotalsMap).length
      ? Object.entries(catTotalsMap).map(([name, amt]) => `
        <div class="stat-card">
          <div class="stat-label">🏷 ${name}（分類統計）</div>
          <div class="stat-value text-red">NT$ ${amt.toLocaleString()}</div>
        </div>`).join('')
      : '';

    const rows = allCoins.length ? allCoins.map(c => `<tr>
      <td class="td-muted">${c.period}</td>
      <td><strong>${U.escHtml(c.type)}</strong></td>
      <td>${U.fmtDatetime(c.time)}</td>
      <td class="td-number text-red">NT$ ${(c.amount||0).toLocaleString()}</td>
      <td class="td-muted" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${U.escHtml(c.description)}</td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state" style="padding:32px"><div class="empty-icon">🪙</div><div class="empty-text">尚無 Cyber 幣資料</div></div></td></tr>`;

    return `
    <div class="page-header">
      <div class="page-title">🪙 Cyber 幣費用明細</div>
      <div class="page-subtitle">CyberBiz 平台費用（黑貓出貨費、簡訊費等）與分類統計</div>
    </div>

    ${Object.entries(catTotalsMap).length ? `
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card" style="border-color:rgba(239,68,68,0.3)">
        <div class="stat-label">Cyber 幣總消耗金額</div>
        <div class="stat-value text-red">NT$ ${grandTotal.toLocaleString()}</div>
        <div class="stat-foot">${allCoins.length} 筆明細交易</div>
      </div>
      ${summaryCardsHtml}
    </div>` : ''}

    <div style="font-size:12px;color:var(--text2);padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:16px">
      📌 <strong>說明：</strong>上方為對帳單底部之【分類統計項】（如黑貓宅配、簡訊、宅到店統計金額）；下方表格為剔除統計項後的實際 <strong>${allCoins.length} 筆明細紀錄</strong>，防止重複累計。
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>對帳期間</th><th>類型</th><th>扣款時間</th><th>金額</th><th>說明內容</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  /* ═══════════════════════════════════════════
     LIVE TOTAL (daily form)
  ═══════════════════════════════════════════ */
  function setupPageEvents(page) {
    if (page === 'daily-form') {
      const fields = ['cash','taishinCC','taishinAP','linePay','bankTransfer','uber'];
      fields.forEach(name => {
        const input = document.querySelector(`[name="${name}"]`);
        if (input) input.addEventListener('input', updateDailyTotal);
      });
      updateDailyTotal();
    }
  }

  function updateDailyTotal() {
    const names = ['cash','taishinCC','taishinAP','linePay','bankTransfer','uber'];
    let total = 0;
    names.forEach(n => {
      const el = document.querySelector(`[name="${n}"]`);
      total += Number(el?.value) || 0;
    });
    const el = U.el('onsite-total');
    if (el) el.textContent = 'NT$ ' + total.toLocaleString();
  }

  /* ═══════════════════════════════════════════
     SIDEBAR DATE
  ═══════════════════════════════════════════ */
  function updateSidebarDate() {
    const el = U.el('sidebar-date');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString('zh-TW', { year:'numeric',month:'long',day:'numeric',weekday:'short' });
  }

  /* ═══════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════ */
  function init() {
    updateSidebarDate();
    setInterval(updateSidebarDate, 60000);
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  }

  /* ═══════════════════════════════════════════
     BACKUP & RESTORE
  ═══════════════════════════════════════════ */
  function exportBackup() {
    try {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup_${U.today()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('備份匯出成功！', 'success');
    } catch (e) {
      toast('備份失敗：' + e.message, 'error');
    }
  }

  function handleBackupUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        let count = 0;
        for (const [key, value] of Object.entries(data)) {
          localStorage.setItem(key, value);
          count++;
        }
        toast(`✅ 備份還原成功！共匯入 ${count} 個項目，正在同步至雲端…`, 'success');
        if (window.AppData && typeof window.AppData.syncToCloud === 'function') {
          window.AppData.syncToCloud();
        }
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        toast('還原失敗：無效的 JSON 備份檔案', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // reset
  }

  document.addEventListener('DOMContentLoaded', init);

  /* Public API */
  return {
    navigate, closeModal, openModal, toast, refreshCurrentPage,
    // daily
    saveDailyForm, deleteDaily,
    // linepay onsite
    confirmLinepay, doConfirmLinepay,
    confirmLinepayBatch, doConfirmLinepayBatch, deleteLinepayBatch,
    // taishin
    confirmTaishin, doConfirmTaishin, openTaishinSettings, saveTaishinSettings,
    // uber
    confirmUber, doConfirmUber, deleteUberWeek,
    // cash
    openCashClose, saveCashClose, deleteCash, loadCashReported,
    // transfer
    openAddTransfer, saveTransfer, confirmTransfer, doConfirmTransfer, deleteTransfer,
    // cyberbiz
    handleCyberbizUpload, handleCyberbizDrop, confirmCyberbizPayout, doConfirmCyberbiz, deleteCyberbiz, clearCyberbizData,
    // cyberbiz linepay
    confirmCbLinepay, doConfirmCbLinepay,
    // backup & restore
    exportBackup, handleBackupUpload,
  };
})();
