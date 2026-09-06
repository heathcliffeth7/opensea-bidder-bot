const axios = require('axios');
const { ethers } = require('ethers');

const API_KEY = process.env.OPENSEA_API_KEY || '';
const headers = {
  'accept': 'application/json',
  'x-api-key': API_KEY
};

async function analyzeOffers() {
  console.log('🔍 Galverse Collection vs Token Offers Analizi\n');
  
  try {
    // 1. Collection offers al
    console.log('1️⃣ COLLECTION OFFERS:');
    const collectionResponse = await axios.get(
      'https://api.opensea.io/api/v2/offers/collection/galverse?limit=10',
      { headers }
    );
    
    const collectionOffers = collectionResponse.data.offers || [];
    console.log(`   Toplam collection offer: ${collectionOffers.length}`);
    
    // En yüksek 5 collection offer'ı göster
    collectionOffers.slice(0, 5).forEach((offer, i) => {
      const priceWei = offer.price?.value || '0';
      const priceEth = parseFloat(ethers.formatEther(priceWei));
      console.log(`   ${i+1}. ${priceEth.toFixed(4)} ETH - ${offer.order_hash.substring(0,10)}...`);
    });
    
    // 2. Token #653 için specific offers al
    console.log('\n2️⃣ TOKEN #653 SPECIFIC OFFERS:');
    
    // Best offer endpoint
    try {
      const bestOfferResponse = await axios.get(
        'https://api.opensea.io/api/v2/offers/collection/galverse/nfts/653/best',
        { headers }
      );
      
      console.log('\n   Best Offer Response:');
      console.log(JSON.stringify(bestOfferResponse.data, null, 2));
      
      if (bestOfferResponse.data && bestOfferResponse.data.price) {
        const priceWei = bestOfferResponse.data.price.value;
        const priceEth = parseFloat(ethers.formatEther(priceWei));
        console.log(`\n   ✅ Best offer for #653: ${priceEth.toFixed(4)} ETH`);
      }
    } catch (e) {
      console.log('   ❌ Best offer endpoint failed:', e.message);
    }
    
    // 3. NFT info endpoint'inden offers kontrol et
    console.log('\n3️⃣ NFT INFO ENDPOINT:');
    const nftResponse = await axios.get(
      'https://api.opensea.io/api/v2/chain/ethereum/contract/0x582048c4077a34e7c3799962f1f8c5342a3f4b12/nfts/653',
      { headers }
    );
    
    const nft = nftResponse.data.nft;
    if (nft) {
      console.log('   NFT info alındı');
      
      // Tüm offer related field'ları kontrol et
      const offerFields = ['best_offer', 'orders', 'offers', 'seaport_offers', 'collection_offers'];
      offerFields.forEach(field => {
        if (nft[field]) {
          console.log(`   ✓ ${field} field mevcut`);
          if (field === 'best_offer' && nft[field].price) {
            const priceWei = nft[field].price.value || nft[field].price;
            const priceEth = parseFloat(ethers.formatEther(priceWei.toString()));
            console.log(`     → Best offer: ${priceEth.toFixed(4)} ETH`);
          }
        } else {
          console.log(`   ✗ ${field} field yok`);
        }
      });
    }
    
    // 4. Orders endpoint'inden token-specific offers
    console.log('\n4️⃣ ORDERS ENDPOINT (Token specific):');
    const ordersResponse = await axios.get(
      'https://api.opensea.io/api/v2/orders/ethereum/seaport/offers',
      { 
        headers,
        params: {
          asset_contract_address: '0x582048c4077a34e7c3799962f1f8c5342a3f4b12',
          token_ids: '653',
          limit: 10
        }
      }
    );
    
    const tokenOffers = ordersResponse.data.orders || [];
    console.log(`   Token #653 için ${tokenOffers.length} offer bulundu`);
    
    tokenOffers.forEach((offer, i) => {
      const priceWei = offer.current_price || offer.base_price || '0';
      const priceEth = parseFloat(ethers.formatEther(priceWei));
      console.log(`   ${i+1}. ${priceEth.toFixed(4)} ETH - ${offer.order_hash.substring(0,10)}...`);
    });
    
    // 5. KARŞILAŞTIRMA
    console.log('\n5️⃣ SONUÇ:');
    
    // En yüksek collection offer
    if (collectionOffers.length > 0) {
      const highestCollection = collectionOffers[0];
      const priceWei = highestCollection.price?.value || '0';
      const priceEth = parseFloat(ethers.formatEther(priceWei));
      console.log(`   En yüksek collection offer: ${priceEth.toFixed(4)} ETH`);
      
      // 0.0267 ETH offer var mı?
      const targetOffer = collectionOffers.find(o => {
        const p = parseFloat(ethers.formatEther(o.price?.value || '0'));
        return Math.abs(p - 0.0267) < 0.0001;
      });
      
      if (targetOffer) {
        console.log(`   ✅ 0.0267 ETH collection offer BULUNDU!`);
      } else {
        console.log(`   ❌ 0.0267 ETH collection offer bulunamadı`);
      }
    }
    
    // Token #653 için en yüksek offer
    if (tokenOffers.length > 0) {
      const highestToken = tokenOffers[0];
      const priceWei = highestToken.current_price || highestToken.base_price || '0';
      const priceEth = parseFloat(ethers.formatEther(priceWei));
      console.log(`   Token #653 en yüksek offer: ${priceEth.toFixed(4)} ETH`);
    }
    
    // 6. PROBLEM ANALİZİ
    console.log('\n6️⃣ PROBLEM ANALİZİ:');
    console.log('   Eğer token için 0.0536 görünüyorsa ve collection offer 0.0267 ise:');
    console.log('   - Collection offer iki kez sayılıyor olabilir');
    console.log('   - Veya collection + token offer birleştiriliyor olabilir');
    console.log('   - API response\'da consideration array\'i de price\'a eklenmiş olabilir');
    
  } catch (error) {
    console.error('Hata:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

analyzeOffers();