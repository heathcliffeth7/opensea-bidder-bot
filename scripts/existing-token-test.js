const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function existingTokenTest() {
  console.log('✅ Var Olan Token Testi\n');
  
  try {
    // Chain'i abstract'a geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    // Yeni instance
    const offer = new AbstractTokenOffer(api);
    
    // Bilinen var olan token ID'leri
    const existingTokens = [
      { tokenId: '100', price: 0.00456 },
      { tokenId: '200', price: 0.00567 },
      { tokenId: '300', price: 0.00678 },
      { tokenId: '400', price: 0.00789 }
    ];
    
    console.log('📋 Yeni counter ile temiz başlangıç yapıyoruz...\n');
    
    for (const token of existingTokens) {
      console.log('='.repeat(60));
      console.log(`\n🎯 Token ${token.tokenId} deneniyor...`);
      console.log('Fiyat:', token.price, 'WETH');
      
      try {
        const result = await offer.createOffer(
          '0xa6c46c07f7f1966d772e29049175ebba26262513',
          token.tokenId,
          token.price,
          15
        );
        
        if (result.success) {
          console.log('\n✅ BAŞARILI!');
          console.log('Order Hash:', result.order_hash);
          console.log('\n🎉 DUPLICATE HATASI ÇÖZÜLDÜ!');
          break;
        } else {
          console.log('❌ Başarısız:', result.error);
          
          if (result.error.includes('Maximum retry attempts')) {
            console.log('⚠️ Maksimum deneme sayısına ulaşıldı, bir sonraki token deneniyor...');
            continue;
          }
        }
      } catch (error) {
        console.log('❌ Hata:', error.message);
        
        if (error.response?.data?.errors?.[0]?.includes('Asset does not exist')) {
          console.log('⚠️ Token mevcut değil, devam ediliyor...');
          continue;
        }
      }
      
      // Her denemeden sonra 5 saniye bekle
      await new Promise(r => setTimeout(r, 5000));
    }
    
  } catch (error) {
    console.error('Genel hata:', error.message);
  }
  
  process.exit(0);
}

existingTokenTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});