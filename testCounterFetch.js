const api = require('./src/api');
const config = require('./config');

async function testCounterFetch() {
  try {
    console.log('=== Counter Fetch Test ===\n');
    
    // Farklı endpoint'leri dene
    const endpoints = [
      `/api/v2/accounts/${config.walletAddress}`,
      `/api/v2/accounts/${config.walletAddress}/nonce`,
      `/api/v2/chain/abstract/account/${config.walletAddress}/nonce`,
      `/api/v2/orders/abstract/seaport/counter/${config.walletAddress}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`\nEndpoint: ${endpoint}`);
        const response = await api.makeRequest('GET', endpoint);
        console.log('Response:', JSON.stringify(response, null, 2));
      } catch (error) {
        console.log('Error:', error.response?.status || error.message);
      }
    }
    
  } catch (error) {
    console.error('\nHata:', error);
  }
  
  process.exit(0);
}

testCounterFetch();