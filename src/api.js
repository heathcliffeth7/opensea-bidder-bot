const axios = require('axios');
const config = require('../config');
const ethers = require('ethers');

/**
 * OpenSea API ile etkileşim için yardımcı fonksiyonlar
 */
class OpenSeaAPI {
  constructor() {
    this.apiClient = axios.create({
      baseURL: config.apiBaseUrl,
      headers: {
        'X-API-KEY': config.apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    this.activeListeners = {};
  }

  /**
   * API isteği gönderme yardımcı fonksiyonu (yeniden deneme mantığı ile)
   */
  async makeRequest(method, endpoint, data = null, params = null) {
    let retries = 0;
    
    while (retries < config.maxRetries) {
      try {
        console.log(`API İsteği: ${method} ${endpoint}`);
        if (params) console.log('Parametreler:', JSON.stringify(params));
        if (data) console.log('Veri:', JSON.stringify(data));
        
        const response = await this.apiClient({
          method,
          url: endpoint,
          data,
          params,
          validateStatus: function (status) {
            return status >= 200 && status < 500;
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
        
        if (response.status >= 400) {
          const error = new Error(`HTTP status code ${response.status}`);
          error.response = response;
          error.status = response.status;
          throw error;
        }
        
        return response.data;
      } catch (error) {
        console.error(`API isteği başarısız: ${error.message}`);
        
        if (error.response) {
          console.error('\n=== API HATA DETAYLARI ===');
          console.error(`Durum Kodu: ${error.response.status} (${error.response.statusText})`);
          console.error('İstek URL:', error.config?.url);
          console.error('İstek Metodu:', error.config?.method);
          
          if (error.response.data) {
            try {
              console.error('\nHata Detayları:', JSON.stringify(error.response.data, null, 2));
            } catch (e) {
              console.error('Ham Hata Verisi:', error.response.data);
            }
          }
        }
        
        // Rate limit aşıldıysa veya geçici bir hata ise yeniden dene
        if (error.response && (error.response.status === 429 || error.response.status >= 500)) {
          retries++;
          console.log(`Yeniden deneme ${retries}/${config.maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, config.retryDelay * Math.pow(2, retries)));
        } else {
          throw error;
        }
      }
    }
    
    throw new Error(`Maksimum yeniden deneme sayısı aşıldı (${config.maxRetries})`);
  }

  /**
   * Koleksiyondaki NFT'leri getir
   */
  async getCollectionNFTs(chain, collectionSlug, limit = 50) {
    return this.makeRequest('GET', `/api/v2/collection/${collectionSlug}/nfts`, null, { 
      limit 
    });
  }

  /**
   * Belirli bir NFT için bilgileri getir
   */
  async getNFTInfo(chain, contractAddress, tokenId) {
    try {
      return await this.makeRequest('GET', `/api/v2/chain/${chain}/contract/${contractAddress}/nfts/${tokenId}`);
    } catch (error) {
      console.error(`NFT bilgisi alınırken hata:`, error.message);
      // Fallback: basit endpoint dene
      try {
        return await this.makeRequest('GET', `/api/v2/contract/${contractAddress}/nfts/${tokenId}`);
      } catch (fallbackError) {
        console.error(`Fallback endpoint de başarısız:`, fallbackError.message);
        throw error;
      }
    }
  }

  /**
   * Koleksiyon için teklifleri getir
   */
  async getCollectionOffers(chain, collectionSlug) {
    try {
      // OpenSea API v2 collection offers endpoint
      return await this.makeRequest('GET', `/api/v2/offers/collection/${collectionSlug}`, null, {
        limit: 50
      });
    } catch (error) {
      console.log(`Koleksiyon teklifleri alma hatası, alternatif deneniyor...`);
      try {
        return await this.makeRequest('GET', `/api/v2/offers/collection/${collectionSlug}/all`, null, {
          limit: 50
        });
      } catch (altError) {
        console.error(`Alternatif endpoint de başarısız:`, altError.message);
        return { offers: [] };
      }
    }
  }

  /**
   * Trait teklifleri al
   */
  async getTraitOffers(chain, collectionSlug, traitType, traitValue) {
    console.log(`Trait teklifleri alınıyor: ${collectionSlug} - ${traitType}:${traitValue}`);
    try {
      return await this.makeRequest('GET', `/api/v2/offers/collection/${collectionSlug}/traits`, null, {
        type: traitType,
        value: traitValue
      });
    } catch (error) {
      console.error(`Trait teklifleri alınırken hata:`, error.message);
      return { offers: [] };
    }
  }

  /**
   * Belirli bir NFT için en iyi teklifi getir
   */
  async getBestOfferForNFT(chain, contractAddress, tokenId) {
    try {
      return await this.makeRequest('GET', `/api/v2/orders/${chain}/seaport/offers`, null, {
        asset_contract_address: contractAddress,
        token_ids: [tokenId],
        order_by: "created_date",
        order_direction: "desc",
        limit: 1
      });
    } catch (error) {
      console.error(`NFT teklifi alınırken hata:`, error.message);
      return { orders: [] };
    }
  }

  /**
   * Criteria teklifi oluştur (trait/koleksiyon bazlı)
   */
  async createCriteriaOffer(chain, collectionSlug, traitType, traitValue, price, expirationTime) {
    console.log(`Criteria teklifi oluşturuluyor: ${collectionSlug} - ${traitType}:${traitValue} - ${price} ETH - Expiration: ${expirationTime} - Chain: ${chain}`);
    
    try {
      // 1. Build endpoint ile parametreleri al
      const buildPayload = {
        offerer: config.walletAddress,
        quantity: 1,
        criteria: {
          collection: {
            slug: collectionSlug
          }
        },
        protocol_address: config.seaportAddress,
        offer_protection_enabled: false
      };
      
      // Trait bilgisi varsa ekle
      if (traitType && traitValue) {
        buildPayload.criteria.trait = {
          type: traitType,
          value: traitValue
        };
      }
      
      console.log('Build payload:', JSON.stringify(buildPayload, null, 2));
      
      const buildResponse = await this.makeRequest('POST', '/api/v2/offers/build', buildPayload);
      console.log('Build response:', JSON.stringify(buildResponse, null, 2));
      
      // 2. Build response ile asıl teklifi gönder
      // Eksik parametreleri tamamla
      const currentTime = Math.floor(Date.now() / 1000);
      
      // ExpirationTime saniye cinsinden geliyorsa doğrudan kullan, milisaniye ise çevir
      let expirationInSeconds = expirationTime || 86400; // Default 1 gün
      if (expirationInSeconds > 31536000) { // 1 yıldan büyükse milisaniye formatındadır
        expirationInSeconds = Math.floor(expirationInSeconds / 1000);
      }
      
      // OpenSea sınırı: 30 gün (2592000 saniye)
      const maxExpirationSeconds = 30 * 24 * 60 * 60; // 2592000 saniye
      expirationInSeconds = Math.min(expirationInSeconds, maxExpirationSeconds);
      
      const endTime = currentTime + expirationInSeconds;
      
      console.log(`Süre hesaplama - Original: ${expirationTime}, Final: ${expirationInSeconds}s (${expirationInSeconds/86400} gün)`);
      console.log(`Zaman - Start: ${currentTime}, End: ${endTime}, Duration: ${endTime - currentTime}s`);
      
      const completeParameters = {
        ...buildResponse.partialParameters,
        offerer: config.walletAddress,
        startTime: currentTime.toString(),
        endTime: endTime.toString(),
        orderType: 3, // FULL_OPEN
        salt: Math.floor(Math.random() * 1000000).toString(),
        conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
        totalOriginalConsiderationItems: buildResponse.partialParameters.consideration?.length || 1,
        counter: "0"
      };
      
      // Offer array'ini ekle (WETH teklifi)
      const wethAddress = config.wethAddresses[chain] || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      const offerAmount = ethers.utils.parseEther(price.toString());
      
      completeParameters.offer = [{
        itemType: 1, // ERC20
        token: wethAddress,
        identifierOrCriteria: "0",
        startAmount: offerAmount.toString(),
        endAmount: offerAmount.toString()
      }];
      
      // OpenSea fee'sini consideration'a ekle (%0.5 = 50 basis points)
      const openseaFee = offerAmount.mul(50).div(10000); // %0.5 fee
      
      // Mevcut consideration'ları koru ve OpenSea fee'sini ekle
      if (!completeParameters.consideration) {
        completeParameters.consideration = buildResponse.partialParameters.consideration || [];
      }
      
      // OpenSea fee consideration item'ını ekle
      completeParameters.consideration.push({
        itemType: 1, // ERC20
        token: wethAddress,
        identifierOrCriteria: "0",
        startAmount: openseaFee.toString(),
        endAmount: openseaFee.toString(),
        recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
      });
      
      // totalOriginalConsiderationItems'ı güncelle
      completeParameters.totalOriginalConsiderationItems = completeParameters.consideration.length;
      
      // Gerçek imza oluştur
      const signature = await this._signOrder(completeParameters, chain);
      
      const offerPayload = {
        protocol_data: {
          parameters: completeParameters,
          signature: signature
        },
        criteria: buildPayload.criteria,
        protocol_address: config.seaportAddress
      };
      
      console.log('Final offer payload:', JSON.stringify(offerPayload, null, 2));
      
      return await this.makeRequest('POST', '/api/v2/offers', offerPayload);
      
    } catch (error) {
      console.error(`Criteria teklifi oluşturulurken hata:`, error.message);
      throw error;
    }
  }

  /**
   * OpenSea build endpoint'ini kullanarak criteria offer parametrelerini al
   * @private
   */
  async _buildCriteriaOfferParams(collectionSlug, traitType, traitValue, price, expirationTime, chain) {
    console.log(`Build endpoint çağrılıyor: ${collectionSlug} - ${traitType}:${traitValue} - Zincir: ${chain}`);
    
    const buildPayload = {
      offerer: config.walletAddress,
      protocol_address: config.seaportAddress,
      quantity: 1
    };
    
    // Trait bilgisi varsa ekle
    if (traitType && traitValue) {
      buildPayload.criteria = {
        collection: {
          slug: collectionSlug
        },
        trait: {
          type: traitType,
          value: traitValue
        }
      };
    } else {
      // Collection offer için sadece collection
      buildPayload.criteria = {
        collection: {
          slug: collectionSlug
        }
      };
    }
    
    console.log('Build payload:', JSON.stringify(buildPayload, null, 2));
    
    const buildResponse = await this.makeRequest('POST', '/api/v2/offers/build', buildPayload);
    console.log('Build response:', JSON.stringify(buildResponse, null, 2));
    
    // Build response'dan gelen parametreleri kullanarak full order oluştur
    const currentTime = Math.floor(Date.now() / 1000);
    
    // OpenSea'nin 30 günlük sınırlaması için maksimum süreyi hesapla (30 gün * 24 saat * 60 dakika * 60 saniye)
    const maxExpirationTime = 30 * 24 * 60 * 60;
    // Kullanıcının belirttiği süre ile 30 gün arasından daha kısa olanı seç
    const actualExpirationTime = Math.min(expirationTime, maxExpirationTime);
    const endTime = currentTime + actualExpirationTime;
    
    console.log(`Teklif süresi ayarlandı: ${actualExpirationTime / 86400} gün (${actualExpirationTime} saniye)`);
    
    // WETH address for the chain
    const wethAddress = config.wethAddresses[chain];
  console.log(`Kullanılan WETH Adresi (${chain} için): ${wethAddress}`);
  if (!wethAddress) {
    throw new Error(`Unsupported chain or WETH address not configured for chain: ${chain}`);
  }
    const offerAmount = ethers.utils.parseEther(price.toString());
    const openseaFee = offerAmount.mul(5).div(1000); // %0.5 OpenSea fee (50 baz puan)
    const creatorFee = ethers.BigNumber.from(0); // Varsayılan olarak creator fee yok

    // Toplam ödeme (teklif + OpenSea ücreti)
    const totalAmount = offerAmount.add(openseaFee).add(creatorFee);

    const offerItem = {
      itemType: 1, // ERC20
      token: wethAddress,
      identifierOrCriteria: "0",
      startAmount: totalAmount.toString(),
      endAmount: totalAmount.toString()
    };
    
    // Build response'dan consideration item'ı al
    const considerationItems = [{
      ...buildResponse.partialParameters.consideration[0],
      recipient: config.walletAddress,
      startAmount: offerAmount.toString(),
      endAmount: offerAmount.toString()
    }];

    // OpenSea fee'yi consideration olarak ekle
    considerationItems.push({
      itemType: 1, // ERC20
      token: wethAddress,
      identifierOrCriteria: "0",
      startAmount: openseaFee.toString(),
      endAmount: openseaFee.toString(),
      recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee alıcı adresi
    });

    // Creator fee varsa ekle
    if (creatorFee.gt(0)) {
      considerationItems.push({
        itemType: 1, // ERC20
        token: wethAddress,
        identifierOrCriteria: "0",
        startAmount: creatorFee.toString(),
        endAmount: creatorFee.toString(),
        recipient: "CREATOR_ADDRESS" // Koleksiyon sahibinin adresi
      });
    }
    
    const orderParameters = {
      offerer: config.walletAddress,
      offer: [offerItem],
      consideration: considerationItems,
      startTime: currentTime.toString(),
      endTime: endTime.toString(),
      orderType: 3, // FULL_OPEN
      zone: buildResponse.partialParameters.zone,
      zoneHash: buildResponse.partialParameters.zoneHash,
      salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(),
      conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
      totalOriginalConsiderationItems: considerationItems.length,
      counter: "0"
    };
    
    return {
      orderParameters,
      buildResponse
    };
  }

  /**
   * Koleksiyon teklifi oluştur
   */
  async createCollectionOffer(chain, collectionSlug, price, expirationTime) {
    console.log(`Koleksiyon teklifi oluşturuluyor: ${collectionSlug} - ${price} ETH`);
    
    // Collection offer aslında trait olmayan criteria offer
    return this.createCriteriaOffer(chain, collectionSlug, null, null, price, expirationTime);
  }

  /**
   * Token teklifi oluştur (belirli bir NFT için)
   */
  async createTokenOffer(chain, contractAddress, tokenId, price, expirationTime) {
    console.log(`Token teklifi oluşturuluyor: ${contractAddress} - Token ID: ${tokenId} - ${price} ETH`);
    
    try {
      // Seaport order parametrelerini oluştur
      const orderParameters = await this._buildSeaportOrder(
        chain, null, null, null, contractAddress, tokenId, price, expirationTime
      );
      
      // API payload oluştur
      const payload = {
        parameters: orderParameters,
        signature: await this._signOrder(orderParameters, chain),
        protocol_address: config.seaportAddress
      };
      
      console.log('Token teklif payload:', JSON.stringify(payload, null, 2));
      
      return await this.makeRequest('POST', `/api/v2/orders/${chain}/seaport/offers`, payload);
      
    } catch (error) {
      console.error(`Token teklifi oluşturulurken hata:`, error.message);
      throw error;
    }
  }
  
  /**
   * Seaport order parametrelerini oluştur
   * @private
   */
  async _buildSeaportOrder(chain, collectionSlug, traitType, traitValue, contractAddress, tokenId, price, expirationTime) {
    const currentTime = Math.floor(Date.now() / 1000);
    const endTime = Math.floor((Date.now() + expirationTime) / 1000);
    
    // WETH address for the chain
    const wethAddress = config.wethAddresses[chain] || config.wethAddresses.ethereum;
    
    const offerAmount = ethers.utils.parseEther(price.toString());
    const openseaFee = offerAmount.mul(5).div(1000); // %0.5 OpenSea fee (50 baz puan)
    const creatorFee = ethers.BigNumber.from(0); // Varsayılan olarak creator fee yok

    // Toplam ödeme (teklif + OpenSea ücreti)
    const totalAmount = offerAmount.add(openseaFee).add(creatorFee);

    // Offer item (WETH)
    const offerItem = {
      itemType: 1, // ERC20
      token: wethAddress,
      identifierOrCriteria: "0",
      startAmount: totalAmount.toString(),
      endAmount: totalAmount.toString()
    };
    
    // Consideration item (NFT or criteria)
    let considerationItem;
    
    if (contractAddress && tokenId) {
      // Specific NFT
      considerationItem = {
        itemType: 2, // ERC721
        token: contractAddress,
        identifierOrCriteria: tokenId,
        startAmount: "1",
        endAmount: "1",
        recipient: config.walletAddress
      };
    } else {
      // Criteria based (collection or trait)
      considerationItem = {
        itemType: 4, // ERC721 with criteria
        token: "0x0000000000000000000000000000000000000000", // Will be filled by OpenSea
        identifierOrCriteria: "0", // Will be filled by OpenSea for criteria
        startAmount: "1",
        endAmount: "1",
        recipient: config.walletAddress
      };
    }
    
    const considerationItems = [considerationItem];

    // OpenSea fee'yi consideration olarak ekle
    considerationItems.push({
      itemType: 1, // ERC20
      token: wethAddress,
      identifierOrCriteria: "0",
      startAmount: openseaFee.toString(),
      endAmount: openseaFee.toString(),
      recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee alıcı adresi
    });

    // Creator fee varsa ekle
    if (creatorFee.gt(0)) {
      considerationItems.push({
        itemType: 1, // ERC20
        token: wethAddress,
        identifierOrCriteria: "0",
        startAmount: creatorFee.toString(),
        endAmount: creatorFee.toString(),
        recipient: "CREATOR_ADDRESS" // Koleksiyon sahibinin adresi
      });
    }
    
    return {
      offerer: config.walletAddress,
      offer: [offerItem],
      consideration: considerationItems,
      startTime: currentTime.toString(),
      endTime: endTime.toString(),
      orderType: 0, // FULL_OPEN (changed from FULL_RESTRICTED since we're not using a zone)
      zone: "0x0000000000000000000000000000000000000000", // No zone for now
      zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt: ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString(),
      conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000", // OpenSea conduit
      totalOriginalConsiderationItems: considerationItems.length,
      counter: "0" // Should be fetched from contract in real implementation
    };
  }
  
  /**
   * Teklifi iptal et
   */
  async cancelOffer(chain, orderHash) {
    return this.makeRequest('POST', `/api/v2/orders/${chain}/seaport/cancel`, {
      order_hash: orderHash
    });
  }
  
  /**
   * Seaport order imzalama
   * @private
   */
  async _signOrder(orderParameters, chainName) {
    if (!config.privateKey) {
      console.warn('Private key yapılandırılmamış - mock imza döndürülüyor');
      return "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    }

    const wallet = new ethers.Wallet(config.privateKey);

    // EIP-712 domain
    const domain = {
      name: 'Seaport',
      version: '1.6',
      chainId: chainName === 'ethereum' ? 1 : (chainName === 'polygon' ? 137 : (chainName === 'sepolia' ? 11155111 : 1)),
      verifyingContract: config.seaportAddress
    };

    // EIP-712 types
    const types = {
      OrderComponents: [
        { name: 'offerer', type: 'address' },
        { name: 'zone', type: 'address' },
        { name: 'offer', type: 'OfferItem[]' },
        { name: 'consideration', type: 'ConsiderationItem[]' },
        { name: 'orderType', type: 'uint8' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'zoneHash', type: 'bytes32' },
        { name: 'salt', type: 'uint256' },
        { name: 'conduitKey', type: 'bytes32' },
        { name: 'counter', type: 'uint256' }
      ],
      OfferItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' }
      ],
      ConsiderationItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' },
        { name: 'recipient', type: 'address' }
      ]
    };

    try {
      const signature = await wallet._signTypedData(domain, types, orderParameters);
      console.log('✅ Teklif imzası oluşturuldu');
      return signature;
    } catch (error) {
      console.error('❌ İmzalama hatası:', error.message);
      throw error;
    }
  }

  /**
   * Stream API dinleyicileri (placeholder)
   */
  listenToCollectionOffers(chain, collectionSlug, callback) {
    console.log(`Stream API şu anda devre dışı. Koleksiyon teklifleri dinlenemiyor.`);
    const eventKey = `collection-offer-${collectionSlug}`;
    this.activeListeners[eventKey] = true;
  }
  
  listenToTraitOffers(chain, collectionSlug, traitType, traitValue, callback) {
    console.log(`${collectionSlug} - ${traitType}:${traitValue} için trait teklif dinleyicisi başlatılıyor...`);
    const eventKey = `trait-offer-${collectionSlug}-${traitType}-${traitValue}`;
    this.activeListeners[eventKey] = true;
    
    // Polling tabanlı dinleme (WebSocket yerine)
    const pollInterval = setInterval(async () => {
      try {
        // Collection stats kontrol et
        const stats = await this.getCollectionStats(collectionSlug);
        if (stats && callback) {
          callback(stats);
        }
      } catch (error) {
        console.error(`Trait dinleme hatası: ${error.message}`);
      }
    }, 30000); // 30 saniyede bir kontrol
    
    this.activeListeners[eventKey] = pollInterval;
  }
  
  listenToItemOffers(chain, contractAddress, tokenId, callback) {
    console.log(`Stream API şu anda devre dışı. Token teklifleri dinlenemiyor.`);
    const eventKey = `item-received-offer-${contractAddress}-${tokenId}`;
    this.activeListeners[eventKey] = true;
  }
  
  stopListener(eventKey) {
    if (this.activeListeners[eventKey]) {
      // Eğer interval ise temizle
      if (typeof this.activeListeners[eventKey] === 'object') {
        clearInterval(this.activeListeners[eventKey]);
      }
      delete this.activeListeners[eventKey];
      console.log(`${eventKey} için dinleyici durduruldu.`);
    }
  }
  
  stopAllListeners() {
    Object.keys(this.activeListeners).forEach(eventKey => {
      if (typeof this.activeListeners[eventKey] === 'object') {
        clearInterval(this.activeListeners[eventKey]);
      }
      delete this.activeListeners[eventKey];
    });
    console.log('Tüm dinleyiciler durduruldu.');
  }
}

module.exports = new OpenSeaAPI();