const axios = require('axios');
const { ethers } = require('ethers');
const config = require('./config');

/**
 * OpenSea web arayüzünün gas ücretsiz iptal mekanizmasını analiz et
 */
async function analyzeWebCancellation() {
  console.log('🔬 OpenSea Web Gas-Free Cancel Analizi\n');
  
  // Web client gibi davran
  const webClient = axios.create({
    baseURL: 'https://opensea.io',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://opensea.io/',
      'Origin': 'https://opensea.io',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    }
  });

  // API client
  const apiClient = axios.create({
    baseURL: 'https://api.opensea.io',
    headers: {
      'X-API-KEY': config.apiKey,
      'Accept': 'application/json'
    }
  });

  console.log('📝 BİLİNENLER:');
  console.log('1. Web: SignedZoneCaptain (0x000000000031163395F67E424F5B0082609709a7) + SIP-7');
  console.log('2. API: Standard Seaport (0x0000000000000068f116a894984e2db1123eb395)');
  console.log('3. Web gas-free cancel = soft cancel (database update)');
  console.log('4. API gas-free cancel desteklemiyor\n');

  console.log('🔍 TEORİ: Collection/Criteria offers neden gas-free iptal edilebilir?\n');
  
  console.log('MUHTEMEL SEBEPLER:');
  console.log('1. ItemType farkı:');
  console.log('   - Token offer: itemType = 2 (ERC721)');
  console.log('   - Collection offer: itemType = 4 (ERC721_WITH_CRITERIA)');
  console.log('   - Criteria offers daha "esnek" olduğu için soft-cancel destekliyor olabilir\n');
  
  console.log('2. OrderType farkı:');
  console.log('   - Token offers genelde: FULL_OPEN (0)');
  console.log('   - Collection offers genelde: PARTIAL_OPEN (1)');
  console.log('   - PARTIAL_OPEN soft-cancel için uygun olabilir\n');
  
  console.log('3. Fulfillment mekanizması:');
  console.log('   - Token offer: Spesifik token ID\'ye bağlı');
  console.log('   - Collection offer: Herhangi bir token kabul edilebilir');
  console.log('   - Bu esneklik soft-cancel imkanı sağlıyor olabilir\n');

  // Test: Collection offer parametreleriyle token offer oluştur
  console.log('🧪 TEST: Collection offer parametreleriyle token offer\n');
  
  const testParams = {
    itemType: 4, // ERC721_WITH_CRITERIA gibi davran
    orderType: 1, // PARTIAL_OPEN
    zone: ethers.ZeroAddress,
    counter: "0",
    // Ama yine de spesifik token ID ver
    tokenId: "200"
  };
  
  console.log('Test parametreleri:', testParams);
  console.log('\n⚠️ NOT: Bu test muhtemelen başarısız olacak çünkü:');
  console.log('- ItemType 4 kullanmak criteria proof gerektirir');
  console.log('- Criteria proof olmadan order geçersiz olur');
  console.log('- Token ID\'li offer her zaman itemType 2 kullanmalı\n');

  // Gerçek collection offer örneği al
  try {
    console.log('📊 Gerçek collection offer örneği aranıyor...');
    
    const response = await apiClient.get('/api/v2/orders/ethereum/seaport/offers', {
      params: {
        limit: 100
      }
    });
    
    const collectionOffers = response.data.orders?.filter(o => 
      o.protocol_data.parameters.consideration.some(c => c.itemType === 4)
    ) || [];
    
    if (collectionOffers.length > 0) {
      console.log(`\n✅ ${collectionOffers.length} collection offer bulundu!`);
      const example = collectionOffers[0];
      console.log('\nÖrnek collection offer:');
      console.log('- Order type:', example.protocol_data.parameters.orderType);
      console.log('- Zone:', example.protocol_data.parameters.zone);
      console.log('- Has criteria proof:', !!example.criteria_proof);
      console.log('- Criteria proof length:', example.criteria_proof?.length || 0);
    } else {
      console.log('❌ Collection offer örneği bulunamadı');
    }
    
  } catch (error) {
    console.error('API hatası:', error.message);
  }

  console.log('\n\n📋 SONUÇ:');
  console.log('1. Token offers (itemType: 2) API üzerinden gas-free iptal EDİLEMEZ');
  console.log('2. Collection/Criteria offers (itemType: 4) MUHTEMELEN gas-free iptal EDİLEBİLİR');
  console.log('3. Fark: ItemType ve fulfillment esnekliği');
  console.log('\n💡 ÇÖZÜMLERİ:');
  console.log('1. Token offer yerine collection offer kullan (mümkünse)');
  console.log('2. Kısa süreli teklifler ver (15-30 dakika)');
  console.log('3. incrementCounter() ile toplu iptal (az gas)');
  console.log('4. Web arayüzünden manuel iptal (gas-free)');
}

analyzeWebCancellation();