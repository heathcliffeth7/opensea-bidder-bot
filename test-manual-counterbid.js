// Manuel olarak gemesis #1234'e teklif verip counter-bid'i test edelim
const { spawn } = require('child_process');

async function testManualCounterbid() {
  console.log('🧪 Manuel Counter-bid Test Başlatılıyor...\n');
  console.log('📌 Test planı:');
  console.log('1. Önce gemesis #1234\'e düşük bir teklif vereceğiz');
  console.log('2. Sonra başka bir cüzdandan daha yüksek teklif vererek counter-bid\'i tetikleyeceğiz\n');
  
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

  // Test senaryosu: Sadece counter-bid için task oluştur
  console.log('\n📝 Counter-bid test task\'ı oluşturuluyor...');
  bot.stdin.write('!createtask counterbid_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Counter-bid etkin, çok düşük min price ile task ayarla
  console.log('\n⚙️ Task ayarları yapılıyor...');
  bot.stdin.write('!settask counterbid_test ethereum:gemesis minprice:0.001 maxprice:0.01 type:tokenoffer offertime:30min looptime:0min counterbid on 0.0001 highofferskip:off itemlimit:1 tokenidlist:1234\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('!starttask counterbid_test\n');
  
  // İlk teklif atılmasını bekle
  console.log('\n⏳ 20 saniye bekleniyor (ilk teklif için)...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  console.log('\n\n💡 ŞİMDİ BAŞKA BİR CÜZDANDAN GEMESIS #1234\'E DAHA YÜKSEK TEKLİF VERİN!');
  console.log('📌 Counter-bid\'in çalışması için 60 saniye bekleniyor...\n');
  
  // Counter-bid testi için bekle
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('!stoptask counterbid_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Test tamamlandı!');
}

testManualCounterbid().catch(console.error);