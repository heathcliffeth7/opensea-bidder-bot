const axios = require('axios');
const config = require('../config');

async function checkOrder(orderHash) {
  try {
    const response = await axios.get(
      `https://api.opensea.io/api/v2/orders/abstract/${orderHash}`,
      {
        headers: {
          'X-API-KEY': config.apiKey,
          'Accept': 'application/json'
        }
      }
    );
    
    console.log(`\n📋 Order Details for ${orderHash}:`);
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.protocol_data && response.data.protocol_data.parameters) {
      const params = response.data.protocol_data.parameters;
      console.log('\n🔍 Key Parameters:');
      console.log('- Offerer:', params.offerer);
      console.log('- Counter:', params.counter);
      console.log('- Salt:', params.salt);
      console.log('- Start Time:', new Date(parseInt(params.startTime) * 1000).toISOString());
      console.log('- End Time:', new Date(parseInt(params.endTime) * 1000).toISOString());
    }
  } catch (error) {
    console.error(`❌ Error checking order ${orderHash}:`, error.message);
    if (error.response && error.response.data) {
      console.error('API Response:', error.response.data);
    }
  }
}

// Check the duplicate orders
const duplicateOrders = [
  '0xcb188d8bba4a39dc568521c490dd9ad1d56e458fcec520e28b07b8ea0d94d714',
  '0x2dae69a5fa86b4b29c7f7121e9f31db001b55ba41ade09cd5c7c1d8560129921',
  '0x683500d530b80b10b5ec8ec777ef3fb71de43bcba53fb48ad431e8a68d6b8272'
];

async function checkAll() {
  for (const orderHash of duplicateOrders) {
    await checkOrder(orderHash);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 saniye bekle
  }
}

checkAll().catch(console.error);