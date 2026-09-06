// Temiz log testi
const { spawn } = require('child_process');

async function testCleanLogs() {
  console.log('🧪 Temiz Log Testi Başlatılıyor...\n');
  console.log('📌 Test planı:');
  console.log('1. Sadece bizim teklif verdiğimiz token\'ların event\'leri görünecek');
  console.log('2. Diğer token\'lar sessizce filtrelenecek');
  console.log('3. Gereksiz loglar kaldırıldı\n');
  
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
  console.log('\n📝 Test task\'ı oluşturuluyor...');
  bot.stdin.write('!createtask clean_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Task ayarları - sadece birkaç token
  console.log('\n⚙️ Task ayarları yapılıyor...');
  bot.stdin.write('!settask clean_test ethereum:gemesis minprice:0.025 maxprice:0.035 type:tokenoffer offertime:30min looptime:0min counterbid on 0.0001 highofferskip:off itemlimit:1 tokenidlist:930,931,932\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('!starttask clean_test\n');
  
  // İlk teklif atılmasını bekle
  console.log('\n⏳ 20 saniye bekleniyor (ilk teklifler için)...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  console.log('\n\n💡 ŞİMDİ LOG\'LARI İNCELEYİN!');
  console.log('📌 Beklenen davranış:');
  console.log('  - Sadece #930, #931, #932 token\'larının event\'leri görünmeli');
  console.log('  - #57, #78 gibi diğer token\'lar görünmemeli');
  console.log('  - Heartbeat logları görünmemeli');
  console.log('  - Gereksiz "Event alındı" logları görünmemeli\n');
  
  console.log('🎯 BAŞKA BİR CÜZDANDAN #930, #931 veya #932\'ye TEKLİF VERİN!');
  console.log('📌 60 saniye bekleniyor...\n');
  
  // Counter-bid testi için bekle
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('!stoptask clean_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Temiz log testi tamamlandı!');
}

testCleanLogs().catch(console.error);