require('dotenv').config({ path: '../.env' });
const api = require('../src/api');

async function testPriceExtraction() {
  console.log('💰 Fiyat Çıkarma Testi\n');
  
  // Test offer objesi (gerçek API yanıtından)
  const testOffer = {
    "order_hash": "0x5baaea993fc1858fcf466a0d597105244794e0fe4b237ef4686eb72e5320aa7c",
    "chain": "abstract",
    "price": {
      "currency": "WETH",
      "decimals": 18,
      "value": "8500000000000000"
    },
    "protocol_data": {
      "parameters": {
        "offerer": "0xb8898bb87b07bac7ba9c2268e6d0640d5a208a7a",
        "offer": [
          {
            "itemType": 1,
            "token": "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
            "identifierOrCriteria": "0",
            "startAmount": "8500000000000000",
            "endAmount": "8500000000000000"
          }
        ]
      }
    }
  };
  
  console.log('Test offer objesi:');
  console.log(JSON.stringify(testOffer, null, 2));
  
  console.log('\n📊 Fiyat çıkarma sonuçları:');
  
  // _extractPrice fonksiyonunu test et
  const price = api._extractPrice(testOffer);
  console.log(`\n1. Direkt _extractPrice: ${price} ETH`);
  
  // price.value üzerinden
  if (testOffer.price && testOffer.price.value) {
    const value = parseFloat(testOffer.price.value);
    const decimals = testOffer.price.decimals || 18;
    const calculatedPrice = value / Math.pow(10, decimals);
    console.log(`\n2. price.value üzerinden: ${calculatedPrice} ETH`);
    console.log(`   - value: ${value}`);
    console.log(`   - decimals: ${decimals}`);
  }
  
  // protocol_data üzerinden
  if (testOffer.protocol_data?.parameters?.offer?.[0]?.startAmount) {
    const startAmount = testOffer.protocol_data.parameters.offer[0].startAmount;
    const ethers = require('ethers');
    const priceFromProtocol = parseFloat(ethers.formatEther(startAmount));
    console.log(`\n3. protocol_data üzerinden: ${priceFromProtocol} ETH`);
    console.log(`   - startAmount: ${startAmount}`);
  }
  
  // getBestOfferForNFT testi
  console.log('\n\n📊 getBestOfferForNFT Testi:');
  try {
    const bestOfferResult = await api.getBestOfferForNFT(
      'abstract',
      '0xa6c46c07f7f1966d772e29049175ebba26262513',
      '50'
    );
    
    console.log('\nAPI yanıtı:');
    console.log('- bestOfferResult:', bestOfferResult ? 'VAR' : 'YOK');
    console.log('- bestOfferResult.offer:', bestOfferResult?.offer ? 'VAR' : 'YOK');
    
    if (bestOfferResult && bestOfferResult.offer) {
      const extractedPrice = api._extractPrice(bestOfferResult.offer);
      console.log(`\nÇıkarılan fiyat: ${extractedPrice} ETH`);
    }
  } catch (error) {
    console.error('API hatası:', error.message);
  }
}

testPriceExtraction();