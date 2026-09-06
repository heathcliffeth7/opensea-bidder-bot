const { formatPrice } = require('./utils/helpers');

console.log('Testing formatPrice function...\n');

// Test various inputs
const testCases = [
  { input: 0.0267, expected: '0.026700' },
  { input: 0.0534, expected: '0.053400' },
  { input: 0.0536, expected: '0.053600' },
  { input: '26700000000000000', expected: '0.026700' },
  { input: '53400000000000000', expected: '0.053400' },
  { input: { value: '26700000000000000' }, expected: '0.026700' },
  { input: { amount: 0.0267 }, expected: '0.026700' }
];

testCases.forEach(({ input, expected }) => {
  const result = formatPrice(input);
  const correct = result === expected;
  console.log(`Input: ${JSON.stringify(input)}`);
  console.log(`Result: ${result}`);
  console.log(`Expected: ${expected}`);
  console.log(`${correct ? '✅' : '❌'} ${correct ? 'PASSED' : 'FAILED'}\n`);
});

// Test the exact scenario
console.log('\n🔍 Testing exact scenario:');
const bestPrice = 0.0267;
console.log('bestPrice:', bestPrice);
console.log('formatPrice(bestPrice):', formatPrice(bestPrice));
console.log('formatPrice(bestPrice * 2):', formatPrice(bestPrice * 2));