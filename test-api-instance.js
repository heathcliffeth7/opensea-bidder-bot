const api = require('./src/api');

// Test _extractPrice directly
const testOffer = {
  price: {
    currency: 'WETH',
    decimals: 18,
    value: '26700000000000000'
  }
};

const result = api._extractPrice(testOffer);
console.log('_extractPrice result:', result, 'ETH');
console.log('Expected:', 0.0267, 'ETH');
console.log('Double:', result * 2, 'ETH');