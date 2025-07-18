const express = require('express');
const twilio = require('twilio');
const dotenv = require('dotenv');
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
  voice: 'สวัสดีค่ะ วันนี้เรามีโปรโมชั่นพิเศษ หากคุณต้องการรับลิงก์ทาง SMS กด 1 ค่ะ',
  sms: 'โปรโมชั่นพิเศษ! คลิกลิงก์เพื่อรับสิทธิ์เลย: https://lin.ee/xxxxx'
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

// === เสียงเมื่อมีสายเข้า ===
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: '/handle-key',
    method: 'POST'
  });

  gather.say({ language: 'th-TH' }, settings.voice);
  twiml.say({ language: 'th-TH' }, 'ขอบคุณค่ะ');
  res.type('text/xml').send(twiml.toString());
});

// === เมื่อกดปุ่ม ===
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
      twiml.say({ language: 'th-TH' }, 'ส่งลิงก์ให้ทาง SMS แล้วค่ะ ขอบคุณที่ใช้บริการ');
    } catch (err) {
      console.error('❌ ส่ง SMS ไม่สำเร็จ:', err.message);
      twiml.say({ language: 'th-TH' }, 'ระบบไม่สามารถส่งข้อความได้ในขณะนี้');
    }
  } else {
    twiml.say({ language: 'th-TH' }, 'คุณไม่ได้กด 1 ระบบจะวางสายค่ะ');
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
        url: `https://${req.headers.host}/voice`
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
  const { voice, sms } = req.body;
  if (!voice || !sms) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกข้อความให้ครบ' });
  }

  settings = { voice, sms };

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



// const express = require('express');
// const twilio = require('twilio');
// const dotenv = require('dotenv');
// const path = require('path');
// const fs = require('fs');

// dotenv.config();
// const app = express();
// app.use(express.urlencoded({ extended: false }));
// app.use(express.json());
// app.use(express.static(path.join(__dirname, '.')));

// const {
//   TWILIO_ACCOUNT_SID,
//   TWILIO_AUTH_TOKEN,
//   TWILIO_FROM_NUMBER,
//   PORT
// } = process.env;

// const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// // ✅ โหลด settings จาก settings.json
// const settingsPath = path.join(__dirname, 'settings.json');
// let settings = {
//   link: 'https://lin.ee/default',
//   voice: 'สวัสดีค่ะ วันนี้เรามีโปรโมชั่นพิเศษ หากคุณต้องการรับลิงก์ทาง SMS กด 1 ค่ะ',
//   sms: 'โปรโมชั่นพิเศษ! คลิกลิงก์เพื่อรับสิทธิ์เลย:'
// };

// try {
//   if (fs.existsSync(settingsPath)) {
//     const file = fs.readFileSync(settingsPath, 'utf-8');
//     const parsed = JSON.parse(file);
//     settings = { ...settings, ...parsed };
//   }
// } catch (err) {
//   console.error('❌ โหลด settings ไม่สำเร็จ:', err.message);
// }

// // 📞 เมื่อมีสายเข้า
// app.post('/voice', (req, res) => {
//   const twiml = new twilio.twiml.VoiceResponse();

//   const gather = twiml.gather({
//     numDigits: 1,
//     action: '/handle-key',
//     method: 'POST'
//   });

//   gather.say({ language: 'th-TH' }, settings.voice);
//   twiml.say({ language: 'th-TH' }, 'ขอบคุณค่ะ');

//   res.type('text/xml').send(twiml.toString());
// });

// // 📩 เมื่อกด 1 ส่ง SMS
// app.post('/handle-key', async (req, res) => {
//   const digit = req.body.Digits;
//   const customerNumber = req.body.To;
//   const twiml = new twilio.twiml.VoiceResponse();

//   if (digit === '1') {
//     try {
//       await client.messages.create({
//         to: customerNumber,
//         from: TWILIO_FROM_NUMBER,
//         body: `${settings.sms} ${settings.link}`
//       });

//       twiml.say({ language: 'th-TH' },
//         'ส่งลิงก์ให้ทาง SMS แล้วค่ะ ขอบคุณที่ใช้บริการ');
//     } catch (err) {
//       console.error('❌ ส่ง SMS ไม่สำเร็จ:', err.message);
//       twiml.say({ language: 'th-TH' },
//         'ระบบไม่สามารถส่งข้อความได้ในขณะนี้');
//     }
//   } else {
//     twiml.say({ language: 'th-TH' }, 'คุณไม่ได้กด 1 ระบบจะวางสายค่ะ');
//   }

//   twiml.hangup();
//   res.type('text/xml').send(twiml.toString());
// });

// // 📲 โทรออก
// app.post('/call', async (req, res) => {
//   const { numbers } = req.body;

//   if (!Array.isArray(numbers) || numbers.length === 0) {
//     return res.status(400).json({ success: false, error: 'ไม่พบหมายเลขโทรศัพท์' });
//   }

//   const results = [];

//   for (const to of numbers) {
//     try {
//       await client.calls.create({
//         to,
//         from: TWILIO_FROM_NUMBER,
//         url: `https://${req.headers.host}/voice`
//       });
//       results.push(to);
//     } catch (err) {
//       console.error(`❌ โทรไม่สำเร็จ: ${to}:`, err.message);
//     }
//   }

//   if (results.length > 0) {
//     res.json({ success: true, results });
//   } else {
//     res.json({ success: false, error: 'โทรไม่สำเร็จทั้งหมด' });
//   }
// });

// // 🔧 อัปเดต settings (ลิงก์, เสียง, SMS)
// app.post('/update-settings', (req, res) => {
//   const { link, voice, sms } = req.body;
//   if (!link || !voice || !sms) {
//     return res.status(400).json({ success: false, error: 'ข้อมูลไม่ครบถ้วน' });
//   }

//   settings = { link, voice, sms };

//   try {
//     fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
//     console.log('💾 อัปเดต settings แล้ว:', settings);
//     res.json({ success: true });
//   } catch (err) {
//     console.error('❌ เขียนไฟล์ settings ไม่สำเร็จ:', err.message);
//     res.status(500).json({ success: false, error: 'บันทึกไม่สำเร็จ' });
//   }
// });

// // 📤 API แสดง settings ปัจจุบัน
// app.get('/settings', (req, res) => {
//   res.json(settings);
// });

// // 🌐 หน้าเว็บ
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'index.html'));
// });

// // ▶️ Start Server
// const port = PORT || 3000;
// app.listen(port, () => {
//   console.log(`🚀 Server is running on port ${port}`);
// });