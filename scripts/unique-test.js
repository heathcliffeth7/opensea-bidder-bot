const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function uniqueTest() {
  console.log('🎯 Benzersiz Order Test\n');
  
  // Chain'i abstract'a geç
  await api.switchChain('abstract');
  await new Promise(r => setTimeout(r, 2000));
  
  // Yeni instance
  const offer = new AbstractTokenOffer(api);
  
  // Tamamen benzersiz parametreler
  const timestamp = Date.now();
  const randomTokenId = ['23', '77', '123', '456', '789'][Math.floor(Math.random() * 5)];
  const randomPrice = (0.008 + Math.random() * 0.004).toFixed(4); // 0.008 - 0.012 arası
  
  console.log('📋 Benzersiz Parametreler:');
  console.log('- Token ID:', randomTokenId);
  console.log('- Fiyat:', randomPrice, 'ETH');
  console.log('- Timestamp:', timestamp);
  console.log('- Contract: 0xa6c46c07f7f1966d772e29049175ebba26262513');
  
  try {
    const result = await offer.createOffer(
      '0xa6c46c07f7f1966d772e29049175ebba26262513',
      randomTokenId,
      parseFloat(randomPrice),
      10 // 10 dakika
    );
    
    console.log('\n📊 SONUÇ:');
    if (result.success) {
      console.log('✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
      console.log('Chain:', result.chain);
    } else {
      console.log('❌ BAŞARISIZ!');
      console.log('Hata:', result.error);
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

uniqueTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});