#!/usr/bin/env node

const readline = require('readline');
const { spawn } = require('child_process');

// Bot'u başlat
const bot = spawn('node', ['index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let commandQueue = [
  '!createtask ornek1',
  '!settask ornek1 ethereum:gemesis minprice:0.02 maxprice:0.035 type:tokenoffer offertime:15min looptime:1min counterbid on 0.0001 highofferskip on itemlimit 1 tokenidlist:16,50,896,653,478,96,85,108,963,588,963,485,763,418,125,698,453,789,362,789,413,566,799,810,811,812,203,198,197,162,358,698,478,16,50,896,753,698,123,1234,5587,1125,747,562,876,369,125,147,897,898,899,900,901,902,903,904,905,906,907,908,909,910,911,912,913,914,915,916,917,918,919,920,921,922,923,924,925,926,927,928,930',
  '!starttask ornek1'
];

let currentCommandIndex = 0;

// Bot çıktılarını dinle
bot.stdout.on('data', (data) => {
  console.log(data.toString());
  
  // Bot hazır olduğunda komutları gönder
  if (data.toString().includes('OpenSea Bidder Bot kullanıma hazır!') || 
      data.toString().includes('opensea-bidder>')) {
    
    if (currentCommandIndex < commandQueue.length) {
      setTimeout(() => {
        const command = commandQueue[currentCommandIndex];
        console.log(`\n>>> Komut gönderiliyor: ${command}`);
        bot.stdin.write(command + '\n');
        currentCommandIndex++;
      }, 1000);
    }
  }
  
  // Log'larda fiyat hesaplama ve teklif verme kısımlarını ara
  const logData = data.toString();
  if (logData.includes('→') || logData.includes('Teklif atılıyor') || 
      logData.includes('Token #') || logData.includes('Best offer') ||
      logData.includes('offerPrice') || logData.includes('0.035') ||
      logData.includes('0.02') || logData.includes('ETH')) {
    console.log('\n🔍 ÖNEMLİ LOG:', logData);
  }
});

bot.stderr.on('data', (data) => {
  console.error('Hata:', data.toString());
});

// 60 saniye sonra bot'u durdur
setTimeout(() => {
  console.log('\n\nTest tamamlandı, bot durduruluyor...');
  bot.kill();
  process.exit(0);
}, 60000);