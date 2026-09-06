require('dotenv').config();
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const { ethers } = require('ethers');
const axios = require('axios');

// Kendi modüllerimizi içe aktar
const config = require('./config');
const api = require('./src/api');
const taskManager = require('./src/taskManager');
const helpers = require('./utils/helpers');
const { parseTaskCommand, parseTimeToMs, formatPrice } = helpers;
const readTokenIdsFromFile = helpers.readTokenIdsFromFile; // async fonksiyonu ayrı al

// Komut satırı arayüzünü oluştur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'opensea-bidder> '
});

// Komut işleme fonksiyonu
async function processCommand(command) {
  // Komutu ayrıştır
  const parts = command.trim().split(' ');
  const cmd = parts[0].toLowerCase();
  
  try {
    switch (cmd) {
      case '!createtask':
        // !createtask <taskismi>
        if (parts.length < 2) {
          console.log('Hata: Görev adı belirtilmedi. Kullanım: !createtask <taskismi>');
          return;
        }
        
        const taskName = parts[1];
        const createResult = taskManager.createTask(taskName);
        console.log(createResult.message);
        break;
        
      case '!settask':
        // !settask <taskismi> koleksiyonunolduğuchain:koleskiyonismi minprice:0.001 maxprice:0.003 ...
        if (parts.length < 3) {
          console.log('Hata: Yetersiz parametre. Kullanım: !settask <taskismi> [parametreler]');
          return;
        }
        
        const settingTaskName = parts[1];
        const settingsCommand = parts.slice(2).join(' ');
        const parsedSettings = parseTaskCommand(settingsCommand);
        
        // Token ID'leri dosyadan oku (eğer belirtilmişse)
        if (parsedSettings.tokenIdsFile) {
          const filePath = path.join(__dirname, 'data', parsedSettings.tokenIdsFile);
          try {
            const tokenIds = await readTokenIdsFromFile(filePath);
            parsedSettings.tokenIds = tokenIds;
            console.log(`${tokenIds.length} adet token ID okundu.`);
          } catch (error) {
            console.error(`Token ID'leri okunamadı: ${error.message}`);
          }
        }
        
        const setResult = taskManager.setTaskSettings(settingTaskName, parsedSettings);
        console.log(setResult.message);
        
        if (setResult.success) {
          console.log('Görev ayarları:');
          console.log(JSON.stringify(setResult.task.settings, null, 2));
        }
        break;
        
      case '!starttask':
        // !starttask <taskismi>
        if (parts.length < 2) {
          console.log('Hata: Görev adı belirtilmedi. Kullanım: !starttask <taskismi>');
          return;
        }
        
        const startTaskName = parts[1];
        const startResult = taskManager.startTask(startTaskName);
        console.log(startResult.message);
        break;
        
      case '!stoptask':
        // !stoptask <taskismi>
        if (parts.length < 2) {
          console.log('Hata: Görev adı belirtilmedi. Kullanım: !stoptask <taskismi>');
          return;
        }
        
        const stopTaskName = parts[1];
        const stopResult = taskManager.stopTask(stopTaskName);
        console.log(stopResult.message);
        break;
        
      case '!settingstask':
        // !settingstask <taskismi>
        if (parts.length < 2) {
          console.log('Hata: Görev adı belirtilmedi. Kullanım: !settingstask <taskismi>');
          return;
        }
        
        const settingsTaskName = parts[1];
        const settingsResult = taskManager.getTaskSettings(settingsTaskName);
        
        if (settingsResult.success) {
          console.log(`"${settingsTaskName}" görevinin ayarları:`);
          console.log(JSON.stringify(settingsResult.task, null, 2));
        } else {
          console.log(settingsResult.message);
        }
        break;
        
      case '!tasklist':
        // !tasklist
        const listResult = taskManager.listAllTasks();
        
        if (listResult.tasks.length === 0) {
          console.log('Henüz hiç görev oluşturulmadı.');
        } else {
          console.log(`Toplam ${listResult.totalCount} görev, ${listResult.activeCount} aktif görev:`);
          console.table(listResult.tasks);
        }
        break;
        
      case '!help':
        // !help
        console.log('Kullanılabilir komutlar:');
        console.log('!createtask <taskismi> - Yeni bir görev oluşturur');
        console.log('!settask <taskismi> [parametreler] - Görev ayarlarını belirler');
        console.log('!starttask <taskismi> - Görevi başlatır');
        console.log('!stoptask <taskismi> - Görevi durdurur');
        console.log('!settingstask <taskismi> - Görev ayarlarını gösterir');
        console.log('!tasklist - Tüm görevleri listeler');
        console.log('!exit - Programdan çıkar');
        break;
        
      case '!exit':
        // !exit
        console.log('Program sonlandırılıyor...');
        rl.close();
        process.exit(0);
        break;
        
      default:
        console.log(`Bilinmeyen komut: ${cmd}. Yardım için !help yazabilirsiniz.`);
    }
  } catch (error) {
    console.error(`Komut işlenirken hata oluştu: ${error.message}`);
    console.error(error.stack);
  }
}

// Veri klasörünün varlığını kontrol et ve yoksa oluştur
async function ensureDataDirectory() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch (error) {
    // Klasör yoksa oluştur
    await fs.mkdir(dataDir, { recursive: true });
    console.log('"data" klasörü oluşturuldu.');
  }
}

// Ana fonksiyon
async function main() {
  console.log('OpenSea Bidder Bot başlatılıyor...');
  
  // Veri klasörünü kontrol et
  await ensureDataDirectory();
  
  // Komut satırı arayüzünü başlat
  rl.prompt();
  
  rl.on('line', async (line) => {
    if (line.trim()) {
      await processCommand(line.trim());
    }
    rl.prompt();
  }).on('close', () => {
    console.log('Program sonlandırıldı.');
    process.exit(0);
  });
  
  // Örnek görev oluştur
  console.log('\nOpenSea Bidder Bot kullanıma hazır!');
  console.log('Yardım için !help yazabilirsiniz.\n');
  console.log('Örnek kullanım:');
  console.log('!createtask ornek1');
  console.log('!settask ornek1 ethereum:opepen-edition minprice:0.001 maxprice:0.003 type:criteriaoffer trait:Edition size:Four offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1');
  console.log('!starttask ornek1\n');
}

// Programı başlat
main().catch(error => {
  console.error('Program başlatılırken hata oluştu:', error);
  process.exit(1);
});
