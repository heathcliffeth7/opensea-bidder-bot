const { spawn } = require('child_process');

async function testGemsisLowPrice() {
  console.log('🧪 Gemesis Counter-bid Test (Düşük Fiyat) Başlatılıyor...\n');
  
  const bot = spawn('node', ['index.js'], {
    cwd: '/root/opensea-bidder-bot',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Bot çıktısını yakala
  bot.stdout.on('data', (data) => {
    const output = data.toString();
    // Stream API ve counter-bid ile ilgili log'ları filtrele
    if (output.includes('Stream') || 
        output.includes('📡') || 
        output.includes('channel') || 
        output.includes('Channel') ||
        output.includes('gemesis') ||
        output.includes('Counter-bid') ||
        output.includes('listener')) {
      console.log(output);
    }
  });

  bot.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  // Bot başlamasını bekle
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test senaryosu: Ethereum'da token offer task oluştur
  console.log('\n📝 Task oluşturuluyor...');
  bot.stdin.write('!createtask gem_low\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Düşük max price ile gemesis koleksiyonuna token offer ayarla
  console.log('\n⚙️ Task ayarları yapılıyor (düşük max price)...');
  bot.stdin.write('!settask gem_low ethereum:gemesis minprice:0.01 maxprice:0.08 type:tokenoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1 tokenidlist:1234\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n🚀 Task başlatılıyor...');
  bot.stdin.write('!starttask gem_low\n');
  
  // 30 saniye çalışmasına izin ver
  console.log('\n⏳ 30 saniye bekleniyor...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  // Task'ı durdur
  console.log('\n🛑 Task durduruluyor...');
  bot.stdin.write('!stoptask gem_low\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Bot'u kapat
  bot.stdin.write('exit\n');
  bot.kill();
  
  console.log('\n✅ Test tamamlandı!');
}

testGemsisLowPrice().catch(console.error);