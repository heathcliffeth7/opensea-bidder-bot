require('dotenv').config({ path: '../.env' });
const CollectionOfferMonitorV2 = require('../src/collectionOfferMonitorV2');
const api = require('../src/api');

async function testCounterBid() {
  console.log('🎯 Counter Bid Test\n');
  
  try {
    // Sahte task ve taskManager oluştur
    const taskManager = {
      tokenOffers: {}
    };
    
    const monitor = new CollectionOfferMonitorV2(api, taskManager);
    
    // Test task
    const task = {
      name: 'test-task',
      settings: {
        chain: 'abstract',
        collection: 'pengztracted-abstract',
        minPrice: 0.01,
        maxPrice: 0.02,
        counterbidEnabled: true,
        counterbidAmount: 0.0001,
        highOfferSkip: true
      }
    };
    
    // Sahte bid event
    const bidData = {
      collection: 'pengztracted-abstract',
      tokenId: '50',
      price: 0.011, // Bizden yüksek bir teklif
      maker: '0x1234567890123456789012345678901234567890', // Başka birinin adresi
      orderHash: '0xabc123'
    };
    
    console.log('📋 Test Senaryosu:');
    console.log(`- Token: #${bidData.tokenId}`);
    console.log(`- Rakip teklifi: ${bidData.price} ETH`);
    console.log(`- Counter-bid miktarı: ${task.settings.counterbidAmount} ETH`);
    console.log(`- Beklenen counter-bid: ${bidData.price + task.settings.counterbidAmount} ETH\n`);
    
    // Counter-bid'i tetikle
    await monitor.handleTokenBid(
      bidData,
      task,
      '0xa6c46c07f7f1966d772e29049175ebba26262513',
      'pengztracted-abstract'
    );
    
    console.log('\n✅ Counter-bid testi tamamlandı!');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
    if (error.response?.data) {
      console.error('API yanıtı:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  // Test bitince çık
  setTimeout(() => process.exit(0), 2000);
}

testCounterBid();