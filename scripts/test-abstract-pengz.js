const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function testAbstractPengz() {
  console.log('🧪 Abstract Pengztracted Test\n');
  
  try {
    // API'yi başlat
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    // AbstractTokenOffer instance oluştur
    const abstractOffer = new AbstractTokenOffer(api);
    
    // Test parametreleri (sizin verdiğiniz task ayarları)
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513'; // pengztracted-abstract
    const tokenIds = ['16', '50', '896'];
    const minPrice = 0.01;
    const maxPrice = 0.015;
    const duration = 15; // dakika
    
    console.log('\n📋 Task Parametreleri:');
    console.log('Collection: pengztracted-abstract');
    console.log('Contract:', contractAddress);
    console.log('Token IDs:', tokenIds.join(', '));
    console.log('Min Price:', minPrice, 'WETH');
    console.log('Max Price:', maxPrice, 'WETH');
    console.log('Duration:', duration, 'minutes');
    console.log('Counterbid:', '0.0001 WETH');
    console.log('High Offer Skip:', 'ON');
    console.log('Item Limit:', '1');
    
    // İlk token ID ile test et
    const tokenId = tokenIds[0];
    const testPrice = minPrice; // Minimum fiyattan başla
    
    console.log('\n🎯 Test Token ID:', tokenId);
    console.log('Test Price:', testPrice, 'WETH');
    
    // Önce mevcut offer'ları kontrol et
    console.log('\n🔍 Mevcut offer\'lar kontrol ediliyor...');
    const hasExisting = await abstractOffer._checkExistingOffers(contractAddress, tokenId, 'pengztracted-abstract');
    
    if (hasExisting) {
      console.log('\n⚠️ Mevcut offer tespit edildi!');
      console.log('💡 Counter\'ı artırarak eski offer\'ları iptal edebilirsiniz:');
      console.log('   node scripts/increment-counter.js');
      console.log('\n📊 Yine de yeni offer denemesi yapılacak...');
    }
    
    // Offer oluştur
    console.log('\n🚀 Yeni offer oluşturuluyor...');
    const result = await abstractOffer.createOffer(contractAddress, tokenId, testPrice, duration);
    
    if (result.success) {
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
      console.log('Chain:', result.chain);
      console.log('\n🎉 Offer başarıyla oluşturuldu!');
      
      // Diğer token ID'ler için bilgi
      console.log('\n📝 Diğer Token ID\'ler için de offer atabilirsiniz:');
      tokenIds.slice(1).forEach(id => {
        console.log(`- Token ID ${id}`);
      });
    } else {
      console.log('\n❌ BAŞARISIZ!');
      console.log('Hata:', result.error);
      
      if (result.suggestion) {
        console.log('\n💡 Öneri:', result.suggestion);
      }
      
      if (result.duplicateHash) {
        console.log('Duplicate Hash:', result.duplicateHash);
        console.log('\n🔄 Çözüm Önerileri:');
        console.log('1. Counter\'ı artırın: node scripts/increment-counter.js');
        console.log('2. Birkaç dakika bekleyin ve tekrar deneyin');
        console.log('3. Farklı bir token ID deneyin:', tokenIds[1] || tokenIds[2]);
      }
    }
    
    // Bakiye bilgisi
    console.log('\n💰 Bakiye Durumu:');
    const balances = await api.checkBalances();
    console.log('ETH:', balances.eth.formatted);
    console.log('WETH:', balances.weth.formatted);
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
    if (error.response?.data) {
      console.error('API Hatası:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  process.exit(0);
}

testAbstractPengz();