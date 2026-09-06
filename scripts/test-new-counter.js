const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function testNewCounter() {
  console.log('🚀 Yeni Counter ile Test\n');
  
  try {
    // Abstract chain'e geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    // Yeni instance
    const offer = new AbstractTokenOffer(api);
    
    // Test parametreleri - farklı token ve fiyat
    const testCase = {
      contract: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '120', // Farklı token ID
      price: 0.00777, // Farklı fiyat
      duration: 30 // 30 dakika
    };
    
    console.log('📋 Test Parametreleri:');
    console.log('Contract:', testCase.contract);
    console.log('Token ID:', testCase.tokenId);
    console.log('Fiyat:', testCase.price, 'WETH');
    console.log('Süre:', testCase.duration, 'dakika');
    console.log('\n✨ Yeni Counter: 4032690726464604719555838733657597992871');
    
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
      console.log('\n🎉 YENİ COUNTER İLE DUPLICATE HATASI ÇÖZÜLDÜ!');
      
      // Order detaylarını göster
      if (result.order && result.order.order) {
        console.log('\n📋 Order Detayları:');
        console.log('Order Hash:', result.order.order.order_hash);
        console.log('Created:', result.order.order.created_date);
        console.log('Expires:', result.order.order.expiration_date);
        console.log('Maker:', result.order.order.maker?.address);
        console.log('Current Price:', result.order.order.current_price);
      }
    } else {
      console.log('❌ BAŞARISIZ!');
      console.log('Sebep:', result.error);
      
      if (result.duplicateHash) {
        console.log('Duplicate Hash:', result.duplicateHash);
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

testNewCounter().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});