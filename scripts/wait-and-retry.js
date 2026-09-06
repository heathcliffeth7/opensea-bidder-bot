const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function waitAndRetry() {
  console.log('⏰ Bekleme ve Yeniden Deneme Testi\n');
  console.log('OpenSea cache temizlenmesi için 30 saniye bekleniyor...\n');
  
  // Progress bar
  for (let i = 0; i <= 30; i++) {
    process.stdout.write(`\r[${'='.repeat(i)}${' '.repeat(30-i)}] ${i}/30 saniye`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('\n');
  
  try {
    // Chain'i abstract'a geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    // Yeni instance
    const offer = new AbstractTokenOffer(api);
    
    // Test parametreleri - tamamen farklı
    const testCase = {
      contract: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '12345', // Çok farklı bir token ID
      price: 0.00123, // Çok farklı bir fiyat
      duration: 20 // 20 dakika
    };
    
    console.log('📋 Test Parametreleri:');
    console.log('Contract:', testCase.contract);
    console.log('Token ID:', testCase.tokenId);
    console.log('Fiyat:', testCase.price, 'WETH');
    console.log('Süre:', testCase.duration, 'dakika');
    console.log('\n🆕 Yeni counter kullanılacak');
    
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
      console.log('\n🎉 SORUN ÇÖZÜLDÜ!');
      console.log('💡 Çözüm: Counter artırma + Cache bekleme + Farklı parametreler');
    } else {
      console.log('❌ BAŞARISIZ!');
      console.log('Sebep:', result.error);
    }
    
  } catch (error) {
    console.error('❌ HATA:', error.message);
    
    if (error.response?.data) {
      console.log('\n📋 API Yanıtı:');
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
  
  process.exit(0);
}

waitAndRetry().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});