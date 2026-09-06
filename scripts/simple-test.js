const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function simpleTest() {
  console.log('🚀 Simple Test Başlıyor...\n');
  
  // Chain'i abstract'a geç
  await api.switchChain('abstract');
  await new Promise(r => setTimeout(r, 2000));
  
  // Yeni instance
  const offer = new AbstractTokenOffer(api);
  
  // Tek bir token için test
  try {
    const result = await offer.createOffer(
      '0xa6c46c07f7f1966d772e29049175ebba26262513',
      '50',  // Farklı token ID
      0.012, // Farklı bir fiyat
      15
    );
    
    console.log('\n📊 SONUÇ:');
    if (result.success) {
      console.log('✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
    } else {
      console.log('❌ BAŞARISIZ!');
    }
  } catch (error) {
    console.error('❌ HATA:', error.message);
  }
  
  process.exit(0);
}

simpleTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});