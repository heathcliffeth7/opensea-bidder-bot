const WebSocket = require('ws');
const config = require('./config');

// Phoenix protokolü için doğru bağlantı
const wsUrl = `wss://stream.openseabeta.com/socket/websocket`;

console.log('Stream API Debug başlıyor...');
console.log('URL:', wsUrl);

const ws = new WebSocket(wsUrl, {
  headers: {
    'Authorization': `Bearer ${config.apiKey}`,
    'X-API-KEY': config.apiKey
  }
});

let joinRef = 1;

ws.on('open', () => {
  console.log('✅ WebSocket bağlandı');
  
  // Phoenix join mesajı - API key'i payload'da gönder
  const joinMsg = {
    topic: 'collection:gemesis',
    event: 'phx_join',
    payload: {
      api_key: config.apiKey,
      token: config.apiKey
    },
    ref: joinRef++
  };
  
  console.log('📤 Join mesajı:', JSON.stringify(joinMsg));
  ws.send(JSON.stringify(joinMsg));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  // System mesajları hariç tüm mesajları göster
  if (!msg.event?.startsWith('phx_')) {
    console.log('\n📨 Event:', msg.event);
    console.log('Topic:', msg.topic);
    if (msg.payload) {
      console.log('Payload önizleme:', JSON.stringify(msg.payload).substring(0, 200) + '...');
    }
  } else if (msg.event === 'phx_reply') {
    console.log('\n📨 Phoenix yanıt:', msg.payload);
  }
});

ws.on('error', (err) => {
  console.error('❌ Hata:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔴 Bağlantı kapandı. Code: ${code}, Reason: ${reason}`);
});

console.log('\nGemesis collection dinleniyor...');
console.log('Token 896 veya diğer tokenlara teklif verin ve bekleyin...');