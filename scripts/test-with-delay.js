const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function testWithDelay() {
  console.log('🧪 Gecikme ile Test\n');
  
  try {
    // API'yi başlat
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    // AbstractTokenOffer instance oluştur
    const abstractOffer = new AbstractTokenOffer(api);
    
    // Test parametreleri - 896 token ID ile dene
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '896'; // Üçüncü token ID
    const price = '0.0095'; // Daha düşük fiyat
    const duration = 20; // Daha uzun süre
    
    console.log('\n📋 Test Parametreleri:');
    console.log('Contract:', contractAddress);
    console.log('Token ID:', tokenId);
    console.log('Price:', price, 'WETH');
    console.log('Duration:', duration, 'minutes');
    
    // 5 saniye bekle (cache temizlenmesi için)
    console.log('\n⏳ 5 saniye bekleniyor...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Counter cache'i temizle
    abstractOffer.counterCache.clear();
    abstractOffer.counterLastFetch.clear();
    abstractOffer.orderHashCache.clear();
    console.log('✅ Cache temizlendi');
    
    // Offer oluştur
    console.log('\n🚀 Yeni offer oluşturuluyor...');
    const result = await abstractOffer.createOffer(contractAddress, tokenId, price, duration);
    
    if (result.success) {
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
      console.log('Chain:', result.chain);
      console.log('\n🎉 Offer başarıyla oluşturuldu!');
      
      // OpenSea'de kontrol etmek için link
      console.log('\n🔗 OpenSea\'de görüntüle:');
      console.log(`https://opensea.io/assets/abstract/${contractAddress}/${tokenId}`);
    } else {
      console.log('\n❌ BAŞARISIZ!');
      console.log('Hata:', result.error);
      
      if (result.duplicateHash) {
        console.log('Duplicate Hash:', result.duplicateHash);
        console.log('\n🔍 Muhtemel Sebepler:');
        console.log('1. Bu wallet için OpenSea cache\'i henüz temizlenmemiş olabilir');
        console.log('2. Önceki failed transaction\'lar hala cache\'de olabilir');
        console.log('3. OpenSea Abstract chain için tam destek sunmuyor olabilir');
        
        console.log('\n💡 Alternatif Çözümler:');
        console.log('1. 10-15 dakika bekleyin ve tekrar deneyin');
        console.log('2. Farklı bir collection deneyin');
        console.log('3. Ethereum mainnet üzerinden cross-chain offer deneyin');
      }
    }
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
    if (error.response?.data) {
      console.error('API Hatası:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  process.exit(0);
}

testWithDelay();