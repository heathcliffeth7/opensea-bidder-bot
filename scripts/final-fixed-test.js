const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function finalFixedTest() {
  console.log('🚀 Final Fixed Test - Tüm Düzeltmelerle\n');
  
  try {
    // Chain'i abstract'a geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    // Yeni instance
    const offer = new AbstractTokenOffer(api);
    
    // Test parametreleri
    const testCase = {
      contract: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '1', // Var olduğunu bildiğimiz token
      price: 0.005, // Makul bir fiyat
      duration: 30 // 30 dakika
    };
    
    console.log('📋 Test Parametreleri:');
    console.log('Contract:', testCase.contract);
    console.log('Token ID:', testCase.tokenId);
    console.log('Fiyat:', testCase.price, 'WETH');
    console.log('Süre:', testCase.duration, 'dakika');
    
    console.log('\n✨ Yapılan Düzeltmeler:');
    console.log('- Salt: 32 byte hex formatında random');
    console.log('- Counter: Blockchain\'den güncel değer alınıyor');
    console.log('- Zone: Abstract Seaport 1.6 zone');
    console.log('- OrderType: 2 (FULL_RESTRICTED)');
    console.log('- ConduitKey: Abstract için doğru key');
    
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
      console.log('✨ TÜM SORUNLAR GİDERİLDİ!');
      
      // Order detaylarını göster
      if (result.order) {
        console.log('\n📋 Order Detayları:');
        if (result.order.order) {
          console.log('Order Hash:', result.order.order.order_hash);
          console.log('Created:', result.order.order.created_date);
          console.log('Expires:', result.order.order.expiration_date);
          console.log('Maker:', result.order.order.maker?.address);
        }
      }
    } else {
      console.log('❌ BAŞARISIZ!');
      console.log('Sebep:', result.error);
      
      if (result.retrying) {
        console.log('⏳ Otomatik retry yapılıyor...');
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

finalFixedTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});