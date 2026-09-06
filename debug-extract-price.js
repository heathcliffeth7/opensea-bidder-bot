// Test the exact scenario
const api = require('./src/api');

// Simulate the exact offer structure from API
const collectionOffer = {
  "order_hash": "0x490c3d93bf151aa08e859848a8dfb3afe3ffabc29d46f45af354775561782815",
  "chain": "ethereum",
  "price": {
    "currency": "WETH",
    "decimals": 18,
    "value": "26700000000000000"
  },
  "criteria": {
    "collection": {
      "slug": "gemesis"
    },
    "contract": {
      "address": "0xbe9371326f91345777b04394448c23e2bfeaa826"
    },
    "trait": null,
    "encoded_token_ids": "*"
  },
  "protocol_data": {
    "parameters": {
      "offerer": "0x15fc5533c95af89d8f58cc1c61f78e9813d007e7",
      "offer": [
        {
          "itemType": 1,
          "token": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          "identifierOrCriteria": "0",
          "startAmount": "26700000000000000",
          "endAmount": "26700000000000000"
        }
      ],
      "consideration": [
        {
          "itemType": 4,
          "token": "0xbe9371326F91345777b04394448c23E2BFEaa826",
          "identifierOrCriteria": "0",
          "startAmount": "1",
          "endAmount": "1",
          "recipient": "0x15fc5533c95Af89d8f58CC1c61f78E9813D007E7"
        },
        {
          "itemType": 1,
          "token": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          "identifierOrCriteria": "0",
          "startAmount": "133500000000000",
          "endAmount": "133500000000000",
          "recipient": "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ]
    }
  }
};

console.log('Testing _extractPrice with real collection offer data...\n');

// Test all paths in _extractPrice
console.log('1. Testing price field:');
const priceFromField = collectionOffer.price?.value / Math.pow(10, collectionOffer.price?.decimals || 18);
console.log('   Result:', priceFromField, 'ETH');

console.log('\n2. Testing protocol_data.parameters.offer:');
const priceFromProtocol = parseFloat(collectionOffer.protocol_data?.parameters?.offer?.[0]?.startAmount) / 1e18;
console.log('   Result:', priceFromProtocol, 'ETH');

console.log('\n3. Testing _extractPrice:');
const extractedPrice = api._extractPrice(collectionOffer);
console.log('   Result:', extractedPrice, 'ETH');

console.log('\n4. Testing consideration amounts:');
const consideration1 = collectionOffer.protocol_data.parameters.consideration[0];
const consideration2 = collectionOffer.protocol_data.parameters.consideration[1];
console.log('   NFT amount:', consideration1.startAmount);
console.log('   Fee amount:', consideration2.startAmount, '=', consideration2.startAmount / 1e18, 'ETH');

console.log('\n5. Testing if consideration is mistakenly added:');
const offerAmount = parseFloat(collectionOffer.protocol_data.parameters.offer[0].startAmount) / 1e18;
const feeAmount = parseFloat(consideration2.startAmount) / 1e18;
console.log('   Offer:', offerAmount);
console.log('   Fee:', feeAmount);
console.log('   Offer + Fee:', offerAmount + feeAmount);
console.log('   Offer * 2:', offerAmount * 2);

// Test edge case: maybe it's reading both offer and consideration?
console.log('\n6. Checking for double counting:');
if (Math.abs(offerAmount * 2 - 0.0534) < 0.0001) {
  console.log('   ✅ CONFIRMED: Value is being doubled!');
  console.log('   0.0267 * 2 = 0.0534');
}