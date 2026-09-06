const { ethers } = require('ethers');
const config = require('../config');

/**
 * OpenSea v2 API ile token offer oluşturma
 * Duplicate order hatalarını önlemek için optimize edilmiş
 */
class TokenOfferV2Fix {
  constructor(api) {
    this.api = api;
    // Order counter'ı her wallet için sakla
    this.counterCache = new Map();
    this.lastCounterUpdate = new Map();
    this.COUNTER_TTL = 30000; // 30 saniye cache
    this.counterIncrement = 0; // Her duplicate order'da artırılacak
  }

  /**
   * OpenSea v2 API ile token offer oluştur
   */
  async createTokenOfferV2(contractAddress, tokenId, priceInETH, expirationTime, chain = 'ethereum', providedCollectionSlug = null) {
    try {
      console.log('\n🚀 OpenSea v2 API ile Token Offer Oluşturuluyor');
      console.log('Chain:', chain);
      console.log('Contract:', contractAddress);
      console.log('Token ID:', tokenId);
      console.log('Fiyat:', priceInETH, 'ETH');
      console.log('Süre:', Math.floor((expirationTime - Date.now()) / 60000), 'dakika');
      
      // Collection slug'ı belirle
      let collectionSlug;
      
      // Eğer slug dışarıdan verilmişse direkt kullan
      if (providedCollectionSlug) {
        collectionSlug = providedCollectionSlug;
        console.log('Collection slug (provided):', collectionSlug);
      } else if (chain === 'abstract') {
        // Abstract için sabit slug - contract address ile de olabilir
        collectionSlug = contractAddress.toLowerCase() === '0xa6c46c07f7f1966d772e29049175ebba26262513' 
          ? 'pengztracted-abstract' 
          : contractAddress; // Başka collection için contract address kullan
      } else if (contractAddress.startsWith('0x')) {
        // Önce cache'den kontrol et (batch'de çekilmiş olabilir)
        if (this.api.collectionCache[contractAddress]) {
          const cachedInfo = this.api.collectionCache[contractAddress];
          collectionSlug = cachedInfo.slug || contractAddress;
          console.log('Collection slug (cache):', collectionSlug);
        } else {
          // Cache'de yoksa API'den çek
          try {
            const collectionInfo = await this.api.getCollectionInfo(contractAddress);
            collectionSlug = collectionInfo.slug || contractAddress;
            console.log('Collection slug:', collectionSlug);
          } catch (e) {
            console.log('Collection slug alınamadı, contract address kullanılıyor');
            collectionSlug = contractAddress;
          }
        }
      } else {
        collectionSlug = contractAddress; // Zaten slug verilmiş
      }
      console.log('Kullanılan collection slug:', collectionSlug);
      
      // Mevcut teklifleri kontrol et (v2 API)
      const hasExisting = await this._checkExistingOffersV2(collectionSlug, tokenId);
      if (hasExisting) {
        console.log('⚠️ Bu token için zaten aktif bir teklif var!');
        // Counter'ı artırarak yeni teklif oluşturabiliriz
      }
      
      // v2/offers endpoint'i için payload hazırla
      const payload = await this._prepareOfferPayloadV2(
        collectionSlug,
        contractAddress, 
        tokenId, 
        priceInETH, 
        expirationTime,
        chain
      );
      
      // Debug: Payload'ı logla
      console.log('🔍 Hazırlanan payload:', JSON.stringify(payload, null, 2));
      
      // API'ye gönder
      console.log('📤 OpenSea v2 API\'ye teklif gönderiliyor...');
      console.log('Endpoint:', `/api/v2/orders/${chain}/seaport/offers`);
      
      // Direkt offer oluştur
      const response = await this.api.makeRequest('POST', `/api/v2/orders/${chain}/seaport/offers`, payload);
      
      console.log('✅ Token offer başarıyla oluşturuldu!');
      console.log('API Response:', JSON.stringify(response, null, 2));
      
      // Response'tan order_hash'i çıkar
      const orderHash = response?.order?.order_hash || 
                       response?.order_hash || 
                       response?.hash ||
                       response?.data?.order_hash ||
                       response?.data?.order?.order_hash;
      
      console.log('Order Hash:', orderHash);
      
      if (!orderHash) {
        console.log('⚠️ Order hash bulunamadı, tam response:', JSON.stringify(response, null, 2));
      }
      
      return {
        success: true,
        order_hash: orderHash,
        orderHash: orderHash,
        response: response
      };
      
    } catch (error) {
      console.error('❌ OpenSea v2 token offer hatası:', error.message);
      
      // Detaylı hata bilgisi
      if (error.response) {
        console.error('HTTP Status:', error.response.status);
        console.error('Hata detayı:', JSON.stringify(error.response.data, null, 2));
      }
      
      // Duplicate order hatası kontrolü
      if (error.message?.includes('DuplicateOrder') || 
          error.response?.data?.errors?.[0]?.includes('Duplicate order') ||
          error.response?.data?.errors?.[0]?.includes('duplicate')) {
        console.log('\n🔧 Duplicate order hatası tespit edildi!');
        
        // Eğer bu aynı token için ilk denememizse counter artırıp tekrar dene
        const tokenKey = `${contractAddress}-${tokenId}`;
        if (!this.retriedTokens) {
          this.retriedTokens = new Set();
        }
        
        if (!this.retriedTokens.has(tokenKey)) {
          console.log('Counter artırılarak yeniden deneniyor...');
          this.retriedTokens.add(tokenKey);
          
          // Counter increment artır
          this.counterIncrement = (this.counterIncrement || 0) + 1;
          console.log(`Counter increment: ${this.counterIncrement}`);
          
          // Cache'i temizle
          this.lastCounterUpdate.delete(config.walletAddress);
          
          // Biraz bekle ve tekrar dene
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Tekrar dene
          return await this.createTokenOfferV2(contractAddress, tokenId, priceInETH, expirationTime, chain);
        }
        
        // İkinci denemede de başarısızsa hata döndür
        return {
          success: false,
          error: 'Duplicate order - Bu token için zaten aktif teklifiniz var',
          requiresCancel: true
        };
      }
      
      throw error;
    }
  }
  
