const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function randomTokenTest() {
  console.log('🎲 Random Token Test\n');
  
  // Chain'i abstract'a geç
  await api.switchChain('abstract');
  await new Promise(r => setTimeout(r, 2000));
  
  // Yeni instance
  const offer = new AbstractTokenOffer(api);
  
  // Tamamen random token ID'ler kullan (büyük sayılar)
  const randomTokenId = Math.floor(Math.random() * 9000) + 1000; // 1000-9999 arası
  const randomPrice = (Math.random() * 0.005 + 0.008).toFixed(4); // 0.008-0.013 arası
  
  console.log('📋 Random Parametreler:');
  console.log('- Token ID:', randomTokenId);
  console.log('- Fiyat:', randomPrice, 'ETH');
  console.log('- Contract: 0xa6c46c07f7f1966d772e29049175ebba26262513');
  
  try {
    const result = await offer.createOffer(
      '0xa6c46c07f7f1966d772e29049175ebba26262513',
      randomTokenId.toString(),
      parseFloat(randomPrice),
      10 // 10 dakika
    );
    
    console.log('\n📊 SONUÇ:');
    if (result.success) {
      console.log('✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
      console.log('Chain:', result.chain);
      console.log('\n🎉 DUPLICATE HATASI ÇÖZÜLDÜ!');
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

randomTokenTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});