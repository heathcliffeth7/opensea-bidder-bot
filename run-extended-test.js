const { spawn } = require('child_process');

// Test komutları
const commands = `!createtask ornek1
!settask ornek1 ethereum:gemesis minprice:0.028 maxprice:0.035 type:collectionoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on
!starttask ornek1
`;

// Bot'u başlat
const bot = spawn('node', ['index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

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
  
  // Event algılandığında özel mesaj
  if (output.includes('YENİ KOLEKSİYON TEKLİFİ ALGILANDI') || 
      output.includes('COLLECTION OFFER EVENT')) {
    console.log('\n\n🎉🎉🎉 GERÇEK ZAMANLI EVENT ALGILANDI! 🎉🎉🎉\n');
  }
  
  // Counter-bid başarısı
  if (output.includes('COUNTER-BID BAŞARILI')) {
    console.log('\n\n✅✅✅ COUNTER-BID BAŞARIYLA ATILDI! ✅✅✅\n');
  }
  
  // Hata kontrolü
  if (output.includes('Received 0.028399999999999998')) {
    console.log('\n\n❌❌❌ FLOATING POINT HATASI HALA VAR! ❌❌❌\n');
  }
});

bot.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// 3 dakika sonra kapat
setTimeout(() => {
  console.log('\n\nTest süresi doldu, bot kapatılıyor...');
  bot.stdin.write('!exit\n');
  setTimeout(() => {
    bot.kill();
    process.exit(0);
  }, 2000);
}, 180000);

// CTRL+C ile kapatma
process.on('SIGINT', () => {
  console.log('\n\nBot kapatılıyor...');
  bot.kill();
  process.exit(0);
});