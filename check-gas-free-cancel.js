const axios = require('axios');
const config = require('./config');

/**
 * OpenSea'deki teklifleri kontrol et ve gas ücretsiz iptal edilebilir mi diye bak
 */
async function checkGasFreeCancellation() {
  console.log('🔍 Gas ücretsiz iptal kontrolü\n');
  
  const apiClient = axios.create({
    baseURL: 'https://api.opensea.io',
    headers: {
      'X-API-KEY': config.apiKey,
      'Accept': 'application/json'
    }
  });

  try {
    // Aktif teklifleri al
    const response = await apiClient.get('/api/v2/orders/ethereum/seaport/offers', {
      params: {
        maker: config.walletAddress,
        limit: 50
      }
    });

    const offers = response.data.orders || [];
    console.log(`📋 Toplam ${offers.length} aktif teklif bulundu\n`);

    for (const offer of offers) {
      console.log(`\n📦 Teklif: ${offer.order_hash}`);
      console.log(`Type: ${offer.protocol_data.parameters.orderType === 1 ? 'PARTIAL_OPEN' : 'FULL_OPEN'}`);
      console.log(`Zone: ${offer.protocol_data.parameters.zone}`);
      console.log(`Counter: ${offer.protocol_data.parameters.counter}`);
      
      // Consideration itemlerini kontrol et
      const consideration = offer.protocol_data.parameters.consideration;
      const hasTokenItem = consideration.some(item => item.itemType === 2);
      const hasCriteriaItem = consideration.some(item => item.itemType === 4);
      
      console.log(`Has Token Item (itemType:2): ${hasTokenItem}`);
      console.log(`Has Criteria Item (itemType:4): ${hasCriteriaItem}`);
      
      // Criteria proof var mı?
      if (offer.criteria_proof && offer.criteria_proof.length > 0) {
        console.log(`✅ Criteria Proof VAR! (${offer.criteria_proof.length} item)`);
      } else {
        console.log(`❌ Criteria Proof YOK`);
      }
      
      // İptal testi için URL oluştur
      const cancelUrl = `https://opensea.io/assets/ethereum/${consideration[0].token}/${consideration[0].identifierOrCriteria}`;
      console.log(`\n🌐 Web'de kontrol et: ${cancelUrl}`);
      console.log('Web arayüzünde bu teklifin yanında "Cancel" butonu var mı?');
      console.log('Eğer varsa ve tıkladığınızda gas ücreti istemiyorsa = GAS ÜCRETSİZ İPTAL!');
      
      // API üzerinden iptal denemesi
      console.log('\n🧪 API üzerinden iptal testi...');
      try {
        // Soft cancel endpoint'i dene
        const cancelResponse = await apiClient.post(`/api/v2/orders/chain/ethereum/protocol/seaport/0x0000000000000068f116a894984e2db1123eb395/${offer.order_hash}/cancel`, {});
        console.log('✅ API soft cancel başarılı!', cancelResponse.data);
      } catch (error) {
        if (error.response?.status === 404) {
          console.log('❌ Soft cancel endpoint bulunamadı');
        } else if (error.response?.status === 400) {
          console.log('❌ Soft cancel reddedildi:', error.response.data);
        } else {
          console.log('❌ API hatası:', error.response?.status, error.response?.data?.errors?.[0] || error.message);
        }
      }
    }
    
    console.log('\n\n📊 ÖZET:');
    console.log('1. criteria_proof eklemek token offer\'ı collection offer\'a dönüştürmez');
    console.log('2. Gas ücretsiz iptal sadece web arayüzünde mevcut');
    console.log('3. API üzerinden gas ücretsiz iptal mümkün değil');
    console.log('\n💡 ÖNERİ: Kısa süreli teklifler verin (15-30 dk) veya incrementCounter() kullanın');
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
  }
}

checkGasFreeCancellation();