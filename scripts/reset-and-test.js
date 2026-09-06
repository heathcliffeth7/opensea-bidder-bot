const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');
const config = require('../config');

async function resetAndTest() {
  console.log('🔄 RESET VE TEST BAŞLATILIYOR...\n');
  
  // Chain'i abstract'a geç
  await api.switchChain('abstract');
  await new Promise(r => setTimeout(r, 2000));
  
  // Yeni instance oluştur
  const abstractOffer = new AbstractTokenOffer(api);
  
  // Test token'ları
  const tokens = [
    { id: '16', price: 0.010 },
    { id: '50', price: 0.011 },
    { id: '896', price: 0.012 }
  ];
  
  const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
  
  console.log('📝 3 farklı token için teklif verilecek...\n');
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    console.log(`\n========= TOKEN #${token.id} =========`);
    
    try {
      // Her token için farklı fiyat
      const result = await abstractOffer.createOffer(
        contractAddress,
        token.id,
        token.price,
        15 // 15 dakika
      );
      
      if (result.success) {
        console.log(`✅ BAŞARILI! Order Hash: ${result.order_hash}`);
      } else {
        console.log(`❌ BAŞARISIZ!`);
      }
    } catch (error) {
      console.error(`❌ HATA: ${error.message}`);
      if (error.response && error.response.data) {
        console.error('API Hatası:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    // Token'lar arası 3 saniye bekle
    if (i < tokens.length - 1) {
      console.log('\n⏳ 3 saniye bekleniyor...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  console.log('\n✅ Test tamamlandı!');
}

resetAndTest().catch(console.error);