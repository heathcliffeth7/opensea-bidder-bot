const { ethers } = require('ethers');
const config = require('../config');
const api = require('../src/api');

async function collectionOfferSolution() {
  console.log('🎯 Collection Offer Çözümü - Duplicate Problemi İçin\n');
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain bağlantısı başarılı');
    
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const price = '0.01';
    const duration = 15; // dakika
    
    console.log('📋 Parametreler:');
    console.log('Collection:', 'pengztracted-abstract');
    console.log('Contract:', contractAddress);
    console.log('Price:', price, 'WETH');
    console.log('Duration:', duration, 'minutes');
    
    // Collection offer parametreleri
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + (duration * 60);
    const salt = ethers.hexlify(ethers.randomBytes(32));
    
    // Blockchain'den güncel counter al
    const seaportAbi = ['function getCounter(address offerer) view returns (uint256)'];
    const seaportContract = new ethers.Contract(
      '0x0000000000000068f116a894984e2db1123eb395',
      seaportAbi,
      api.provider
    );
    
    const currentCounter = await seaportContract.getCounter(config.walletAddress);
    console.log('📊 Current Counter:', currentCounter.toString());
    
    const orderParameters = {
      offerer: config.walletAddress,
      zone: ethers.ZeroAddress,
      offer: [{
        itemType: 1, // ERC20 (WETH)
        token: config.getWethAddress('abstract'),
        identifierOrCriteria: "0",
        startAmount: ethers.parseEther(price).toString(),
        endAmount: ethers.parseEther(price).toString()
      }],
      consideration: [{
        itemType: 4, // ERC721_WITH_CRITERIA - Collection offer
        token: contractAddress,
        identifierOrCriteria: "0", // Criteria root - tüm collection
        startAmount: "1",
        endAmount: "1",
        recipient: config.walletAddress
      }],
      orderType: 0, // FULL_OPEN
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      zoneHash: ethers.ZeroHash,
      salt: salt,
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      counter: currentCounter.toString(),
      totalOriginalConsiderationItems: 1
    };
    
    console.log('\n📝 Order Detayları:');
    console.log('Order Type:', 'Collection Offer (itemType: 4)');
    console.log('Salt:', salt);
    console.log('Counter:', orderParameters.counter);
    
    // İmzala
    console.log('\n✍️ Order imzalanıyor...');
    const signature = await api._signOrder(orderParameters, 'abstract');
    console.log('✅ İmza oluşturuldu');
    
    // API payload
    const payload = {
      parameters: orderParameters,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    console.log('\n📤 OpenSea\'ye gönderiliyor...');
    
    try {
      const response = await api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload);
      
      console.log('\n✅ BAŞARILI!');
      console.log('Order Hash:', response.order?.order_hash || response.order_hash);
      console.log('Created:', new Date(response.order?.created_date || Date.now()).toLocaleString());
      console.log('\n💡 Collection offer başarıyla oluşturuldu!');
      console.log('Bu offer collection\'daki herhangi bir NFT için geçerli.');
      
    } catch (error) {
      if (error.response?.status === 400) {
        const errorMsg = error.response.data.errors?.[0] || error.response.data.detail || 'Unknown error';
        console.log('❌ Hata:', errorMsg);
        
        if (errorMsg.toLowerCase().includes('duplicate')) {
          console.log('\n⚠️ Collection offer da duplicate hatası veriyor!');
          console.log('Bu durumda counter artırmak tek çözüm.');
        } else if (errorMsg.toLowerCase().includes('criteria')) {
          console.log('\n⚠️ Criteria hatası - identifierOrCriteria değeri ayarlanmalı');
        }
      } else {
        console.log('❌ Diğer hata:', error.message);
      }
    }
    
  } catch (error) {
    console.error('Genel hata:', error.message);
  }
  
  process.exit(0);
}

collectionOfferSolution();