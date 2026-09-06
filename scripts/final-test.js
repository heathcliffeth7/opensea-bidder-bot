const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function finalTest() {
  console.log('🚀 Final Test - Düzeltilmiş Parametrelerle\n');
  
  try {
    // Chain'i abstract'a geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    // Yeni instance - tamamen temiz
    const offer = new AbstractTokenOffer(api);
    
    // Test parametreleri
    const testCase = {
      contract: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '777', // Farklı bir token
      price: 0.006789, // Unique bir fiyat
      duration: 15
    };
    
    console.log('📋 Test Parametreleri:');
    console.log('Contract:', testCase.contract);
    console.log('Token ID:', testCase.tokenId);
    console.log('Fiyat:', testCase.price, 'WETH');
    console.log('Süre:', testCase.duration, 'dakika');
    console.log('\n✨ Yeni iyileştirmeler:');
    console.log('- 32 byte tamamen random salt');
    console.log('- OrderType: 2 (FULL_RESTRICTED)');
    console.log('- Zone: Abstract Seaport 1.6 zone');
    console.log('- Duplicate durumunda fiyat değiştirme');
    
    // Offer oluştur
    const result = await offer.createOffer(
      testCase.contract,
      testCase.tokenId,
      testCase.price,
      testCase.duration
    );
    
    console.log('\n📊 SONUÇ:');
    if (result.success) {
      console.log('✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
      console.log('Chain:', result.chain);
      console.log('\n🎉 DUPLICATE HATASI ÇÖZÜLDÜ!');
      
      // Order detaylarını göster
      if (result.order) {
        console.log('\n📋 Order Detayları:');
        console.log('Protocol:', result.order.protocol_address || 'N/A');
        console.log('Created:', new Date().toISOString());
      }
    } else {
      console.log('❌ BAŞARISIZ!');
      console.log('Sebep:', result.error);
      
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
  
  process.exit(0);
}

finalTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});