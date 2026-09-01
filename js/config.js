/* config.js — App-wide constants */
window.AppConfig = {
  APP_NAME: '態度貳貳甜點 — 對帳系統',

  // Payout timing
  LINEPAY_BUSINESS_DAYS: 2,   // N+2
  TAISHIN_BUSINESS_DAYS: 1,   // T+1 (adjust if needed)

  // Uber
  UBER_DEFAULT_COMMISSION: 0.32,   // 32%

  // LinePay Fee & Tax
  LINEPAY_FEE_RATE: 0.028,          // 2.8% 官網手續費
  ONSITE_LINEPAY_FEE_RATE: 0.022,   // 2.2% 現場手續費
  LINEPAY_TAX_RATE: 0.05,           // 5% 手續費營業稅

  // CyberBiz
  CYBERBIZ_MAINTENANCE_FEE_RATE: 0.01,  // 1%

  // Storage keys
  KEYS: {
    DAILY:            'ta_daily_reports',
    LINEPAY:          'ta_linepay_payouts',
    LINEPAY_BATCHES:  'ta_linepay_batches',
    TAISHIN:          'ta_taishin_payouts',
    UBER:             'ta_uber_weeks',
    CASH:             'ta_cash_closes',
    TRANSFER:         'ta_transfers',
    CYBERBIZ:         'ta_cyberbiz_periods',
    SETTINGS:         'ta_settings',
  },

  // Taiwan 2025-2026 public holidays (for N+2 calc)
  HOLIDAYS: new Set([
    // 2025
    '2025-01-01',
    '2025-01-27','2025-01-28','2025-01-29','2025-01-30','2025-01-31',
    '2025-02-02','2025-02-03',
    '2025-02-28',
    '2025-04-03','2025-04-04',
    '2025-05-01',
    '2025-05-30', // Dragon Boat
    '2025-10-06', // Mid-Autumn
    '2025-10-10',
    // 2026
    '2026-01-01','2026-01-02',
    '2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-23',
    '2026-02-28',
    '2026-04-03','2026-04-04',
    '2026-05-01',
    '2026-06-19', // Dragon Boat
    '2026-09-17', // Mid-Autumn (TBC)
    '2026-10-09','2026-10-10',
  ]),

  // Firebase Config
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyAKvG8VbEykx507zX9TlswHRWm8frJuFBM",
    authDomain: "reveune-912d3.firebaseapp.com",
    projectId: "reveune-912d3",
    storageBucket: "reveune-912d3.firebasestorage.app",
    messagingSenderId: "962642364275",
    appId: "1:962642364275:web:d9f206941bf44be6646706",
    measurementId: "G-9Q5PBG25R4"
  }
};

// Initialize Firebase & Firestore
(function initFirebase() {
  if (typeof firebase !== 'undefined' && window.AppConfig.FIREBASE_CONFIG?.apiKey) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.AppConfig.FIREBASE_CONFIG);
      }
      window.db = firebase.firestore();
      // Enable offline persistence cleanly
      window.db.enablePersistence().catch(() => {});
    } catch (e) {
      console.warn('Firebase init warning:', e);
    }
  }
})();
