require('dotenv').config();
const axios = require('axios');
const config = require('./config');

async function testGemesisContract() {
  console.log('🔍 Gemesis Contract Address Test\n');
  
  const headers = {
    'accept': 'application/json',
    'x-api-key': config.apiKey
  };

  // Test edilecek contract addressler
  const contracts = [
    { address: '0xbe9371326f91345777b04394448c23e2bfeaa826', name: 'API\'den gelen' },
    { address: '0x0Beed7099AF7514cCEDF642CfAE435731696A2cE', name: 'Bot\'un kullandığı' }
  ];
  
  for (const contract of contracts) {
    console.log(`\n📍 Testing ${contract.name}: ${contract.address}`);
    
    try {
      // 1. Contract bilgisini al
      const contractUrl = `https://api.opensea.io/api/v2/chain/ethereum/contract/${contract.address}`;
      const contractResponse = await axios.get(contractUrl, { headers });
      
      console.log('✅ Contract bulundu!');
      console.log(`   Collection: ${contractResponse.data.collection}`);
      console.log(`   Name: ${contractResponse.data.name}`);
      console.log(`   Symbol: ${contractResponse.data.symbol}`);
      
      // 2. NFT örneği al
      const nftUrl = `https://api.opensea.io/api/v2/chain/ethereum/contract/${contract.address}/nfts/16`;
      try {
        const nftResponse = await axios.get(nftUrl, { headers });
        console.log(`   Token #16: ✅ Mevcut`);
      } catch (e) {
        console.log(`   Token #16: ❌ Bulunamadı`);
      }
      
      // 3. Best offer kontrol et
      const bestOfferUrl = `https://api.opensea.io/api/v2/offers/collection/${contractResponse.data.collection}/nfts/16/best`;
      try {
        const bestOfferResponse = await axios.get(bestOfferUrl, { headers });
        if (bestOfferResponse.data && bestOfferResponse.data.price) {
          const price = parseFloat(bestOfferResponse.data.price.value) / 1e18;
          console.log(`   Best offer for #16: ${price.toFixed(4)} ETH`);
        }
      } catch (e) {
        console.log(`   Best offer error: ${e.response?.status}`);
      }
      
    } catch (error) {
      console.log('❌ Contract bulunamadı veya hata:', error.response?.status, error.message);
    }
  }
  
  // OpenSea web'den kontrol
  console.log('\n📝 Manual kontrol için:');
  console.log('https://opensea.io/collection/gemesis');
  console.log('https://opensea.io/assets/ethereum/0x0beed7099af7514ccedf642cfae435731696a2ce/16');
}

testGemesisContract().catch(console.error);