require('dotenv').config({ path: '../.env' });
const config = require('../config');
const api = require('../src/api');

/**
 * OpenSea v2 API token offer test scripti
 * Duplicate order hatalarını önleyen yeni sistemi test eder
 */
async function testV2TokenOffer() {
  console.log('🚀 OpenSea v2 Token Offer Test Başlıyor...\n');
  
  // Test parametreleri - Abstract chain pengztracted koleksiyonu
  const testParams = {
    chain: 'abstract',
    collection: 'pengztracted-abstract',
    contractAddress: '0x8888888b82468e03b3f86501e8e7c4cf5682bc3e', // Pengztracted contract
    tokenId: '16', // Test token ID
    price: 0.01, // 0.01 WETH
    duration: 15 // 15 dakika
  };
  
  console.log('📋 Test Parametreleri:');
  console.log(`Chain: ${testParams.chain}`);
  console.log(`Collection: ${testParams.collection}`);
  console.log(`Contract: ${testParams.contractAddress}`);
  console.log(`Token ID: ${testParams.tokenId}`);
  console.log(`Fiyat: ${testParams.price} WETH`);
  console.log(`Süre: ${testParams.duration} dakika\n`);
  
  try {
    // Chain'i değiştir
    console.log(`🔄 ${testParams.chain} chain'ine geçiliyor...`);
    await api.switchChain(testParams.chain);
    
    // Bakiye kontrolü
    console.log('\n💰 Bakiye kontrolü yapılıyor...');
    const balances = await api.checkBalances();
    console.log(`ETH Bakiyesi: ${balances.eth.formatted} ETH`);
    console.log(`WETH Bakiyesi: ${balances.weth.formatted} WETH\n`);
    
    // Mevcut teklifleri kontrol et
    console.log('🔍 Token için mevcut teklifler kontrol ediliyor...');
    try {
      const bestOffer = await api.getBestOfferForNFT(
        testParams.chain, 
        testParams.collection, 
        testParams.tokenId
      );
      
      if (bestOffer && bestOffer.offer) {
        console.log(`Mevcut en yüksek teklif: ${bestOffer.offer.price} WETH`);
        console.log(`Teklif sahibi: ${bestOffer.offer.maker?.address || 'Bilinmiyor'}\n`);
      } else {
        console.log('Bu token için aktif teklif yok.\n');
      }
    } catch (error) {
      console.log('Teklif kontrolü başarısız:', error.message, '\n');
    }
    
    // Token offer oluştur
    console.log('🎯 v2 API ile Token Offer oluşturuluyor...');
    const expirationTime = Date.now() + (testParams.duration * 60 * 1000);
    
    const result = await api.createTokenOffer(
      testParams.chain,
      testParams.contractAddress,
      testParams.tokenId,
      testParams.price,
      expirationTime
    );
    
    console.log('\n✅ Token Offer Başarıyla Oluşturuldu!');
    console.log('Order Hash:', result.orderHash || result.order_hash);
    console.log('Detaylar:', JSON.stringify(result, null, 2));
    
    // Test 2: Aynı token'a tekrar teklif ver (duplicate test)
    console.log('\n\n🔬 TEST 2: Duplicate Order Testi');
    console.log('Aynı token\'a tekrar teklif veriliyor...\n');
    
    try {
      const result2 = await api.createTokenOffer(
        testParams.chain,
        testParams.contractAddress,
        testParams.tokenId,
        testParams.price + 0.0001, // Biraz daha yüksek fiyat
        expirationTime
      );
      
      console.log('✅ İkinci teklif de başarıyla oluşturuldu!');
      console.log('Order Hash:', result2.orderHash || result2.order_hash);
      console.log('v2 API duplicate order hatasını başarıyla yönetti!\n');
      
    } catch (error) {
      console.error('❌ İkinci teklif başarısız:', error.message);
      if (error.message.includes('DuplicateOrder')) {
        console.log('⚠️ Duplicate order hatası alındı - Bu normaldir.');
        console.log('💡 Çözüm: Counter artırılarak otomatik retry yapılmalıydı.\n');
      }
    }
    
    // Test 3: Farklı token'lara toplu teklif
    console.log('\n🔬 TEST 3: Toplu Token Offer Testi');
    const tokenIds = ['50', '896', '653'];
    console.log(`Token ID'ler: ${tokenIds.join(', ')}\n`);
    
    for (const tokenId of tokenIds) {
      try {
        console.log(`Token #${tokenId} için teklif veriliyor...`);
        const batchResult = await api.createTokenOffer(
          testParams.chain,
          testParams.contractAddress,
          tokenId,
          testParams.price,
          expirationTime
        );
        console.log(`✅ Token #${tokenId} başarılı!`);
      } catch (error) {
        console.error(`❌ Token #${tokenId} başarısız: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Tüm testler tamamlandı!');
    
  } catch (error) {
    console.error('\n❌ Test başarısız:', error);
    console.error('Hata detayı:', error.message);
    
    if (error.response?.data) {
      console.error('API yanıtı:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Test'i çalıştır
testV2TokenOffer().then(() => {
  console.log('\n✅ Test scripti tamamlandı');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Test scripti hata ile sonlandı:', error);
  process.exit(1);
});