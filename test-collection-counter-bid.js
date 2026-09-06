// Collection offer counter-bid test
const { spawn } = require('child_process');

async function testCollectionCounterBid() {
  console.log('🔧 Collection Offer Counter-bid Testi Başlatılıyor...\n');
  console.log('📌 Düzeltilen sorunlar:');
  console.log('1. Stream event parse hatası düzeltildi');
  console.log('2. Event\'ten gelen maker ve price bilgileri doğru alınıyor');
  console.log('3. Counter-bid max price kontrolü çalışıyor\n');
  
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
  bot.stdin.write('!createtask counter_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Task ayarları - max price 0.031
  console.log('\n⚙️ Task ayarları yapılıyor...');
  console.log('   Min price: 0.028 ETH');
  console.log('   Max price: 0.031 ETH');
  console.log('   Counter-bid amount: 0.0001 ETH\n');
  
  bot.stdin.write('!settask counter_test ethereum:gemesis minprice:0.028 maxprice:0.031 type:collectionoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:off\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('!starttask counter_test\n');
  
  // İlk teklif atılmasını bekle
  console.log('\n⏳ 20 saniye bekleniyor (ilk teklif için)...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  console.log('\n\n💡 TEST TALİMATLARI:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n📌 TEST 1: Normal Counter-bid');
  console.log('1. Başka bir cüzdandan GEMESIS collection\'ına 0.0285 ETH teklif verin');
  console.log('2. Bot\'un algılaması gereken:');
  console.log('   - Stream event: "YENİ KOLEKSİYON TEKLİFİ ALGILANDI"');
  console.log('   - Maker adresi doğru gösterilmeli');
  console.log('   - Price: 0.0285 ETH olarak gösterilmeli');
  console.log('3. Bot\'un yapması gereken:');
  console.log('   - "COUNTER-BID: gemesis | Rakip: 0.0285 > Bizim: 0.028 ETH"');
  console.log('   - 0.0286 ETH counter-bid atmalı');
  console.log('   - "COUNTER-BID BAŞARILI!" mesajı vermeli\n');
  
  console.log('📌 TEST 2: Max Price Kontrolü');
  console.log('1. Başka bir cüzdandan 0.0305 ETH teklif verin');
  console.log('2. Bot\'un yapması gereken:');
  console.log('   - Event\'i algılamalı');
  console.log('   - "Counter-bid (0.0306 ETH) max price\'ı (0.031 ETH) aşıyor!" demeli');
  console.log('   - Counter-bid ATMAMALI\n');
  
  console.log('📌 TEST 3: Kendi Teklifimiz');
  console.log('1. Bot kendi teklifini algıladığında sessizce atlamalı');
  console.log('2. "Kendi teklifimiz algılandı" log\'u GÖRÜNMEMELİ\n');
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n⏳ 180 saniye test süresi...\n');
  
  // Test için bekle
  await new Promise(resolve => setTimeout(resolve, 180000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('!stoptask counter_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Collection counter-bid testi tamamlandı!');
  console.log('\n📊 Kontrol Listesi:');
  console.log('- [ ] Stream event\'leri doğru parse edildi mi?');
  console.log('- [ ] Maker adresi ve fiyat doğru gösterildi mi?');
  console.log('- [ ] Counter-bid doğru fiyatla atıldı mı?');
  console.log('- [ ] Max price kontrolü çalıştı mı?');
  console.log('- [ ] Kendi teklifleri sessizce atladı mı?');
}

testCollectionCounterBid().catch(console.error);