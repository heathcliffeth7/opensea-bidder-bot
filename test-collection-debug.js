// Collection offer debug test
const { spawn } = require('child_process');

async function testCollectionDebug() {
  console.log('🔧 Collection Offer Debug Testi Başlatılıyor...\n');
  
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
  console.log('\n📝 Collection offer debug task\'ı oluşturuluyor...');
  bot.stdin.write('!createtask debug_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Task ayarları
  console.log('\n⚙️ Task ayarları yapılıyor...');
  console.log('   Min price: 0.028 ETH');
  console.log('   Max price: 0.031 ETH');
  console.log('   Counter-bid amount: 0.0001 ETH');
  console.log('   HighOfferSkip: OFF (counter-bid her zaman çalışacak)\n');
  
  bot.stdin.write('!settask debug_test ethereum:gemesis minprice:0.028 maxprice:0.031 type:collectionoffer offertime:15min looptime:1min counterbid on 0.0001 highofferskip:off\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('!starttask debug_test\n');
  
  // İlk teklif atılmasını bekle
  console.log('\n⏳ 20 saniye bekleniyor (ilk teklif için)...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  console.log('\n\n💡 DEBUG LOG\'LARI İZLEYİN:');
  console.log('═══════════════════════════════════════════════════════');
  console.log('1. Başka cüzdandan 0.0285 ETH teklif verin');
  console.log('\n2. Şu log\'ları görmelisiniz:');
  console.log('   - "YENİ KOLEKSİYON TEKLİFİ ALGILANDI"');
  console.log('   - "COLLECTION OFFER EVENT"');
  console.log('   - "HANDLE COLLECTION OFFER"');
  console.log('   - Price değerleri doğru gösterilmeli');
  console.log('   - Counter-bid logic çalışmalı');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log('⏳ 120 saniye test süresi...\n');
  
  // Test için bekle
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('!stoptask debug_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Debug testi tamamlandı!');
}

testCollectionDebug().catch(console.error);