/* api/line-webhook.js — LINE Bot Serverless Webhook Handler */
const https = require('https');

const FIREBASE_PROJECT_ID = 'reveune-912d3';
const FIRESTORE_DATABASE = '(default)';   // Must match web app (compat SDK only supports default)
const FIREBASE_API_KEY = 'AIzaSyAKvG8VbEykx507zX9TlswHRWm8frJuFBM';

// 解析 LINE 訊息文字 (範例 A 格式)
function parseLineMessage(text) {
  if (!text || typeof text !== 'string') return null;

  const today = new Date();
  const year = today.getFullYear();
  let dateStr = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const dateMatch = text.match(/(?:20\d{2}[\/\.-])?(\d{1,2})[\/\.月-](\d{1,2})/);
  if (dateMatch) {
    const m = String(dateMatch[1]).padStart(2, '0');
    const d = String(dateMatch[2]).padStart(2, '0');
    dateStr = `${year}-${m}-${d}`;
  }

  function extractNum(patterns) {
    for (const pattern of patterns) {
      const regex = new RegExp(`${pattern}\\s*[:：\\s=]*([\\-−]?[0-9,]+)`, 'i');
      const match = text.match(regex);
      if (match) {
        const rawNum = match[1].replace(/,/g, '').replace('−', '-');
        const num = Number(rawNum);
        if (!isNaN(num)) return num;
      }
    }
    return 0;
  }

  const onsite = {
    cash: extractNum(['現金', 'cash', '現場現金']),
    taishinCC: extractNum(['台新信用卡', '信用卡', '刷卡']),
    taishinAP: extractNum(['Apple\\s*Pay', 'AP', 'ApplePay']),
    linePay: extractNum(['LinePay', 'Line\\s*Pay', 'LP', 'LINE\\s*PAY']),
    uber: extractNum(['Uber\\s*Eats', 'UberEats', 'Uber']),
    bankTransfer: extractNum(['銀行轉帳', '轉帳', '匯款']),
  };

  const total = onsite.cash + onsite.taishinCC + onsite.taishinAP + onsite.linePay + onsite.uber + onsite.bankTransfer;

  if (total === 0) return null; // ignore non-report messages

  return { date: dateStr, onsite, total, notes: 'LINE 群組自動回報' };
}

// Write to Firestore REST API
// NOTE: Firestore REST API requires integerValue to be a STRING representation
function makeIntField(n) {
  return { integerValue: String(n) };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('LINE Webhook Endpoint is Running ✅');
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { console.error('Body parse error:', e); }
  }

  const events = body?.events || [];
  console.log(`📨 Received ${events.length} LINE events`);

  for (const event of events) {
    if (event.type !== 'message' || !event.message || event.message.type !== 'text') continue;

    const text = event.message.text;
    console.log('📩 LINE text received:', JSON.stringify(text));

    const parsed = parseLineMessage(text);
    if (!parsed) {
      console.log('⚠️ No amounts detected, skipping.');
      continue;
    }

    console.log(`✅ Parsed: date=${parsed.date}, total=${parsed.total}`, JSON.stringify(parsed.onsite));

    // Firestore REST: PATCH to upsert the document
    const documentPath = `projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE}/documents/daily_reports/${parsed.date}`;
    const apiUrl = `https://firestore.googleapis.com/v1/${documentPath}?key=${FIREBASE_API_KEY}`;

    const payload = {
      fields: {
        date:      { stringValue: parsed.date },
        notes:     { stringValue: parsed.notes },
        updatedAt: { stringValue: new Date().toISOString() },
        onsite: {
          mapValue: {
            fields: {
              cash:         makeIntField(parsed.onsite.cash),
              taishinCC:    makeIntField(parsed.onsite.taishinCC),
              taishinAP:    makeIntField(parsed.onsite.taishinAP),
              linePay:      makeIntField(parsed.onsite.linePay),
              uber:         makeIntField(parsed.onsite.uber),
              bankTransfer: makeIntField(parsed.onsite.bankTransfer),
            }
          }
        }
      }
    };

    const postData = JSON.stringify(payload);
    const urlObj = new URL(apiUrl);

    await new Promise((resolve) => {
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const request = https.request(options, (response) => {
        let responseBody = '';
        response.on('data', chunk => responseBody += chunk);
        response.on('end', () => {
          console.log(`🔥 Firestore PATCH status: ${response.statusCode}`);
          if (response.statusCode !== 200) {
            console.error('❌ Firestore error body:', responseBody);
          } else {
            console.log('✅ Firestore write success for', parsed.date);
          }
          resolve();
        });
      });
      request.on('error', (err) => {
        console.error('❌ HTTP request error:', err.message);
        resolve();
      });
      request.write(postData);
      request.end();
    });
  }

  return res.status(200).json({ status: 'ok' });
};
