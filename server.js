const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// สถานะกลางของทั้งเซิร์ฟเวอร์
let globalState = {
  gameState: 'BETTING', // BETTING | DEALING
  countdown: 10,
  locked: false,
  adminWinMode: 'normal',
  history: []
};

let timerInterval = null;

function startRound() {
  if (globalState.locked) return;

  globalState.gameState = 'BETTING';
  globalState.countdown = 10;
  io.emit('stateSync', globalState);

  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    if (globalState.locked) return; // ถ้าล็อกอยู่ให้หยุดนับ

    globalState.countdown--;
    io.emit('stateSync', globalState);

    if (globalState.countdown <= 0) {
      clearInterval(timerInterval);
      globalState.gameState = 'DEALING';
      io.emit('stateSync', globalState);
      
      // สั่งให้ทุก Client เริ่มแจกไพ่พร้อมกัน
      io.emit('startDealing');
      
      // หน่วงเวลา 15 วินาทีเพื่อให้ฝั่ง Client แสดงแอนิเมชันเสร็จ แล้วเริ่มรอบใหม่
      setTimeout(() => {
        startRound();
      }, 15000); 
    }
  }, 1000);
}

io.on('connection', (socket) => {
  // ส่งสถานะล่าสุดให้คนที่เพิ่งเข้ามาเห็นเวลาตรงกับคนอื่น
  socket.emit('stateSync', globalState);

  // รับคำสั่งจากแอดมิน
  socket.on('adminAction', (data) => {
    if (data.type === 'LOCK') {
      globalState.locked = data.status;
      io.emit('stateSync', globalState);
    } else if (data.type === 'SET_WIN_MODE') {
      globalState.adminWinMode = data.mode;
    } else if (data.type === 'FORCE_START') {
      globalState.locked = false;
      globalState.countdown = 1; // เร่งเวลาให้เริ่มทันที
      io.emit('stateSync', globalState);
    }
  });

  // รับผลลัพธ์จาก Client (ในที่นี้ให้ Client สุ่ม แต่ถ้าอยากให้ปลอดภัยต้องย้าย Logic ไพ่มา Server)
  // *เพื่อความง่ายที่สุด ข้ามขั้นตอนนี้ไปก่อน
});

// เริ่มต้นระบบ
startRound();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
