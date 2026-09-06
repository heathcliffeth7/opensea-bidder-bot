const api = require('../src/api');
const { ethers } = require('ethers');
const config = require('../config');

async function minimalParamsTest() {
  console.log('🧪 Minimal Parametrelerle OpenSea Offer Testi\n');
  
  try {
    await api.switchChain('abstract');
    
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const tokenId = '999'; // Daha önce denenmemiş bir token ID
    const price = '0.01';
    
    console.log('📋 Test Parametreleri:');
    console.log('Contract:', contractAddress);
    console.log('Token ID:', tokenId);
    console.log('Price:', price, 'WETH');
    
    // Seaport contract'tan counter al
    const seaportAbi = ['function getCounter(address offerer) view returns (uint256)'];
    const seaportContract = new ethers.Contract(
      '0x0000000000000068f116a894984e2db1123eb395',
      seaportAbi,
      api.provider
    );
    
    const currentCounter = await seaportContract.getCounter(config.walletAddress);
    console.log('Counter:', currentCounter.toString());
    
    // ULTRA MİNİMAL parametreler - OpenSea web gibi
    const now = Math.floor(Date.now() / 1000);
    const orderParams = {
      offerer: config.walletAddress,
      zone: ethers.ZeroAddress, // Zone yok
      offer: [{
        itemType: 1,
        token: config.getWethAddress('abstract'),
        identifierOrCriteria: "0",
        startAmount: ethers.parseEther(price).toString(),
        endAmount: ethers.parseEther(price).toString()
      }],
      consideration: [{
        itemType: 2,
        token: contractAddress,
        identifierOrCriteria: tokenId,
        startAmount: "1",
        endAmount: "1",
        recipient: config.walletAddress
      }],
      orderType: 0, // FULL_OPEN
      startTime: now.toString(),
      endTime: (now + 900).toString(), // 15 dakika
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      counter: currentCounter.toString(), // Blockchain'den alınan gerçek counter
      totalOriginalConsiderationItems: 1 // Sadece NFT, fee yok
    };
    
    console.log('\n🔍 Order Özeti:');
    console.log('- Zone: Yok (0x0000...)');
    console.log('- Fee: Yok');
    console.log('- OrderType: 0 (FULL_OPEN)');
    console.log('- Counter: Blockchain\'den alındı');
    console.log('- Salt: Random');
    
    // İmzala
    console.log('\n✍️ İmzalanıyor...');
    const signature = await api._signOrder(orderParams, 'abstract');
    
    // Gönder
    const payload = {
      parameters: orderParams,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    console.log('\n📤 Gönderiliyor...');
    
    try {
      const response = await api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload);
      
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', response.order?.order_hash || response.order_hash);
      console.log('\n💡 Minimal parametreler çalıştı!');
      
    } catch (error) {
      if (error.response?.data) {
        console.log('\n❌ HATA:', JSON.stringify(error.response.data, null, 2));
        
        if (error.response.data.errors?.[0]?.includes('duplicate')) {
          console.log('\n⚠️ Bu token ID de duplicate hatası veriyor!');
          console.log('💡 Çözüm: Counter artırın veya çok farklı bir token ID deneyin (örn: 1000+)');
        }
      } else {
        console.log('❌ Hata:', error.message);
      }
    }
    
  } catch (error) {
    console.error('Test hatası:', error.message);
  }
  
  process.exit(0);
}

minimalParamsTest();