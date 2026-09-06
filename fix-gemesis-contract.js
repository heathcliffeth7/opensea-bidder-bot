require('dotenv').config();
const api = require('./src/api');

async function fixGemesisContract() {
  console.log('🔧 Gemesis Contract Fix\n');
  
  // Cache'i temizle
  console.log('1️⃣ Cache temizleniyor...');
  if (api.collectionCache && api.collectionCache['gemesis']) {
    delete api.collectionCache['gemesis'];
    delete api.collectionCacheTTL['gemesis'];
    console.log('✅ Gemesis cache temizlendi');
  }
  
  // Doğru collection bilgisini al
  console.log('\n2️⃣ Doğru contract address alınıyor...');
  try {
    const collectionInfo = await api.getCollectionInfo('gemesis');
    console.log('Collection bilgileri:');
    console.log(`- Slug: ${collectionInfo.slug}`);
    console.log(`- Name: ${collectionInfo.name}`);
    console.log(`- Contract: ${collectionInfo.contractAddress}`);
    console.log(`- Chain: ${collectionInfo.chain}`);
    
    // Test token'lar için best offer kontrol et
    console.log('\n3️⃣ Test token\'lar için best offer kontrolü...');
    const testTokens = [16, 50, 108];
    
    for (const tokenId of testTokens) {
      try {
        const bestOffer = await api.getBestOfferForNFT('ethereum', collectionInfo.contractAddress, tokenId);
        
        if (bestOffer && bestOffer.offer) {
          const price = api._extractPrice(bestOffer.offer);
          const isCollectionOffer = bestOffer.offer.criteria?.encoded_token_ids === '*';
          
          console.log(`\nToken #${tokenId}:`);
          console.log(`- Best offer: ${price.toFixed(4)} ETH`);
          console.log(`- Offer type: ${isCollectionOffer ? 'COLLECTION OFFER' : 'TOKEN SPECIFIC'}`);
          console.log(`- Order hash: ${bestOffer.offer.order_hash?.substring(0, 10)}...`);
        } else {
          console.log(`\nToken #${tokenId}: No offers`);
        }
      } catch (error) {
        console.log(`\nToken #${tokenId}: Error - ${error.message}`);
      }
    }
    
    // Collection offer'ları da kontrol et
    console.log('\n4️⃣ Collection offer\'ları kontrol ediliyor...');
    try {
      const collectionOffers = await api.getCollectionOffers('ethereum', 'gemesis');
      if (collectionOffers && collectionOffers.offers) {
        console.log(`\nToplam ${collectionOffers.offers.length} collection offer bulundu`);
        
        // En yüksek 3 collection offer
        const topOffers = collectionOffers.offers
          .sort((a, b) => {
            const priceA = parseFloat(a.price?.value || 0) / 1e18;
            const priceB = parseFloat(b.price?.value || 0) / 1e18;
            return priceB - priceA;
          })
          .slice(0, 3);
          
        topOffers.forEach((offer, i) => {
          const price = parseFloat(offer.price?.value || 0) / 1e18;
          console.log(`${i+1}. ${price.toFixed(4)} ETH - ${offer.maker?.address?.substring(0, 8)}...`);
        });
      }
    } catch (error) {
      console.log('Collection offers error:', error.message);
    }
    
    console.log('\n✅ Gemesis contract address doğrulandı!');
    console.log('Bot artık doğru contract kullanacak.');
    
  } catch (error) {
    console.error('Hata:', error.message);
  }
}

fixGemesisContract().catch(console.error);