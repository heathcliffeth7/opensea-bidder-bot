const axios = require('axios');
const config = require('./config');

/**
 * OpenSea'nin collection offer API'sini analiz et
 */
async function analyzeCollectionAPI() {
  console.log('🔬 OPENSEA COLLECTION OFFER API ANALİZİ\n');
  
  const apiClient = axios.create({
    baseURL: 'https://api.opensea.io',
    headers: {
      'X-API-KEY': config.apiKey,
      'Accept': 'application/json'
    }
  });

  console.log('📝 BİLİNENLER:');
  console.log('1. Seaport protokolü itemType 4 destekliyor');
  console.log('2. OpenSea API itemType 4 reddediyor');
  console.log('3. Ama OpenSea\'de collection offer var!\n');
  
  console.log('🔍 ARAŞTIRMA:\n');
  
  // 1. Mevcut collection offer'ları incele
  try {
    console.log('1️⃣ Mevcut collection offer\'ları arıyorum...\n');
    
    // Popüler collection'lardan birini seç
    const collections = ['azuki', 'boredapeyachtclub', 'mutant-ape-yacht-club', 'pudgypenguins'];
    
    for (const collection of collections) {
      console.log(`\n📦 Collection: ${collection}`);
      
      try {
        // Collection offer'ları al
        const response = await apiClient.get(`/api/v2/offers/collection/${collection}`, {
          params: {
            limit: 5
          }
        });
        
        if (response.data.offers && response.data.offers.length > 0) {
          console.log(`✅ ${response.data.offers.length} collection offer bulundu!`);
          
          const firstOffer = response.data.offers[0];
          console.log('\nİlk offer detayları:');
          console.log(`- Price: ${firstOffer.price?.value || 'N/A'} ${firstOffer.price?.currency || ''}`);
          console.log(`- Maker: ${firstOffer.maker?.address?.substring(0, 10)}...`);
          
          // Protocol data varsa incele
          if (firstOffer.protocol_data) {
            console.log('\nProtocol Data:');
            const params = firstOffer.protocol_data.parameters;
            if (params) {
              console.log(`- Order Type: ${params.orderType}`);
              console.log(`- Zone: ${params.zone}`);
              
              if (params.consideration && params.consideration[0]) {
                const cons = params.consideration[0];
                console.log(`- Item Type: ${cons.itemType}`);
                console.log(`- Identifier: ${cons.identifierOrCriteria}`);
              }
            }
          }
          
          // Order hash varsa, detaylı bilgi al
          if (firstOffer.order_hash) {
            console.log(`\nOrder hash: ${firstOffer.order_hash}`);
            
            // Bu order'ı detaylı incele
            try {
              const orderDetail = await apiClient.get(`/api/v2/orders/ethereum/seaport/${firstOffer.order_hash}`);
              
              if (orderDetail.data.protocol_data) {
                const consideration = orderDetail.data.protocol_data.parameters.consideration[0];
                console.log('\nDetaylı Consideration:');
                console.log(`- Item Type: ${consideration.itemType}`);
                console.log(`- Token: ${consideration.token}`);
                console.log(`- Identifier/Criteria: ${consideration.identifierOrCriteria}`);
              }
            } catch (e) {
              // Order detayı alınamadı
            }
          }
          
          break; // İlk başarılı collection'da dur
        }
        
      } catch (error) {
        if (error.response?.status !== 404) {
          console.log(`❌ Hata: ${error.response?.status || error.message}`);
        }
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
  } catch (error) {
    console.error('Collection offer araması başarısız:', error.message);
  }
  
  // 2. OpenSea'nin özel endpoint'lerini araştır
  console.log('\n\n2️⃣ OPENSEA ÖZEL API ENDPOINT\'LERİ:\n');
  
  console.log('Bilinen endpoint\'ler:');
  console.log('- POST /api/v2/offers (Token-specific offers)');
  console.log('- POST /api/v2/criteria/offers (Criteria-based offers)');
  console.log('- POST /api/v2/orders/ethereum/seaport/offers (Seaport offers)');
  console.log('- GET /api/v2/offers/collection/{slug} (Collection offers)');
  
  // 3. Criteria offer endpoint'ini test et
  console.log('\n3️⃣ CRITERIA OFFER ENDPOINT TESTİ:\n');
  
  try {
    const testPayload = {
      protocol: "seaport",
      protocol_data: {
        parameters: {
          // Test parametreleri
        }
      }
    };
    
    console.log('POST /api/v2/criteria/offers endpoint\'i test ediliyor...');
    
    // Bu muhtemelen 404 verecek ama deneyelim
    const response = await apiClient.post('/api/v2/criteria/offers', testPayload);
    console.log('✅ Endpoint mevcut!');
    
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('❌ Endpoint bulunamadı (404)');
    } else if (error.response?.status === 400) {
      console.log('✅ Endpoint mevcut! (400 - Geçersiz payload)');
      if (error.response.data) {
        console.log('Hata detayı:', error.response.data);
      }
    } else {
      console.log(`❌ Başka hata: ${error.response?.status || error.message}`);
    }
  }
  
  console.log('\n\n📊 SONUÇ:');
  console.log('1. OpenSea collection offer\'ları farklı bir mekanizma kullanıyor');
  console.log('2. API doğrudan itemType 4 kabul etmiyor');
  console.log('3. Muhtemelen özel bir endpoint veya wrapper kullanılıyor');
  console.log('4. Collection offer\'lar backend\'de itemType 4\'e dönüştürülüyor olabilir');
  
  console.log('\n💡 TAVSİYE:');
  console.log('- Token-specific offer\'lar kullanmaya devam edin');
  console.log('- Collection offer gerekirse OpenSea SDK kullanın');
  console.log('- Gas-free iptal artık mevcut değil, incrementCounter() kullanın');
}

analyzeCollectionAPI();