require('dotenv').config({ path: '../.env' });
const BatchTokenProcessor = require('../src/batchTokenProcessor');
const api = require('../src/api');

async function testParallelOffers() {
  console.log('⚡ Paralel Teklif Testi\n');
  
  try {
    const batchProcessor = new BatchTokenProcessor(api);
    
    // Test task
    const task = {
      name: 'parallel-test',
      settings: {
        chain: 'abstract',
        collection: 'pengztracted-abstract',
        minPrice: 0.005,
        maxPrice: 0.01,
        counterbidEnabled: true,
        counterbidAmount: 0.0001,
        highOfferSkip: true,
        type: 'tokenoffer'
      }
    };
    
    // Test token listesi (10 token)
    const tokens = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
    
    console.log('📋 Test Parametreleri:');
    console.log(`- Token sayısı: ${tokens.length}`);
    console.log(`- Batch size: ${batchProcessor.batchSize}`);
    console.log(`- Min fiyat: ${task.settings.minPrice} ETH`);
    console.log(`- Max fiyat: ${task.settings.maxPrice} ETH`);
    console.log(`- Chain: ${task.settings.chain}\n`);
    
    console.log('🚀 Paralel işlem başlatılıyor...');
    const startTime = Date.now();
    
    // Batch processor'ı çalıştır (doğru parametre sırası)
    const results = await batchProcessor.processBatch(
      task,
      tokens,
      '0xa6c46c07f7f1966d772e29049175ebba26262513', // contract address
      15 * 60 * 1000 // 15 dakika offer time (milisaniye)
    );
    
    const elapsed = Date.now() - startTime;
    
    // Sonuçları analiz et
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('\n📊 TEST SONUÇLARI:');
    console.log(`- Toplam süre: ${elapsed}ms (${(elapsed/1000).toFixed(2)} saniye)`);
    console.log(`- Başarılı: ${successful}`);
    console.log(`- Başarısız: ${failed}`);
    console.log(`- Ortalama süre/token: ${Math.round(elapsed / tokens.length)}ms`);
    
    if (failed > 0) {
      console.log('\n❌ Başarısız tokenlar:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`- Token #${r.tokenId}: ${r.error}`);
      });
    }
    
    // Performans analizi
    console.log('\n⚡ PERFORMANS ANALİZİ:');
    if (elapsed < tokens.length * 1000) {
      console.log('✅ PARALEL İŞLEM BAŞARILI! Sıralı işlemden daha hızlı.');
    } else {
      console.log('⚠️ Paralel işlem beklenen hızda değil.');
    }
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
    console.error(error.stack);
  }
}

testParallelOffers();