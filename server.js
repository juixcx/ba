const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// สถานะกลาง
let globalState = {
  gameState: 'BETTING', // BETTING | DEALING
  countdown: 10,
  locked: false,
  adminWinMode: 'normal', // normal | force_player | force_banker | tie
  history: []
};

let timerInterval = null;

// ฟังก์ชันสุ่มไพ่
const suits = ['♠', '♥', '♦', '♣'];
const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const drawCard = () => ({
  value: values[Math.floor(Math.random() * values.length)],
  suit: suits[Math.floor(Math.random() * suits.length)],
  isRed: false // เดี๋ยว client จัดการสีเอง
});
const getVal = (card) => ['10','J','Q','K'].includes(card.value) ? 0 : card.value === 'A' ? 1 : parseInt(card.value);
const calcScore = (hand) => hand.reduce((sum, c) => sum + getVal(c), 0) % 10;

function generateGameResult() {
  let pHand = [drawCard(), drawCard()];
  let bHand = [drawCard(), drawCard()];
  
  // ถ้าแอดมินล็อกผลไว้ ให้บังคับไพ่
  if (globalState.adminWinMode === 'force_player') {
    pHand = [{value:'9', suit:'♠'}, {value:'9', suit:'♥'}]; // Player 8 แต้ม
    bHand = [{value:'10', suit:'♦'}, {value:'5', suit:'♣'}]; // Banker 5 แต้ม
  } else if (globalState.adminWinMode === 'force_banker') {
    pHand = [{value:'10', suit:'♦'}, {value:'4', suit:'♣'}]; // Player 4 แต้ม
    bHand = [{value:'9', suit:'♠'}, {value:'9', suit:'♥'}]; // Banker 8 แต้ม
  } else if (globalState.adminWinMode === 'force_tie') {
    pHand = [{value:'5', suit:'♠'}, {value:'5', suit:'♥'}]; // Player 0 แต้ม
    bHand = [{value:'10', suit:'♦'}, {value:'10', suit:'♣'}]; // Banker 0 แต้ม
  }

  return { pHand, bHand };
}

function startRound() {
  if (globalState.locked) return;

  globalState.gameState = 'BETTING';
  globalState.countdown = 10;
  io.emit('stateSync', globalState);

  if (timerInterval) clearInterval(timerInterval);
  
  timerInterval = setInterval(() => {
    if (globalState.locked) return;

    globalState.countdown--;
    io.emit('stateSync', globalState);

    if (globalState.countdown <= 0) {
      clearInterval(timerInterval);
      globalState.gameState = 'DEALING';
      io.emit('stateSync', globalState);
      
      // คำนวณไพ่ที่เซิร์ฟเวอร์
      const result = generateGameResult();
      
      // ส่งไพ่ให้ทุกคนพร้อมกัน
      io.emit('startDealing', result);
      
      // หน่วงเวลา 12 วินาทีให้แอนิเมชันจบ แล้วเริ่มรอบใหม่
      setTimeout(() => {
        startRound();
      }, 12000); 
    }
  }, 1000);
}

io.on('connection', (socket) => {
  socket.emit('stateSync', globalState);

  socket.on('adminAction', (data) => {
    if (data.type === 'LOCK') {
      globalState.locked = data.status;
      io.emit('stateSync', globalState);
    } else if (data.type === 'SET_WIN_MODE') {
      globalState.adminWinMode = data.mode;
      console.log('Admin changed win mode to:', data.mode);
    }
  });
});

startRound();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
