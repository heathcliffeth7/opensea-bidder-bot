require('dotenv').config();
const readline = require('readline');
const taskManager = require('./src/taskManager');
const config = require('./config');
const api = require('./src/api');
const helpers = require('./utils/helpers');
const { parseTaskCommand, parseTimeToMs } = helpers;

// Komut işleme fonksiyonu
async function processCommand(command) {
  const parts = command.trim().split(' ');
  const cmd = parts[0].toLowerCase();
  
  try {
    switch (cmd) {
      case '!createtask':
        if (parts.length < 2) {
          console.log('Hata: Task adı belirtilmedi. Kullanım: !createtask <task-adi>');
          return;
        }
        const taskName = parts[1];
        const createResult = taskManager.createTask(taskName);
        console.log(createResult.message);
        break;
        
      case '!settask':
        if (parts.length < 3) {
          console.log('Hata: Yetersiz parametre. Kullanım: !settask <task-adi> <parametreler>');
          return;
        }
        const settingTaskName = parts[1];
        const settings = parseTaskCommand(parts.slice(2));
        const setResult = taskManager.setTaskSettings(settingTaskName, settings);
        console.log(setResult.message);
        break;
        
      case '!starttask':
        if (parts.length < 2) {
          console.log('Hata: Task adı belirtilmedi. Kullanım: !starttask <task-adi>');
          return;
        }
        const startTaskName = parts[1];
        const startResult = taskManager.startTask(startTaskName);
        console.log(startResult.message);
        break;
        
      case '!stoptask':
        if (parts.length < 2) {
          console.log('Hata: Task adı belirtilmedi. Kullanım: !stoptask <task-adi>');
          return;
        }
        const stopTaskName = parts[1];
        const stopResult = taskManager.stopTask(stopTaskName);
        console.log(stopResult.message);
        break;
        
      case '!tasklist':
        const taskList = taskManager.listAllTasks();
        console.log('\n📋 Task Listesi:');
        console.log(`Toplam: ${taskList.totalCount}, Aktif: ${taskList.activeCount}\n`);
        taskList.tasks.forEach(task => {
          console.log(`- ${task.name}: ${task.isActive ? '✅ Aktif' : '❌ Pasif'}`);
          if (task.settings?.collection) {
            console.log(`  Collection: ${task.settings.collection}`);
            console.log(`  Type: ${task.settings.type}`);
            console.log(`  Price: ${task.settings.minPrice} - ${task.settings.maxPrice} WETH`);
          }
        });
        break;
        
      case '!help':
        console.log('\n📖 Komutlar:');
        console.log('!createtask <task-adi> - Yeni task oluştur');
        console.log('!settask <task-adi> <parametreler> - Task ayarlarını yap');
        console.log('  Örnek: !settask task1 abstract:pengztracted-abstract minprice:0.01 maxprice:0.02 type:collectionoffer offertime:15min looptime:0 counterbid:on:0.0001 highofferskip:on');
        console.log('!starttask <task-adi> - Task\'ı başlat');
        console.log('!stoptask <task-adi> - Task\'ı durdur');
        console.log('!tasklist - Tüm task\'ları listele');
        break;
        
      default:
        console.log('Bilinmeyen komut. !help yazarak komutları görebilirsiniz.');
    }
  } catch (error) {
    console.error('Komut hatası:', error.message);
  }
}

