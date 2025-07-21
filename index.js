const express = require('express');
const twilio = require('twilio');
const dotenv =require('dotenv');
const path = require('path');
const fs = require('fs');

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
  fallbackNumbers: [] // ค่าเริ่มต้น
};

try {
  if (fs.existsSync(settingsPath)) {
    const file = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(file);
    settings = { ...settings, ...parsed };
  }
} catch (err) {
  console.error('❌ โหลด settings ไม่สำเร็จ:', err.message);
}

// === Middleware ตรวจสอบลายเซ็น Twilio เพื่อความปลอดภัย ===
// ป้องกันคนนอกยิง webhook ของเราโดยตรง
// const twilioAuthMiddleware = twilio.webhook(); // ปิดใช้งานชั่วคราวเพื่อทดสอบ

// === เสียงเมื่อมีสายเข้า ===
// ลบ twilioAuthMiddleware ออกจากบรรทัดนี้เพื่อปิดการตรวจสอบ
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: '/handle-key',
    method: 'POST'
  });

  gather.say({ language: 'th-TH' }, settings.voice);
  // หากผู้ใช้ไม่กดอะไรเลย จะเล่นข้อความนี้แล้ววางสาย
  twiml.say({ language: 'th-TH' }, 'ไม่ได้รับการตอบรับ ขอบคุณค่ะ'); 
  res.type('text/xml').send(twiml.toString());
});

// === เมื่อกดปุ่ม ===
// ลบ twilioAuthMiddleware ออกจากบรรทัดนี้เพื่อปิดการตรวจสอบ
app.post('/handle-key', async (req, res) => {
  const digit = req.body.Digits;
  const to = req.body.To;
  const twiml = new twilio.twiml.VoiceResponse();

  if (digit === '1') {
    try {
      await client.messages.create({
        to,
        from: TWILIO_FROM_NUMBER,
        body: settings.sms
      });
      twiml.say({ language: 'th-TH' }, 'ส่งลิงก์โปรโมชั่นให้ทาง SMS แล้วค่ะ ขอบคุณค่ะ');
    } catch (err) {
      console.error('❌ ส่ง SMS ไม่สำเร็จ:', err.message);
      twiml.say({ language: 'th-TH' }, 'ขออภัยค่ะ ไม่สามารถส่งข้อความได้ในขณะนี้');
    }
  } else if (digit === '2') {
    // ใช้เบอร์โอนสายจาก settings
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

// === โทรออก ===
app.post('/call', async (req, res) => {
  const { numbers } = req.body;

  if (!Array.isArray(numbers) || numbers.length === 0) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุหมายเลขโทรศัพท์' });
  }

  const results = [];
  for (const to of numbers) {
    try {
      await client.calls.create({
        to,
        from: TWILIO_FROM_NUMBER,
        url: `https://${req.headers.host}/voice` // URL ที่ Twilio จะเรียกกลับมา
      });
      results.push(to);
    } catch (err) {
      console.error(`❌ โทรไม่สำเร็จ: ${to}`, err.message);
    }
  }

  res.json({ success: results.length > 0, results });
});

// === อัปเดตข้อความจากหน้าเว็บ ===
app.post('/update-settings', (req, res) => {
  const { voice, sms, fallbackNumbers } = req.body;
  if (!voice || !sms) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกข้อความให้ครบ' });
  }
  
  // อัปเดตค่า settings ในหน่วยความจำและบันทึกลงไฟล์
  settings = { ...settings, ...req.body };

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('💾 บันทึก settings:', settings);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ บันทึกไม่สำเร็จ:', err.message);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึก' });
  }
});

// === ดึงค่าข้อความล่าสุด ===
app.get('/settings', (req, res) => {
  res.json(settings);
});

// === หน้า UI index.html ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});