const { ethers } = require('ethers');
const { OpenSeaSDK, Chain } = require('opensea-js');
const config = require('../config');
const ParallelApiManager = require('./parallelApiManager');

/**
 * Ultra hızlı teklif sistemi - SDK ile offchain iptal edilebilir
 */
class UltraFastBidder {
  constructor(api) {
    this.api = api;
    this.parallelApi = new ParallelApiManager();
    
    // RPC provider'ları oluştur
    if (config.rpcUrls && config.rpcUrls.length > 0) {
      this.providers = config.rpcUrls.map(url => new ethers.JsonRpcProvider(url));
    } else if (config.rpcUrl) {
      this.providers = [new ethers.JsonRpcProvider(config.rpcUrl)];
    } else {
      console.error('❌ RPC URL bulunamadı!');
      this.providers = [];
    }
    
    // Wallet'ları ve SDK'ları oluştur
    if (config.privateKey && this.providers.length > 0) {
      try {
        // Private key formatını kontrol et
        let privateKey = config.privateKey;
        if (!privateKey.startsWith('0x')) {
          privateKey = '0x' + privateKey;
        }
        
        this.wallets = this.providers.map(provider => 
          new ethers.Wallet(privateKey, provider)
        );
        
        // Her API key için SDK oluştur
        this.sdks = [];
        for (let i = 0; i < config.apiKeys.length; i++) {
          const wallet = this.wallets[i % this.wallets.length];
          const sdk = new OpenSeaSDK(wallet, {
            chain: Chain.Mainnet,
            apiKey: config.apiKeys[i]
          });
          this.sdks.push(sdk);
        }
        
        console.log(`✅ Wallet başarıyla oluşturuldu: ${this.wallets[0].address}`);
        console.log(`✅ ${this.sdks.length} SDK instance oluşturuldu`);
        
        // Wallet address'in config'deki ile aynı olduğunu kontrol et
        if (config.walletAddress && this.wallets[0].address.toLowerCase() !== config.walletAddress.toLowerCase()) {
          console.warn(`⚠️ UYARI: Private key'den türetilen adres (${this.wallets[0].address}) ile config'deki adres (${config.walletAddress}) farklı!`);
        }
      } catch (error) {
        console.error('❌ Wallet/SDK oluşturma hatası:', error.message);
        this.wallets = [];
        this.sdks = [];
      }
    } else {
      console.error('❌ Private key veya provider bulunamadı!');
      console.error('Private key var mı?', !!config.privateKey);
      console.error('Provider sayısı:', this.providers.length);
      this.wallets = [];
      this.sdks = [];
    }
    
    // Rate limiting ayarları - saniyede 1 teklif
    this.rateLimit = {
      perApiKey: 1,      // Her API key için saniyede maksimum 1 istek
      perRpc: 5,         // Her RPC için saniyede maksimum 5 istek
      minDelay: 1000     // Minimum bekleme süresi 1 saniye
    };
    
    // İstatistikler
    this.stats = {
      totalBids: 0,
      successfulBids: 0,
      failedBids: 0,
      totalTime: 0,
      startTime: Date.now()
    };
    
    console.log(`\n⚡ Ultra Fast Bidder başlatıldı:`);
    console.log(`- ${config.apiKeys.length} API key`);
    console.log(`- ${this.providers.length} RPC provider`);
    console.log(`- Hedef: Kontrollü hız (limit aşılmayacak)`);
  }
  
