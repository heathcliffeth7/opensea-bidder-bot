// Let's trace the exact flow to find where doubling happens

console.log('🔍 Finding the double bug...\n');

// The facts we know:
console.log('FACTS:');
console.log('1. API returns 0.0267 ETH for token #588 (confirmed)');
console.log('2. _extractPrice returns 0.0267 (confirmed)');
console.log('3. formatPrice works correctly (confirmed)');
console.log('4. Logs show "Best offer 0.053600"');
console.log('5. 0.0536 ≈ 0.0267 * 2');

console.log('\nPOSSIBLE CAUSES:');
console.log('1. bestPrice is calculated twice somewhere');
console.log('2. A variable is being reused/accumulated');
console.log('3. API response is cached and modified');
console.log('4. Collection offer price is being doubled for tokens');

console.log('\nLet\'s check the exact code flow in ethereumWorkerPool.js:');
console.log('Line 152: API call → bestOffer');
console.log('Line 165: bestPrice = this.api._extractPrice(bestOffer)');
console.log('Line 177: console.log shows formatPrice(bestPrice)');

console.log('\nTHEORY:');
console.log('Maybe bestOffer is being modified between line 152 and 165?');
console.log('Or bestPrice is being calculated differently?');

// Let's simulate the exact scenario
const { formatPrice } = require('./utils/helpers');

const bestOffer = {
  price: {
    currency: 'WETH',
    decimals: 18,
    value: '26700000000000000'
  }
};

// What the code should do
const api = require('./src/api');
const bestPrice = api._extractPrice(bestOffer);
console.log('\nSIMULATION:');
console.log('bestPrice from _extractPrice:', bestPrice);
console.log('formatPrice(bestPrice):', formatPrice(bestPrice));
console.log('Should show: 0.026700');
console.log('But logs show: 0.053600');

// Maybe it's in the API response itself?
console.log('\nCHECKING: Is API sometimes returning doubled values?');
console.log('We need to add more debug logs to see the raw API response.');