const api = require('./src/api');

console.log('Testing wei conversion scenarios...\n');

// Test different offer structures
const testOffers = [
  {
    name: 'Standard API response',
    offer: {
      price: {
        currency: 'WETH',
        decimals: 18,
        value: '26700000000000000'
      }
    },
    expected: 0.0267
  },
  {
    name: 'Value as number',
    offer: {
      price: {
        currency: 'WETH',
        decimals: 18,
        value: 26700000000000000
      }
    },
    expected: 0.0267
  },
  {
    name: 'Price as direct number (ETH)',
    offer: {
      price: 0.0267
    },
    expected: 0.0267
  },
  {
    name: 'Price as direct number (Wei)',
    offer: {
      price: 26700000000000000
    },
    expected: 0.0267
  },
  {
    name: 'Double value string',
    offer: {
      price: {
        currency: 'WETH',
        decimals: 18,
        value: '53400000000000000'
      }
    },
    expected: 0.0534
  },
  {
    name: 'Price as 0.0534',
    offer: {
      price: 0.0534
    },
    expected: 0.0534
  }
];

testOffers.forEach(({ name, offer, expected }) => {
  const result = api._extractPrice(offer);
  const correct = Math.abs(result - expected) < 0.000001;
  
  console.log(`Test: ${name}`);
  console.log(`Input: ${JSON.stringify(offer.price)}`);
  console.log(`Result: ${result}`);
  console.log(`Expected: ${expected}`);
  console.log(`${correct ? '✅' : '❌'} ${correct ? 'PASSED' : 'FAILED'}`);
  
  if (!correct && result === expected * 2) {
    console.log('⚠️  Result is DOUBLE the expected value!');
  }
  
  console.log('');
});