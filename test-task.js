require('dotenv').config();
const taskManager = require('./src/taskManager');
const helpers = require('./utils/helpers');
const { parseTaskCommand } = helpers;

async function main() {
  console.log('Test görevi başlatılıyor...');
  
  // 1. Task oluştur
  const createResult = taskManager.createTask('ornek1');
  console.log('Task oluşturma:', createResult.message);
  
  // 2. Task ayarlarını yap
  const settingsCommand = 'abstract:pengztracted-abstract minprice:0.01 maxprice:0.015 type:tokenoffer offertime:15min looptime:2min counterbid on 0.0001 highofferskip on itemlimit 1 tokenidlist:16,50,896';
  const parsedSettings = parseTaskCommand(settingsCommand);
  
  console.log('Parsed settings:', parsedSettings);
  
  const setResult = taskManager.setTaskSettings('ornek1', parsedSettings);
  console.log('Task ayarlama:', setResult.message);
  
  if (setResult.success) {
    console.log('Görev ayarları:');
    console.log(JSON.stringify(setResult.task.settings, null, 2));
  }
  
  // 3. Task'ı başlat
  const startResult = taskManager.startTask('ornek1');
  console.log('Task başlatma:', startResult.message);
  
  // 30 saniye bekle ve hatayı gözlemle
  setTimeout(() => {
    console.log('\\n30 saniye sonra task durumu:');
    const settingsResult = taskManager.getTaskSettings('ornek1');
    if (settingsResult.success) {
      console.log(JSON.stringify(settingsResult.task, null, 2));
    }
    
    // Task'ı durdur
    const stopResult = taskManager.stopTask('ornek1');
    console.log('\\nTask durdurma:', stopResult.message);
    
    process.exit(0);
  }, 30000);
}

main().catch(console.error);