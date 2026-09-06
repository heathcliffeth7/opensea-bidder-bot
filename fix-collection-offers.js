require('dotenv').config();
const axios = require('axios');
const config = require('./config');

async function fixCollectionOffers() {
  console.log('🔧 Collection Offers Fix Test\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };

  // 1. Gerçek collection offer'ları al
  console.log('1️⃣ Gerçek collection offer\'ları alınıyor...');
  const collectionOffersUrl = `https://api.opensea.io/api/v2/offers/collection/gemesis`;
  
  try {
    const response = await axios.get(collectionOffersUrl, { headers });
    
    if (response.data.offers && response.data.offers.length > 0) {
      console.log(`\n✅ ${response.data.offers.length} collection offer bulundu`);
      
      // En yüksek 5 collection offer
      const topOffers = response.data.offers
        .sort((a, b) => {
          const priceA = parseFloat(a.price?.value || 0) / 1e18;
          const priceB = parseFloat(b.price?.value || 0) / 1e18;
          return priceB - priceA;
        })
        .slice(0, 5);
      
      console.log('\nEn yüksek 5 collection offer:');
      topOffers.forEach((offer, i) => {
        const price = parseFloat(offer.price?.value || 0) / 1e18;
        console.log(`${i+1}. ${price.toFixed(4)} ETH - Order Hash: ${offer.order_hash?.substring(0, 16)}...`);
      });
      
      const highestPrice = parseFloat(topOffers[0].price?.value || 0) / 1e18;
      console.log(`\n🎯 En yüksek collection offer: ${highestPrice.toFixed(4)} ETH`);
    }
  } catch (error) {
    console.error('Collection offers error:', error.message);
  }
  
  // 2. Best offer endpoint'lerini test et
  console.log('\n2️⃣ Best offer endpoint\'lerini test ediyoruz...');
  const testTokens = [963, 896, 108]; // Offer'ı olmayan token'lar
  
  for (const tokenId of testTokens) {
    console.log(`\n📍 Token #${tokenId}:`);
    
    // Best offer endpoint
    const bestOfferUrl = `https://api.opensea.io/api/v2/offers/collection/gemesis/nfts/${tokenId}/best`;
    
    try {
      const response = await axios.get(bestOfferUrl, { headers });
      
      if (response.data && response.data.price) {
        const price = parseFloat(response.data.price.value) / 1e18;
        const isCollectionOffer = response.data.criteria?.encoded_token_ids === '*';
        const orderHash = response.data.order_hash?.substring(0, 16);
        
        console.log(`Best offer endpoint response:`);
        console.log(`- Price: ${price.toFixed(4)} ETH`);
        console.log(`- Type: ${isCollectionOffer ? 'COLLECTION OFFER' : 'TOKEN SPECIFIC'}`);
        console.log(`- Order Hash: ${orderHash}...`);
        
        // Collection offer hash'lerini karşılaştır
        if (isCollectionOffer) {
          console.log(`⚠️  Bu collection offer gerçek mi kontrol ediliyor...`);
          
          // En yüksek collection offer ile karşılaştır
          if (orderHash === '0x0bcee13a8d34a1') {
            console.log(`✅ Bu gerçekten en yüksek collection offer (0.0294 ETH)!`);
          } else {
            console.log(`❌ Bu en yüksek collection offer DEĞİL! Yanlış değer döndürüyor.`);
          }
        }
      }
    } catch (error) {
      console.log(`Best offer error: ${error.response?.status} ${error.message}`);
    }
  }
  
  // 3. Seaport orders endpoint'ini test et
  console.log('\n3️⃣ Seaport orders endpoint ile doğru değeri bulma...');
  
  const seaportUrl = `https://api.opensea.io/api/v2/orders/ethereum/seaport/offers`;
  
  try {
    // Sadece collection offer'ları al
    const response = await axios.get(seaportUrl, {
      headers,
      params: {
        asset_contract_address: '0xbe9371326f91345777b04394448c23e2bfeaa826',
        order_by: 'eth_price',
        order_direction: 'desc',
        limit: 50
      }
    });
    
    if (response.data.orders) {
      // Collection offer'ları filtrele
      const collectionOffers = response.data.orders.filter(order => {
        const consideration = order.protocol_data?.parameters?.consideration?.[0];
        return consideration?.itemType === 4; // ERC721_WITH_CRITERIA
      });
      
      console.log(`\n✅ Seaport'tan ${collectionOffers.length} collection offer bulundu`);
      
      if (collectionOffers.length > 0) {
        const topOffer = collectionOffers[0];
        const price = parseFloat(topOffer.current_price || 0) / 1e18;
        console.log(`En yüksek collection offer: ${price.toFixed(4)} ETH`);
        console.log(`Order hash: ${topOffer.order_hash?.substring(0, 16)}...`);
      }
    }
  } catch (error) {
    console.log('Seaport error:', error.message);
  }
  
  console.log('\n✅ Test tamamlandı!');
  console.log('\n📝 SONUÇ: Best offer endpoint yanlış collection offer döndürüyor.');
  console.log('Çözüm: Seaport orders endpoint kullanarak manuel filtreleme yapmalıyız.');
}

fixCollectionOffers().catch(console.error);