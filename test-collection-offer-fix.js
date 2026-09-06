// Collection offer stream listener ve counter-bid fix testi
const { spawn } = require('child_process');

async function testCollectionOfferFix() {
  console.log('🔧 Collection Offer Stream Listener Fix Testi Başlatılıyor...\n');
  console.log('📌 Yapılan düzeltmeler:');
  console.log('1. setupStreamListeners fonksiyonu eklendi');
  console.log('2. Collection offer listener collectionMonitorV2 üzerinden kuruluyor');
  console.log('3. Duplicate listener kontrolü kaldırıldı');
  console.log('4. Counter-bid sistemi max price kontrolü ile çalışıyor\n');
  
  const bot = spawn('node', ['index.js'], {
    cwd: '/root/opensea-bidder-bot',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Tüm çıktıları göster
  bot.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  bot.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  // Bot başlamasını bekle
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test task oluştur
  console.log('\n📝 Collection offer test task\'ı oluşturuluyor...');
  bot.stdin.write('!createtask collection_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Task ayarları - max price 0.031
  console.log('\n⚙️ Task ayarları yapılıyor (max price: 0.031 ETH)...');
  bot.stdin.write('!settask collection_test ethereum:gemesis minprice:0.028 maxprice:0.031 type:collectionoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:off\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('!starttask collection_test\n');
  
  // İlk teklif atılmasını bekle
  console.log('\n⏳ 20 saniye bekleniyor (ilk teklif için)...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  console.log('\n\n💡 ŞİMDİ TEST EDİN!');
  console.log('🎯 BAŞKA BİR CÜZDANDAN GEMESIS COLLECTION\'INA TEKLİF VERİN!');
  console.log('📌 Test senaryoları:');
  console.log('  1. 0.0285 ETH teklif verin → Bot 0.0286 ETH counter-bid atmalı');
  console.log('  2. 0.0305 ETH teklif verin → Bot counter-bid ATMAMALI (max price aşıldı)');
  console.log('\n📋 Beklenen davranış:');
  console.log('  - Stream API event\'i algılanmalı');
  console.log('  - CollectionMonitorV2 üzerinden counter-bid yapılmalı');
  console.log('  - Max price kontrolü çalışmalı\n');
  
  console.log('⏳ 120 saniye bekleniyor (test için)...\n');
  
  // Counter-bid testi için bekle
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('!stoptask collection_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Collection offer fix testi tamamlandı!');
  console.log('\n📊 Test sonuçları:');
  console.log('- Stream listener başarıyla kuruldu mu?');
  console.log('- Collection offer event\'leri algılandı mı?');
  console.log('- Counter-bid doğru fiyatla atıldı mı?');
  console.log('- Max price kontrolü çalıştı mı?');
}

testCollectionOfferFix().catch(console.error);