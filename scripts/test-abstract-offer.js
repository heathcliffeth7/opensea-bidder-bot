const taskManager = require('../src/taskManager');
const config = require('../config');

async function runTest() {
  console.log('🚀 Abstract Offer Test Başlatılıyor...\n');
  
  // Task oluştur
  taskManager.createTask('ornek1');
  
  // Task ayarları
  const settings = {
    minPrice: 0.01,
    maxPrice: 0.015,
    offerTime: 900000, // 15 dakika
    loopTime: 120000, // 2 dakika
    counterbidEnabled: true,
    counterbidAmount: 0.0001,
    highOfferSkip: true,
    itemLimit: 1,
    chain: 'abstract',
    collection: 'pengztracted-abstract',
    type: 'tokenoffer',
    tokenIdList: ['16', '50', '896']
  };
  
  // Task'ı güncelle
  taskManager.setTaskSettings('ornek1', settings);
  
  // Task'ı başlat
  taskManager.startTask('ornek1');
  
  // 5 dakika çalışmasına izin ver
  console.log('Test 5 dakika boyunca çalışacak...');
  setTimeout(() => {
    console.log('\n⏰ Test süresi doldu, görev durduruluyor...');
    taskManager.stopTask('ornek1');
    process.exit(0);
  }, 5 * 60 * 1000);
}

// Hata yakalama
process.on('unhandledRejection', (error) => {
  console.error('Yakalanmamış hata:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Yakalanmamış istisna:', error);
});

// Testi başlat
runTest().catch(console.error);