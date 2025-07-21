const express = require('express');
const twilio = require('twilio');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch'); // <-- ส่วนสำคัญที่แก้ไขให้ถูกต้อง

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
  console.error('❌ Error loading settings.json:', err.message);
}

// === Endpoint หลักสำหรับ TwiML ===
app.post('/voice', (req, res) => {
  const { callbackUrl } = req.query;
  const twiml = new twilio.twiml.VoiceResponse();
  
  let actionUrl = '/handle-key';
  if (callbackUrl) {
    actionUrl += `?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  const gather = twiml.gather({
    numDigits: 1,
    action: actionUrl,
    method: 'POST',
    timeout: 5 // รอการกด 5 วินาที
  });

  gather.say({ language: 'th-TH' }, settings.voice);
  twiml.say({ language: 'th-TH' }, 'ไม่ได้รับการตอบรับ ขอบคุณค่ะ');
  res.type('text/xml').send(twiml.toString());
});

// === Endpoint สำหรับจัดการการกดปุ่ม ===
app.post('/handle-key', async (req, res) => {
  const { callbackUrl } = req.query;
  const digit = req.body.Digits;
  const callSid = req.body.CallSid;
  const to = req.body.To;
  const twiml = new twilio.twiml.VoiceResponse();

  // --- ส่วนสำคัญ: ส่งข้อมูลการกดปุ่มกลับไปที่ Google Script ---
  if (callbackUrl && digit) {
    console.log(`Forwarding digit ${digit} for SID ${callSid} to ${callbackUrl}`);
    const callbackPayload = new URLSearchParams({ CallSid: callSid, Digits: digit });
    fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: callbackPayload.toString()
    }).catch(err => console.error('Error forwarding digits to callback:', err));
  }
  // --- จบส่วนสำคัญ ---

  if (digit === '1') {
    try {
      await client.messages.create({ to, from: TWILIO_FROM_NUMBER, body: settings.sms });
      twiml.say({ language: 'th-TH' }, 'เราได้ส่งลิงก์โปรโมชั่นให้ทาง SMS แล้วค่ะ ขอบคุณค่ะ');
    } catch (err) {
      console.error('❌ SMS sending failed:', err.message);
      twiml.say({ language: 'th-TH' }, 'ขออภัยค่ะ ไม่สามารถส่งข้อความได้ในขณะนี้');
    }
  } else if (digit === '2') {
    if (settings.fallbackNumbers && settings.fallbackNumbers.length > 0) {
      twiml.say({ language: 'th-TH' }, 'กำลังโอนสายไปยังเจ้าหน้าที่ กรุณารอสักครู่');
      const dial = twiml.dial();
      settings.fallbackNumbers.forEach(num => dial.number(num));
    } else {
      twiml.say({ language: 'th-TH' }, 'ขออภัยค่ะ ไม่มีเบอร์เจ้าหน้าที่สำหรับโอนสายในขณะนี้');
    }
  } else {
    twiml.say({ language: 'th-TH' }, 'คุณไม่ได้กด 1 หรือ 2 ขอบคุณค่ะ');
  }

  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// ส่วนที่เหลือสำหรับจัดการหน้าเว็บ
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const port = PORT || 3000;
app.listen(port, () => console.log(`🚀 Server is running on port ${port}`));
