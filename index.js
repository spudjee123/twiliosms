const express = require('express');
const twilio = require('twilio');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// ใช้ fetch ที่มากับ Node.js v18+
// หากใช้ Node เวอร์ชันเก่า อาจต้องติดตั้ง node-fetch: npm install node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

dotenv.config();
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  PORT
} = process.env;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// === โหลด settings จากไฟล์ ===
const settingsPath = path.join(__dirname, 'setting.json');
let settings = {
  voice: 'สวัสดีค่ะ กรุณากด 1 เพื่อรับ SMS หรือกด 2 เพื่อโอนสายค่ะ',
  sms: 'โปรโมชั่นพิเศษ! คลิกลิงก์: https://lin.ee/xxxxx',
  fallbackNumbers: []
};

try {
  if (fs.existsSync(settingsPath)) {
    const file = fs.readFileSync(settingsPath, 'utf-8');
    settings = { ...settings, ...JSON.parse(file) };
  }
} catch (err) {
  console.error('❌ โหลด settings ไม่สำเร็จ:', err.message);
}

// === เสียงเมื่อมีสายเข้า ===
app.post('/voice', (req, res) => {
  // รับ callback URL จาก query parameter ที่ส่งมาจาก Google Script
  const { callbackUrl } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();
  
  // สร้าง action URL สำหรับ gather โดยแนบ callback URL ไปด้วย
  let actionUrl = '/handle-key';
  if (callbackUrl) {
    actionUrl += `?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  const gather = twiml.gather({
    numDigits: 1,
    action: actionUrl, // ใช้ actionUrl ที่สร้างขึ้น
    method: 'POST'
  });

  gather.say({ language: 'th-TH' }, settings.voice);
  twiml.say({ language: 'th-TH' }, 'ไม่ได้รับการตอบรับ ขอบคุณค่ะ');
  res.type('text/xml').send(twiml.toString());
});

// === เมื่อกดปุ่ม ===
app.post('/handle-key', async (req, res) => {
  // รับ callback URL จาก query parameter
  const { callbackUrl } = req.query;
  const digit = req.body.Digits;
  const callSid = req.body.CallSid;
  const to = req.body.To;
  const twiml = new twilio.twiml.VoiceResponse();

  // --- ส่วนที่เพิ่มเข้ามา: ส่งข้อมูลการกดปุ่มกลับไปที่ Google Script ---
  if (callbackUrl && digit) {
    const callbackPayload = new URLSearchParams({
        CallSid: callSid,
        Digits: digit
    });
    fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: callbackPayload.toString()
    }).catch(err => console.error('Error forwarding digits to callback:', err));
  }
  // --- จบส่วนที่เพิ่มเข้ามา ---

  if (digit === '1') {
    try {
      await client.messages.create({ to, from: TWILIO_FROM_NUMBER, body: settings.sms });
      twiml.say({ language: 'th-TH' }, 'ส่งลิงก์โปรโมชั่นให้ทาง SMS แล้วค่ะ ขอบคุณค่ะ');
    } catch (err) {
      console.error('❌ ส่ง SMS ไม่สำเร็จ:', err.message);
      twiml.say({ language: 'th-TH' }, 'ขออภัยค่ะ ไม่สามารถส่งข้อความได้ในขณะนี้');
    }
  } else if (digit === '2') {
    if (settings.fallbackNumbers && settings.fallbackNumbers.length > 0) {
      twiml.say({ language: 'th-TH' }, 'กำลังโอนสายไปยังเจ้าหน้าที่ กรุณารอสักครู่');
      const dial = twiml.dial();
      settings.fallbackNumbers.forEach(num => dial.number(num));
    } else {
      twiml.say({ language: 'th-TH' }, 'ขออภัยค่ะ ไม่มีเบอร์เจ้าหน้าที่สำหรับโอนสาย');
    }
  } else {
    twiml.say({ language: 'th-TH' }, 'คุณไม่ได้กด 1 หรือ 2 ขอบคุณค่ะ');
  }

  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// === โทรออก (สำหรับหน้าเว็บ) ===
app.post('/call', async (req, res) => {
  const { numbers } = req.body;
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุหมายเลขโทรศัพท์' });
  }

  const results = [];
  for (const to of numbers) {
    try {
      const call = await client.calls.create({
        to,
        from: TWILIO_FROM_NUMBER,
        url: `https://${req.headers.host}/voice`
      });
      results.push({ to: to, sid: call.sid });
    } catch (err) {
      console.error(`❌ โทรไม่สำเร็จ: ${to}`, err.message);
    }
  }
  res.json({ success: results.length > 0, results });
});


// === อัปเดตและดึงค่า Settings (สำหรับหน้าเว็บ) ===
app.post('/update-settings', (req, res) => {
  settings = { ...settings, ...req.body };
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึก' });
  }
});

app.get('/settings', (req, res) => {
  res.json(settings);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
