const axios = require('axios');
const { ethers } = require('ethers');

const API_KEY = process.env.OPENSEA_API_KEY || '';
const headers = {
  'accept': 'application/json',
  'x-api-key': API_KEY
};

// Test için _extractPrice fonksiyonunu simüle et
function _extractPrice(offer) {
  if (!offer) return 0;
  
  let price = 0;
  
  if (offer.price) {
    if (typeof offer.price === 'number') {
      price = offer.price;
    } else if (offer.price.value) {
      const value = parseFloat(offer.price.value);
      const decimals = offer.price.decimals || 18;
      price = value / Math.pow(10, decimals);
    }
  }
  
  return price;
}

async function testFix() {
  console.log('🔍 Collection Offer Bug Fix Testi\n');
  
  try {
    // Token #653 için best offer al
    const response = await axios.get(
      'https://api.opensea.io/api/v2/offers/collection/galverse/nfts/653/best',
      { headers }
    );
    
    const bestOffer = response.data;
    
    if (bestOffer) {
      console.log('✅ Best offer alındı');
      console.log(`Order hash: ${bestOffer.order_hash}`);
      console.log(`Raw price value: ${bestOffer.price?.value}`);
      
      const price = _extractPrice(bestOffer);
      console.log(`Extracted price: ${price.toFixed(4)} ETH`);
      
      // Collection offer kontrolü
      if (bestOffer.criteria?.encoded_token_ids === '*') {
        console.log('\n⚠️  BU BİR COLLECTION OFFER!');
        console.log('encoded_token_ids = "*" (tüm tokenlar için geçerli)');
        console.log('\n✅ YENİ MANTIK:');
        console.log('- Collection offer token-specific offer olarak KULLANILMAYACAK');
        console.log('- Min price kullanılacak');
        console.log('\n❌ ESKİ MANTIK:');
        console.log('- Collection offer price kullanılırdı');
        console.log('- Bu da yanlış fiyat gösterimine neden olurdu');
      } else {
        console.log('\n✅ Bu gerçek bir token-specific offer');
        console.log('- Normal counterbid mantığı uygulanacak');
      }
      
      // Simülasyon
      console.log('\n📊 SİMÜLASYON:');
      const minPrice = 0.01;
      const counterbidAmount = 0.0001;
      
      if (bestOffer.criteria?.encoded_token_ids === '*') {
        console.log('Collection offer bulundu → Min price kullanılacak');
        console.log(`Offer price: ${minPrice.toFixed(4)} ETH`);
      } else {
        const offerPrice = price + counterbidAmount;
        console.log(`Token offer bulundu: ${price.toFixed(4)} ETH`);
        console.log(`Counterbid: ${price.toFixed(4)} + ${counterbidAmount.toFixed(4)} = ${offerPrice.toFixed(4)} ETH`);
      }
      
    } else {
      console.log('❌ Best offer bulunamadı');
    }
    
  } catch (error) {
    console.error('Hata:', error.message);
  }
}

testFix();