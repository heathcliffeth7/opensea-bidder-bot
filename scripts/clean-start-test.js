const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function cleanStartTest() {
  console.log('🧹 Clean Start Test - Yeni Counter ile\n');
  
  try {
    // Chain'i abstract'a geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    // Yeni instance - cache'siz
    const offer = new AbstractTokenOffer(api);
    
    // Test için parametreler
    const testCase = {
      contract: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '42', // Farklı bir token
      price: 0.009, // Temiz bir fiyat
      duration: 15
    };
    
    console.log('📋 Test Parametreleri:');
    console.log('Contract:', testCase.contract);
    console.log('Token ID:', testCase.tokenId);
    console.log('Fiyat:', testCase.price, 'WETH');
    console.log('Süre:', testCase.duration, 'dakika');
    console.log('\n⚡ Counter yeni artırıldı, temiz bir başlangıç yapıyoruz...');
    
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
      console.log('💡 Çözüm: Counter artırarak eski offer\'ları iptal etmek');
      
      // Order detaylarını göster
      if (result.order) {
        console.log('\n📋 Order Detayları:');
        console.log('Created:', new Date().toISOString());
        console.log('Expires:', new Date(Date.now() + testCase.duration * 60 * 1000).toISOString());
      }
    } else {
      console.log('❌ BAŞARISIZ!');
      console.log('Sebep:', result.error);
      
      if (result.requiresCancel) {
        console.log('💡 Counter tekrar artırılmalı');
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

cleanStartTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});