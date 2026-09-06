require('dotenv').config({ path: '../.env' });
const axios = require('axios');

/**
 * OpenSea API'ye doğrudan erişim testi
 */
async function testDirectAPI() {
  console.log('🔍 OpenSea API Test\n');
  
  const apiKey = process.env.OPENSEA_API_KEY;
  
  // Test edilecek endpoint'ler
  const endpoints = [
    {
      name: 'Collections',
      url: 'https://api.opensea.io/api/v2/collections/pengztracted-abstract'
    },
    {
      name: 'Collection by contract',
      url: 'https://api.opensea.io/api/v2/chain/abstract/contract/0xa6c46c07f7f1966d772e29049175ebba26262513'
    },
    {
      name: 'Account info',
      url: `https://api.opensea.io/api/v2/accounts/${process.env.WALLET_ADDRESS}`
    }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📡 Testing: ${endpoint.name}`);
    console.log(`URL: ${endpoint.url}`);
    
    try {
      const response = await axios.get(endpoint.url, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      console.log('✅ Başarılı!');
      console.log('Response:', JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
      
    } catch (error) {
      console.error('❌ Hata:', error.message);
      
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Headers:', error.response.headers);
        
        // HTML response mu kontrol et
        const contentType = error.response.headers['content-type'];
        if (contentType && contentType.includes('text/html')) {
          console.log('⚠️ HTML response alındı (muhtemelen Cloudflare)');
          console.log('Response başlangıcı:', error.response.data.substring(0, 100));
        } else {
          console.log('Response data:', error.response.data);
        }
      }
    }
  }
  
  // Alternatif: SDK kullanarak test
  console.log('\n\n🔧 SDK ile test ediliyor...');
  try {
    const { OpenSeaSDK, Chain } = require('opensea-js');
    const { ethers } = require('ethers');
    
    const provider = new ethers.JsonRpcProvider(process.env.ABSTRACT_RPC_URL || 'https://api.mainnet.abs.xyz');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    // SDK v2 kullan
    const openseaSDK = new OpenSeaSDK(wallet, {
      chain: 'abstract',
      apiKey: apiKey
    });
    
    console.log('SDK başarıyla oluşturuldu');
    
    // Basit bir API çağrısı
    const collection = await openseaSDK.api.getCollection('pengztracted-abstract');
    console.log('Collection bilgisi:', collection);
    
  } catch (sdkError) {
    console.error('SDK hatası:', sdkError.message);
  }
}

testDirectAPI();