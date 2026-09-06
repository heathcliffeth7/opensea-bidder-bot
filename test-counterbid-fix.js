// Counter-bid fix testi
const { spawn } = require('child_process');

async function testCounterbidFix() {
  console.log('🔧 Counter-bid Fix Testi Başlatılıyor...\n');
  console.log('📌 Yapılan düzeltme:');
  console.log('- API\'ye gitmek yerine Stream event\'inden gelen fiyatı kullanıyoruz');
  console.log('- Bu sayede collection offer yerine doğru token offer fiyatını görüyoruz\n');
  
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
  console.log('\n📝 Counter-bid fix test task\'ı oluşturuluyor...');
  bot.stdin.write('\!createtask fix_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Task ayarları - max price 0.035
  console.log('\n⚙️ Task ayarları yapılıyor (max price: 0.035 ETH)...');
  bot.stdin.write('\!settask fix_test ethereum:gemesis minprice:0.025 maxprice:0.035 type:tokenoffer offertime:30min looptime:0min counterbid on 0.0001 highofferskip:off itemlimit:1 tokenidlist:930\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('\!starttask fix_test\n');
  
  // İlk teklif atılmasını bekle
  console.log('\n⏳ 20 saniye bekleniyor (ilk teklif için)...');
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  console.log('\n\n💡 ŞİMDİ TEST EDİN\!');
  console.log('🎯 BAŞKA BİR CÜZDANDAN GEMESIS #930\'a 0.0283 ETH TEKLİF VERİN\!');
  console.log('📌 Beklenen davranış:');
  console.log('  - Stream\'den gelen fiyat: 0.0283 ETH (doğru)');
  console.log('  - Collection offer değil, token offer kullanılacak');
  console.log('  - Counter-bid: 0.0284 ETH olmalı');
  console.log('  - Max price (0.035) aşılmadığı için başarılı olmalı\n');
  
  console.log('⏳ 60 saniye bekleniyor...\n');
  
  // Counter-bid testi için bekle
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('\!stoptask fix_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Fix testi tamamlandı\!');
}

testCounterbidFix().catch(console.error);
EOF < /dev/null
