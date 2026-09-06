const axios = require('axios');
const config = require('./config');

async function debugCollectionOffers() {
  const collectionSlug = 'gemesis';
  const contractAddress = '0xbe9371326f91345777b04394448c23e2bfeaa826';
  
  console.log('🔍 Analyzing Collection Offers for Gemesis...\n');
  
  const headers = {
    'accept': 'application/json', 
    'x-api-key': config.apiKey
  };
  
  try {
    // 1. Get collection offers
    console.log('1️⃣ Getting collection offers:');
    const collectionResponse = await axios.get(
      `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}/all`,
      { 
        headers,
        params: { limit: 10 }
      }
    );
    
    console.log(`   - Total offers: ${collectionResponse.data.offers?.length || 0}`);
    
    // Find the 0.0267 offer
    const targetOffer = collectionResponse.data.offers?.find(offer => {
      const value = offer.price?.value;
      return value === '26700000000000000' || value === '53400000000000000';
    });
    
    if (targetOffer) {
      console.log('\n   ✅ Found matching offer:');
      console.log('   - Order hash:', targetOffer.order_hash);
      console.log('   - Price value:', targetOffer.price?.value);
      console.log('   - ETH:', targetOffer.price?.value / 1e18);
      console.log('   - Criteria:', JSON.stringify(targetOffer.criteria, null, 2));
    }
    
    // 2. Check if there's a 0.0534 offer
    const doubleOffer = collectionResponse.data.offers?.find(offer => {
      const ethValue = offer.price?.value / 1e18;
      return Math.abs(ethValue - 0.0534) < 0.0001;
    });
    
    if (doubleOffer) {
      console.log('\n   ⚠️  Found 0.0534 ETH offer:');
      console.log('   - Order hash:', doubleOffer.order_hash);
      console.log('   - Price value:', doubleOffer.price?.value);
      console.log('   - ETH:', doubleOffer.price?.value / 1e18);
    }
    
    // 3. Get best offers for specific token
    console.log('\n2️⃣ Getting token-specific best offer:');
    const tokenResponse = await axios.get(
      `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}/nfts/653/best`,
      { headers }
    );
    
    console.log('   - Best offer for token #653:', tokenResponse.data.price?.value / 1e18, 'ETH');
    console.log('   - Order hash:', tokenResponse.data.order_hash);
    
    // 4. Get all offers via seaport endpoint
    console.log('\n3️⃣ Checking seaport orders endpoint:');
    const seaportResponse = await axios.get(
      `https://api.opensea.io/api/v2/orders/ethereum/seaport/offers`,
      { 
        headers,
        params: {
          asset_contract_address: contractAddress,
          token_ids: '653',
          limit: 10
        }
      }
    );
    
    console.log('   - Seaport offers:', seaportResponse.data.orders?.length || 0);
    if (seaportResponse.data.orders?.[0]) {
      const firstOrder = seaportResponse.data.orders[0];
      console.log('   - First offer value:', firstOrder.current_price);
      console.log('   - Maker asset:', firstOrder.maker_asset_bundle);
      console.log('   - Protocol data:', firstOrder.protocol_data?.parameters?.offer?.[0]?.startAmount);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

debugCollectionOffers();