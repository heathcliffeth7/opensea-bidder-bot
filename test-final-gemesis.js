require('dotenv').config();
process.env.CHAIN = 'ethereum';

const taskManager = require('./src/taskManager');

async function testFinalGemesis() {
  console.log('🧪 Final Gemesis Test - Token Offer Task');
  
  // Test task oluştur
  const taskName = 'test-gemesis-final';
  console.log(`\n1️⃣ Task oluşturuluyor: ${taskName}`);
  const createResult = taskManager.createTask(taskName);
  console.log(createResult.message);
  
  // Task ayarları - sadece birkaç token test et
  const settings = {
    chain: 'ethereum',
    collection: 'gemesis',
    minPrice: 0.02,
    maxPrice: 0.035,
    type: 'tokenoffer',
    offerTime: 15 * 60 * 1000, // 15 dakika
    loopTime: 0,
    counterbidEnabled: true,
    counterbidAmount: 0.0001,
    highOfferSkip: true,
    tokenIds: [16, 50, 108, 963, 896] // Test token'ları - tokenIds olarak değiştirildi
  };
  
  console.log(`\n2️⃣ Task ayarları yapılıyor...`);
  const setResult = taskManager.setTaskSettings(taskName, settings);
  console.log(setResult.message);
  
  console.log(`\n3️⃣ Task başlatılıyor...`);
  const startResult = taskManager.startTask(taskName);
  console.log(startResult.message);
  
  console.log('\n✅ Gemesis token offer task başlatıldı!');
  console.log('📡 İzlenen tokenler: 16, 50, 108, 963, 896');
  console.log('💰 Max price: 0.035 ETH');
  console.log('\n⏳ İşlem tamamlanıyor (15 saniye)...');
  
  // 15 saniye bekle
  await new Promise(resolve => setTimeout(resolve, 15000));
  
  console.log('\n🏁 Test tamamlandı!');
  
  // Task'ı durdur
  console.log('\n4️⃣ Task durduruluyor...');
  const stopResult = taskManager.stopTask(taskName);
  console.log(stopResult.message);
  
  process.exit(0);
}

testFinalGemesis().catch(console.error);