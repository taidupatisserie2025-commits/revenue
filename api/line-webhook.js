/* api/line-webhook.js — LINE Bot Serverless Webhook Handler */
// 部署於 Vercel / Render / Firebase Functions 即可接收 LINE 群組訊息全自動寫入 Firestore

const crypto = require('crypto');
const https = require('https');

// 貼上您的 Firebase Config projectId
const FIREBASE_PROJECT_ID = 'reveune-912d3';
const FIRESTORE_DATABASE = 'revenue';

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

  return {
    date: dateStr,
    onsite,
    total,
    notes: 'LINE 群組自動回報'
  };
}

// Handler Functions for Vercel / Express
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('LINE Webhook Endpoint is Running');
  }

  const events = req.body?.events || [];
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const parsed = parseLineMessage(event.message.text);
      if (parsed && parsed.total > 0) {
        // Direct write to Firestore REST API (revenue database)
        try {
          const documentUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE}/documents/daily_reports/${parsed.date}`;
          // Payload formatting for Firestore REST API
          const payload = {
            fields: {
              date: { stringValue: parsed.date },
              notes: { stringValue: parsed.notes },
              updatedAt: { stringValue: new Date().toISOString() },
              onsite: {
                mapValue: {
                  fields: {
                    cash: { integerValue: parsed.onsite.cash },
                    taishinCC: { integerValue: parsed.onsite.taishinCC },
                    taishinAP: { integerValue: parsed.onsite.taishinAP },
                    linePay: { integerValue: parsed.onsite.linePay },
                    uber: { integerValue: parsed.onsite.uber },
                    bankTransfer: { integerValue: parsed.onsite.bankTransfer },
                  }
                }
              }
            }
          };

          // Post request to Firestore
          const postData = JSON.stringify(payload);
          const urlObj = new URL(documentUrl);
          const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };

          const request = https.request(options, (response) => {
            console.log('Firestore write status:', response.statusCode);
          });
          request.write(postData);
          request.end();

        } catch (err) {
          console.error('Firestore REST error:', err);
        }
      }
    }
  }

  return res.status(200).json({ status: 'ok' });
};
