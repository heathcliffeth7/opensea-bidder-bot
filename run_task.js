const { spawn } = require('child_process');

async function runBot() {
  const bot = spawn('node', ['index.js'], {
    cwd: '/root/opensea-bidder-bot'
  });

  bot.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  bot.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  // Bot başlamasını bekle
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Komutları gönder
  bot.stdin.write('!createtask ornek1\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  bot.stdin.write('!settask ornek1 abstract:pengztracted-abstract minprice:0.005 maxprice:0.009 type:collectionoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1\n');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  bot.stdin.write('!starttask ornek1\n');
  
  // 20 saniye çalışsın
  await new Promise(resolve => setTimeout(resolve, 20000));
  
  bot.stdin.write('exit\n');
  bot.kill();
}

runBot().catch(console.error);