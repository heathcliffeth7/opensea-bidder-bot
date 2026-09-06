require('dotenv').config({ path: '../.env' });
const taskManager = require('../src/taskManager');
const config = require('../config');

async function simpleBotTest() {
  console.log('🤖 Basit Bot Testi\n');
  
  try {
    // Task oluştur
    console.log('1️⃣ Task oluşturuluyor...');
    const createResult = taskManager.createTask('ornek1');
    console.log(createResult.message);
    
    // Task ayarlarını yap
    console.log('\n2️⃣ Task ayarları yapılıyor...');
    const settings = {
      chain: 'abstract',
      collection: 'pengztracted-abstract', // Slug kullan, contract address değil
      minPrice: 0.01,
      maxPrice: 0.015,
      type: 'tokenoffer',
      offerTime: 15 * 60 * 1000, // 15 dakika
      loopTime: 2 * 60 * 1000,   // 2 dakika
      counterbidEnabled: true,
      counterbidAmount: 0.0001,
      highOfferSkip: true,
      itemLimit: 1,
      tokenIdList: ['16', '50', '896']
    };
    
    const setResult = taskManager.setTaskSettings('ornek1', settings);
    console.log(setResult.message);
    
    // Task'ı başlat
    console.log('\n3️⃣ Task başlatılıyor...');
    const startResult = taskManager.startTask('ornek1');
    console.log(startResult.message);
    
    // 30 saniye bekle ve durumu kontrol et
    console.log('\n⏳ 30 saniye bekleniyor...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Durum raporu
    console.log('\n📊 Durum raporu:');
    const activeOffers = taskManager.getActiveTokenOffers();
    console.log('Aktif token teklifleri:', Object.keys(activeOffers).length);
    
    if (Object.keys(activeOffers).length > 0) {
      console.log('\nAktif teklifler:');
      for (const [key, offer] of Object.entries(activeOffers)) {
        console.log(`- ${key}: ${offer.price} WETH`);
      }
    }
    
    // Task'ı durdur
    console.log('\n4️⃣ Task durduruluyor...');
    const stopResult = taskManager.stopTask('ornek1');
    console.log(stopResult.message);
    
    console.log('\n✅ Test tamamlandı!');
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
  }
  
  // 5 saniye sonra çık
  setTimeout(() => {
    console.log('\n👋 Çıkılıyor...');
    process.exit(0);
  }, 5000);
}

simpleBotTest();