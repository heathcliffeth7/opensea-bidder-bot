const api = require('./src/api');

// Test offer with 0.0267 ETH
const testOffer = {
  price: {
    currency: "WETH",
    decimals: 18,
    value: "26700000000000000"
  }
};

console.log('Testing _extractPrice method:');
console.log('Input value:', testOffer.price.value);
console.log('Expected: 0.0267 ETH');

const result = api._extractPrice(testOffer);
console.log('Result:', result, 'ETH');
console.log('Is doubled?', result === 0.0534);