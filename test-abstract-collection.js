const WebSocket = require('ws');
require('dotenv').config();

const apiKey = process.env.OPENSEA_API_KEY;
const collectionSlug = 'pengztracted-abstract';

console.log('🧪 Abstract Collection Subscription Testi');
console.log('API Key:', apiKey ? apiKey.substring(0, 8) + '...' : 'YOK');
console.log('Collection:', collectionSlug);

// En iyi çalışan URL'yi kullan
const url = `wss://stream.openseabeta.com/socket/websocket?token=${apiKey}`;

const ws = new WebSocket(url);
let ref = 1;

ws.on('open', () => {
  console.log('\n✅ WebSocket bağlantısı kuruldu!');
  
  // Farklı topic formatlarını dene
  const topics = [
    `collection:${collectionSlug}`,
    `collection:abstract:${collectionSlug}`,
    `abstract:collection:${collectionSlug}`,
    `chain:2741:collection:${collectionSlug}`,
    `collection:${collectionSlug}:abstract`,
    `2741:collection:${collectionSlug}`,
    `collection/${collectionSlug}`,
    `abstract/${collectionSlug}`,
    'collection:*',
    '*'
  ];
  
  // Her topic'i dene
  topics.forEach((topic, index) => {
    setTimeout(() => {
      const message = {
        topic: topic,
        event: 'phx_join',
        payload: {
          chain: 'abstract',
          chain_id: 2741,
          network: 'abstract-mainnet'
        },
        ref: (ref++).toString()
      };
      
      console.log(`\n📨 Deneme ${index + 1}: ${topic}`);
      ws.send(JSON.stringify(message));
    }, index * 1000); // Her deneme arasında 1 saniye bekle
  });
  
  // 15 saniye sonra kapat
  setTimeout(() => {
    console.log('\n🔚 Test tamamlandı, bağlantı kapatılıyor...');
    ws.close();
  }, 15000);
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.event === 'phx_reply') {
    console.log(`\n📩 Topic: ${message.topic}`);
    console.log(`Status: ${message.payload.status}`);
    if (message.payload.status === 'ok') {
      console.log('✅✅✅ BAŞARILI SUBSCRIPTION! ✅✅✅');
    } else {
      console.log('❌ Başarısız:', message.payload.response);
    }
  } else if (message.event) {
    console.log(`\n🔥 Event alındı! Type: ${message.event}`);
    console.log('Topic:', message.topic);
    console.log('Payload:', JSON.stringify(message.payload, null, 2));
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket hatası:', error);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔴 Bağlantı kapandı - Code: ${code}, Reason: ${reason}`);
  process.exit(0);
});