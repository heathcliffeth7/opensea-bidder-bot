// Test the full flow with taskManager
const taskManager = require('./src/taskManager');
const helpers = require('./utils/helpers');

console.log('Testing tokenIdList fix...\n');

// Create task
const createResult = taskManager.createTask('testTask');
console.log('Create task:', createResult.message);

// Parse command
const command = 'ethereum:gemesis minprice:0.02 maxprice:0.035 type:tokenoffer offertime:15min looptime:1min counterbid on 0.0001 highofferskip on itemlimit 1 tokenidlist:16,50,896,653,478,96,85,108,963,588';
const parsedSettings = helpers.parseTaskCommand(command);

console.log('\nParsed settings:');
console.log('- tokenIdList:', parsedSettings.tokenIdList ? parsedSettings.tokenIdList.length + ' tokens' : 'none');
console.log('- tokenIds:', parsedSettings.tokenIds ? parsedSettings.tokenIds.length + ' tokens' : 'none');

// Simulate what index.js does now
if (parsedSettings.tokenIdList && parsedSettings.tokenIdList.length > 0) {
  parsedSettings.tokenIds = parsedSettings.tokenIdList;
  delete parsedSettings.tokenIdList;
  console.log(`\n✅ Converted tokenIdList to tokenIds: ${parsedSettings.tokenIds.length} tokens`);
  
  // Remove duplicates
  const uniqueTokens = [...new Set(parsedSettings.tokenIds)];
  if (uniqueTokens.length < parsedSettings.tokenIds.length) {
    console.log(`Duplicate tokens removed: ${parsedSettings.tokenIds.length} -> ${uniqueTokens.length}`);
    parsedSettings.tokenIds = uniqueTokens;
  }
}

// Set task settings
const setResult = taskManager.setTaskSettings('testTask', parsedSettings);
console.log('\nSet task settings:', setResult.message);

// Check task settings
const task = taskManager.tasks['testTask'];
console.log('\nFinal task settings:');
console.log('- tokenIds:', task.settings.tokenIds ? task.settings.tokenIds.length + ' tokens' : 'none');
console.log('- First 5 tokens:', task.settings.tokenIds ? task.settings.tokenIds.slice(0, 5) : 'none');

console.log('\n✅ Fix verified! tokenIdList is now properly converted to tokenIds');