  /**
   * v2 API ile mevcut teklifleri kontrol et
   */
  async _checkExistingOffersV2(collectionSlug, tokenId) {
    try {
      console.log('🔍 Mevcut teklifler kontrol ediliyor...');
      
      // v2 API endpoint'i kullan
      const response = await this.api.makeRequest(
        'GET',
        `/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`
      );
      
      if (response && response.price) {
        console.log('Mevcut en yüksek teklif:', response.price.value, response.price.currency);
        console.log('Teklif sahibi:', response.maker?.address);
        
        // Bizim teklifimiz mi kontrol et
        if (response.maker?.address?.toLowerCase() === config.walletAddress.toLowerCase()) {
          console.log('⚠️ Bu bizim teklifimiz!');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      // 404 hatası teklif olmadığını gösterir
      if (error.status === 404) {
        console.log('✅ Bu token için teklif yok');
        return false;
      }
      console.error('Teklif kontrolü hatası:', error.message);
      return false;
    }
  }
  
  /**
   * v2 API için offer payload hazırla
   */
  async _prepareOfferPayloadV2(collectionSlug, contractAddress, tokenId, priceInETH, expirationTime, chain = 'ethereum') {
    // Güncel counter'ı al
    const counter = await this._getCurrentCounter();
    console.log('Kullanılacak counter:', counter);
    
    // Chain'e göre ayarlamalar
    const wethAddress = chain === 'abstract' ? 
      '0x3439153EB7AF838Ad19d56E1571FBD09333C2809' : // Abstract WETH
      config.wethContractAddress;
      
    // Zone her zaman aynı (Seaport 1.6)
    
    // Order parametreleri
    const orderParams = {
      offerer: config.walletAddress,
      zone: config.getSeaportZone(chain), // Chain'e göre zone
      offer: [
        {
          itemType: 1, // ERC20 (WETH)
          token: wethAddress,
          identifierOrCriteria: "0",
          startAmount: ethers.parseEther(parseFloat(priceInETH).toFixed(6)).toString(),
          endAmount: ethers.parseEther(parseFloat(priceInETH).toFixed(6)).toString()
        }
      ],
      consideration: [
        {
          itemType: 2, // ERC721
          token: contractAddress,
          identifierOrCriteria: tokenId.toString(),
          startAmount: "1",
          endAmount: "1",
          recipient: config.walletAddress
        },
        {
          itemType: 1, // ERC20 (WETH fee)
          token: wethAddress,
          identifierOrCriteria: "0",
          startAmount: (ethers.parseEther(parseFloat(priceInETH).toFixed(6)) * 50n / 10000n).toString(), // 0.5% fee
          endAmount: (ethers.parseEther(parseFloat(priceInETH).toFixed(6)) * 50n / 10000n).toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
        }
      ],
      orderType: 3, // PARTIAL_RESTRICTED for single token
      startTime: Math.floor(Date.now() / 1000).toString(),
      endTime: Math.floor(expirationTime / 1000).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: chain === 'abstract' ? 
        "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e" : // Abstract için OpenSea conduit key
        "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000", // Diğer chainler için standart conduit key
      totalOriginalConsiderationItems: 2,
      counter: counter.toString()
    };
    
    // İmzala
    const signature = await this.api._signOrder(orderParams, chain);
    
    // API payload - test scriptinde çalışan format
    const payload = {
      parameters: orderParams,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    return payload;
  }
  
  /**
   * Güncel counter'ı al (cache'li)
   */
  async _getCurrentCounter() {
    const now = Date.now();
    const lastUpdate = this.lastCounterUpdate.get(config.walletAddress) || 0;
    
    // Cache geçerliyse kullan
    if (now - lastUpdate < this.COUNTER_TTL && this.counterCache.has(config.walletAddress)) {
      const cachedCounter = this.counterCache.get(config.walletAddress);
      
      // Counter increment ekle
      if (this.counterIncrement > 0) {
        const incrementedCounter = (BigInt(cachedCounter) + BigInt(this.counterIncrement)).toString();
        console.log(`Counter increment uygulandı: ${cachedCounter} + ${this.counterIncrement} = ${incrementedCounter}`);
        return incrementedCounter;
      }
      
      return cachedCounter;
    }
    
    try {
      console.log('📊 Güncel counter alınıyor...');
      
      // Önce API'den dene
      let counter = '0';
      
      try {
        // Blockchain'den counter al
        if (this.api.provider) {
          const seaportAddress = config.seaportAddress;
          const seaportInterface = new ethers.Interface([
            'function getCounter(address offerer) view returns (uint256)'
          ]);
          
          const data = seaportInterface.encodeFunctionData('getCounter', [config.walletAddress]);
          
          const result = await this.api.provider.call({
            to: seaportAddress,
            data: data
          });
          
          counter = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], result)[0].toString();
          console.log('Blockchain counter:', counter);
          
          // Abstract için özel durum - counter çok büyükse doğrudur
          if (counter.length > 30) {
            console.log('Abstract chain counter tespit edildi');
          }
        }
      } catch (e) {
        console.log('Blockchain counter alınamadı, varsayılan kullanılıyor');
        counter = '0';
      }
      
      // Counter increment ekle (duplicate order durumları için)
      if (this.counterIncrement > 0) {
        const bigCounter = BigInt(counter) + BigInt(this.counterIncrement);
        counter = bigCounter.toString();
        console.log(`Counter increment uygulandı: +${this.counterIncrement} = ${counter}`);
      }
      
      // Cache'e kaydet
      this.counterCache.set(config.walletAddress, counter);
      this.lastCounterUpdate.set(config.walletAddress, now);
      
      return counter;
    } catch (error) {
      console.error('Counter alınamadı, varsayılan kullanılıyor:', error.message);
      
      // Fallback: Abstract için bilinen counter
      const ABSTRACT_COUNTER = "4261708516436045846285944668025016340433";
      const currentCounter = this.counterCache.get(config.walletAddress) || ABSTRACT_COUNTER;
      
      // Counter increment ekle
      let newCounter = currentCounter;
      if (this.counterIncrement > 0) {
        newCounter = (BigInt(currentCounter) + BigInt(this.counterIncrement)).toString();
        console.log(`Fallback counter increment: ${currentCounter} + ${this.counterIncrement} = ${newCounter}`);
      }
      
      this.counterCache.set(config.walletAddress, newCounter);
      this.lastCounterUpdate.set(config.walletAddress, now);
      
      return newCounter;
    }
  }
  
  /**
   * Counter artırarak tekrar dene
   */
  async _retryWithIncrementedCounter(contractAddress, tokenId, priceInETH, expirationTime, chain = 'ethereum') {
    try {
      console.log('\n🔄 Counter artırılarak yeniden deneniyor...');
      
      // Mevcut counter'ı al ve artır
      const currentCounter = await this._getCurrentCounter();
      const newCounter = (BigInt(currentCounter) + 1n).toString();
      
      console.log('Eski counter:', currentCounter);
      console.log('Yeni counter:', newCounter);
      
      // Cache'i güncelle
      this.counterCache.set(config.walletAddress, newCounter);
      this.lastCounterUpdate.set(config.walletAddress, Date.now());
      
      // Biraz bekle
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Tekrar dene
      return await this.createTokenOfferV2(contractAddress, tokenId, priceInETH, expirationTime, chain);
      
    } catch (error) {
      console.error('❌ Counter artırma başarısız:', error.message);
      throw error;
    }
  }
  
  /**
   * Toplu token offer oluştur (batch)
   */
  async createBatchTokenOffersV2(offers) {
    console.log(`\n📦 ${offers.length} adet token için toplu teklif oluşturuluyor...`);
    
    const results = [];
    const batchSize = 5; // Her batch'te 5 teklif
    
    for (let i = 0; i < offers.length; i += batchSize) {
      const batch = offers.slice(i, i + batchSize);
      console.log(`\nBatch ${Math.floor(i/batchSize) + 1}/${Math.ceil(offers.length/batchSize)}`);
      
      // Batch içindeki teklifleri paralel oluştur
      const batchPromises = batch.map(async (offer) => {
        try {
          const result = await this.createTokenOfferV2(
            offer.contractAddress,
            offer.tokenId,
            offer.price,
            offer.expirationTime
          );
          return {
            ...offer,
            success: true,
            result: result
          };
        } catch (error) {
          return {
            ...offer,
            success: false,
            error: error.message
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Batch'ler arası bekleme
      if (i + batchSize < offers.length) {
        console.log('⏳ Sonraki batch için 2 saniye bekleniyor...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Özet
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n✅ Toplu teklif tamamlandı!`);
    console.log(`Başarılı: ${successful}`);
    console.log(`Başarısız: ${failed}`);
    
    if (failed > 0) {
      console.log('\n❌ Başarısız teklifler:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`- Token #${r.tokenId}: ${r.error}`);
      });
    }
    
    return results;
  }
}

module.exports = TokenOfferV2Fix;