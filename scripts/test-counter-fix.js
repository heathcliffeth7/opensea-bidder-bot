const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function testCounterFix() {
  console.log('🧪 Counter Fix Test\n');
  
  try {
    // API'yi başlat
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    // AbstractTokenOffer instance oluştur
    const abstractOffer = new AbstractTokenOffer(api);
    
    // Test parametreleri
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '16';
    const price = '0.01';
    const duration = 15;
    
    console.log('\n📋 Test Parametreleri:');
    console.log('Contract:', contractAddress);
    console.log('Token ID:', tokenId);
    console.log('Price:', price, 'WETH');
    console.log('Duration:', duration, 'minutes');
    
    // Önce mevcut offer'ları kontrol et
    console.log('\n🔍 Mevcut offer\'lar kontrol ediliyor...');
    const hasExisting = await abstractOffer._checkExistingOffers(contractAddress, tokenId, 'degenheim');
    
    if (hasExisting) {
      console.log('\n⚠️ Mevcut offer tespit edildi!');
      console.log('💡 Öneri: Counter\'ı artırarak eski offer\'ları iptal edin:');
      console.log('   node scripts/increment-counter.js');
      return;
    }
    
    // Offer oluştur
    console.log('\n🚀 Yeni offer oluşturuluyor...');
    const result = await abstractOffer.createOffer(contractAddress, tokenId, price, duration);
    
    if (result.success) {
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
      console.log('Chain:', result.chain);
    } else {
      console.log('\n❌ BAŞARISIZ!');
      console.log('Hata:', result.error);
      
      if (result.suggestion) {
        console.log('\n💡 Öneri:', result.suggestion);
      }
      
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

testCounterFix();