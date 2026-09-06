const api = require('../src/api');
const { ethers } = require('ethers');
const config = require('../config');

async function finalDuplicateFix() {
  console.log('🎯 Final Duplicate Fix - Farklı Token ID Yaklaşımı\n');
  
  try {
    await api.switchChain('abstract');
    console.log('✅ Abstract chain\'e bağlandı');
    
    const contractAddress = '0xa6c46c07f7f1966d772e29049175ebba26262513';
    const price = '0.01'; // minprice
    const duration = 15; // 15 dakika
    
    // Token ID listesi - 16 hariç diğerleri
    const tokenIds = [50, 896]; // Sadece iki tane deneyelim
    
    console.log('📋 Test Parametreleri:');
    console.log('Collection:', 'pengztracted-abstract');
    console.log('Contract:', contractAddress);
    console.log('Price:', price, 'WETH');
    console.log('Duration:', duration, 'minutes');
    console.log('Token IDs:', tokenIds.join(', '));
    
    // Her token ID için dene
    for (const tokenId of tokenIds) {
      console.log(`\n🔄 Token ID ${tokenId} için deneniyor...`);
      
      try {
        // Önce bu token için mevcut offer var mı kontrol et
        const offersResponse = await api.makeRequest(
          'GET',
          `/api/v2/orders/abstract/seaport/offers?asset_contract_address=${contractAddress}&token_ids=${tokenId}`
        );
        
        if (offersResponse.orders && offersResponse.orders.length > 0) {
          console.log(`⚠️ Token ${tokenId} için zaten ${offersResponse.orders.length} offer var`);
          
          // En yüksek offer'ı bul
          const highestOffer = offersResponse.orders.reduce((max, order) => {
            const orderPrice = parseFloat(order.current_price || '0') / 1e18;
            const maxPrice = parseFloat(max.current_price || '0') / 1e18;
            return orderPrice > maxPrice ? order : max;
          });
          
          const highestPrice = parseFloat(highestOffer.current_price || '0') / 1e18;
          console.log(`En yüksek offer: ${highestPrice} WETH`);
          
          // Eğer bizim offer'ımız değilse ve fiyat uygunsa devam et
          if (highestOffer.maker?.address?.toLowerCase() !== config.walletAddress.toLowerCase() && 
              highestPrice < parseFloat(price)) {
            console.log('✅ Bizim offer\'ımız değil ve fiyat uygun, devam ediliyor...');
          } else {
            console.log('⏭️ Bu token\'ı atlıyorum');
            continue;
          }
        } else {
          console.log('✅ Bu token için offer yok');
        }
        
        // Minimal parametrelerle order oluştur
        const orderParams = {
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
            itemType: 2, // ERC721 - Specific token
            token: contractAddress,
            identifierOrCriteria: tokenId.toString(),
            startAmount: "1",
            endAmount: "1",
            recipient: config.walletAddress
          }],
          orderType: 0, // FULL_OPEN
          startTime: Math.floor(Date.now() / 1000).toString(),
          endTime: (Math.floor(Date.now() / 1000) + duration * 60).toString(),
          zoneHash: ethers.ZeroHash,
          salt: ethers.hexlify(ethers.randomBytes(32)),
          conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
          counter: "0",
          totalOriginalConsiderationItems: 1
        };
        
        console.log('📝 Order imzalanıyor...');
        const signature = await api._signOrder(orderParams, 'abstract');
        console.log('✅ İmza oluşturuldu');
        
        const payload = {
          parameters: orderParams,
          signature: signature,
          protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
        };
        
        console.log('📤 OpenSea\'ye gönderiliyor...');
        const response = await api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload);
        
        console.log('\n✅ BAŞARILI!');
        console.log('Token ID:', tokenId);
        console.log('Order Hash:', response.order?.order_hash || response.order_hash);
        console.log('Created:', new Date(response.order?.created_date || Date.now()).toLocaleString());
        
        // Başarılı oldu, döngüden çık
        break;
        
      } catch (error) {
        if (error.response?.status === 400) {
          const errorMsg = error.response.data.errors?.[0] || error.response.data.detail || 'Unknown error';
          console.log(`❌ Token ${tokenId} hatası: ${errorMsg}`);
          
          if (errorMsg.toLowerCase().includes('duplicate')) {
            console.log('💡 Bu token da duplicate hatası veriyor, bir sonrakini deniyorum...');
          }
        } else {
          console.log(`❌ Token ${tokenId} diğer hata: ${error.message}`);
        }
      }
      
      // Rate limit için kısa bekleme
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n📋 ÖZET:');
    console.log('Token ID 16 sürekli duplicate hatası veriyor.');
    console.log('OpenSea bu wallet + token kombinasyonu için cache\'lemiş olabilir.');
    console.log('\n💡 ÖNERİLER:');
    console.log('1. Farklı token ID\'lere offer atmayı deneyin (yukarıdaki gibi)');
    console.log('2. Collection offer kullanın (ama criteria düzgün ayarlanmalı)');
    console.log('3. Farklı bir wallet kullanın');
    console.log('4. 24-48 saat bekleyin cache temizlenmesi için');
    console.log('5. abstractTokenOffer.js\'deki createOffer fonksiyonuna token ID blacklist ekleyin');
    
  } catch (error) {
    console.error('\n❌ Test hatası:', error.message);
  }
  
  process.exit(0);
}

finalDuplicateFix();