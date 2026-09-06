const readline = require('readline');

// stdin'i readline interface ile oku
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Test script başlatıldı. Komutları girin:');

rl.on('line', (input) => {
  console.log('Alınan komut:', input);
  
  if (input === 'exit') {
    rl.close();
    process.exit(0);
  }
});

// 30 saniye sonra otomatik kapat
setTimeout(() => {
  console.log('Timeout - script kapatılıyor');
  process.exit(0);
}, 30000);
EOF < /dev/null
