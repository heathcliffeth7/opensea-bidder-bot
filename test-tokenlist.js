// Test script to check tokenidlist parsing
const helpers = require('./utils/helpers');

const testCommand = 'ethereum:gemesis minprice:0.02 maxprice:0.035 type:tokenoffer offertime:15min looptime:1min counterbid on 0.0001 highofferskip on itemlimit 1 tokenidlist:16,50,896,653,478,96,85,108,963,588,963,485,763,418,125,698,453,789,362,789,413,566,799,810,811,812,203,198,197,162,358,698,478,16,50,896,753,698,123,1234,5587,1125,747,562,876,369,125,147,897,898,899,900,901,902,903,904,905,906,907,908,909,910,911,912,913,914,915,916,917,918,919,920,921,922,923,924,925,926,927,928,930';

console.log('Testing tokenidlist parsing...\n');

// Parse the command
const parsed = helpers.parseTaskCommand(testCommand);

console.log('Parsed settings:');
console.log(JSON.stringify(parsed, null, 2));

if (parsed.tokenIdList) {
  console.log('\nToken ID List:');
  console.log(`Total tokens: ${parsed.tokenIdList.length}`);
  
  // Check for duplicates
  const uniqueTokens = [...new Set(parsed.tokenIdList)];
  console.log(`Unique tokens: ${uniqueTokens.length}`);
  
  if (uniqueTokens.length < parsed.tokenIdList.length) {
    console.log(`\nDuplicates found: ${parsed.tokenIdList.length - uniqueTokens.length} tokens`);
    
    // Find duplicates
    const tokenCounts = {};
    parsed.tokenIdList.forEach(token => {
      tokenCounts[token] = (tokenCounts[token] || 0) + 1;
    });
    
    console.log('\nDuplicate tokens:');
    Object.entries(tokenCounts).forEach(([token, count]) => {
      if (count > 1) {
        console.log(`- Token ${token}: ${count} times`);
      }
    });
  }
  
  // Show first 10 and last 10 tokens
  console.log('\nFirst 10 tokens:', parsed.tokenIdList.slice(0, 10).join(', '));
  console.log('Last 10 tokens:', parsed.tokenIdList.slice(-10).join(', '));
}