  /**
   * Toplu paralel teklif - kontrollü hız ile
   */
  async batchBidParallel(tokens) {
    console.log(`\n🚀 ${tokens.length} token için paralel teklif başlıyor...`);
    const startTime = Date.now();
    
    // Token'ları API key sayısına göre böl
    const apiKeyCount = config.apiKeys.length;
    const tokensPerKey = Math.ceil(tokens.length / apiKeyCount);
    const batches = [];
    
    // Her API key için batch oluştur
    for (let i = 0; i < apiKeyCount; i++) {
      const start = i * tokensPerKey;
      const end = Math.min(start + tokensPerKey, tokens.length);
      if (start < tokens.length) {
        batches.push({
          tokens: tokens.slice(start, end),
          apiKeyIndex: i,
          rpcIndex: i % this.providers.length
        });
      }
    }
    
    console.log(`📊 ${batches.length} batch oluşturuldu, her biri ~${tokensPerKey} token`);
    
    // Her batch'i PARALEL işle - 3 API key aynı anda çalışsın
    const results = await Promise.all(
      batches.map(batch => this.processBatchWithRateLimit(batch))
    );
    
    // Sonuçları birleştir
    const allResults = results.flat();
    const successCount = allResults.filter(r => r.success).length;
    const elapsed = Date.now() - startTime;
    
    // İstatistikleri güncelle
    this.stats.totalBids += tokens.length;
    this.stats.successfulBids += successCount;
    this.stats.failedBids += (tokens.length - successCount);
    this.stats.totalTime += elapsed;
    
    console.log(`\n✅ Toplu teklif tamamlandı:`);
    console.log(`- Süre: ${elapsed}ms`);
    console.log(`- Başarılı: ${successCount}/${tokens.length}`);
    console.log(`- Ortalama hız: ${(tokens.length / (elapsed / 1000)).toFixed(2)} teklif/saniye`);
    console.log(`- Güvenli hız: API ve RPC limitleri aşılmadı`);
    
    return allResults;
  }
  