// Otomatik komutları çalıştır
async function runBot() {
  console.log('🤖 OpenSea Bidder Bot - Otomatik Mod\n');
  
  // İlk başlangıç task'ı - Sadece bot'u başlatmak için
  // Yeni task'lar için bot çalışırken komut kullanın:
  // !createtask task2
  // !settask task2 abstract:collection-name minprice:0.01 maxprice:0.02 type:collectionoffer ...
  // !starttask task2
  const initialTask = {
    name: 'pengz1',
    settings: {
      chain: 'abstract',
      collection: 'pengztracted-abstract',
      minPrice: 0.0078,
      maxPrice: 0.009,
      type: 'collectionoffer',
      offerTime: 15 * 60 * 1000, // 15 dakika
      loopTime: 0,   // Sürekli döngü
      counterbidEnabled: true,
      counterbidAmount: 0.0001,
      highOfferSkip: true,
      itemLimit: 1
    }
  };
  
  try {
    // İlk task'ı kur
    console.log(`\n📋 İlk task oluşturuluyor: ${initialTask.name}`);
    const createResult = taskManager.createTask(initialTask.name);
    console.log(createResult.message);
    
    console.log(`⚙️ Task ayarları yapılıyor: ${initialTask.name}`);
    const setResult = taskManager.setTaskSettings(initialTask.name, initialTask.settings);
    console.log(setResult.message);
    
    console.log(`🚀 Task başlatılıyor: ${initialTask.name}`);
    const startResult = taskManager.startTask(initialTask.name);
    console.log(startResult.message);
    
    console.log('\n✅ İlk task başlatıldı!');
    console.log('\n📌 Yeni task eklemek için ayrı bir terminal açıp şu komutları kullanın:');
    console.log('   node index.js');
    console.log('   !createtask yeni-task-adi');
    console.log('   !settask yeni-task-adi abstract:koleksiyon-adi minprice:0.01 maxprice:0.02 type:collectionoffer offertime:15min looptime:0 counterbid:on:0.0001 highofferskip:on');
    console.log('   !starttask yeni-task-adi');
    
    // Bot'un çalışmasını izle
    console.log('\n✅ Bot çalışıyor. Durdurmak için Ctrl+C yapın.\n');
    
    // Komut satırı arayüzü ekle
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'bot> '
    });
    
    console.log('💡 Komut kullanımı:');
    console.log('   !createtask <task-adi>');
    console.log('   !settask <task-adi> <chain>:<collection> minprice:<fiyat> maxprice:<fiyat> ...');
    console.log('   !starttask <task-adi>');
    console.log('   !stoptask <task-adi>');
    console.log('   !tasklist');
    console.log('   !help\n');
    
    rl.prompt();
    
    // Komut işleyici
    rl.on('line', async (line) => {
      const command = line.trim();
      if (!command) {
        rl.prompt();
        return;
      }
      
      await processCommand(command);
      rl.prompt();
    });
    
    // Her 30 saniyede bir durum raporu
    setInterval(() => {
      const activeOffers = taskManager.getActiveTokenOffers();
      const taskList = taskManager.listAllTasks();
      const collectionOffers = taskManager.collectionOffers || {};
      
      console.log('\n📊 DURUM RAPORU:', new Date().toLocaleString());
      console.log('Aktif task sayısı:', taskList.activeCount);
      console.log('Aktif token teklifleri:', Object.keys(activeOffers).length);
      console.log('Aktif koleksiyon teklifleri:', Object.keys(collectionOffers).length);
      
      // Task durumlarını göster
      if (taskList.tasks.length > 0) {
        console.log('\nTask Durumları:');
        for (const task of taskList.tasks) {
          console.log(`- ${task.name}: ${task.isActive ? '✅ Aktif' : '❌ Pasif'} (${task.settings?.collection || 'N/A'})`);
        }
      }
      
      // Collection offer'ları göster
      if (Object.keys(collectionOffers).length > 0) {
        console.log('\nAktif Koleksiyon Teklifleri:');
        for (const [collection, offer] of Object.entries(collectionOffers)) {
          console.log(`- ${collection}: ${offer.price} WETH`);
        }
      }
    }, 30000);
    
  } catch (error) {
    console.error('❌ Bot hatası:', error);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Bot durduruluyor...');
  
  // Tüm task'ları durdur
  const tasks = taskManager.listAllTasks();
  for (const task of tasks.tasks) {
    if (task.isActive) {
      console.log(`Task durduruluyor: ${task.name}`);
      taskManager.stopTask(task.name);
    }
  }
  
  console.log('✅ Bot durduruldu.');
  process.exit(0);
});

// Bot'u başlat
runBot();