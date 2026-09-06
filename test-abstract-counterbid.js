const { spawn } = require("child_process");

console.log(`
========================================
ABSTRACT CHAIN COUNTER-BID TEST
========================================

Abstract chain'de counter-bid testi başlatılıyor...
Pengztracted-abstract koleksiyonuna teklif verilecek.

========================================
`);

// Test komutları
const commands = `\!createtask ornek1
\!settask ornek1 abstract:pengztracted-abstract minprice:0.005 maxprice:0.012 type:collectionoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on
\!starttask ornek1
`;

// Bot'u başlat
const bot = spawn("node", ["index.js"], {
  stdio: ["pipe", "pipe", "pipe"]
});

let counterbidDetected = false;

// Komutları gönder
setTimeout(() => {
  commands.split("\n").forEach((cmd, index) => {
    if (cmd.trim()) {
      setTimeout(() => {
        console.log(`Sending: ${cmd}`);
        bot.stdin.write(cmd + "\n");
      }, index * 1000);
    }
  });
}, 2000);

// Output'u göster
bot.stdout.on("data", (data) => {
  const output = data.toString();
  process.stdout.write(output);
  
  // Abstract event algılandığında
  if (output.includes("ABSTRACT COLLECTION OFFER ALGILANDI")) {
    console.log("\n\n🚀🚀🚀 ABSTRACT EVENT ALGILANDI\! 🚀🚀🚀\n");
  }
  
  // Counter-bid algılandığında
  if (output.includes("COUNTER-BID GEREKLİ")) {
    console.log("\n\n🎯🎯🎯 COUNTER-BID TETİKLENDİ\! 🎯🎯🎯\n");
    counterbidDetected = true;
  }
  
  // Counter-bid başarısı
  if (output.includes("COUNTER-BID BAŞARILI")) {
    console.log("\n\n✅✅✅ ABSTRACT COUNTER-BID BAŞARIYLA ATILDI\! ✅✅✅");
    console.log("TEST BAŞARILI\!\n");
    setTimeout(() => {
      bot.kill();
      process.exit(0);
    }, 5000);
  }
  
  // Hata kontrolü
  if (output.includes("processedOrderHashes.set is not a function")) {
    console.log("\n\n❌❌❌ PROCESSED ORDER HASHES HATASI VAR\! ❌❌❌\n");
  }
});

bot.stderr.on("data", (data) => {
  process.stderr.write(data);
});

// 3 dakika sonra kapat
setTimeout(() => {
  if (\!counterbidDetected) {
    console.log("\n\n⏰ 3 dakika içinde counter-bid event'i algılanmadı.");
  }
  console.log("Test süresi doldu, bot kapatılıyor...");
  bot.kill();
  process.exit(0);
}, 180000);

// CTRL+C ile kapatma
process.on("SIGINT", () => {
  console.log("\n\nBot kapatılıyor...");
  bot.kill();
  process.exit(0);
});
