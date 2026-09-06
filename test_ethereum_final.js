require('dotenv').config();
const taskManager = require('./src/taskManager');
const { parseTaskCommand } = require('./utils/helpers');

async function testEthereumFinal() {
  console.log('🧪 Ethereum Final Test Başlatılıyor...\n');
  console.log('⚡ YENİ: BURST + PIPELINE HYBRID (20 TOKEN)');
  console.log('- Pattern: 20 token burst → her best offer gelince HEMEN teklif');
  console.log('- 3 worker paralel (worker arası 100ms delay)');
  console.log('- Best offer gelir gelmez teklif atılıyor (beklemeden)');
  console.log('- Worker başına max 3 concurrent istek (güvenli)');
  console.log('- 1 saniye cooldown = daha hızlı işlem');
  console.log('- Hedef: Daha yüksek throughput\n');
  
  // Görevi oluştur
  const createResult = taskManager.createTask('ornek1');
  console.log(createResult.message);
  
  // Görev ayarlarını belirle
  const settingsCommand = 'ethereum:gemesis minprice:0.02 maxprice:0.035 type:tokenoffer offertime:15min looptime:1min counterbid on 0.0001 highofferskip on itemlimit 1';
  const parsedSettings = parseTaskCommand(settingsCommand);
  
  // Token listesini ekle
  parsedSettings.tokenIds = [16,50,896,653,478,96,85,108,963,588,963,485,763,418,125,698,453,789,362,789,413,566,799,810,811,812,203,198,197,162,358,698,478,16,50,896,753,698,123,1234,5587,1125,747,562,876,369,125,147,897,898,899,900,901,902,903,904,905,906,907,908,909,910,911,912,913,914,915,916,917,918,919,920,921,922,923,924,925,926,927,928,930];
  
  // Duplicate'leri temizle
  const uniqueTokens = [...new Set(parsedSettings.tokenIds)];
  console.log(`Token sayısı: ${parsedSettings.tokenIds.length} -> Unique: ${uniqueTokens.length}`);
  parsedSettings.tokenIds = uniqueTokens;
  
  const setResult = taskManager.setTaskSettings('ornek1', parsedSettings);
  console.log(setResult.message);
  
  // Görevi başlat
  const startResult = taskManager.startTask('ornek1');
  console.log(startResult.message);
  
  console.log('\n⏱️ Test 2 dakika boyunca çalışacak...');
  console.log('📊 429 hatalarını izleyin:\n');
  
  let checkInterval = setInterval(() => {
    console.log(`⏰ ${new Date().toLocaleTimeString()} - Test devam ediyor...`);
  }, 30000); // Her 30 saniyede bir durum göster
  
  // 2 dakika bekle
  setTimeout(() => {
    clearInterval(checkInterval);
    console.log('\n🏁 Test tamamlandı!');
    
    // Görevi durdur
    const stopResult = taskManager.stopTask('ornek1');
    console.log(stopResult.message);
    
    // Özet bilgi
    const listResult = taskManager.listAllTasks();
    console.log('\n📈 Test Özeti:');
    console.table(listResult.tasks);
    
    process.exit(0);
  }, 120000); // 2 dakika
}

// Testi başlat
testEthereumFinal().catch(error => {
  console.error('Test hatası:', error);
  process.exit(1);
});