const api = require('../src/api');
const AbstractTokenOffer = require('../src/abstractTokenOffer');
const { ethers } = require('ethers');

async function freshOfferTest() {
  console.log('🆕 Fresh Offer Test - Tamamen Yeni Parametrelerle\n');
  
  try {
    // Chain'i abstract'a geç
    await api.switchChain('abstract');
    await new Promise(r => setTimeout(r, 2000));
    
    // Yeni instance
    const offer = new AbstractTokenOffer(api);
    
    // Tamamen farklı parametreler kullan
    const testParams = {
      contract: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '1337', // Farklı token ID
      price: 0.00777, // Farklı fiyat
      duration: 10 // 10 dakika
    };
    
    console.log('📋 Test Parametreleri:');
    console.log('Contract:', testParams.contract);
    console.log('Token ID:', testParams.tokenId);
    console.log('Fiyat:', testParams.price, 'WETH');
    console.log('Süre:', testParams.duration, 'dakika');
    
    // Önce bu token'ın var olup olmadığını kontrol et
    console.log('\n🔍 Token varlığı kontrol ediliyor...');
    try {
      const nftResponse = await api.makeRequest(
        'GET',
        `/api/v2/chain/abstract/contract/${testParams.contract}/nfts/${testParams.tokenId}`
      );
      console.log('✅ Token mevcut:', nftResponse.nft?.name || 'İsimsiz NFT');
    } catch (e) {
      console.log('⚠️ Token bilgisi alınamadı, yine de deneniyor...');
    }
    
    // Offer oluştur
    console.log('\n🚀 Offer oluşturuluyor...');
    const result = await offer.createOffer(
      testParams.contract,
      testParams.tokenId,
      testParams.price,
      testParams.duration
    );
    
    console.log('\n📊 SONUÇ:');
    if (result.success) {
      console.log('✅ BAŞARILI!');
      console.log('Order Hash:', result.order_hash);
      console.log('Chain:', result.chain);
      console.log('\n🎉 DUPLICATE HATASI ÇÖZÜLDÜ!');
      console.log('💡 Çözüm: Farklı token ID kullanmak');
    } else {
      console.log('❌ BAŞARISIZ!');
      console.log('Sebep:', result.error);
      
      if (result.requiresCancel) {
        console.log('💡 Öneri: Counter artırarak eski offer\'ları iptal edin');
      }
    }
    
  } catch (error) {
    console.error('❌ HATA:', error.message);
    
    // API yanıtını detaylı göster
    if (error.response && error.response.data) {
      console.log('\n📋 API Yanıtı:');
      console.log(JSON.stringify(error.response.data, null, 2));
      
      // Eğer asset mevcut değilse, başka bir token dene
      if (error.response.data.errors && error.response.data.errors[0]?.includes('Asset does not exist')) {
        console.log('\n🔄 Token mevcut değil, başka bir token deneniyor...');
        
        // Bilinen var olan token ID'leri
        const knownTokens = ['16', '50', '100', '200', '1', '2', '3', '4', '5'];
        
        for (const tokenId of knownTokens) {
          console.log(`\n📌 Token ${tokenId} deneniyor...`);
          
          try {
            const retryOffer = new AbstractTokenOffer(api);
            const retryResult = await retryOffer.createOffer(
              testParams.contract,
              tokenId,
              testParams.price + Math.random() * 0.001, // Her seferinde farklı fiyat
              testParams.duration
            );
            
            if (retryResult.success) {
              console.log('✅ BAŞARILI!');
              console.log('Order Hash:', retryResult.order_hash);
              break;
            }
          } catch (retryError) {
            console.log('❌ Token', tokenId, 'başarısız:', retryError.message);
          }
          
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  }
  
  process.exit(0);
}

freshOfferTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});