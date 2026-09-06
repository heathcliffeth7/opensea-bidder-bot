const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function testDifferentToken() {
  console.log('🧪 Farklı Token ID Test\n');
  
  try {
    // API'yi başlat
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    // AbstractTokenOffer instance oluştur
    const abstractOffer = new AbstractTokenOffer(api);
    
    // Test parametreleri
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '50'; // Farklı token ID
    const price = '0.011'; // Farklı fiyat
    const duration = 10; // Farklı süre
    
    console.log('\n📋 Test Parametreleri:');
    console.log('Contract:', contractAddress);
    console.log('Token ID:', tokenId);
    console.log('Price:', price, 'WETH');
    console.log('Duration:', duration, 'minutes');
    
    // Offer oluştur
    console.log('\n🚀 Yeni offer oluşturuluyor...');
    const result = await abstractOffer.createOffer(contractAddress, tokenId, price, duration);
    
    if (result.success) {
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
      console.log('Chain:', result.chain);
      console.log('\n🎉 Offer başarıyla oluşturuldu!');
    } else {
      console.log('\n❌ BAŞARISIZ!');
      console.log('Hata:', result.error);
      
      if (result.duplicateHash) {
        console.log('Duplicate Hash:', result.duplicateHash);
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

testDifferentToken();