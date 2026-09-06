const WebSocket = require('ws');
require('dotenv').config();

const apiKey = process.env.OPENSEA_API_KEY;

console.log('🧪 Abstract WebSocket Bağlantı Testi');
console.log('API Key:', apiKey ? apiKey.substring(0, 8) + '...' : 'YOK');

const urls = [
  `wss://stream.openseabeta.com/socket/websocket?token=${apiKey}&chain=abstract`,
  `wss://stream.openseabeta.com/socket/websocket?token=${apiKey}&chain_id=2741`,
  `wss://stream.openseabeta.com/socket/websocket?token=${apiKey}&network=abstract`,
  `wss://stream.openseabeta.com/socket/websocket?token=${apiKey}`,
];

let currentIndex = 0;

function testConnection(url) {
  console.log(`\n🔄 Test ${currentIndex + 1}/${urls.length}`);
  console.log(`URL: ${url.replace(apiKey, 'API_KEY')}`);
  
  const ws = new WebSocket(url);
  
  ws.on('open', () => {
    console.log('✅ Bağlantı başarılı!');
    
    // Phoenix handshake
    const phoenixHandshake = {
      topic: "phoenix",
      event: "phx_join",
      payload: {},
      ref: "1"
    };
    
    console.log('📨 Phoenix handshake gönderiliyor...');
    ws.send(JSON.stringify(phoenixHandshake));
    
    // 5 saniye bekle ve kapat
    setTimeout(() => {
      ws.close();
      nextTest();
    }, 5000);
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📩 Mesaj alındı:', message);
  });
  
  ws.on('error', (error) => {
    console.error('❌ Hata:', error.message);
    nextTest();
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔴 Bağlantı kapandı - Code: ${code}, Reason: ${reason}`);
  });
}

function nextTest() {
  currentIndex++;
  if (currentIndex < urls.length) {
    testConnection(urls[currentIndex]);
  } else {
    console.log('\n✅ Tüm testler tamamlandı');
    process.exit(0);
  }
}

// İlk testi başlat
testConnection(urls[currentIndex]);