require('dotenv').config();
process.env.CHAIN = 'abstract';

const TaskManager = require('./src/taskManager');
const { API } = require('./src/api');

async function quickTest() {
  console.log('🚀 Abstract Token Offer Test');
  
  const api = new API();
  await api.initialize();
  
  const taskManager = new TaskManager(api);
  
  // Test task oluştur
  const testTask = {
    name: 'abstract-test',
    settings: {
      chain: 'abstract',
      collection: 'pengztracted-abstract',
      type: 'tokenoffer',
      tokenIdList: ['928'], // Test token
      counterbidEnabled: true,
      counterbidAmount: 0.0001,
      maxPrice: 0.05,
      minPrice: 0.01,
      offerTime: 15,
      loopTime: 0,
      highOfferskip: true
    }
  };
  
  // Task'ı başlat
  console.log('\n📌 Task başlatılıyor...');
  await taskManager.startTask(testTask);
  
  // 30 saniye bekle
  console.log('\n⏳ 30 saniye test ediliyor...');
  setTimeout(() => {
    console.log('\n✅ Test tamamlandı!');
    process.exit(0);
  }, 30000);
}

quickTest().catch(console.error);