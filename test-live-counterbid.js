const { spawn } = require('child_process');

console.log(`
========================================
COUNTER-BID TEST - CANLI TEST
========================================

Bot'u başlatıyorum ve gerçek zamanlı event bekliyorum...

YAPMANIZ GEREKENLER:
1. Bot 0.0282 WETH teklif verecek
2. OpenSea'de gemesis koleksiyonuna gidin
3. BAŞKA BİR HESAPTAN 0.0283 WETH veya daha yüksek teklif verin
4. Bot otomatik olarak counter-bid atmalı

========================================
`);

// Test komutları
const commands = `!createtask ornek1
!settask ornek1 ethereum:gemesis minprice:0.028 maxprice:0.035 type:collectionoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on
!starttask ornek1
`;

// Bot'u başlat
const bot = spawn('node', ['index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let counterbidDetected = false;

// Komutları gönder
setTimeout(() => {
  commands.split('\n').forEach((cmd, index) => {
    if (cmd.trim()) {
      setTimeout(() => {
        console.log(`Sending: ${cmd}`);
        bot.stdin.write(cmd + '\n');
      }, index * 1000);
    }
  });
}, 2000);

// Output'u göster
bot.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  
  // Counter-bid algılandığında
  if (output.includes('COUNTER-BID GEREKLİ')) {
    console.log('\n\n🎯🎯🎯 COUNTER-BID TETİKLENDİ! 🎯🎯🎯\n');
    counterbidDetected = true;
  }
  
  // Counter-bid başarısı
  if (output.includes('COUNTER-BID BAŞARILI')) {
    console.log('\n\n✅✅✅ COUNTER-BID BAŞARIYLA ATILDI! ✅✅✅');
    console.log('TEST BAŞARILI!\n');
    setTimeout(() => {
      bot.kill();
      process.exit(0);
    }, 5000);
  }
  
  // Hata kontrolü
  if (output.includes('Order expiration exceeds limit')) {
    console.log('\n\n❌❌❌ EXPIRATION TIME HATASI HALA VAR! ❌❌❌\n');
  }
  
  if (output.includes('processedOrderHashes.add is not a function')) {
    console.log('\n\n❌❌❌ PROCESSED ORDER HASHES HATASI HALA VAR! ❌❌❌\n');
  }
});

bot.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// 5 dakika sonra kapat
setTimeout(() => {
  if (!counterbidDetected) {
    console.log('\n\n⏰ 5 dakika içinde counter-bid event\'i algılanmadı.');
    console.log('Başka bir hesaptan gemesis koleksiyonuna teklif verdiğinizden emin olun.\n');
  }
  console.log('Test süresi doldu, bot kapatılıyor...');
  bot.kill();
  process.exit(0);
}, 300000);

// CTRL+C ile kapatma
process.on('SIGINT', () => {
  console.log('\n\nBot kapatılıyor...');
  bot.kill();
  process.exit(0);
});