require('dotenv').config({ path: '../.env' });
const FastCounterBid = require('../src/fastCounterBid');
const api = require('../src/api');

async function testQuickCounterBid() {
  console.log('⚡ Quick Counter-Bid Test\n');
  
  try {
    const fastCounterBid = new FastCounterBid(api);
    
    // Test task
    const task = {
      name: 'test-counterbid',
      settings: {
        chain: 'abstract',
        collection: 'pengztracted-abstract',
        minPrice: 0.008,
        maxPrice: 0.01,
        counterbidAmount: 0.0001,
        type: 'tokenoffer'
      },
      contractAddress: '0xa6c46c07f7f1966d772e29049175ebba26262513'
    };
    
    // Sahte best offer (test için)
    const fakeBestOffer = {
      price: {
        value: "8600000000000000"
      }
    };
    
    console.log('🚀 Counter-bid yapılıyor...\n');
    
    const result = await fastCounterBid.createCounterBid(
      task,
      100, // tokenId
      fakeBestOffer
    );
    
    console.log('\n📊 SONUÇ:');
    if (result.success) {
      console.log('✅ Counter-bid BAŞARILI!');
      console.log(`Order Hash: ${result.orderHash}`);
    } else {
      console.log('❌ Counter-bid BAŞARISIZ!');
      console.log(`Hata: ${result.error}`);
    }
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
  }
  
  // Hızlı çıkış
  process.exit(0);
}

// 5 saniye timeout
setTimeout(() => {
  console.log('\n⏱️ Timeout - test sonlandırılıyor');
  process.exit(1);
}, 5000);

testQuickCounterBid();