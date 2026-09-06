require('dotenv').config();
const axios = require('axios');
const config = require('./config');

async function debugEthereumOffers() {
  console.log('🔍 Ethereum Gemesis Collection Offer Debug\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };

  try {
    // 1. Collection bilgisini al
    console.log('1️⃣ Collection bilgisi alınıyor...');
    const collectionUrl = `https://api.opensea.io/api/v2/collections/gemesis`;
    const collectionResponse = await axios.get(collectionUrl, { headers });
    console.log('Collection slug:', collectionResponse.data.collection);
    console.log('Contract address:', collectionResponse.data.contracts?.[0]?.address);
    console.log('Total supply:', collectionResponse.data.total_supply);
    
    // 2. Collection offer'ları kontrol et
    console.log('\n2️⃣ Collection offer\'ları kontrol ediliyor...');
    const collectionOffersUrl = `https://api.opensea.io/api/v2/offers/collection/gemesis`;
    try {
      const collectionOffersResponse = await axios.get(collectionOffersUrl, { headers });
      console.log('Collection offers response:', JSON.stringify(collectionOffersResponse.data, null, 2));
      
      if (collectionOffersResponse.data.offers) {
        console.log(`\nToplam ${collectionOffersResponse.data.offers.length} collection offer bulundu`);
        collectionOffersResponse.data.offers.forEach((offer, i) => {
          const price = offer.price?.value ? parseFloat(offer.price.value) / 1e18 : 0;
          console.log(`Offer ${i+1}: ${price.toFixed(4)} ETH - Maker: ${offer.maker?.address?.substring(0, 8)}...`);
        });
      }
    } catch (e) {
      console.log('Collection offers error:', e.response?.data || e.message);
    }
    
    // 3. All offers endpoint'ini dene
    console.log('\n3️⃣ All offers endpoint deneniyor...');
    const allOffersUrl = `https://api.opensea.io/api/v2/offers/collection/gemesis/all`;
    try {
      const allOffersResponse = await axios.get(allOffersUrl, { headers });
      console.log('All offers count:', allOffersResponse.data.offers?.length || 0);
      
      if (allOffersResponse.data.offers && allOffersResponse.data.offers.length > 0) {
        // Collection offer'ları filtrele
        const collectionOffers = allOffersResponse.data.offers.filter(o => 
          o.criteria?.encoded_token_ids === '*' || 
          o.item?.criteria?.encoded_token_ids === '*'
        );
        
        console.log(`\nCollection offer sayısı: ${collectionOffers.length}`);
        collectionOffers.slice(0, 5).forEach((offer, i) => {
          const price = offer.price?.value ? parseFloat(offer.price.value) / 1e18 : 0;
          console.log(`Collection Offer ${i+1}: ${price.toFixed(4)} ETH`);
        });
      }
    } catch (e) {
      console.log('All offers error:', e.response?.data || e.message);
    }
    
    // 4. Örnek token'lar için best offer kontrol et
    console.log('\n4️⃣ Örnek token\'lar için best offer kontrolü...');
    const testTokens = [16, 50, 108, 963, 896];
    
    for (const tokenId of testTokens) {
      console.log(`\n📍 Token #${tokenId}:`);
      
      // Best offer endpoint
      const bestOfferUrl = `https://api.opensea.io/api/v2/offers/collection/gemesis/nfts/${tokenId}/best`;
      try {
        const bestOfferResponse = await axios.get(bestOfferUrl, { headers });
        const offer = bestOfferResponse.data;
        
        if (offer && offer.price) {
          const price = offer.price.value ? parseFloat(offer.price.value) / 1e18 : 0;
          const isCollectionOffer = offer.criteria?.encoded_token_ids === '*';
          console.log(`Best offer: ${price.toFixed(4)} ETH ${isCollectionOffer ? '(COLLECTION OFFER)' : '(TOKEN SPECIFIC)'}`);
          console.log(`Order hash: ${offer.order_hash?.substring(0, 10)}...`);
        } else {
          console.log('No best offer found');
        }
      } catch (e) {
        console.log('Best offer error:', e.response?.status, e.response?.data?.errors?.[0] || e.message);
      }
      
      // Seaport offers endpoint
      const seaportUrl = `https://api.opensea.io/api/v2/orders/ethereum/seaport/offers`;
      try {
        const seaportResponse = await axios.get(seaportUrl, {
          headers,
          params: {
            asset_contract_address: '0x0Beed7099AF7514cCEDF642CfAE435731696A2cE',
            token_ids: tokenId,
            limit: 10
          }
        });
        
        if (seaportResponse.data.orders && seaportResponse.data.orders.length > 0) {
          console.log(`Seaport offers: ${seaportResponse.data.orders.length} adet`);
          const topOffer = seaportResponse.data.orders[0];
          const price = topOffer.current_price ? parseFloat(topOffer.current_price) / 1e18 : 0;
          console.log(`Top seaport offer: ${price.toFixed(4)} ETH`);
        }
      } catch (e) {
        console.log('Seaport offers error:', e.response?.status);
      }
    }
    
    // 5. OpenSea web sayfasını kontrol etme önerisi
    console.log('\n5️⃣ Karşılaştırma için OpenSea web sayfalarını kontrol edin:');
    console.log('Collection offers: https://opensea.io/collection/gemesis?tab=offers');
    console.log('Token #16: https://opensea.io/assets/ethereum/0x0beed7099af7514ccedf642cfae435731696a2ce/16');
    console.log('Token #50: https://opensea.io/assets/ethereum/0x0beed7099af7514ccedf642cfae435731696a2ce/50');
    
  } catch (error) {
    console.error('Hata:', error.message);
  }
}

debugEthereumOffers().catch(console.error);