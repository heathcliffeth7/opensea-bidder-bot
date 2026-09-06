require('dotenv').config();
const axios = require('axios');
const config = require('./config');

async function testTokenSpecificOffers() {
  console.log('🔍 Token Specific vs Collection Offers Test\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };

  const contractAddress = '0xbe9371326f91345777b04394448c23e2bfeaa826';
  const testTokens = [16, 50, 108, 963, 896];
  
  console.log('Contract:', contractAddress);
  console.log('Testing tokens:', testTokens.join(', '));
  console.log('\n' + '='.repeat(60) + '\n');
  
  for (const tokenId of testTokens) {
    console.log(`\n📍 Token #${tokenId}:`);
    console.log('-'.repeat(40));
    
    // 1. Seaport orders endpoint - TÜM offer'ları al
    try {
      const seaportUrl = `https://api.opensea.io/api/v2/orders/ethereum/seaport/offers`;
      const seaportResponse = await axios.get(seaportUrl, {
        headers,
        params: {
          asset_contract_address: contractAddress,
          token_ids: tokenId,
          limit: 20
        }
      });
      
      if (seaportResponse.data.orders && seaportResponse.data.orders.length > 0) {
        console.log(`\n✅ Seaport'tan ${seaportResponse.data.orders.length} offer bulundu:`);
        
        seaportResponse.data.orders.forEach((order, i) => {
          const price = order.current_price ? parseFloat(order.current_price) / 1e18 : 0;
          const isCollectionOffer = order.criteria?.collection || 
                                   order.protocol_data?.parameters?.consideration?.[0]?.itemType === 4;
          
          console.log(`\n  ${i+1}. ${price.toFixed(4)} ETH`);
          console.log(`     Type: ${isCollectionOffer ? 'COLLECTION OFFER' : 'TOKEN SPECIFIC'}`);
          console.log(`     Maker: ${order.maker?.address?.substring(0, 10)}...`);
          console.log(`     Created: ${new Date(order.created_date).toLocaleString()}`);
          
          // Consideration detayları
          if (order.protocol_data?.parameters?.consideration) {
            const consideration = order.protocol_data.parameters.consideration[0];
            console.log(`     ItemType: ${consideration.itemType} (2=ERC721, 4=ERC721_WITH_CRITERIA)`);
            console.log(`     Identifier: ${consideration.identifierOrCriteria}`);
          }
        });
        
        // Token-specific offer'ları filtrele
        const tokenSpecificOffers = seaportResponse.data.orders.filter(order => {
          const consideration = order.protocol_data?.parameters?.consideration?.[0];
          return consideration?.itemType === 2; // ItemType 2 = specific ERC721
        });
        
        if (tokenSpecificOffers.length > 0) {
          console.log(`\n🎯 ${tokenSpecificOffers.length} TOKEN SPECIFIC offer bulundu`);
          const bestTokenOffer = tokenSpecificOffers.sort((a, b) => {
            const priceA = parseFloat(a.current_price || 0);
            const priceB = parseFloat(b.current_price || 0);
            return priceB - priceA;
          })[0];
          
          const bestPrice = parseFloat(bestTokenOffer.current_price) / 1e18;
          console.log(`➡️  En yüksek token-specific: ${bestPrice.toFixed(4)} ETH`);
        } else {
          console.log(`\n❌ Token-specific offer YOK`);
        }
        
        // Collection offer'ları da göster
        const collectionOffers = seaportResponse.data.orders.filter(order => {
          const consideration = order.protocol_data?.parameters?.consideration?.[0];
          return consideration?.itemType === 4; // ItemType 4 = ERC721_WITH_CRITERIA
        });
        
        if (collectionOffers.length > 0) {
          console.log(`\n📦 ${collectionOffers.length} COLLECTION offer bulundu`);
          const bestCollectionOffer = collectionOffers.sort((a, b) => {
            const priceA = parseFloat(a.current_price || 0);
            const priceB = parseFloat(b.current_price || 0);
            return priceB - priceA;
          })[0];
          
          const bestPrice = parseFloat(bestCollectionOffer.current_price) / 1e18;
          console.log(`➡️  En yüksek collection: ${bestPrice.toFixed(4)} ETH`);
        }
      } else {
        console.log('❌ Hiç offer bulunamadı');
      }
    } catch (error) {
      console.log('Seaport error:', error.response?.status, error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  console.log('✅ Test completed!');
}

testTokenSpecificOffers().catch(console.error);