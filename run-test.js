const { spawn } = require('child_process');
const fs = require('fs');

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
  process.stdout.write(data);
});

bot.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// 60 saniye sonra kapat
setTimeout(() => {
  console.log('\n\nTest süresi doldu, bot kapatılıyor...');
  bot.stdin.write('!exit\n');
  setTimeout(() => {
    bot.kill();
    process.exit(0);
  }, 2000);
}, 60000);

// CTRL+C ile kapatma
process.on('SIGINT', () => {
  console.log('\n\nBot kapatılıyor...');
  bot.kill();
  process.exit(0);
});