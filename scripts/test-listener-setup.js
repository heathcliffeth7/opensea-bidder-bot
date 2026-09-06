require('dotenv').config({ path: '../.env' });
const CollectionOfferMonitorV2 = require('../src/collectionOfferMonitorV2');
const api = require('../src/api');

async function testListenerSetup() {
  console.log('🎧 Listener Setup Test\n');
  
  try {
    // Sahte taskManager
    const taskManager = {
      tokenOffers: {}
    };
    
    const monitor = new CollectionOfferMonitorV2(api, taskManager);
    
    // Test task
    const task = {
      name: 'test-task',
      settings: {
        chain: 'abstract',
        collection: 'pengztracted-abstract',
        tokenIdList: [16, 50, 896],
        minPrice: 0.01,
        maxPrice: 0.02,
        counterbidEnabled: true,
        counterbidAmount: 0.0001
      }
    };
    
    // Stream API bağlantısını bekle
    console.log('⏳ Stream API bağlantısı bekleniyor...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Listener'ı kur
    console.log('\n🔧 Listener kuruluyor...');
    monitor.setupCollectionListener(
      task,
      '0xa6c46c07f7f1966d772e29049175ebba26262513',
      null
    );
    
    console.log('\n✅ Listener kurulum testi tamamlandı!');
    console.log('Dinlenen tokenler: 16, 50, 896');
    console.log('\n⏳ Event bekleniyor (10 saniye)...');
    
    // 10 saniye bekle
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('\n🏁 Test tamamlandı!');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

testListenerSetup();