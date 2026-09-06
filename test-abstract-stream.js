require('dotenv').config();

// Abstract chain'i zorla
process.env.CHAIN = 'abstract';

const AbstractStreamClient = require('./src/abstractStreamClient');
const AbstractPollingClient = require('./src/abstractPollingClient');
const AbstractClientManager = require('./src/abstractClientManager');

console.log('🧪 Abstract Chain Stream/Polling Test Başlatılıyor...');
console.log('Chain:', process.env.CHAIN);
console.log('API Key:', process.env.OPENSEA_API_KEY ? process.env.OPENSEA_API_KEY.substring(0, 8) + '...' : 'YOK');

async function testAbstractStream() {
  console.log('\n=== Abstract Stream Client Test ===');
  
  const streamClient = new AbstractStreamClient();
  
  streamClient.on('connected', () => {
    console.log('✅ Stream client bağlandı!');
    
    // Test: pengztracted-abstract koleksiyonuna token offer dinle
    streamClient.subscribeTokenOffers('pengztracted-abstract', '96', (event) => {
      console.log('\n🎯 Token offer event alındı!');
      console.log(JSON.stringify(event, null, 2));
    });
  });
  
  streamClient.on('fallback_to_polling', () => {
    console.log('⚠️ Stream başarısız, polling test edilecek...');
    testAbstractPolling();
  });
  
  streamClient.on('disconnected', (info) => {
    console.log('🔴 Stream client bağlantısı kesildi:', info);
  });
  
  streamClient.connect();
}

async function testAbstractPolling() {
  console.log('\n=== Abstract Polling Client Test ===');
  
  const pollingClient = new AbstractPollingClient();
  
  // Test: pengztracted-abstract koleksiyonuna token offer dinle
  pollingClient.subscribeTokenOffers('pengztracted-abstract', '96', (event) => {
    console.log('\n🎯 Polling token offer event!');
    console.log(JSON.stringify(event, null, 2));
  });
  
  // 5 saniye bekle
  setTimeout(() => {
    console.log('\n✅ Polling test tamamlandı');
    pollingClient.disconnect();
  }, 5000);
}

async function testAbstractClientManager() {
  console.log('\n=== Abstract Client Manager Test ===');
  
  const manager = new AbstractClientManager();
  
  manager.on('connected', (info) => {
    console.log(`✅ Manager bağlandı! Mode: ${info.mode}`);
    
    // Test: pengztracted-abstract koleksiyonuna token offer dinle
    manager.subscribeTokenOffers('pengztracted-abstract', '96', (event) => {
      console.log('\n🎯 Manager token offer event!');
      console.log(JSON.stringify(event, null, 2));
    });
    
    // Status kontrolü
    setTimeout(() => {
      const status = manager.getStatus();
      console.log('\n📊 Manager Status:');
      console.log(status);
    }, 2000);
  });
  
  await manager.connect();
  
  // 20 saniye sonra kapat
  setTimeout(() => {
    console.log('\n🛑 Test sonlandırılıyor...');
    manager.disconnect();
    process.exit(0);
  }, 20000);
}

// Test seçimi
const testType = process.argv[2] || 'manager';

switch(testType) {
  case 'stream':
    testAbstractStream();
    break;
  case 'polling':
    testAbstractPolling();
    break;
  case 'manager':
    testAbstractClientManager();
    break;
  default:
    console.log('Geçersiz test tipi. Kullanım: node test-abstract-stream.js [stream|polling|manager]');
    process.exit(1);
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});