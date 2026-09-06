const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');

async function differentCollectionTest() {
  console.log('🔄 Farklı Koleksiyon Test\n');
  
  try {
    // Chain'i abstract'a geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    // Yeni instance
    const offer = new AbstractTokenOffer(api);
    
    // Farklı koleksiyonlar dene
    const collections = [
      // Abstract'ta popüler koleksiyonlar
      { contract: '0xfb8aF20E8a962d12d4d4EEf08e0203686C0a71d6', tokenId: '1', name: 'Abstract Collection 1' },
      { contract: '0x11111F01570eBf2b6A702f3A46d5Fa8a43F3d8AF', tokenId: '1', name: 'Abstract Collection 2' },
      { contract: '0x3b3ee1931dc30c1957379fac9aba94d1c48a5405', tokenId: '1', name: 'Abstract Collection 3' }
    ];
    
    for (const col of collections) {
      console.log('\n' + '='.repeat(60));
      console.log(`🎯 ${col.name} deneniyor...`);
      console.log('Contract:', col.contract);
      console.log('Token ID:', col.tokenId);
      
      try {
        const result = await offer.createOffer(
          col.contract,
          col.tokenId,
          0.001, // Düşük bir fiyat
          10
        );
        
        if (result.success) {
          console.log('✅ BAŞARILI!');
          console.log('Order Hash:', result.order_hash);
          console.log('\n🎉 ÇÖZÜM BULUNDU: Farklı koleksiyon kullanmak!');
          break;
        } else {
          console.log('❌ Başarısız:', result.error);
        }
      } catch (error) {
        console.log('❌ Hata:', error.message);
        
        // Eğer asset yoksa devam et
        if (error.response?.data?.errors?.[0]?.includes('Asset does not exist')) {
          console.log('⚠️ Bu token mevcut değil, bir sonraki deneniyor...');
          continue;
        }
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Hala başarısızsa, orijinal koleksiyona geri dön ama farklı strateji
    console.log('\n\n🔧 Orijinal koleksiyona alternatif yaklaşım...');
    
    // Rastgele yüksek token ID'ler dene
    for (let i = 0; i < 5; i++) {
      const randomTokenId = Math.floor(Math.random() * 9000) + 1000;
      console.log(`\n📌 Token #${randomTokenId} deneniyor...`);
      
      try {
        const result = await offer.createOffer(
          '0xa6c46c07f7f1966d772e29049175ebba26262513',
          randomTokenId.toString(),
          0.005 + Math.random() * 0.005, // 0.005-0.01 arası random fiyat
          10
        );
        
        if (result.success) {
          console.log('✅ BAŞARILI!');
          console.log('Order Hash:', result.order_hash);
          break;
        }
      } catch (error) {
        if (!error.response?.data?.errors?.[0]?.includes('Asset does not exist')) {
          console.log('❌ Farklı hata:', error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('Genel hata:', error.message);
  }
  
  process.exit(0);
}

differentCollectionTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});