/* utils.js — Date, currency, and business-day helpers */
window.AppUtils = (function () {

  /* ── Date formatting ── */
  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function today() {
    return toYMD(new Date());
  }

  function fmt(dateStr) {
    if (!dateStr) return '—';
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function fmtShort(dateStr) {
    if (!dateStr) return '—';
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
  }

  function fmtWeekday(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const days = ['日','一','二','三','四','五','六'];
    return '（' + days[d.getDay()] + '）';
  }

  function fmtDatetime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('zh-TW') + ' ' + d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  }

  function isWeekend(dateStr) {
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  function isHoliday(dateStr) {
    return AppConfig.HOLIDAYS.has(dateStr);
  }

  function isBusinessDay(dateStr) {
    return !isWeekend(dateStr) && !isHoliday(dateStr);
  }

  /* Add N business days to a date string (YYYY-MM-DD) */
  function addBusinessDays(dateStr, n) {
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    let count = 0;
    while (count < n) {
      d.setDate(d.getDate() + 1);
      const s = toYMD(d);
      if (isBusinessDay(s)) count++;
    }
    return toYMD(d);
  }

  /* Get Monday and Sunday of the week containing dateStr */
  function getWeekBounds(dateStr) {
    const parts = dateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [
      toYMD(monday),
      toYMD(sunday),
    ];
  }

  function fmtWeek(weekStart, weekEnd) {
    return fmtShort(weekStart) + ' ～ ' + fmtShort(weekEnd);
  }

  /* ── Currency ── */
  function money(n) {
    if (n === null || n === undefined || n === '') return '—';
    const num = Number(n);
    if (isNaN(num)) return '—';
    return 'NT$ ' + num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function money1(n) {
    if (n === null || n === undefined || n === '') return '—';
    const num = Number(n);
    if (isNaN(num)) return '—';
    return 'NT$ ' + (Math.round(num * 10) / 10).toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function moneySign(n) {
    if (n === null || n === undefined || n === '') return '—';
    const num = Number(n);
    return (num >= 0 ? '+' : '') + 'NT$ ' + Math.abs(num).toLocaleString('zh-TW');
  }

  /* ── CyberBiz Excel Parser ── */
  function parseCyberbizExcel(workbook) {
    const result = {
      periodStart: '',
      periodEnd: '',
      linePay: { total: 0, maintenanceFee: 0, daily: {} },
      cyberPayments: { total: 0, txFee: 0, maintenanceFee: 0, refunds: 0, breakdown: {} },
      cyberCoins: { total: 0, items: [], categoryTotals: [] },
      summaryPayout: 0,
      rawSummary: {},
    };

    // ── 對帳總表 ──
    const summarySheet = workbook.Sheets['對帳總表'];
    if (summarySheet) {
      const rows = XLSX.utils.sheet_to_json(summarySheet, { header: 1, defval: null });
      if (rows[0] && rows[0][0]) {
        const m = String(rows[0][0]).match(/(\d{4}\/\d{2}\/\d{2})\s*~\s*(\d{4}\/\d{2}\/\d{2})/);
        if (m) {
          result.periodStart = m[1].replace(/\//g, '-');
          result.periodEnd   = m[2].replace(/\//g, '-');
        }
      }
      rows.forEach(row => {
        if (!row[1]) return;
        const label = String(row[1]).trim();
        const val = Number(row[2]) || 0;
        result.rawSummary[label] = val;
        if (label === '本期撥款金額') result.summaryPayout = val;
      });
    }

    // ── 訂單明細 ──
    const orderSheet = workbook.Sheets['訂單明細'];
    if (orderSheet) {
      const rows = XLSX.utils.sheet_to_json(orderSheet, { header: 1, defval: null });

      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        const orderId    = String(r[0]);
        const orderDate  = r[1] ? String(r[1]).slice(0, 10).replace(/\//g,'-') : null;
        const creditDate = r[2] ? String(r[2]).slice(0, 10).replace(/\//g,'-') : orderDate;
        const payMethod  = String(r[4] || '');
        const txType     = String(r[3] || '');  // 付款 | 退款
        const txAmount   = Number(r[7]) || 0;
        const txFee      = Number(r[8]) || 0;
        const maintFee   = Number(r[9]) || 0;

        if (payMethod === 'Line Pay') {
          result.linePay.maintenanceFee += maintFee;

          if (txType === '付款') {
            if (!creditDate) continue;
            if (!result.linePay.daily[creditDate]) {
              result.linePay.daily[creditDate] = {
                grossTotal: 0,
                canceledAmount: 0,
                systemAmount: 0,
                uncanceledAmount: 0,
                lpTxFee: 0,
                lpTaxFee: 0,
                lpTotalFee: 0,
                payoutAmount: 0,
                count: 0,
                fee: 0,
                amount: 0,
              };
            }
            const dayObj = result.linePay.daily[creditDate];
            dayObj.grossTotal += txAmount;
            dayObj.count += 1;
            dayObj.fee += maintFee;

            result.linePay.total += txAmount;
          } else if (txType === '退款') {
            if (!creditDate) continue;
            if (!result.linePay.daily[creditDate]) {
              result.linePay.daily[creditDate] = {
                grossTotal: 0,
                canceledAmount: 0,
                systemAmount: 0,
                uncanceledAmount: 0,
                lpTxFee: 0,
                lpTaxFee: 0,
                lpTotalFee: 0,
                payoutAmount: 0,
                count: 0,
                fee: 0,
                amount: 0,
              };
            }
            result.linePay.daily[creditDate].canceledAmount += Math.abs(txAmount);
          }
        } else if (payMethod.startsWith('CYBERBIZ PAYMENTS')) {
          result.cyberPayments.total          += txAmount;
          result.cyberPayments.txFee          += txFee;
          result.cyberPayments.maintenanceFee += maintFee;

          if (!result.cyberPayments.breakdown[payMethod]) {
            result.cyberPayments.breakdown[payMethod] = { total: 0, txFee: 0, maintenanceFee: 0, count: 0, refundCount: 0 };
          }
          const b = result.cyberPayments.breakdown[payMethod];
          b.total          += txAmount;
          b.txFee          += txFee;
          b.maintenanceFee += maintFee;

          if (txType === '退款') {
            b.refundCount += 1;
            result.cyberPayments.refunds += txAmount;
          } else {
            b.count += 1;
          }
        }
      }

      result.cyberPayments.txFee = Math.round((result.cyberPayments.txFee || 0) * 10) / 10;
      result.cyberPayments.maintenanceFee = Math.round((result.cyberPayments.maintenanceFee || 0) * 10) / 10;
      Object.keys(result.cyberPayments.breakdown).forEach(m => {
        const item = result.cyberPayments.breakdown[m];
        item.txFee = Math.round((item.txFee || 0) * 10) / 10;
        item.maintenanceFee = Math.round((item.maintenanceFee || 0) * 10) / 10;
      });

      const feeRate = AppConfig.LINEPAY_FEE_RATE || 0.028;
      const taxRate = AppConfig.LINEPAY_TAX_RATE || 0.05;

      Object.keys(result.linePay.daily).forEach(d => {
        const item = result.linePay.daily[d];
        item.systemAmount = item.grossTotal - item.canceledAmount;

        const rawFee = item.systemAmount * feeRate;
        item.lpTxFee = Math.round(rawFee);
        item.lpTaxFee = Math.round(item.lpTxFee * taxRate);
        item.lpTotalFee = item.lpTxFee + item.lpTaxFee;

        item.payoutAmount = Math.max(0, item.systemAmount - item.lpTotalFee);
        item.amount = item.payoutAmount;
      });
    }

    // ── Cyber幣使用明細 ──
    const coinSheet = workbook.Sheets['Cyber幣使用明細'];
    if (coinSheet) {
      const rows = XLSX.utils.sheet_to_json(coinSheet, { header: 1, defval: null });
      result.cyberCoins.categoryTotals = [];
      result.cyberCoins.total = 0;

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        const colA = String(r[0]).trim();
        const timeVal = r[1] ? String(r[1]).trim() : '';
        const amt = Number(r[2]) || 0;

        const isRealTransaction = timeVal && /\d{4}[\/\-]\d{2}[\/\-]\d{2}/.test(timeVal);

        if (isRealTransaction) {
          result.cyberCoins.total += amt;
          result.cyberCoins.items.push({
            type: colA,
            time: timeVal,
            amount: amt,
            description: r[3] || '',
          });
        } else if (colA.includes('總使用') || colA.includes('總計')) {
          result.cyberCoins.grandTotal = amt || result.cyberCoins.total;
        } else if (amt > 0) {
          result.cyberCoins.categoryTotals.push({
            name: colA,
            amount: amt
          });
        }
      }
    }

    return result;
  }

  function el(id) { return document.getElementById(id); }

  function setInner(id, html) {
    const e = el(id);
    if (e) e.innerHTML = html;
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusBadge(status) {
    if (status === 'confirmed' || status === 'received') return '<span class="badge badge-success">已到帳</span>';
    if (status === 'discrepancy') return '<span class="badge badge-danger">金額不符</span>';
    return '<span class="badge badge-warning">待撥款</span>';
  }

  /* Parse LINE Group Sales Report Text (Example A Format) */
  function parseLineReportText(text) {
    if (!text || typeof text !== 'string') return null;
    
    const result = {
      date: today(),
      onsite: {
        cash: 0,
        taishinCC: 0,
        taishinAP: 0,
        linePay: 0,
        bankTransfer: 0,
        uber: 0,
      },
      parsedCount: 0
    };

    // 1. Try extracting date (e.g., 08/31, 8.31, 8月31日, 2026-08-31)
    const dateMatch = text.match(/(?:20\d{2}[\/\.-])?(\d{1,2})[\/\.月-](\d{1,2})/);
    if (dateMatch) {
      const year = new Date().getFullYear();
      const m = String(dateMatch[1]).padStart(2, '0');
      const d = String(dateMatch[2]).padStart(2, '0');
      result.date = `${year}-${m}-${d}`;
    }

    // Helper to extract amount by pattern
    function extractNum(patterns) {
      for (const pattern of patterns) {
        const regex = new RegExp(`${pattern}\\s*[:：\\s=]*([\\-−]?[0-9,]+)`, 'i');
        const match = text.match(regex);
        if (match) {
          const rawNum = match[1].replace(/,/g, '').replace('−', '-');
          const num = Number(rawNum);
          if (!isNaN(num)) {
            result.parsedCount++;
            return num;
          }
        }
      }
      return 0;
    }

    result.onsite.cash = extractNum(['現金', 'cash', '現場現金']);
    result.onsite.taishinCC = extractNum(['台新信用卡', '信用卡', '刷卡']);
    result.onsite.taishinAP = extractNum(['Apple\\s*Pay', 'AP', 'ApplePay']);
    result.onsite.linePay = extractNum(['LinePay', 'Line\\s*Pay', 'LP', 'LINE\\s*PAY']);
    result.onsite.uber = extractNum(['Uber\\s*Eats', 'UberEats', 'Uber']);
    result.onsite.bankTransfer = extractNum(['銀行轉帳', '轉帳', '匯款']);

    return result;
  }

  return {
    today, fmt, fmtShort, fmtWeekday, fmtDatetime,
    isWeekend, isHoliday, isBusinessDay, addBusinessDays,
    getWeekBounds, fmtWeek,
    money, money1, moneySign,
    parseCyberbizExcel, parseLineReportText,
    el, setInner, escHtml, statusBadge,
  };
})();
