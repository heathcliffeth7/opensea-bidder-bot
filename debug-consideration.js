#!/usr/bin/env node

const axios = require('axios');

async function debugConsideration() {
  const token = '653';
  const url = `https://api.opensea.io/api/v2/offers/collection/gemesis/nfts/${token}/best`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'X-API-KEY': process.env.OPENSEA_API_KEY || ''
      }
    });
    
    const data = response.data;
    console.log('\n=== DEBUGGING CONSIDERATION FOR TOKEN', token, '===\n');
    
    console.log('Price field:', data.price);
    console.log('Price in ETH:', parseInt(data.price.value) / 1e18);
    
    console.log('\n--- OFFER ARRAY ---');
    data.protocol_data.parameters.offer.forEach((item, i) => {
      console.log(`Offer[${i}]:`, item);
      console.log(`  Amount in ETH:`, parseInt(item.startAmount) / 1e18);
    });
    
    console.log('\n--- CONSIDERATION ARRAY ---');
    let totalConsideration = 0;
    data.protocol_data.parameters.consideration.forEach((item, i) => {
      console.log(`Consideration[${i}]:`, item);
      if (item.itemType === 1) { // ETH/WETH
        const amount = parseInt(item.startAmount) / 1e18;
        console.log(`  Amount in ETH:`, amount);
        totalConsideration += amount;
      }
    });
    
    console.log('\n--- TOTALS ---');
    console.log('Total offer:', parseInt(data.protocol_data.parameters.offer[0].startAmount) / 1e18);
    console.log('Total consideration (ETH items):', totalConsideration);
    console.log('Sum of consideration:', totalConsideration);
    
    // Check if this matches the doubled value
    console.log('\nIs total consideration 0.0534?', Math.abs(totalConsideration - 0.0534) < 0.0001);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugConsideration();