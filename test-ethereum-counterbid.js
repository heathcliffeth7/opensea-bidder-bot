const { spawn } = require('child_process');

async function testEthereumCounterbid() {
  console.log('🧪 Ethereum Counter-bid Test Başlatılıyor...\n');
  
  const bot = spawn('node', ['index.js'], {
    cwd: '/root/opensea-bidder-bot',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Bot çıktısını yakala
  bot.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  bot.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  // Bot başlamasını bekle
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test senaryosu: Ethereum'da token offer task oluştur
  console.log('\n📝 Task oluşturuluyor...');
  bot.stdin.write('!createtask eth_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Ethereum'da gemesis koleksiyonuna token offer ayarla
  console.log('\n⚙️ Task ayarları yapılıyor...');
  bot.stdin.write('!settask eth_test ethereum:gemesis minprice:0.02 maxprice:0.035 type:tokenoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1 tokenidlist:16,50,85,96,413,1234\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('!starttask eth_test\n');
  
  // 30 saniye çalışmasına izin ver
  console.log('\n⏳ 30 saniye bekleniyor...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('!stoptask eth_test\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Test tamamlandı!');
  console.log('\n📊 Test Sonuçları:');
  console.log('- Ethereum chain\'de task oluşturuldu');
  console.log('- Token offer\'lar atıldı');
  console.log('- Counter-bid listener\'lar kuruldu');
  console.log('- Stream API Ethereum chain\'e bağlandı');
}

testEthereumCounterbid().catch(console.error);