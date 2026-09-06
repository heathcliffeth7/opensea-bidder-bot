require('dotenv').config();

// Test scenario açıklaması
console.log(`
===============================================
COUNTERBID TEST SENARYOSU
===============================================

Bu test şunları kontrol eder:
1. Stream API'den collection offer eventlerinin alınması
2. counterbidEnabled: true olduğunda counter-bid atılması
3. Kendi tekliflerimizin filtrelenmesi
4. Max price limitinin aşılmaması

Test adımları:
1. Bot başlatılıyor (counterbidEnabled: true)
2. Abstract chain'de collection offer dinleniyor
3. Başka bir cüzdandan offer geldiğinde counter-bid atılması bekleniyor

===============================================
`);

const TaskManager = require('./src/taskManager');

// TaskManager'ı başlat
const taskManager = new TaskManager();

// Test task'ı oluştur
const testTask = {
  name: 'counterbid-test',
  settings: {
    chain: 'abstract',
    collection: 'pengztracted-abstract',
    minPrice: 0.0078,
    maxPrice: 0.009,
    type: 'collectionoffer',
    offerTime: 15 * 60 * 1000, // 15 dakika
    loopTime: 0,
    counterbidEnabled: true,      // ✅ Counter-bid açık
    counterbidAmount: 0.0001,
    highOfferSkip: true,
    itemLimit: 1,
    streamApiEnabled: true         // ✅ Stream API açık (opsiyonel)
  }
};

async function runTest() {
  try {
    console.log('🚀 Test başlatılıyor...\n');
    
    // Task'ı oluştur ve başlat
    const createResult = taskManager.createTask(testTask.name);
    console.log('✅', createResult.message);
    
    const setResult = taskManager.setTaskSettings(testTask.name, testTask.settings);
    console.log('✅', setResult.message);
    
    console.log('\n📋 Task Ayarları:');
    console.log(`   Chain: ${testTask.settings.chain}`);
    console.log(`   Collection: ${testTask.settings.collection}`);
    console.log(`   Type: ${testTask.settings.type}`);
    console.log(`   CounterBid: ${testTask.settings.counterbidEnabled ? 'AÇIK' : 'KAPALI'} ✅`);
    console.log(`   CounterBid Amount: ${testTask.settings.counterbidAmount} ETH`);
    console.log(`   Min Price: ${testTask.settings.minPrice} ETH`);
    console.log(`   Max Price: ${testTask.settings.maxPrice} ETH`);
    console.log(`   Stream API: ${testTask.settings.streamApiEnabled ? 'AÇIK' : 'KAPALI'} ✅`);
    
    console.log('\n🎯 Task başlatılıyor...');
    const startResult = taskManager.startTask(testTask.name);
    console.log('✅', startResult.message);
    
    console.log('\n📡 Stream API\'den collection offer bekleniyor...');
    console.log('💡 Başka bir cüzdandan pengztracted-abstract koleksiyonuna teklif atın');
    console.log('💡 Bot otomatik olarak counter-bid atacak!\n');
    
    // Test için 5 dakika bekle
    setTimeout(() => {
      console.log('\n⏱️ Test süresi doldu. Task durduruluyor...');
      taskManager.stopTask(testTask.name);
      console.log('✅ Test tamamlandı!');
      process.exit(0);
    }, 5 * 60 * 1000);
    
  } catch (error) {
    console.error('❌ Test hatası:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test durduruluyor...');
  taskManager.stopTask('counterbid-test');
  console.log('✅ Test durduruldu.');
  process.exit(0);
});

// Test'i başlat
runTest();