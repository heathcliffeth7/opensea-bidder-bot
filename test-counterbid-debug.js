// Counter-bid debug test
const { spawn } = require('child_process');

async function testCounterbidDebug() {
  console.log('🔍 Counter-bid Debug Test Başlatılıyor...\n');
  console.log('📌 Test planı:');
  console.log('1. Gemesis #1234\'e düşük teklif vereceğiz');
  console.log('2. Counter-bid listener\'ların kurulduğunu doğrulayacağız');
  console.log('3. Başka cüzdandan teklif simüle edeceğiz\n');
  
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
  console.log('\n📝 Counter-bid test task\'ı oluşturuluyor...');
  bot.stdin.write('!createtask debug_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Task ayarları - çok düşük fiyatlarla test
  console.log('\n⚙️ Task ayarları yapılıyor...');
  bot.stdin.write('!settask debug_test ethereum:gemesis minprice:0.001 maxprice:0.01 type:tokenoffer offertime:30min looptime:0min counterbid on 0.0001 highofferskip:off itemlimit:1 tokenidlist:1234\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('!starttask debug_test\n');
  
  // İlk teklif atılmasını bekle
  console.log('\n⏳ 20 saniye bekleniyor (ilk teklif için)...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  console.log('\n\n💡 ŞİMDİ DEBUG LOGLARINI İNCELEYİN!');
  console.log('📌 Kontrol edilecekler:');
  console.log('  - Token key formatı doğru mu? (gemesis-1234)');
  console.log('  - tokenOffers objesine eklendi mi?');
  console.log('  - Stream listener kuruldu mu?');
  console.log('  - handleTokenBid çağrıldığında key bulunuyor mu?\n');
  
  console.log('🎯 BAŞKA BİR CÜZDANDAN GEMESIS #1234\'E TEKLİF VERİN!');
  console.log('📌 60 saniye bekleniyor...\n');
  
  // Counter-bid testi için bekle
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('!stoptask debug_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Debug testi tamamlandı!');
}

testCounterbidDebug().catch(console.error);