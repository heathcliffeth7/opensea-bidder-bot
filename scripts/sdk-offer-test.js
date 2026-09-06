const api = require('../src/api');
const config = require('../config');
const { ethers } = require('ethers');

async function sdkOfferTest() {
  console.log('🔧 OpenSea SDK ile Offer Test\n');
  
  try {
    // Abstract chain'e geç
    await api.switchChain('abstract');
    console.log('Chain: Abstract');
    
    // SDK hazır olana kadar bekle
    if (!api.sdk) {
      console.log('SDK hazırlanıyor...');
      await new Promise(r => setTimeout(r, 3000));
    }
    
    const testCase = {
      contract: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '999', // Farklı bir token
      price: 0.00555, // Farklı bir fiyat
      duration: 10 // 10 dakika
    };
    
    console.log('\n📋 Test Parametreleri:');
    console.log('Contract:', testCase.contract);
    console.log('Token ID:', testCase.tokenId);
    console.log('Fiyat:', testCase.price, 'WETH');
    console.log('Süre:', testCase.duration, 'dakika');
    
    console.log('\n🚀 SDK ile offer oluşturuluyor...');
    
    try {
      // SDK createOffer metodunu kullan
      const offer = await api.sdk.createOffer({
        asset: {
          tokenId: testCase.tokenId,
          tokenAddress: testCase.contract,
          schemaName: "ERC721"
        },
        accountAddress: config.walletAddress,
        startAmount: testCase.price,
        expirationTime: Math.floor(Date.now() / 1000) + (testCase.duration * 60),
        paymentTokenAddress: config.getWethAddress('abstract')
      });
      
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', offer.hash || offer.orderHash);
      console.log('Order:', JSON.stringify(offer, null, 2));
      
    } catch (sdkError) {
      console.error('❌ SDK Hatası:', sdkError.message);
      
      // Eğer SDK başarısız olursa, manuel yöntem dene
      console.log('\n🔄 Manuel yöntem deneniyor...');
      
      // Direkt API call
      const orderParams = {
        offerer: config.walletAddress,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100",
        offer: [{
          itemType: 1,
          token: config.getWethAddress('abstract'),
          identifierOrCriteria: "0",
          startAmount: ethers.parseEther(testCase.price.toString()).toString(),
          endAmount: ethers.parseEther(testCase.price.toString()).toString()
        }],
        consideration: [
          {
            itemType: 2,
            token: testCase.contract,
            identifierOrCriteria: testCase.tokenId,
            startAmount: "1",
            endAmount: "1",
            recipient: config.walletAddress
          },
          {
            itemType: 1,
            token: config.getWethAddress('abstract'),
            identifierOrCriteria: "0",
            startAmount: (ethers.parseEther(testCase.price.toString()) * 250n / 10000n).toString(),
            endAmount: (ethers.parseEther(testCase.price.toString()) * 250n / 10000n).toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
          }
        ],
        orderType: 2,
        startTime: Math.floor(Date.now() / 1000).toString(),
        endTime: Math.floor(Date.now() / 1000 + testCase.duration * 60).toString(),
        zoneHash: ethers.ZeroHash,
        salt: ethers.hexlify(ethers.randomBytes(32)),
        conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
        totalOriginalConsiderationItems: 2
      };
      
      // Counter al
      const seaportAbi = ['function getCounter(address offerer) view returns (uint256)'];
      const seaportContract = new ethers.Contract(
        '0x0000000000000068f116a894984e2db1123eb395',
        seaportAbi,
        api.provider
      );
      
      const counter = await seaportContract.getCounter(config.walletAddress);
      orderParams.counter = counter.toString();
      
      console.log('Counter:', orderParams.counter);
      
      // İmzala
      const signature = await api._signOrder(orderParams, 'abstract');
      
      // API'ye gönder
      const response = await api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', {
        parameters: orderParams,
        signature: signature,
        protocol_address: '0x0000000000000068f116a894984e2db1123eb395'
      });
      
      console.log('\n✅ Manuel yöntem BAŞARILI!');
      console.log('Response:', JSON.stringify(response, null, 2));
    }
    
  } catch (error) {
    console.error('Genel hata:', error.message);
    if (error.response?.data) {
      console.log('API Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  process.exit(0);
}

sdkOfferTest();