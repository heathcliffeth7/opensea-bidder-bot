const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function testAfterCounterIncrement() {
  console.log('🎯 Counter Artırıldıktan Sonra Test\n');
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    const offerInstance = new AbstractTokenOffer(api);
    
    // Test parametreleri - farklı token ID dene
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenIds = [16, 50, 896, 1234]; // Son token ID yeni
    const price = '0.01';
    const duration = 15;
    
    console.log('📋 Test Parametreleri:');
    console.log('Collection:', 'pengztracted-abstract');
    console.log('Price:', price, 'WETH');
    console.log('Duration:', duration, 'minutes');
    console.log('Token IDs:', tokenIds.join(', '));
    console.log('\n⚡ Counter artırıldı, cache temizlenmiş olmalı!\n');
    
    // Her token ID için dene
    for (const tokenId of tokenIds) {
      console.log(`\n🔄 Token ID ${tokenId} deneniyor...`);
      
      try {
        const result = await offerInstance.createOffer(
          contractAddress,
          tokenId.toString(),
          price,
          duration
        );
        
        if (result.success) {
          console.log('\n✅ BAŞARILI!');
          console.log('Token ID:', tokenId);
          console.log('Order Hash:', result.order_hash);
          console.log('Response:', JSON.stringify(result.order, null, 2));
          break; // Başarılı oldu, döngüden çık
        } else {
          console.log('❌ Hata:', result.error);
          if (result.duplicateHash) {
            console.log('Duplicate Hash:', result.duplicateHash);
          }
        }
      } catch (error) {
        console.log('❌ Exception:', error.message);
      }
      
      // Rate limit için bekleme
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n📊 TEST ÖZET:');
    console.log('Counter artırma işlemi başarılı oldu.');
    console.log('Eğer hala duplicate hatası alıyorsanız:');
    console.log('1. Birkaç dakika bekleyin (OpenSea cache güncellenmesi için)');
    console.log('2. Farklı bir collection deneyin');
    console.log('3. Counter\'ı birkaç kez daha artırın');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
  }
  
  process.exit(0);
}

testAfterCounterIncrement();