// Fire & Forget Counter-bid Listener Test Script
const taskManager = require('./src/taskManager');

async function testFireAndForgetListener() {
  console.log('\n🧪 === FIRE & FORGET COUNTER-BID LISTENER TEST ===\n');
  
  // Test task oluştur
  const taskName = 'test-fire-forget';
  console.log('1. Test task oluşturuluyor...');
  taskManager.createTask(taskName);
  
  // Task ayarları
  const settings = {
    chain: 'abstract',
    collection: 'pengztracted-abstract',
    minPrice: 0.0001,
    maxPrice: 0.001,
    type: 'tokenoffer',
    offerTime: 300000, // 5 dakika
    tokenIdList: [16, 50], // Sadece 2 token tokenIdList'te
    counterbidEnabled: true,
    counterbidAmount: 0.0001,
    highOfferSkip: true,
    loopTime: 0 // Sürekli çalışsın
  };
  
  console.log('2. Task ayarları belirleniyor...');
  taskManager.setTaskSettings(taskName, settings);
  
  // Test: Fire & forget callback simülasyonu
  console.log('\n3. Fire & forget callback simülasyonu...');
  
  // Örnek task objesi oluştur
  const task = taskManager.tasks[taskName];
  
  // Callback fonksiyonunu simüle et
  const simulateFireAndForgetSuccess = (tokenId, price) => {
    console.log(`\n🎯 Fire & forget success simülasyonu: Token #${tokenId}, Price: ${price} ETH`);
    
    const collection = settings.collection;
    const currentTokenKey = `${collection}-${tokenId}`;
    
    // Token offer'a kaydet
    taskManager.tokenOffers[currentTokenKey] = {
      price: price,
      taskName: taskName,
      expirationTime: Date.now() + settings.offerTime,
      chain: settings.chain,
      contractAddress: '0xa6C46c07F7f1966D772E29049175EBBa26262513'
    };
    console.log(`✔️ Token offer kaydedildi: ${currentTokenKey}`);
    
    // Counter-bid listener kur
    if (!taskManager.tokenListeners[currentTokenKey]) {
      console.log(`📡 Counter-bid listener kuruluyor...`);
      taskManager._setupTokenOfferListener(task, settings.chain, collection, tokenId)
        .then(() => {
          taskManager.tokenListeners[currentTokenKey] = true;
          console.log(`✅ Counter-bid listener kuruldu: ${currentTokenKey}`);
        })
        .catch(err => {
          console.error(`❌ Counter-bid listener kurulumu başarısız: ${err.message}`);
        });
    }
  };
  
  // tokenIdList'te OLMAYAN tokenlar için fire & forget simülasyonu
  const fireAndForgetTokens = [100, 200, 300, 400, 500]; // tokenIdList'te yok
  
  console.log('\n4. Fire & forget tokenları işleniyor...');
  console.log(`TokenIdList: [${settings.tokenIdList.join(', ')}]`);
  console.log(`Fire & forget tokenları: [${fireAndForgetTokens.join(', ')}]`);
  
  // Her token için callback'i çağır
  for (const tokenId of fireAndForgetTokens) {
    simulateFireAndForgetSuccess(tokenId, 0.0001);
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms bekle
  }
  
  // Sonuçları göster
  setTimeout(() => {
    console.log('\n📊 === TEST SONUÇLARI ===');
    console.log(`\nAktif token offers:`);
    const activeOffers = taskManager.getActiveTokenOffers();
    Object.entries(activeOffers).forEach(([key, offer]) => {
      console.log(`  ${key}: ${offer.price} ETH, Listener: ${offer.hasListener ? '✅' : '❌'}`);
    });
    
    console.log(`\nToken listeners:`);
    Object.keys(taskManager.tokenListeners).forEach(key => {
      console.log(`  ${key}: ✅`);
    });
    
    console.log(`\nMonitored collections:`);
    const collectionMonitor = taskManager.collectionMonitor;
    collectionMonitor.monitoredCollections.forEach((data, collection) => {
      console.log(`  ${collection}: ${data.tokens.size} token`);
      console.log(`    Tokens: [${Array.from(data.tokens).join(', ')}]`);
    });
    
    console.log('\n✅ Test tamamlandı!');
  }, 3000);
}

// Test'i çalıştır
testFireAndForgetListener().catch(console.error);