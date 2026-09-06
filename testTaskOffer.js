const taskManager = require('./src/taskManager');

async function testTaskOffer() {
  try {
    console.log('=== Task Token Offer Test ===\n');
    
    // Task ayarları
    const taskSettings = {
      chain: 'abstract',
      collection: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      minPrice: 0.008,
      maxPrice: 0.01,
      type: 'tokenoffer',
      offerTime: 15 * 60 * 1000, // 15 dakika
      loopTime: 0,
      counterbidEnabled: true,
      counterbidAmount: 0.0001,
      highOfferSkip: true,
      itemLimit: 1,
      tokenList: [108] // Test token ID
    };
    
    // Task oluştur
    taskManager.createTask('test-task', taskSettings);
    
    // Task'ı başlat
    await taskManager.startTask('test-task');
    
  } catch (error) {
    console.error('\nHata:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Birkaç saniye bekle ve çalıştır
setTimeout(testTaskOffer, 2000);