  /**
   * Batch'i rate limit ile işle
   */
  async processBatchWithRateLimit(batch) {
    const { tokens, apiKeyIndex, rpcIndex } = batch;
    const results = [];
    const delayBetweenRequests = Math.max(
      this.rateLimit.minDelay,
      1000 / this.rateLimit.perApiKey // Saniyede maksimum istek sayısına göre gecikme
    );
    
    console.log(`\n🔄 API Key #${apiKeyIndex + 1} ile ${tokens.length} token işleniyor...`);
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      try {
        const result = await this.createSingleBid(
          token,
          apiKeyIndex,
          this.providers[rpcIndex],
          this.wallets[rpcIndex]
        );
        results.push(result);
        
        // Rate limiting - son token'da bekleme
        if (i < tokens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
        }
        
        // İlerleme göster
        if ((i + 1) % 5 === 0 || i === tokens.length - 1) {
          console.log(`  📍 API Key #${apiKeyIndex + 1}: ${i + 1}/${tokens.length} tamamlandı`);
        }
      } catch (error) {
        console.error(`\n⚠️ Token #${token.tokenId} başarısız:`, error.message);
        results.push({
          success: false,
          token: token,
          tokenId: token.tokenId,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Tek teklif oluştur - SDK ile offchain iptal edilebilir
   */
  async createSingleBid(token, apiKeyIndex, provider, wallet) {
    const startTime = Date.now();
    
    try {
      // SDK kullan
      const sdk = this.sdks[apiKeyIndex];
      if (!sdk) {
        throw new Error(`SDK #${apiKeyIndex} bulunamadı`);
      }
      
      console.log(`🔐 SDK ile offchain teklif oluşturuluyor - Token #${token.tokenId}`);
      
      // Teklif süresi - 15 dakika
      const expirationTime = Math.floor((Date.now() + (15 * 60 * 1000)) / 1000);
      
      // SDK ile zone parametreli token offer oluştur
      const offerParams = {
        asset: {
          tokenId: token.tokenId.toString(),
          tokenAddress: token.contractAddress
        },
        accountAddress: config.walletAddress,
        startAmount: parseFloat(token.price),
        expirationTime: expirationTime,
        paymentTokenAddress: config.wethContractAddress,
        // Zone parametresi - offchain iptal edilebilir yapar
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100"
      };
      
      const offer = await sdk.createOffer(offerParams);
      
      const elapsed = Date.now() - startTime;
      
      console.log(`✅ Token #${token.tokenId} için offchain teklif oluşturuldu (${elapsed}ms)`);
      
      return {
        success: true,
        token: token,
        tokenId: token.tokenId,
        price: token.price,
        orderHash: offer.orderHash || offer.order_hash,
        time: elapsed
      };
      
    } catch (error) {
      // SDK hatası durumunda eski yöntemi dene
      console.log(`SDK hatası, eski yöntem deneniyor: ${error.message}`);
      return await this.createSingleBidLegacy(token, apiKeyIndex, provider, wallet);
    }
  }
  
  /**
   * Tek teklif oluştur - eski yöntem (yedek)
   */
  async createSingleBidLegacy(token, apiKeyIndex, provider, wallet) {
    const startTime = Date.now();
    
    try {
      // Wallet kontrolü ve address alımı
      if (!wallet) {
        throw new Error('Wallet bulunamadı');
      }
      
      // Wallet address'ini güvenli şekilde al
      let walletAddress;
      try {
        walletAddress = await wallet.getAddress();
        console.log(`Wallet adresi alındı: ${walletAddress}`);
      } catch (error) {
        console.error('Wallet adresi alınamadı:', error);
        throw new Error('Wallet adresi alınamadı: ' + error.message);
      }
      
      // Counter değerini blockchain'den al
      const seaportContract = new ethers.Contract(
        "0x0000000000000068f116a894984e2db1123eb395",
        ['function getCounter(address) view returns (uint256)'],
        provider
      );
      
      let counter;
      try {
        counter = await seaportContract.getCounter(walletAddress);
        console.log(`Counter değeri alındı: ${counter.toString()}`);
      } catch (error) {
        console.log('Counter alınamadı, 0 kullanılıyor');
        counter = 0;
      }
      
      // 1. Order parametrelerini hazırla
      const orderParams = this.buildOrderParams(token, walletAddress, counter.toString());
      
      // 2. İmza oluştur (offchain, hızlı)
      let signature;
      try {
        console.log(`İmza oluşturuluyor - Wallet: ${walletAddress}, Counter: ${orderParams.counter}`);
        
        // Private key kontrolü
        const testMessage = "test";
        const testSignature = await wallet.signMessage(testMessage);
        const recoveredAddress = ethers.verifyMessage(testMessage, testSignature);
        
        if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new Error(`Private key uyuşmazlığı! Beklenen: ${walletAddress}, Bulunan: ${recoveredAddress}`);
        }
        
        signature = await this.signOrder(orderParams, wallet);
        console.log(`İmza başarılı: ${signature.substring(0, 10)}...`);
        
        // İmzayı doğrula
        const domain = {
          name: "Seaport",
          version: "1.6",
          chainId: 1,
          verifyingContract: "0x0000000000000068f116a894984e2db1123eb395"
        };
        
        const types = {
          OrderComponents: [
            { name: "offerer", type: "address" },
            { name: "zone", type: "address" },
            { name: "offer", type: "OfferItem[]" },
            { name: "consideration", type: "ConsiderationItem[]" },
            { name: "orderType", type: "uint8" },
            { name: "startTime", type: "uint256" },
            { name: "endTime", type: "uint256" },
            { name: "zoneHash", type: "bytes32" },
            { name: "salt", type: "uint256" },
            { name: "conduitKey", type: "bytes32" },
            { name: "counter", type: "uint256" }
          ],
          OfferItem: [
            { name: "itemType", type: "uint8" },
            { name: "token", type: "address" },
            { name: "identifierOrCriteria", type: "uint256" },
            { name: "startAmount", type: "uint256" },
            { name: "endAmount", type: "uint256" }
          ],
          ConsiderationItem: [
            { name: "itemType", type: "uint8" },
            { name: "token", type: "address" },
            { name: "identifierOrCriteria", type: "uint256" },
            { name: "startAmount", type: "uint256" },
            { name: "endAmount", type: "uint256" },
            { name: "recipient", type: "address" }
          ]
        };
        
        const recoveredSigner = ethers.verifyTypedData(domain, types, orderParams, signature);
        console.log(`İmza doğrulandı - Signer: ${recoveredSigner}`);
        
        if (recoveredSigner.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new Error(`İmza doğrulama hatası! Beklenen: ${walletAddress}, Bulunan: ${recoveredSigner}`);
        }
        
      } catch (signError) {
        console.error('İmza hatası:', signError.message);
        throw signError;
      }
      
      // 3. API'ye gönder - belirli API key ile
      const apiClient = this.parallelApi.apiClients[apiKeyIndex];
      const response = await this.submitOrder(
        orderParams,
        signature,
        apiClient,
        token.chain || 'ethereum'
      );
      
      const elapsed = Date.now() - startTime;
      
      return {
        success: true,
        token: token,
        tokenId: token.tokenId,
        price: token.price,
        orderHash: response.order_hash,
        time: elapsed
      };
      
    } catch (error) {
      console.error(`\n❌ createSingleBidLegacy hatası - Token #${token.tokenId}:`);
      console.error('Hata mesajı:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      return {
        success: false,
        token: token,
        tokenId: token.tokenId,
        error: error.message,
        time: Date.now() - startTime
      };
    }
  }
  
  /**
   * Hızlı bakiye kontrolü
   */
  async checkBalanceFast(requiredETH, provider, wallet) {
    // Ethereum mainnet WETH adresi
    const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    
    const wethContract = new ethers.Contract(
      WETH_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    
    const walletAddress = await wallet.getAddress();
    const balance = await wethContract.balanceOf(walletAddress);
    const required = ethers.parseEther(requiredETH.toString());
    
    return balance >= required;
  }
  
  /**
   * Order parametreleri oluştur
   */
  buildOrderParams(token, walletAddress, counter = "0") {
    // Token nesnesini kontrol et
    if (!token.contractAddress) {
      console.error('❌ Token contractAddress eksik!', token);
      throw new Error('Token contractAddress gerekli');
    }
    
    const now = Math.floor(Date.now() / 1000);
    const offerWei = ethers.parseEther(token.price.toString());
    const feeWei = offerWei * 50n / 10000n; // %0.5 OpenSea fee
    
    // Ethereum mainnet WETH adresi
    const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    
    // Salt'ı BigInt olarak oluştur
    const salt = ethers.toBigInt(ethers.randomBytes(32));
    
    return {
      offerer: walletAddress,
      zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone
      offer: [{
        itemType: 1, // ERC20 (WETH)
        token: WETH_ADDRESS,
        identifierOrCriteria: "0",
        startAmount: offerWei.toString(),
        endAmount: offerWei.toString()
      }],
      consideration: [
        {
          itemType: 2, // ERC721
          token: token.contractAddress, // Contract address gerekli
          identifierOrCriteria: token.tokenId.toString(),
          startAmount: "1",
          endAmount: "1",
          recipient: walletAddress
        },
        {
          itemType: 1, // ERC20 (WETH) - OpenSea fee
          token: WETH_ADDRESS,
          identifierOrCriteria: "0",
          startAmount: feeWei.toString(),
          endAmount: feeWei.toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ],
      orderType: 2, // FULL_RESTRICTED - signed zone için gerekli
      startTime: now.toString(),
      endTime: (now + (15 * 60)).toString(), // 15 dakika
      zoneHash: ethers.ZeroHash,
      salt: salt.toString(), // Salt'ı string olarak gönder
      conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
      counter: counter
    };
  }
  
  /**
   * Order'ı imzala
   */
  async signOrder(orderParams, wallet) {
    // OpenSea'nin kabul ettiği Seaport address
    const SEAPORT_ADDRESS = "0x0000000000000068f116a894984e2db1123eb395";
    
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: 1,
      verifyingContract: SEAPORT_ADDRESS
    };
    
    const types = {
      OrderComponents: [
        { name: "offerer", type: "address" },
        { name: "zone", type: "address" },
        { name: "offer", type: "OfferItem[]" },
        { name: "consideration", type: "ConsiderationItem[]" },
        { name: "orderType", type: "uint8" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
        { name: "zoneHash", type: "bytes32" },
        { name: "salt", type: "uint256" },
        { name: "conduitKey", type: "bytes32" },
        { name: "counter", type: "uint256" }
      ],
      OfferItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" }
      ],
      ConsiderationItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "recipient", type: "address" }
      ]
    };
    
    return await wallet.signTypedData(domain, types, orderParams);
  }
  
  /**
   * Order'ı API'ye gönder
   */
  async submitOrder(orderParams, signature, apiClient, chain) {
    // OpenSea'nin kabul ettiği Seaport address
    const SEAPORT_ADDRESS = "0x0000000000000068f116a894984e2db1123eb395";
    
    // API için totalOriginalConsiderationItems ekle
    const apiParams = {
      ...orderParams,
      totalOriginalConsiderationItems: orderParams.consideration.length
    };
    
    const payload = {
      parameters: apiParams,
      signature: signature,
      protocol_address: SEAPORT_ADDRESS
    };
    
    // Debug log
    console.log('\n📝 API Payload:', JSON.stringify(payload, null, 2));
    
    try {
      const response = await apiClient.post(
        `/api/v2/orders/${chain}/seaport/offers`,
        payload
      );
      
      return response.data;
    } catch (error) {
      if (error.response?.data) {
        console.error(`\n❌ API Hatası (${chain}):`);
        console.error('Status:', error.response.status);
        console.error('Data:', JSON.stringify(error.response.data, null, 2));
        if (error.response.headers) {
          console.error('Rate Limit Headers:', {
            'x-ratelimit-limit': error.response.headers['x-ratelimit-limit'],
            'x-ratelimit-remaining': error.response.headers['x-ratelimit-remaining'],
            'x-ratelimit-reset': error.response.headers['x-ratelimit-reset']
          });
        }
      } else {
        console.error('API Hatası:', error.message);
      }
      throw error;
    }
  }
  
  /**
   * Tek teklif ver (counter-bid için)
   */
  async placeSingleBid(token) {
    try {
      const apiKeyIndex = Math.floor(Math.random() * config.apiKeys.length);
      const rpcIndex = apiKeyIndex % this.providers.length;
      
      // Wallet ve provider kontrolü
      if (!this.wallets[rpcIndex]) {
        throw new Error(`Wallet #${rpcIndex} bulunamadı`);
      }
      if (!this.providers[rpcIndex]) {
        throw new Error(`Provider #${rpcIndex} bulunamadı`);
      }
      
      console.log(`\n🎯 Counter-bid başlatılıyor - Token #${token.tokenId}`);
      console.log(`- API Key Index: ${apiKeyIndex}`);
      console.log(`- RPC Index: ${rpcIndex}`);
      console.log(`- Fiyat: ${token.price} ETH`);
      
      const result = await this.createSingleBid(
        token,
        apiKeyIndex,
        this.providers[rpcIndex],
        this.wallets[rpcIndex]
      );
      
      if (result.success) {
        console.log(`✅ Counter-bid başarılı - Order Hash: ${result.orderHash}`);
      } else {
        console.log(`❌ Counter-bid başarısız - Hata: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      console.error(`\n❌ placeSingleBid hatası:`, error);
      return {
        success: false,
        token: token,
        tokenId: token.tokenId,
        error: error.message
      };
    }
  }
  
  /**
   * İstatistikleri göster
   */
  showStats() {
    const avgSpeed = this.stats.totalBids / (this.stats.totalTime / 1000);
    console.log(`\n📊 Ultra Fast Bidder İstatistikleri:`);
    console.log(`- Toplam teklif: ${this.stats.totalBids}`);
    console.log(`- Başarılı: ${this.stats.successfulBids}`);
    console.log(`- Başarısız: ${this.stats.failedBids}`);
    console.log(`- Ortalama hız: ${avgSpeed.toFixed(2)} teklif/saniye`);
    console.log(`- Çalışma süresi: ${((Date.now() - this.stats.startTime) / 1000).toFixed(0)} saniye`);
  }
}

module.exports = UltraFastBidder;