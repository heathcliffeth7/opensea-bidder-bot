require('dotenv').config({ path: '../.env' });
const FastCounterBid = require('../src/fastCounterBid');
const api = require('../src/api');

async function testFastCounterBid() {
  console.log('🚀 Fast Counter-Bid Test\n');
  
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
    
    // Test token
    const tokenId = 100;
    
    console.log('📋 Test Parametreleri:');
    console.log(`- Token ID: ${tokenId}`);
    console.log(`- Min fiyat: ${task.settings.minPrice} ETH`);
    console.log(`- Max fiyat: ${task.settings.maxPrice} ETH`);
    console.log(`- Counterbid miktarı: ${task.settings.counterbidAmount} ETH`);
    console.log(`- Chain: ${task.settings.chain}\n`);
    
    // Önce mevcut en yüksek teklifi al
    console.log('🔍 Mevcut en yüksek teklif kontrol ediliyor...');
    const bestOffer = await api.getBestOfferForNFT(
      task.settings.chain,
      task.settings.collection,
      tokenId
    );
    
    if (bestOffer?.offer) {
      const currentPrice = api._extractPrice(bestOffer.offer);
      console.log(`Mevcut en yüksek teklif: ${currentPrice.toFixed(4)} ETH`);
    } else {
      console.log('Mevcut teklif yok');
    }
    
    // Counter-bid yap
    console.log('\n⚡ Counter-bid yapılıyor...');
    const startTime = Date.now();
    
    const result = await fastCounterBid.createCounterBid(
      task,
      tokenId,
      bestOffer?.offer || bestOffer
    );
    
    const elapsed = Date.now() - startTime;
    
    console.log('\n📊 SONUÇ:');
    if (result.success) {
      console.log(`✅ Counter-bid başarılı!`);
      console.log(`- Fiyat: ${result.price} ETH`);
      console.log(`- Order Hash: ${result.orderHash}`);
      console.log(`- Süre: ${elapsed}ms`);
    } else {
      console.log(`❌ Counter-bid başarısız!`);
      console.log(`- Hata: ${result.error}`);
    }
    
    // İstatistikleri göster
    console.log('\n📈 İstatistikler:');
    const stats = fastCounterBid.getStats();
    console.log(`- Aktif counter-bid sayısı: ${stats.activeBids}`);
    if (stats.bids.length > 0) {
      console.log('- Son counter-bidler:');
      stats.bids.forEach(bid => {
        console.log(`  Token #${bid.tokenId}: ${bid.price} (${bid.age} önce)`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
    console.error(error.stack);
  }
}

testFastCounterBid();