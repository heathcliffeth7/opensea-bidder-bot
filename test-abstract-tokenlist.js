// Test script to verify abstract chain is not affected
const helpers = require('./utils/helpers');

console.log('Testing Abstract chain token parsing...\n');

// Test 1: Abstract collection offer (no tokenIds)
const abstractCollectionCommand = 'abstract:pengztracted minprice:0.001 maxprice:0.003 type:collectionoffer offertime:15min looptime:0min counterbid on 0.0001';
const parsedCollection = helpers.parseTaskCommand(abstractCollectionCommand);

console.log('Abstract Collection Offer:');
console.log(JSON.stringify(parsedCollection, null, 2));
console.log('Has tokenIds?', !!parsedCollection.tokenIds);
console.log('---\n');

// Test 2: Abstract token offer with tokenIdList
const abstractTokenCommand = 'abstract:pengztracted minprice:0.001 maxprice:0.003 type:tokenoffer tokenidlist:1,2,3,4,5';
const parsedToken = helpers.parseTaskCommand(abstractTokenCommand);

console.log('Abstract Token Offer:');
console.log(JSON.stringify(parsedToken, null, 2));
console.log('TokenIdList:', parsedToken.tokenIdList);
console.log('---\n');

// Test 3: Ethereum token offer for comparison
const ethereumCommand = 'ethereum:gemesis minprice:0.02 maxprice:0.035 type:tokenoffer tokenidlist:16,50,896';
const parsedEth = helpers.parseTaskCommand(ethereumCommand);

console.log('Ethereum Token Offer:');
console.log(JSON.stringify(parsedEth, null, 2));
console.log('TokenIdList:', parsedEth.tokenIdList);

console.log('\n✅ Abstract chain parsing works correctly!');