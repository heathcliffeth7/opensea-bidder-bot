require('dotenv').config();
process.env.CHAIN = 'abstract';

const taskManager = require('./src/taskManager');

async function testAbstractTokenTask() {
  console.log('🧪 Abstract Token Task Test');
  
  // Test task oluştur
  const taskName = 'test-abstract-tokens';
  console.log(`\n1️⃣ Task oluşturuluyor: ${taskName}`);
  const createResult = taskManager.createTask(taskName);
  console.log(createResult.message);
  
  // Task ayarları
  const settings = {
    chain: 'abstract',
    collection: 'pengztracted-abstract',
    minPrice: 0.01,
    maxPrice: 0.02,
    type: 'tokenoffer',
    offerTime: 15 * 60 * 1000, // 15 dakika
    loopTime: 0,
    counterbidEnabled: true,
    counterbidAmount: 0.0001,
    highOfferSkip: true,
    tokenIdList: [16, 50, 896, 928] // Test token'ları
  };
  
  console.log(`\n2️⃣ Task ayarları yapılıyor...`);
  const setResult = taskManager.setTaskSettings(taskName, settings);
  console.log(setResult.message);
  
  console.log(`\n3️⃣ Task başlatılıyor...`);
  const startResult = taskManager.startTask(taskName);
  console.log(startResult.message);
  
  console.log('\n✅ Token offer task başlatıldı!');
  console.log('📡 İzlenen tokenler: 16, 50, 896, 928');
  console.log('\n⏳ Event bekleniyor (30 saniye)...');
  console.log('💡 Başka bir cüzdandan bu tokenlerden birine teklif atın');
  
  // 30 saniye bekle
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log('\n🏁 Test tamamlandı!');
  
  // Task'ı durdur
  console.log('\n4️⃣ Task durduruluyor...');
  const stopResult = taskManager.stopTask(taskName);
  console.log(stopResult.message);
  
  process.exit(0);
}

testAbstractTokenTask().catch(console.error);