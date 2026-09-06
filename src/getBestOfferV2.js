const { formatPrice } = require('../utils/helpers');

/**
 * Token için en iyi teklifi getir - V2
 * Hem token-specific hem de collection offer'ları doğru şekilde alır
 */
async function getBestOfferForNFTV2(api, chain, contractAddress, tokenId) {
  try {
    console.log(`📊 Token #${tokenId} için teklifler kontrol ediliyor...`);
    
    let bestTokenSpecificOffer = null;
    let bestCollectionOffer = null;
    
    // 1. Önce Seaport orders endpoint'inden token-specific offer'ları al
    try {
      console.log(`🔍 Token-specific offer'lar aranıyor...`);
      const tokenOffersResponse = await api.makeRequest('GET', `/api/v2/orders/${chain}/seaport/offers`, null, {
        asset_contract_address: contractAddress,
        token_ids: tokenId,
        limit: 50
      });
      
      if (tokenOffersResponse && tokenOffersResponse.orders && tokenOffersResponse.orders.length > 0) {
        // Token-specific offer'ları filtrele (itemType 2 = specific ERC721)
        const tokenSpecificOffers = tokenOffersResponse.orders.filter(order => {
          const consideration = order.protocol_data?.parameters?.consideration?.[0];
          return consideration?.itemType === 2 && 
                 consideration?.identifierOrCriteria === tokenId.toString();
        });
        
        if (tokenSpecificOffers.length > 0) {
          // En yüksek token-specific offer'ı bul
          bestTokenSpecificOffer = tokenSpecificOffers.sort((a, b) => {
            const priceA = api._extractPrice(a);
            const priceB = api._extractPrice(b);
            return priceB - priceA;
          })[0];
          
          const price = api._extractPrice(bestTokenSpecificOffer);
          console.log(`✅ Token-specific offer bulundu: ${formatPrice(price)} ETH`);
        } else {
          console.log(`❌ Token-specific offer bulunamadı`);
        }
      }
    } catch (error) {
      console.log(`Token offers error: ${error.message}`);
    }
    
    // 2. Collection slug'ı al
    let collectionSlug = contractAddress;
    try {
      if (chain === 'ethereum' && contractAddress.toLowerCase() === '0xbe9371326f91345777b04394448c23e2bfeaa826') {
        collectionSlug = 'gemesis';
      } else if (chain === 'abstract' && contractAddress.toLowerCase() === '0xa6c46c07f7f1966d772e29049175ebba26262513') {
        collectionSlug = 'pengztracted-abstract';
      } else {
        const collectionInfo = await api.getCollectionInfo(contractAddress);
        if (collectionInfo && collectionInfo.slug) {
          collectionSlug = collectionInfo.slug;
        }
      }
    } catch (e) {
      console.log('Collection slug alınamadı');
    }
    
    // 3. Collection offer'ları al
    try {
      console.log(`📦 Collection offer'lar kontrol ediliyor...`);
      const collectionOffersResponse = await api.makeRequest('GET', `/api/v2/offers/collection/${collectionSlug}`);
      
      if (collectionOffersResponse && collectionOffersResponse.offers && collectionOffersResponse.offers.length > 0) {
        // En yüksek collection offer'ı bul
        bestCollectionOffer = collectionOffersResponse.offers.sort((a, b) => {
          const priceA = api._extractPrice(a);
          const priceB = api._extractPrice(b);
          return priceB - priceA;
        })[0];
        
        const price = api._extractPrice(bestCollectionOffer);
        console.log(`📦 En yüksek collection offer: ${formatPrice(price)} ETH`);
      } else {
        console.log(`❌ Collection offer bulunamadı`);
      }
    } catch (error) {
      console.log(`Collection offers error: ${error.message}`);
    }
    
    // 4. En iyi teklifi seç
    let bestOffer = null;
    let isCollectionOffer = false;
    
    if (bestTokenSpecificOffer && bestCollectionOffer) {
      // Her ikisi de varsa, en yükseği seç
      const tokenPrice = api._extractPrice(bestTokenSpecificOffer);
      const collectionPrice = api._extractPrice(bestCollectionOffer);
      
      if (tokenPrice >= collectionPrice) {
        bestOffer = bestTokenSpecificOffer;
        console.log(`🎯 En iyi teklif: Token-specific (${formatPrice(tokenPrice)} ETH)`);
      } else {
        bestOffer = bestCollectionOffer;
        isCollectionOffer = true;
        console.log(`🎯 En iyi teklif: Collection offer (${formatPrice(collectionPrice)} ETH)`);
      }
    } else if (bestTokenSpecificOffer) {
      bestOffer = bestTokenSpecificOffer;
      console.log(`🎯 Sadece token-specific offer var`);
    } else if (bestCollectionOffer) {
      bestOffer = bestCollectionOffer;
      isCollectionOffer = true;
      console.log(`🎯 Sadece collection offer var`);
    }
    
    if (bestOffer) {
      // Collection offer flag'ini ekle
      if (isCollectionOffer) {
        bestOffer.isCollectionOffer = true;
      }
      return { offer: bestOffer };
    }
    
    console.log(`❌ Token #${tokenId} için hiç teklif bulunamadı`);
    return { offer: null };
    
  } catch (error) {
    console.error('getBestOfferV2 error:', error);
    return { offer: null };
  }
}

module.exports = { getBestOfferForNFTV2 };