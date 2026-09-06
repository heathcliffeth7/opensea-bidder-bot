const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function smartOfferTest() {
  console.log('🧠 Smart Offer Test Başlıyor...\n');
  
  // Chain'i abstract'a geç
  await api.switchChain('abstract');
  await new Promise(r => setTimeout(r, 2000));
  
  // Yeni instance
  const offer = new AbstractTokenOffer(api);
  
  // Test parametreleri
  const tokens = [
    { contract: '0xa6c46c07f7f1966d772e29049175ebba26262513', tokenId: '16', price: 0.011 },
    { contract: '0xa6c46c07f7f1966d772e29049175ebba26262513', tokenId: '50', price: 0.012 },
    { contract: '0xa6c46c07f7f1966d772e29049175ebba26262513', tokenId: '100', price: 0.013 }
  ];
  
  for (const token of tokens) {
    console.log('\n' + '='.repeat(60));
    console.log(`📌 Token ${token.tokenId} için offer deneniyor...`);
    
    try {
      const result = await offer.createOffer(
        token.contract,
        token.tokenId,
        token.price,
        15
      );
      
      console.log('\n📊 SONUÇ:');
      if (result.success) {
        console.log('✅ BAŞARILI!');
        console.log('Order Hash:', result.order_hash);
        console.log('Chain:', result.chain);
        break; // İlk başarılı offer'da dur
      } else {
        console.log('❌ BAŞARISIZ!');
        console.log('Sebep:', result.error);
        
        if (result.requiresCancel) {
          console.log('💡 Öneri: Counter artırarak eski offer\'ları iptal edin');
        }
        
        if (result.cached) {
          console.log('⏰ Cache\'deki order hash:', result.order_hash);
        }
      }
    } catch (error) {
      console.error('❌ HATA:', error.message);
      
      // API yanıtını detaylı göster
      if (error.response && error.response.data) {
        console.log('\n📋 API Yanıtı:');
        console.log(JSON.stringify(error.response.data, null, 2));
      }
    }
    
    // Her denemeden sonra 3 saniye bekle
    await new Promise(r => setTimeout(r, 3000));
  }
  
  process.exit(0);
}

smartOfferTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});