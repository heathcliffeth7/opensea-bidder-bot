const axios = require('axios');
const config = require('../config');
const { ethers } = require('ethers');
const { OpenSeaSDK, Chain } = require('opensea-js');
// Stream API - Custom WebSocket implementasyonu kullan
// const StreamAPIClient = require('./openSeaStreamClient');
const StreamAPIClient = require('./streamClient');
const AbstractClientManager = require('./abstractClientManager');
const ParallelApiManager = require('./parallelApiManager');
const { formatPrice } = require('../utils/helpers');
const rateLimiter = require('./rateLimiter');
const TokenOfferV2Fix = require('./tokenOfferV2Fix');
const RateLimitManager = require('./rateLimitManager');
const BestOfferReactor = require('./bestOfferReactor');
const AsyncTokenOfferManager = require('./asyncTokenOfferManager');

/**
 * OpenSea API ile etkileşim için yardımcı fonksiyonlar
 */
class OpenSeaAPI {
  constructor() {
    // Config referansı
    this.config = config;
    
    // Rate limit manager - tüm API istekleri için
    this.rateLimitManager = new RateLimitManager();
    this.rateLimitManager.setApiKeys(config.apiKeys || [config.apiKey]);
    
    this.apiClient = axios.create({
      baseURL: config.apiBaseUrl,
      headers: {
        'X-API-KEY': config.apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    // Collection cache - API isteklerini azaltmak için
    this.collectionCache = {};
    this.collectionCacheTTL = {}; // Her cache girişi için TTL timestamp
    this.COLLECTION_CACHE_DURATION = 30 * 60 * 1000; // 30 dakika
    
    // Paralel API Manager - rate limit manager ile entegre
    this.parallelApi = new ParallelApiManager();
    
    // Abstract offer instance'larını sakla
    this.abstractOfferInstances = {};
    
    // v2 Token offer handler
    this.tokenOfferV2 = new TokenOfferV2Fix(this);
    
    // Best offer reactor - hızlı counterbid sistemi
    this.bestOfferReactor = new BestOfferReactor(this);
    
    // Async token offer manager - tamamen paralel sistem
    this.asyncOfferManager = new AsyncTokenOfferManager(this);
    
    this.sdk = null; // OpenSea SDK instance
    this._initializeSDK();
    
    // Başlangıçta stream başlatmıyoruz, task'a göre başlatacağız
    console.log('\n🔄 Dynamic stream client modu aktif');
    console.log('Stream client\'lar task\'a göre başlatılacak');
    
    this.activeListeners = {};
    
    // Dynamic stream clients storage
    this.streamClients = new Map();
  }
  
  /**
   * Chain'e göre stream client'ı al veya oluştur
   * @param {string} chain - Chain adı (ethereum, abstract, vb.)
   * @returns {Object} Stream client instance
   */
  getStreamForChain(chain) {
    // Zaten bu chain için client varsa döndür
    if (this.streamClients.has(chain)) {
      return this.streamClients.get(chain);
    }
    
    console.log(`\n🔄 ${chain} chain için yeni stream client başlatılıyor...`);
    
    let client;
    if (chain === 'abstract') {
      // Abstract chain için özel client
      console.log('🔧 Abstract chain algılandı, AbstractClientManager başlatılıyor...');
      console.log('🌐 Chain ID: 2741');
      console.log('📍 WETH Address:', config.getWethAddress('abstract'));
      
      client = new AbstractClientManager();
      
      // Abstract client event listeners
      client.on('connected', (info) => {
        console.log(`\n🟢 Abstract Stream API BAĞLANDI!`);
        console.log('✅ OpenSea Abstract chain\'ı destekliyor!');
        console.log('Chain: Abstract (2741)');
        console.log('WebSocket URL:', info.url || 'unknown');
      });
      
      client.on('disconnected', (event) => {
        console.log(`\n🔴 Abstract Stream API bağlantısı kesildi!`);
        if (event?.code === 1011) {
          console.log('🔄 Code 1011 - Farklı parametrelerle yeniden denenecek...');
        }
      });
      
      client.on('error', (error) => {
        console.error(`\n❌ Abstract Stream hatası:`, error);
      });
      
      // Initialize async
      console.log('🔄 Abstract client initialize ediliyor...');
      client.initialize(config.apiKey).then(() => {
        console.log('✅ Abstract client başarıyla başlatıldı');
      }).catch(error => {
        console.error('❌ Abstract client başlatma hatası:', error);
      });
      
    } else {
      // Diğer chainler için normal Stream API
      console.log(`📡 ${chain} için normal StreamAPIClient başlatılıyor...`);
      client = new StreamAPIClient();
      
      // Event listeners
      client.on('connected', () => {
        console.log(`\n🟢 ${chain} Stream API bağlantısı kuruldu!`);
        console.log(`Chain: ${chain}`);
        console.log('Zaman:', new Date().toLocaleString());
      });
      
      client.on('disconnected', (event) => {
        console.log(`\n🔴 ${chain} Stream API bağlantısı kesildi!`);
        if (event) {
          console.log('Disconnect code:', event.code || 'Bilinmiyor');
          console.log('Disconnect reason:', event.reason || 'Belirtilmemiş');
        }
      });
      
      client.on('error', (error) => {
        console.error(`\n❌ ${chain} Stream API hatası:`, error);
      });
      
      // Connect - chain parametresi ile
      client.connect(chain);
      console.log(`${chain} stream connect(${chain}) çağrıldı`);
    }
    
    // Client'ı sakla ve döndür
    this.streamClients.set(chain, client);
    console.log(`✅ ${chain} stream client Map'e eklendi`);
    
    return client;
  }
  
  /**
   * Rate limit korumalı API isteği
   */
  async _makeApiRequest(method, endpoint, data = null, params = null, priority = 0) {
    // Chain'i endpoint'ten çıkar
    let chain = null;
    if (endpoint.includes('/ethereum/')) {
      chain = 'ethereum';
    } else if (endpoint.includes('/abstract/')) {
      chain = 'abstract';
    } else if (endpoint.includes('/polygon/')) {
      chain = 'polygon';
    }
    
    return await this.rateLimitManager.addRequest(async (apiKey) => {
      // API key verilmişse header'ı güncelle
      const headers = { ...this.apiClient.defaults.headers };
      if (apiKey) {
        headers['X-API-KEY'] = apiKey;
      }
      
      try {
        const response = await this.apiClient.request({
          method,
          url: endpoint,
          data,
          params,
          headers
        });
        
        return response.data;
      } catch (error) {
        // Hata detaylarını logla
        if (error.response?.status === 429) {
          console.error(`⚠️ RATE LIMIT AŞILDI: ${endpoint}`);
          const detail = error.response.data?.detail || error.response.data?.message || '';
          console.error(`Detaylı hata: ${detail}`);
        }
        throw error;
      }
    }, priority, chain);
  }
  
  async _initializeSDK(chain = 'ethereum') {
    try {
      // Chain'e göre RPC URL al
      const rpcUrl = config.getRpcUrl(chain);
      
      // Provider oluştur - ethers v6
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Wallet oluştur - ethers v6
      const wallet = new ethers.Wallet(config.privateKey, provider);
      
      // Chain mapping for OpenSea SDK
      let sdkChain;
      switch(chain) {
        case 'ethereum':
          sdkChain = Chain.Mainnet;
          break;
        case 'polygon':
          sdkChain = Chain.Polygon;
          break;
        case 'sepolia':
          sdkChain = Chain.Sepolia;
          break;
        case 'abstract':
          // Abstract chain için özel ayar - SDK string bekliyor
          sdkChain = 'abstract';
          break;
        default:
          sdkChain = Chain.Mainnet;
      }
      
      // SDK'yı wallet ile başlat
      this.sdk = new OpenSeaSDK(wallet, {
        chain: sdkChain,
        apiKey: config.apiKey
      });
      
      // Provider ve wallet'ı sakla (bakiye kontrolü için)
      this.provider = provider;
      this.wallet = wallet;
      this.currentChain = chain;
      
      console.log(`OpenSea SDK başarıyla başlatıldı - Chain: ${chain}`);
    } catch (error) {
      console.error('OpenSea SDK başlatma hatası:', error);
    }
  }

  /**
   * Chain değiştir ve SDK'yı yeniden başlat
   */
  async switchChain(chain) {
    console.log(`Chain değiştiriliyor: ${this.currentChain} -> ${chain}`);
    await this._initializeSDK(chain);
    return this.currentChain === chain;
  }
  
  /**
   * Tamamen paralel toplu token offer - Ultra hızlı
   */
  async createBulkOffersAsync(tokens, task) {
    console.log('\n⚡⚡⚡ ULTRA HIZLI PARALEL OFFER SİSTEMİ AKTİF ⚡⚡⚡');
    
    // Token verisini hazırla
    const tokenData = tokens.map(tokenId => ({
      tokenId,
      contractAddress: task.settings.contractAddress || task.settings.collection
    }));
    
    // Fire and forget - hiçbir işlem diğerini beklemiyor
    await this.asyncOfferManager.fireAndForgetBulkOffers(tokenData, task);
    
    // İstatistikleri göster
    setTimeout(() => {
      console.log('\n📊 5 saniye sonrası durum:');
      this.asyncOfferManager.showStats();
    }, 5000);
    
    return { 
      message: 'Tüm teklifler paralel olarak işleniyor', 
      totalTokens: tokens.length 
    };
  }

  /**
   * WETH ve ETH bakiyelerini kontrol et
   */
  async checkBalances() {
    try {
      if (!this.provider || !this.wallet) {
        throw new Error('Provider veya wallet henüz hazır değil');
      }

      // Debug bilgisi
      console.log('\n🔍 Bakiye kontrolü debug bilgileri:');
      console.log('- Mevcut chain:', this.currentChain || 'ethereum');
      console.log('- Wallet adresi:', this.wallet.address);
      
      // Chain'e göre WETH kontrat adresi
      const wethAddress = config.getWethAddress(this.currentChain || 'ethereum');
      console.log('- WETH kontrat adresi:', wethAddress);
      
      // Network bilgisini kontrol et
      const network = await this.provider.getNetwork();
      console.log('- Bağlı network chain ID:', network.chainId);
      console.log('- Beklenen chain ID:', config.getChainId(this.currentChain || 'ethereum'));
      
      // Chain ID uyumsuzluğu kontrolü
      if (Number(network.chainId) !== config.getChainId(this.currentChain || 'ethereum')) {
        console.warn('⚠️ Chain ID uyumsuzluğu tespit edildi!');
      }
      
      // WETH kontratı ABI (sadece balanceOf fonksiyonu için)
      const wethAbi = [
        'function balanceOf(address owner) view returns (uint256)'
      ];
      
      // WETH kontratına bağlan
      const wethContract = new ethers.Contract(wethAddress, wethAbi, this.provider);
      
      // WETH bakiyesini sorgula
      const wethBalance = await wethContract.balanceOf(this.wallet.address);
      const wethBalanceInEth = ethers.formatEther(wethBalance);
      console.log('- WETH bakiyesi (raw):', wethBalance.toString());
      console.log('- WETH bakiyesi (ETH):', wethBalanceInEth);
      
      // ETH bakiyesini sorgula (gas için)
      const ethBalance = await this.provider.getBalance(this.wallet.address);
      const ethBalanceInEth = ethers.formatEther(ethBalance);
      console.log('- ETH bakiyesi (raw):', ethBalance.toString());
      console.log('- ETH bakiyesi (ETH):', ethBalanceInEth);
      
      return {
        weth: {
          raw: wethBalance.toString(),
          formatted: wethBalanceInEth,
          symbol: 'WETH'
        },
        eth: {
          raw: ethBalance.toString(),
          formatted: ethBalanceInEth,
          symbol: 'ETH'
        },
        walletAddress: this.wallet.address,
        network: this.currentChain || 'ethereum',
        chainId: Number(network.chainId)
      };
    } catch (error) {
      console.error('Bakiye kontrolü hatası:', error);
      console.error('Hata detayı:', error.message);
      if (error.code) {
        console.error('Hata kodu:', error.code);
      }
      throw error;
    }
  }

  /**
   * Chain-specific provider al
   */
  async getProviderForChain(targetChain) {
    if (targetChain === 'abstract') {
      if (!this.abstractProvider) {
        console.log('🔗 Abstract chain provider oluşturuluyor...');
        this.abstractProvider = new ethers.JsonRpcProvider(config.abstractRpcUrls[0]);
      }
      return this.abstractProvider;
    }
    return this.provider; // Mevcut Ethereum provider
  }

  /**
   * Chain-specific wallet al
   */
  async getWalletForChain(targetChain) {
    const provider = await this.getProviderForChain(targetChain);
    return new ethers.Wallet(config.privateKey, provider);
  }

  /**
   * Abstract chain için bakiye kontrolü
   */
  async checkAbstractBalance(offerAmount, gasEstimate = '0.0015') {
    try {
      console.log('\n💰 Abstract chain bakiye kontrolü yapılıyor...');
      
      const provider = await this.getProviderForChain('abstract');
      const wallet = await this.getWalletForChain('abstract');
      
      // Debug bilgileri
      console.log('🔍 Abstract bakiye kontrolü debug:');
      console.log('- Chain: abstract (ID: 2741)');
      console.log('- Wallet adresi:', wallet.address);
      
      const wethAddress = config.wethAddresses.abstract;
      console.log('- WETH kontrat adresi:', wethAddress);
      
      // Network doğrulama
      const network = await provider.getNetwork();
      console.log('- Bağlı network chain ID:', network.chainId);
      console.log('- Beklenen chain ID:', config.chainIds.abstract);
      
      // WETH kontratı
      const wethAbi = ['function balanceOf(address owner) view returns (uint256)'];
      const wethContract = new ethers.Contract(wethAddress, wethAbi, provider);
      
      // Bakiyeleri sorgula
      const wethBalance = await wethContract.balanceOf(wallet.address);
      const wethBalanceInEth = ethers.formatEther(wethBalance);
      console.log('- WETH bakiyesi (raw):', wethBalance.toString());
      console.log('- WETH bakiyesi (ETH):', wethBalanceInEth);
      
      const ethBalance = await provider.getBalance(wallet.address);
      const ethBalanceInEth = ethers.formatEther(ethBalance);
      console.log('- ETH bakiyesi (raw):', ethBalance.toString());
      console.log('- ETH bakiyesi (ETH):', ethBalanceInEth);
      
      // Yeterlilik kontrolü
      const wethRequired = parseFloat(offerAmount);
      const wethAvailable = parseFloat(wethBalanceInEth);
      const ethAvailable = parseFloat(ethBalanceInEth);
      const gasRequired = parseFloat(gasEstimate);
      
      const hasEnoughWETH = wethAvailable >= wethRequired;
      const hasEnoughETH = ethAvailable >= gasRequired;
      
      const result = {
        sufficient: hasEnoughWETH && hasEnoughETH,
        weth: {
          required: wethRequired,
          available: wethAvailable,
          sufficient: hasEnoughWETH,
          shortage: hasEnoughWETH ? 0 : (wethRequired - wethAvailable)
        },
        eth: {
          required: gasRequired,
          available: ethAvailable,
          sufficient: hasEnoughETH,
          shortage: hasEnoughETH ? 0 : (gasRequired - ethAvailable)
        },
        message: ''
      };
      
      // Mesaj oluştur
      if (result.sufficient) {
        result.message = `✅ Abstract chain bakiye yeterli!\n` +
          `   WETH: ${wethAvailable.toFixed(6)} (gerekli: ${wethRequired})\n` +
          `   ETH: ${ethAvailable.toFixed(6)} (gas için: ${gasRequired})`;
      } else {
        const messages = [];
        if (!hasEnoughWETH) {
          messages.push(`❌ Yetersiz WETH bakiyesi!\n` +
            `   Gerekli: ${wethRequired} WETH\n` +
            `   Mevcut: ${wethAvailable} WETH\n` +
            `   Eksik: ${(wethRequired - wethAvailable).toFixed(6)} WETH`);
        }
        if (!hasEnoughETH) {
          messages.push(`❌ Yetersiz ETH bakiyesi (gas için)!\n` +
            `   Gerekli: ${gasRequired} ETH\n` +
            `   Mevcut: ${ethAvailable} ETH\n` +
            `   Eksik: ${(gasRequired - ethAvailable).toFixed(6)} ETH`);
        }
        result.message = messages.join('\n\n');
      }
      
      return result;
      
    } catch (error) {
      console.error('Abstract bakiye kontrolü hatası:', error);
      return {
        sufficient: false,
        error: error.message,
        message: `Abstract chain bakiye kontrolünde hata: ${error.message}`
      };
    }
  }

  /**
   * Teklif için yeterli bakiye var mı kontrol et (Chain-aware)
   */
  async checkSufficientBalance(offerAmount, gasEstimate = '0.0015', chain = null) {
    try {
      // Abstract chain için özel kontrol
      if (chain === 'abstract') {
        return await this.checkAbstractBalance(offerAmount, gasEstimate);
      }
      
      // Ethereum ve diğer chainler için mevcut sistem
      const balances = await this.checkBalances();
      
      // Eğer chain parametresi verilmişse ve current chain farklıysa uyarı ver
      if (chain && chain !== this.currentChain) {
        console.warn(`⚠️ Bakiye kontrolü ${this.currentChain} chain'inde yapıldı, ancak teklif ${chain} chain'inde olacak!`);
      }
      
      const wethRequired = parseFloat(offerAmount);
      const wethBalance = parseFloat(balances.weth.formatted);
      const ethBalance = parseFloat(balances.eth.formatted);
      const gasRequired = parseFloat(gasEstimate);
      
      const hasEnoughWETH = wethBalance >= wethRequired;
      const hasEnoughETH = ethBalance >= gasRequired;
      
      const result = {
        sufficient: hasEnoughWETH && hasEnoughETH,
        weth: {
          required: wethRequired,
          available: wethBalance,
          sufficient: hasEnoughWETH,
          shortage: hasEnoughWETH ? 0 : (wethRequired - wethBalance)
        },
        eth: {
          required: gasRequired,
          available: ethBalance,
          sufficient: hasEnoughETH,
          shortage: hasEnoughETH ? 0 : (gasRequired - ethBalance)
        },
        message: ''
      };
      
      // Detaylı hata mesajı oluştur
      if (!result.sufficient) {
        const messages = [];
        
        if (!hasEnoughWETH) {
          messages.push(`❌ Yetersiz WETH bakiyesi!\n` +
            `   Gerekli: ${wethRequired} WETH\n` +
            `   Mevcut: ${wethBalance} WETH\n` +
            `   Eksik: ${result.weth.shortage.toFixed(6)} WETH`);
        }
        
        if (!hasEnoughETH) {
          messages.push(`❌ Yetersiz ETH bakiyesi (gas için)!\n` +
            `   Gerekli: ${gasRequired} ETH\n` +
            `   Mevcut: ${ethBalance} ETH\n` +
            `   Eksik: ${result.eth.shortage.toFixed(6)} ETH`);
        }
        
        result.message = messages.join('\n\n') + 
          `\n\n💡 İpucu: ETH'yi WETH'e çevirmek için: https://app.uniswap.org/swap adresini kullanabilirsiniz.`;
      } else {
        result.message = `✅ Bakiye yeterli\n` +
          `   WETH: ${wethBalance} (${wethRequired} gerekli)\n` +
          `   ETH: ${ethBalance} (${gasRequired} gas için)`;
      }
      
      return result;
    } catch (error) {
      console.error('Bakiye yeterliliği kontrolü hatası:', error);
      throw error;
    }
  }

  /**
   * API isteği gönderme yardımcı fonksiyonu (yeniden deneme mantığı ile)
   */
  async makeRequest(method, endpoint, data = null, params = null, headers = null) {
    // Log'u HEMEN at - rate limiter'dan önce
    console.log(`API İsteği: ${method} ${endpoint}`);
    if (params) console.log('Parametreler:', JSON.stringify(params));
    if (data && method === 'POST') console.log('Veri:', JSON.stringify(data));
    
    // Chain'i endpoint'ten çıkar
    let chain = null;
    if (endpoint.includes('/ethereum/')) {
      chain = 'ethereum';
    } else if (endpoint.includes('/abstract/')) {
      chain = 'abstract';
    } else if (endpoint.includes('/polygon/')) {
      chain = 'polygon';
    }
    
    // RateLimitManager kullanarak paralel istek - chain parametresi ile
    return this.rateLimitManager.addRequest(async (apiKey) => {
      try {
        // API key'i header'a ekle
        const requestHeaders = {
          ...this.apiClient.defaults.headers,
          ...headers
        };
        if (apiKey) {
          requestHeaders['X-API-KEY'] = apiKey;
        }
        
        // İstek yap
        const requestConfig = {
          method,
          url: endpoint,
          data,
          params,
          headers: requestHeaders,
          validateStatus: function (status) {
            return status >= 200 && status < 500;
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        };
          
        const response = await this.apiClient(requestConfig);
        
        // 4xx hatalarını kontrol et
        if (response.status >= 400) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.response = response;
          error.status = response.status;
          
          // 400 hatası için detaylı log
          if (response.status === 400 && response.data) {
            console.error('\n=== 400 HATA DETAYI ===');
            console.error('Endpoint:', endpoint);
            if (response.data.errors) {
              console.error('Hatalar:', response.data.errors);
            }
            if (response.data.detail) {
              console.error('Detay:', response.data.detail);
            }
            if (response.data.message) {
              console.error('Mesaj:', response.data.message);
            }
          }
          
          throw error;
        }
        
        return response.data;
      } catch (error) {
        // Rate limit manager zaten retry yapacak, burada sadece hata fırlat
        throw error;
      }
    }, 0, chain); // priority = 0, chain parametresi eklendi
  }

  /**
   * Koleksiyon bilgilerini getir (contract address dahil)
   */
  async getCollectionInfo(collectionSlug) {
    // Abstract chain için özel mapping
    const abstractMappings = {
      'abstract': 'pengztracted-abstract',
      'pengztracted-abstract': 'pengztracted-abstract',
      'pengztracted': 'pengztracted-abstract'
    };
    
    // Abstract chain için slug düzeltmesi
    const chainName = process.env.CHAIN || this.currentChain || 'ethereum';
    if (chainName === 'abstract' && abstractMappings[collectionSlug]) {
      collectionSlug = abstractMappings[collectionSlug];
      console.log(`Abstract collection slug düzeltildi: ${collectionSlug}`);
    }
    
    // Abstract collections için önce API'den dene
    if (chainName === 'abstract') {
      // API'den almayı dene
      try {
        console.log(`Abstract collection bilgileri API'den alınıyor: ${collectionSlug}`);
        const params = { chain: 'abstract' };
        const response = await this.makeRequest('GET', `/api/v2/collections/${collectionSlug}`, null, params);
        
        if (response && response.contracts && response.contracts.length > 0) {
          // Abstract chain için contract bulma
          const abstractContract = response.contracts.find(c => c.chain === 'abstract' || c.chain === 'abstract_mainnet');
          if (abstractContract) {
            const result = {
              success: true,
              contractAddress: abstractContract.address,
              chain: 'abstract',
              name: response.name,
              slug: response.collection,
              contracts: response.contracts
            };
            this.collectionCache[collectionSlug] = result;
            this.collectionCacheTTL[collectionSlug] = Date.now();
            return result;
          }
        }
      } catch (error) {
        console.log(`Abstract collection API hatası, fallback mapping kullanılacak: ${error.message}`);
      }
      
      // Fallback: Sabit mapping
      const abstractContracts = {
        'pengztracted-abstract': {
          success: true,
          contractAddress: '0xa6C46c07F7f1966D772E29049175EBBa26262513',
          chain: 'abstract',
          name: 'Pengztracted',
          slug: 'pengztracted-abstract'
        }
      };
      
      if (abstractContracts[collectionSlug]) {
        console.log(`Abstract collection bilgileri fallback mapping'ten alındı: ${collectionSlug}`);
        this.collectionCache[collectionSlug] = abstractContracts[collectionSlug];
        this.collectionCacheTTL[collectionSlug] = Date.now();
        return abstractContracts[collectionSlug];
      }
    }
    
    // Cache kontrolü - TTL ile
    if (this.collectionCache[collectionSlug]) {
      const cacheTime = this.collectionCacheTTL[collectionSlug] || 0;
      const now = Date.now();
      
      // Cache hala geçerliyse kullan
      if (now - cacheTime < this.COLLECTION_CACHE_DURATION) {
        console.log(`Koleksiyon bilgileri cache'den alındı: ${collectionSlug} (${Math.floor((this.COLLECTION_CACHE_DURATION - (now - cacheTime)) / 60000)} dakika kaldı)`);
        return this.collectionCache[collectionSlug];
      } else {
        // Cache expire olmuş, temizle
        console.log(`Cache expire olmuş, yenileniyor: ${collectionSlug}`);
        delete this.collectionCache[collectionSlug];
        delete this.collectionCacheTTL[collectionSlug];
      }
    }
    
    try {
      console.log(`Koleksiyon bilgileri API'den alınıyor: ${collectionSlug}`);
      const response = await this.makeRequest('GET', `/api/v2/collections/${collectionSlug}`);
      
      if (response && response.contracts && response.contracts.length > 0) {
        // İlk contract'ı al (genelde tek contract olur)
        const contractInfo = response.contracts[0];
        console.log(`Contract address bulundu: ${contractInfo.address}`);
        const collectionData = {
          success: true,
          contractAddress: contractInfo.address,
          chain: contractInfo.chain || 'ethereum',
          name: response.name,
          slug: response.collection
        };
        
        // Cache'e kaydet
        this.collectionCache[collectionSlug] = collectionData;
        this.collectionCacheTTL[collectionSlug] = Date.now();
        
        return collectionData;
      } else {
        throw new Error(`${collectionSlug} için contract address bulunamadı`);
      }
    } catch (error) {
      console.error(`Koleksiyon bilgileri alınamadı: ${collectionSlug}`, error);
      throw error;
    }
  }

  /**
   * Birden fazla koleksiyon bilgisini batch olarak al (performans optimizasyonu)
   */
  async getCollectionInfoBatch(collectionSlugs) {
    if (!Array.isArray(collectionSlugs) || collectionSlugs.length === 0) {
      return {};
    }
    
    const results = {};
    const uncachedSlugs = [];
    const now = Date.now();
    
    // Önce cache'den alınabilenleri kontrol et
    for (const slug of collectionSlugs) {
      if (this.collectionCache[slug]) {
        const cacheTime = this.collectionCacheTTL[slug] || 0;
        if (now - cacheTime < this.COLLECTION_CACHE_DURATION) {
          results[slug] = this.collectionCache[slug];
          console.log(`Batch: ${slug} cache'den alındı`);
        } else {
          // Expire olmuş
          delete this.collectionCache[slug];
          delete this.collectionCacheTTL[slug];
          uncachedSlugs.push(slug);
        }
      } else {
        uncachedSlugs.push(slug);
      }
    }
    
    // Cache'de olmayanları teker teker al (OpenSea batch endpoint'i yok)
    if (uncachedSlugs.length > 0) {
      console.log(`${uncachedSlugs.length} koleksiyon için API çağrısı yapılacak`);
      
      // Paralel olarak tüm koleksiyonları al
      const promises = uncachedSlugs.map(slug => 
        this.getCollectionInfo(slug)
          .then(info => {
            results[slug] = info;
            return info;
          })
          .catch(err => {
            console.error(`Koleksiyon bilgisi alınamadı: ${slug}`, err.message);
            return null;
          })
      );
      
      await Promise.all(promises);
    }
    
    return results;
  }

  /**
   * Koleksiyondaki NFT'leri getir
   */
  async getCollectionNFTs(chain, collectionSlug, limit = 50) {
    return this.makeRequest('GET', `/api/v2/collection/${collectionSlug}/nfts`, null, { 
      chain, 
      limit 
    });
  }

  /**
   * Belirli bir NFT için bilgileri getir
   */
  async getNFTInfo(chain, collectionOrContract, tokenId) {
    try {
      // Eğer Ethereum adresi ise (0x ile başlıyorsa) contract endpoint'ini kullan
      if (collectionOrContract.startsWith('0x')) {
        return await this.makeRequest('GET', `/api/v2/chain/${chain}/contract/${collectionOrContract}/nfts/${tokenId}`);
      } else {
        // Değilse collection slug'dır, önce contract address'i al
        try {
          const collectionInfo = await this.getCollectionInfo(collectionOrContract);
          return await this.makeRequest('GET', `/api/v2/chain/${chain}/contract/${collectionInfo.contractAddress}/nfts/${tokenId}`);
        } catch (error) {
          console.error('Collection bilgisi alınamadı, slug ile deneniyor:', error);
          // Bazı endpoint'ler slug'ı da kabul edebilir
          return await this.makeRequest('GET', `/api/v2/collection/${collectionOrContract}/nfts/${tokenId}`, null, { chain });
        }
      }
    } catch (error) {
      // HTML hatası veya 404 hatası token'ın bulunmadığını gösterir
      if (error.message && (error.message.includes('html') || error.message.includes('404') || error.message.includes('Not Found'))) {
        throw new Error(`Token #${tokenId} bulunamadı`);
      }
      throw error;
    }
  }
  
  /**
   * NFT için tüm bilgileri getir (trait'ler dahil)
   */
  async getNFT(chain, collectionOrContract, tokenId) {
    try {
      const nftInfo = await this.getNFTInfo(chain, collectionOrContract, tokenId);
      
      // Trait bilgilerini logla
      if (nftInfo && nftInfo.nft && nftInfo.nft.traits) {
        console.log(`NFT #${tokenId} trait'leri:`);
        nftInfo.nft.traits.forEach(trait => {
          console.log(`- ${trait.trait_type}: ${trait.value}`);
        });
      }
      
      return nftInfo;
    } catch (error) {
      console.error('NFT bilgileri alınamadı:', error);
      return null;
    }
  }

  /**
   * Koleksiyon için en iyi teklifleri getir (v2 API)
   */
  async getCollectionOffers(chain, collectionSlug) {
    // Abstract chain için collection slug düzeltmesi
    if (chain === 'abstract' && collectionSlug === 'abstract') {
      collectionSlug = 'pengztracted-abstract';
    }
    return this.makeRequest('GET', `/api/v2/offers/collection/${collectionSlug}`, null, { chain });
  }

  /**
   * Belirli bir NFT için en iyi teklifi getir (v2 API)
   */
  async getBestOfferForNFT(chain, contractAddress, tokenId) {
    // Yeni V2 fonksiyonunu kullan
    const { getBestOfferForNFTV2 } = require('./getBestOfferV2');
    return getBestOfferForNFTV2(this, chain, contractAddress, tokenId);
  }
  
  /**
   * Belirli bir NFT için en iyi teklifi getir (v2 API) - ESKİ VERSİYON
   */
  async getBestOfferForNFT_OLD(chain, contractAddress, tokenId) {
    // OpenSea v2 API'de NFT offers'ı NFT detayları içinde geliyor
    try {
      console.log(`📊 Token #${tokenId} için teklifler kontrol ediliyor...`);
      
      // 1. NFT için best offer endpoint'ini dene (OpenSea docs'a göre)
      try {
        console.log(`🔍 Best offer endpoint deneniyor...`);
        
        // Önce collection slug'ı al
        let collectionSlug = contractAddress;
        try {
          // Ethereum için gemesis slug'ını kullan
          if (chain === 'ethereum' && contractAddress.toLowerCase() === '0xbe9371326f91345777b04394448c23e2bfeaa826') {
            collectionSlug = 'gemesis';
          } else if (chain === 'abstract' && contractAddress.toLowerCase() === '0xa6c46c07f7f1966d772e29049175ebba26262513') {
            collectionSlug = 'pengztracted-abstract';
          } else {
            const collectionInfo = await this.getCollectionInfo(contractAddress);
            if (collectionInfo && collectionInfo.slug) {
              collectionSlug = collectionInfo.slug;
            }
          }
        } catch (e) {
          // Contract address ile devam et
          console.log('Collection slug alınamadı, contract address ile devam ediliyor');
        }
        
        const bestOfferUrl = `/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`;
        
        const bestOfferResponse = await this.makeRequest('GET', bestOfferUrl);
        
        if (bestOfferResponse && bestOfferResponse.price) {
          console.log(`✅ Best offer endpoint'inden teklif bulundu!`);
          console.log(`Raw response:`, JSON.stringify(bestOfferResponse, null, 2));
          
          // Collection offer kontrolü
          const isCollectionOffer = bestOfferResponse.criteria?.encoded_token_ids === '*';
          
          if (isCollectionOffer) {
            console.log(`⚠️ Bu bir COLLECTION OFFER - token specific değil!`);
            console.log(`Collection offer değeri: ${formatPrice(this._extractPrice(bestOfferResponse))} ETH`);
            // Collection offer ise Seaport endpoint'ine geç
            throw new Error('Collection offer bulundu, token specific offer aranıyor');
          }
          
          // OpenSea best offer response formatı
          const bestPrice = this._extractPrice(bestOfferResponse);
          console.log(`🎯 En yüksek teklif: ${formatPrice(bestPrice)} ETH`);
          
          return { offer: bestOfferResponse };
        }
      } catch (bestOfferError) {
        console.log(`Best offer endpoint başarısız:`, bestOfferError.message);
      }
      
      // 2. Seaport orders endpoint'ini dene
      try {
        console.log(`🔍 Seaport orders endpoint deneniyor...`);
        const offersResponse = await this.makeRequest('GET', `/api/v2/orders/${chain}/seaport/offers`, null, {
          asset_contract_address: contractAddress,
          token_ids: tokenId,
          limit: 50
        });
        
        if (offersResponse && offersResponse.orders && offersResponse.orders.length > 0) {
          console.log(`✅ Seaport orders endpoint'inden ${offersResponse.orders.length} teklif bulundu!`);
          
          // Token-specific offer'ları filtrele (collection offer'ları hariç tut)
          const tokenSpecificOffers = offersResponse.orders.filter(order => {
            // Collection offer kontrolü
            const isCollectionOffer = order.criteria?.encoded_token_ids === '*' || 
                                     order.protocol_data?.parameters?.consideration?.[0]?.itemType === 4;
            
            if (isCollectionOffer) {
              const price = this._extractPrice(order);
              console.log(`📦 Collection offer filtrelendi: ${formatPrice(price)} ETH`);
            }
            
            return !isCollectionOffer;
          });
          
          if (tokenSpecificOffers.length > 0) {
            console.log(`✅ ${tokenSpecificOffers.length} token-specific offer bulundu`);
            
            // En yüksek teklifi bul
            const sortedOffers = tokenSpecificOffers.sort((a, b) => {
              const priceA = this._extractPrice(a);
              const priceB = this._extractPrice(b);
              return priceB - priceA;
            });
            
            const bestOffer = sortedOffers[0];
            const bestPrice = this._extractPrice(bestOffer);
            console.log(`🎯 En yüksek token-specific teklif: ${formatPrice(bestPrice)} ETH`);
            
            return { offer: bestOffer };
          } else {
            console.log(`⚠️ Sadece collection offer'lar var, token-specific offer yok`);
          }
        }
      } catch (offersError) {
        console.log(`Seaport orders endpoint başarısız, NFT detaylarına bakılıyor...`);
      }
      
      // NFT detaylarını al
      const nftInfo = await this.getNFTInfo(chain, contractAddress, tokenId);
      
      // Debug: API'den gelen veriyi detaylı logla
      if (nftInfo && nftInfo.nft) {
        console.log(`API Response keys:`, Object.keys(nftInfo.nft));
        
        // Tüm offer ile ilgili alanları kontrol et
        const offerFields = ['best_offer', 'orders', 'offers', 'seaport_offers', 'collection_offers', 'last_sale', 'top_bid'];
        offerFields.forEach(field => {
          if (nftInfo.nft[field]) {
            console.log(`✓ ${field} alanı mevcut`);
            
            // best_offer detayını göster
            if (field === 'best_offer' && nftInfo.nft[field].price) {
              const price = this._extractPrice(nftInfo.nft[field]);
              console.log(`  → Best offer fiyatı: ${formatPrice(price)} ETH`);
            }
          }
        });
      }
      
      let allOffers = [];
      
      // 1. Best offer'ı kontrol et
      if (nftInfo && nftInfo.nft && nftInfo.nft.best_offer) {
        const bestOfferPrice = this._extractPrice(nftInfo.nft.best_offer);
        console.log(`✓ Best offer bulundu: ${formatPrice(bestOfferPrice)} ETH`);
        allOffers.push(nftInfo.nft.best_offer);
      }
      
      // 2. Orders içindeki tüm teklifleri kontrol et  
      if (nftInfo && nftInfo.nft && nftInfo.nft.orders) {
        const offers = nftInfo.nft.orders.filter(order => 
          order.side === 0 || order.order_type === 'bid' || order.order_type === 'offer'
        );
        
        console.log(`✓ ${offers.length} adet order bulundu`);
        allOffers = [...allOffers, ...offers];
      }
      
      // 3. Offers alanını da kontrol et
      if (nftInfo && nftInfo.nft && nftInfo.nft.offers) {
        console.log(`✓ ${nftInfo.nft.offers.length} adet offer bulundu`);
        allOffers = [...allOffers, ...nftInfo.nft.offers];
      }
      
      // 4. Seaport offers alanını kontrol et
      if (nftInfo && nftInfo.nft && nftInfo.nft.seaport_offers) {
        console.log(`✓ ${nftInfo.nft.seaport_offers.length} adet seaport offer bulundu`);
        allOffers = [...allOffers, ...nftInfo.nft.seaport_offers];
      }
      
      // 5. Collection offers da kontrol et
      if (nftInfo && nftInfo.nft && nftInfo.nft.collection_offers) {
        console.log(`✓ ${nftInfo.nft.collection_offers.length} adet collection offer bulundu`);
        allOffers = [...allOffers, ...nftInfo.nft.collection_offers];
      }
      
      if (allOffers.length > 0) {
        // Tüm teklifleri fiyata göre sırala
        const sortedOffers = allOffers.sort((a, b) => {
          const priceA = this._extractPrice(a);
          const priceB = this._extractPrice(b);
          return priceB - priceA;
        });
        
        // En yüksek 3 teklifi logla
        console.log(`📈 En yüksek teklifler (${sortedOffers.length} toplam):`);
        sortedOffers.slice(0, 3).forEach((offer, index) => {
          const price = this._extractPrice(offer);
          const maker = offer.maker?.address || offer.protocol_data?.parameters?.offerer || 'Bilinmiyor';
          console.log(`  ${index + 1}. ${formatPrice(price)} ETH - ${maker.substring(0, 8)}...`);
        });
        
        return { offer: sortedOffers[0] };
      }
      
      console.log(`❌ Token #${tokenId} için hiç teklif bulunamadı`);
      return { offer: null };
    } catch (error) {
      console.error('NFT offers alınamadı:', error);
      return { offer: null };
    }
  }
  
  /**
   * Teklif objesinden fiyatı çıkar
   */
  _extractPrice(offer) {
    if (!offer) return 0;
    
    // DEBUG: Log offers with collection offer detection
    const isCollectionOffer = offer.criteria?.encoded_token_ids === '*' || 
                             offer.protocol_data?.parameters?.consideration?.[0]?.itemType === 4;
    
    if (process.env.DEBUG_PRICE && offer.price?.value) {
      const weiValue = offer.price.value;
      const ethValue = parseFloat(weiValue) / 1e18;
      console.log('[DEBUG] _extractPrice called:', {
        weiValue: weiValue,
        ethValue: ethValue,
        isCollectionOffer: isCollectionOffer,
        orderHash: offer.order_hash?.substring(0, 10) + '...'
      });
    }
    
    // Farklı fiyat formatlarını kontrol et
    let price = 0;
    
    // 1. Standard price fields
    if (offer.price) {
      if (typeof offer.price === 'number') {
        price = offer.price;
      } else if (offer.price.value) {
        // value genellikle wei formatında gelir
        const value = parseFloat(offer.price.value);
        const decimals = offer.price.decimals || 18;
        price = value / Math.pow(10, decimals);
      } else if (offer.price.amount) {
        price = parseFloat(offer.price.amount);
      } else if (offer.price.eth) {
        price = parseFloat(offer.price.eth);
      } else if (offer.price.usd) {
        // USD fiyatı varsa tahmini ETH'e çevir (1 ETH ≈ 2500 USD varsayımı)
        price = parseFloat(offer.price.usd) / 2500;
      }
    } 
    
    // 2. Current price
    else if (offer.current_price) {
      price = parseFloat(offer.current_price);
    } 
    
    // 3. Base price
    else if (offer.base_price) {
      price = parseFloat(offer.base_price);
    } 
    
    // 4. Seaport order formatı
    else if (offer.protocol_data?.parameters?.offer?.[0]?.startAmount) {
      try {
        price = parseFloat(ethers.formatEther(offer.protocol_data.parameters.offer[0].startAmount));
      } catch (e) {
        price = parseFloat(offer.protocol_data.parameters.offer[0].startAmount) / 1e18;
      }
    }
    
    // 5. Direct parameters format
    else if (offer.parameters?.offer?.[0]?.startAmount) {
      try {
        price = parseFloat(ethers.formatEther(offer.parameters.offer[0].startAmount));
      } catch (e) {
        price = parseFloat(offer.parameters.offer[0].startAmount) / 1e18;
      }
    }
    
    // 6. Maker price
    else if (offer.maker_asset_bundle?.assets?.[0]?.token_price?.eth) {
      price = parseFloat(offer.maker_asset_bundle.assets[0].token_price.eth);
    }
    
    // Wei formatında ise ETH'e çevir (1000000'dan büyükse wei olabilir)
    if (price > 1000000) {
      price = price / 1e18;
    }
    
    // DEBUG: Log if we're returning an unexpected value
    if (Math.abs(price - 0.0534) < 0.0001 || Math.abs(price - 0.0536) < 0.0001) {
      console.log('[DEBUG] _extractPrice returning DOUBLED value:', price);
      console.log('[DEBUG] Offer structure:', {
        price: offer.price,
        current_price: offer.current_price,
        base_price: offer.base_price,
        protocol_offer: offer.protocol_data?.parameters?.offer?.[0]?.startAmount
      });
    }
    
    return price;
  }

  /**
   * Trait teklifleri al
   */
  async getTraitOffers(chain, collectionSlug, traitType, traitValue) {
    console.log(`Trait teklifleri alınıyor: ${collectionSlug} - ${traitType}:${traitValue}`);
    
    try {
      // Önce collection bilgilerini al
      const collectionInfo = await this.getCollectionInfo(collectionSlug);
      const contractAddress = collectionInfo.contractAddress;
      
      // OpenSea v2 API - Collection offers endpoint'ini kullan
      const response = await this.makeRequest('GET', `/api/v2/offers/collection/${collectionSlug}`, null, {
        chain: chain
      });
      
      console.log(`Koleksiyon teklifleri alındı, trait için filtreleniyor: ${traitType}:${traitValue}`);
      
      if (response && response.offers) {
        // Trait'e göre filtrele ve fiyata göre sırala
        const traitOffers = response.offers
          .filter(offer => {
            // Trait criteria kontrolü
            if (offer.criteria && offer.criteria.trait) {
              return offer.criteria.trait.type === traitType && 
                     offer.criteria.trait.value === traitValue;
            }
            // Protocol data içinde trait kontrolü
            if (offer.protocol_data && offer.protocol_data.parameters && 
                offer.protocol_data.parameters.consideration) {
              // Consideration içinde trait bilgisi olabilir
              // Bu kısım OpenSea'nin API formatına göre değişebilir
              return false;
            }
            return false;
          })
          .sort((a, b) => {
            const priceA = parseFloat(a.price?.value || a.price?.amount || a.current_price || a.price || 0);
            const priceB = parseFloat(b.price?.value || b.price?.amount || b.current_price || b.price || 0);
            return priceB - priceA; // Yüksekten düşüğe sırala
          });
        
        console.log(`${traitOffers.length} adet trait teklifi bulundu`);
        
        // Detaylı log
        if (traitOffers.length > 0) {
          console.log('En yüksek 3 trait teklifi:');
          traitOffers.slice(0, 3).forEach((offer, index) => {
            const price = offer.price?.value || offer.price?.amount || offer.current_price || offer.price || 0;
            const maker = offer.maker?.address || offer.protocol_data?.parameters?.offerer || 'Bilinmiyor';
            console.log(`${index + 1}. ${formatPrice(price)} WETH - Maker: ${maker.substring(0, 8)}...`);
          });
        }
        
        return { offers: traitOffers };
      }
      
      return { offers: [] };
    } catch (error) {
      console.error('Trait teklifleri alınırken hata:', error);
      return { offers: [] };
    }
  }

  /**
   * Koleksiyon teklifi oluştur (v2 API)
   */
  async createCollectionOffer(chain, collectionSlug, price, expirationTime) {
    // Abstract chain için collection slug düzeltmesi
    if (chain === 'abstract' && collectionSlug === 'abstract') {
      collectionSlug = 'pengztracted-abstract';
      console.log('Abstract collection slug düzeltildi: pengztracted-abstract');
    }
    
    console.log(`Koleksiyon teklifi oluşturuluyor: ${collectionSlug} - ${price} ETH`);
    
    // Test modunda sadece simülasyon yap
    if (config.testMode) {
      console.log('TEST MODU: Koleksiyon teklifi simüle ediliyor...');
      return {
        success: true,
        order_hash: `test-${Date.now()}`,
        message: 'Test mode - no real offer created'
      };
    }
    
    // Bakiye kontrolü yap
    console.log('\n💰 Bakiye kontrolü yapılıyor...');
    const balanceCheck = await this.checkSufficientBalance(price, '0.0015', chain);
    
    if (!balanceCheck.sufficient) {
      console.error('\n' + balanceCheck.message);
      throw new Error(`Yetersiz bakiye!\n${balanceCheck.message}`);
    }
    
    console.log(balanceCheck.message);
    
    // Abstract chain için direkt API v2 kullan
    if (chain === 'abstract') {
      console.log('🔄 Abstract chain - SDK desteklenmiyor, direkt API v2 kullanılıyor...');
      return this._createCollectionOfferWithAPI(chain, collectionSlug, price, expirationTime);
    }
    
    try {
      // SDK'nın yüklenmesini bekle
      if (!this.sdk) {
        console.log('SDK henüz hazır değil, bekleniyor...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!this.sdk) {
          throw new Error('OpenSea SDK başlatılamadı');
        }
      }
      
      console.log('OpenSea SDK ile koleksiyon teklifi oluşturuluyor...');
      
      // WETH adresi
      const wethAddress = config.wethAddresses[chain] || config.wethContractAddress;
      
      // Teklif parametreleri - SDK dokümantasyonuna göre güncellendi
      const offerParams = {
        collectionSlug: collectionSlug,
        accountAddress: config.walletAddress,
        amount: parseFloat(price), // ETH cinsinden (wei değil)
        quantity: 1,
        expirationTime: Math.floor(expirationTime / 1000),
        paymentTokenAddress: wethAddress,
        zone: config.getSeaportZone(chain) // Chain'e göre dinamik zone
      };
      
      // SDK ile teklif oluştur
      const offer = await this.sdk.createCollectionOffer(offerParams);
      
      console.log('Koleksiyon teklifi başarıyla oluşturuldu:', offer);
      
      return {
        success: true,
        order_hash: offer.orderHash || offer.hash,
        order: offer
      };
      
    } catch (error) {
      console.error('SDK ile koleksiyon teklifi oluşturma hatası:', error);
      
      // Abstract chain için SDK desteği yok, direkt fallback'e geç
      if (chain === 'abstract') {
        console.log('🔄 Abstract chain SDK desteklemiyor, özel API yöntemi kullanılıyor...');
        return this._createCollectionOfferWithAPI(chain, collectionSlug, price, expirationTime);
      }
      
      // Diğer chainler için normal fallback
      if (error.message.includes('SDK') || error.message.includes('Contract address') || error.code === 'NETWORK_ERROR') {
        console.log('SDK başarısız, alternatif yöntem deneniyor...');
        return this._createCollectionOfferWithAPI(chain, collectionSlug, price, expirationTime);
      }
      
      throw error;
    }
  }
  
  async _createCollectionOfferWithAPI(chain, collectionSlug, price, expirationTime) {
    // Mevcut API mantığını kullan
    return this._createCollectionOfferSimplified(chain, collectionSlug, price, expirationTime);
  }
  
  async _createCollectionOfferSimplified(chain, collectionSlug, price, expirationTime) {
    try {
      // Abstract chain için özel işlem
      if (chain === 'abstract') {
        console.log('🔗 Abstract chain için özel collection offer oluşturuluyor...');
        return this._createAbstractCollectionOffer(collectionSlug, price, expirationTime);
      }
      
      console.log('Direkt Seaport order oluşturuluyor...');
      
      // Seaport order parametreleri - SignedZone kullan
      const orderParameters = {
        offerer: config.walletAddress,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone - gas-free iptal için
        offer: [
          {
            itemType: 1, // ERC20
            token: config.getWethAddress(chain),
            identifierOrCriteria: "0",
            startAmount: ethers.parseEther(price.toString()).toString(),
            endAmount: ethers.parseEther(price.toString()).toString()
          }
        ],
        consideration: [],
        orderType: 2, // FULL_RESTRICTED - SignedZone için gerekli
        startTime: Math.floor(Date.now() / 1000).toString(),
        endTime: Math.floor(expirationTime / 1000).toString(),
        zoneHash: ethers.ZeroHash, // SignedZone için zero hash
        salt: ethers.hexlify(ethers.randomBytes(32)),
        conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
        totalOriginalConsiderationItems: 0,
        counter: "0"
      };
      
      // İmzala
      const signature = await this._signOrder(orderParameters, chain);
      
      // API için payload - sadece gerekli alanlar
      const payload = {
        criteria: {
          collection: {
            slug: collectionSlug
          }
        },
        protocol_data: {
          parameters: orderParameters,
          signature: signature
        },
        protocol_address: config.seaportAddress
      };
      
      return this.makeRequest('POST', `/api/v2/offers`, payload);
      
    } catch (error) {
      console.error('Direkt order oluşturma da başarısız:', error);
      
      // Son çare: OpenSea SDK formatını dene
      if (error.status === 400) {
        return this._tryOpenSeaSDKFormat(chain, collectionSlug, price, expirationTime);
      }
      
      throw error;
    }
  }
  
  /**
   * Abstract chain için özel collection offer sistemi
   */
  async _createAbstractCollectionOffer(collectionSlug, price, expirationTime) {
    try {
      console.log('📱 Abstract chain collection offer olusturuluyor...');
      console.log(`- Collection: ${collectionSlug}`);
      console.log(`- Price: ${price} WETH`);
      console.log(`- ExpirationTime (raw): ${expirationTime}`);
      console.log(`- Expiration: ${new Date(expirationTime).toLocaleString()}`);
      
      // Eğer expirationTime geçersizse varsayılan 15 dakika kullan
      if (!expirationTime || expirationTime < Date.now()) {
        expirationTime = Date.now() + 15 * 60 * 1000;
        console.log(`⚠️ Geçersiz expirationTime, varsayılan kullanılıyor: ${new Date(expirationTime).toLocaleString()}`);
      }
      
      // Abstract chain icin ozel wallet olustur
      const abstractProvider = await this.getProviderForChain('abstract');
      const abstractWallet = await this.getWalletForChain('abstract');
      
      // Seaport kontratından counter değerini al
      console.log('🔢 Counter değeri alınıyor...');
      const seaportContract = new ethers.Contract(
        config.seaportAddress,
        ['function getCounter(address) view returns (uint256)'],
        abstractProvider
      );
      
      let currentCounter;
      try {
        currentCounter = await seaportContract.getCounter(abstractWallet.address);
        console.log(`✅ Mevcut counter: ${currentCounter.toString()}`);
      } catch (error) {
        console.warn('⚠️ Counter alınamadı, varsayılan 0 kullanılıyor:', error.message);
        currentCounter = BigInt(0);
      }
      
      // Contract address - pengztracted koleksiyonu için sabit
      const contractAddress = '0xa6C46c07F7f1966D772E29049175EBBa26262513';
      
      // Seaport order parametreleri - Abstract chain özelleştirilmiş
      const orderParameters = {
        offerer: abstractWallet.address,
        zone: config.seaportZones.abstract,
        offer: [
          {
            itemType: 1, // ERC20 (WETH)
            token: config.wethAddresses.abstract,
            identifierOrCriteria: "0",
            startAmount: ethers.parseEther(price.toString()).toString(),
            endAmount: ethers.parseEther(price.toString()).toString()
          }
        ],
        consideration: [
          {
            itemType: 4, // ERC721_WITH_CRITERIA
            token: contractAddress,
            identifierOrCriteria: "0",
            startAmount: "1",
            endAmount: "1", 
            recipient: abstractWallet.address
          },
          // OpenSea fee
          {
            itemType: 1, // ERC20
            token: config.wethAddresses.abstract,
            identifierOrCriteria: "0",
            startAmount: (BigInt(ethers.parseEther(price.toString()).toString()) * BigInt(5) / BigInt(1000)).toString(), // 0.5% fee
            endAmount: (BigInt(ethers.parseEther(price.toString()).toString()) * BigInt(5) / BigInt(1000)).toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
          }
        ],
        orderType: 2, // FULL_RESTRICTED - zone kontrolü ile
        startTime: Math.floor(Date.now() / 1000).toString(),
        endTime: Math.floor(expirationTime / 1000).toString(),
        zoneHash: ethers.ZeroHash,
        salt: ethers.hexlify(
          ethers.concat([
            ethers.randomBytes(16),
            ethers.toBeHex(Date.now(), 16)
          ])
        ), // Benzersiz salt: random + timestamp
        conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e", // OpenSea conduit key for Abstract
        totalOriginalConsiderationItems: 2,
        counter: currentCounter.toString()
      };
      
      console.log('🔐 Abstract order imzalaniyor...');
      
      // Abstract için özel imzalama
      const signature = await this._signAbstractOrder(orderParameters, abstractWallet);
      
      console.log("📤 Abstract order OpenSea API'ye gonderiliyor...");
      
      // OpenSea API payload - Abstract format
      const payload = {
        criteria: {
          collection: {
            slug: collectionSlug
          }
          // contract alanı kaldırıldı - OpenSea API buna izin vermiyor
        },
        protocol_data: {
          parameters: orderParameters,
          signature: signature
        },
        protocol_address: config.seaportAddress
      };
      
      // Abstract chain header ekle
      const headers = {
        'X-Chain': 'abstract',
        'X-Chain-Id': '2741'
      };
      
      const result = await this.makeRequest('POST', `/api/v2/offers`, payload, headers);
      
      console.log('✅ Abstract collection offer basariyla olusturuldu!');
      return {
        success: true,
        order_hash: result.order_hash || `abstract-${Date.now()}`,
        order: result,
        chain: 'abstract'
      };
      
    } catch (error) {
      console.error('❌ Abstract collection offer hatasi:', error);
      
      // Test modu fallback
      if (config.testMode || error.message.includes('network')) {
        console.log('🔄 Abstract test modu - simulated order olusturuluyor...');
        return {
          success: true,
          order_hash: `abstract-test-${Date.now()}`,
          message: `Abstract chain collection offer simulated - ${collectionSlug} ${price} WETH`,
          chain: 'abstract'
        };
      }
      
      throw error;
    }
  }
  
  /**
   * Abstract chain için özel order imzalama
   */
  async _signAbstractOrder(orderParameters, wallet) {
    try {
      // EIP-712 domain - Abstract chain
      const domain = {
        name: 'Seaport',
        version: '1.6',
        chainId: 2741, // Abstract chain ID
        verifyingContract: config.seaportAddress
      };
      
      // Seaport order types - v1.6 compatible
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
      
      // İmzala
      const signature = await wallet.signTypedData(domain, types, orderParameters);
      
      console.log('✅ Abstract order basariyla imzalandi');
      return signature;
      
    } catch (error) {
      console.error('❌ Abstract order imzalama hatasi:', error);
      throw error;
    }
  }
  
  async _tryOpenSeaSDKFormat(chain, collectionSlug, price, expirationTime) {
    try {
      console.log('OpenSea SDK formatı deneniyor...');
      
      // Minimal format - sadece zorunlu alanlar
      const payload = {
        criteria: {
          collection: {
            slug: collectionSlug
          }
        },
        protocol_data: {
          seaport_offer: {
            itemType: 1,
            token: config.wethContractAddress,
            identifier: "0",
            amount: ethers.parseEther(price.toString()).toString()
          }
        }
      };
      
      return this.makeRequest('POST', `/api/v2/offers`, payload);
      
    } catch (error) {
      console.error('OpenSea SDK formatı da başarısız:', error);
      throw new Error('OpenSea API ile teklif oluşturulamadı. API formatı değişmiş olabilir.');
    }
  }
  
  async _createCollectionOfferOldFormat(chain, collectionSlug, price, expirationTime) {
    // Eski format - direkt Seaport order oluşturma - SignedZone kullan
    const orderParameters = {
      offerer: config.walletAddress,
      zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone - gas-free iptal için
      offer: [
        {
          itemType: 1, // ERC20
          token: config.wethContractAddress,
          identifierOrCriteria: "0",
          startAmount: ethers.parseEther(price.toString()).toString(),
          endAmount: ethers.parseEther(price.toString()).toString()
        }
      ],
      consideration: [],
      orderType: 2, // FULL_RESTRICTED
      startTime: Math.floor(Date.now() / 1000).toString(),
      endTime: Math.floor(expirationTime / 1000).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.toBigInt(ethers.randomBytes(32)).toString(),
      conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
      counter: "0"
    };
    
    const signature = await this._signOrder(orderParameters, chain);
    
    // Farklı endpoint'ler dene
    const endpoints = [
      `/api/v2/orders/${chain}/seaport/offers`,
      `/v2/orders/${chain}/seaport/offers`,
      `/api/v2/offers/${chain}`,
      `/v2/offers/${chain}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Endpoint deneniyor: ${endpoint}`);
        
        const data = {
          parameters: orderParameters,
          signature: signature,
          protocol_address: config.seaportAddress
        };
        
        return await this.makeRequest('POST', endpoint, data);
      } catch (err) {
        console.log(`${endpoint} başarısız:`, err.message);
        continue;
      }
    }
    
    throw new Error('Hiçbir endpoint çalışmadı');
  }

  /**
   * Criteria teklifi oluştur (trait bazlı)
   */
  async createCriteriaOffer(chain, collectionSlug, traitType, traitValue, price, expirationTime) {
    // createTraitOffer fonksiyonunu çağır (aynı işlevi görüyor)
    return this.createTraitOffer(chain, collectionSlug, traitType, traitValue, price, expirationTime);
  }
  
  /**
   * Trait teklifi oluştur
   */
  async createTraitOffer(chain, collectionSlug, traitType, traitValue, price, expirationTime) {
    // Abstract chain için collection slug düzeltmesi
    if (chain === 'abstract' && collectionSlug === 'abstract') {
      collectionSlug = 'pengztracted-abstract';
      console.log('Abstract collection slug düzeltildi: pengztracted-abstract');
    }
    
    console.log(`Trait teklifi oluşturuluyor: ${collectionSlug} - ${traitType}:${traitValue} - ${price} ETH`);
    
    // Test modunda sadece simülasyon yap
    if (config.testMode) {
      console.log('TEST MODU: Trait teklifi simüle ediliyor...');
      return {
        success: true,
        order_hash: `test-trait-${Date.now()}`,
        message: 'Test mode - no real offer created'
      };
    }
    
    // Bakiye kontrolü yap
    console.log('\n💰 Bakiye kontrolü yapılıyor...');
    const balanceCheck = await this.checkSufficientBalance(price, '0.0015', chain);
    
    if (!balanceCheck.sufficient) {
      console.error('\n' + balanceCheck.message);
      throw new Error(`Yetersiz bakiye!\n${balanceCheck.message}`);
    }
    
    console.log(balanceCheck.message);
    
    try {
      // SDK'nın yüklenmesini bekle
      if (!this.sdk) {
        console.log('SDK henüz hazır değil, bekleniyor...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!this.sdk) {
          throw new Error('OpenSea SDK başlatılamadı');
        }
      }
      
      console.log('OpenSea SDK ile trait teklifi oluşturuluyor...');
      
      // WETH adresi
      const wethAddress = config.wethAddresses[chain] || config.wethContractAddress;
      
      // Trait bazlı teklif için collection offer kullanıyoruz
      // SDK dokümantasyonuna göre trait parametreleri ekleniyor
      const offerParams = {
        collectionSlug: collectionSlug,
        accountAddress: config.walletAddress,
        amount: parseFloat(price), // ETH cinsinden (wei değil)
        quantity: 1,
        expirationTime: Math.floor(expirationTime / 1000),
        paymentTokenAddress: wethAddress,
        traitType: traitType,
        traitValue: traitValue,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100" // Seaport 1.6 zone - ZORUNLU
      };
      
      // SDK ile teklif oluştur - createCollectionOffer trait parametreleri ile
      const offer = await this.sdk.createCollectionOffer(offerParams);
      
      console.log('Trait teklifi başarıyla oluşturuldu:', offer);
      
      return {
        success: true,
        order_hash: offer.orderHash || offer.hash,
        order: offer
      };
      
    } catch (error) {
      console.error('SDK ile trait teklifi oluşturma hatası:', error);
      
      // Fallback: API ile dene
      console.log('SDK başarısız, API ile deneniyor...');
    }
    // OpenSea API v2 için trait offer formatı - /v2/offers/build endpoint'ine göre güncellendi
    // Sadece gerekli alanlar gönderiliyor
    const payload = {
      offerer: config.walletAddress,
      quantity: 1,
      criteria: {
        collection: {
          slug: collectionSlug
        },
        trait: {
          type: traitType,
          value: traitValue
        }
      },
      protocol_address: "0x00000000006687982678b03100b9bdc8be440814" // OpenSea'nin kabul ettiği protokol adresi
    };
    console.log('Gönderilen veri:', JSON.stringify(payload, null, 2));
    // OpenSea API v2'de trait-based offer oluşturma endpoint'i
    return this.makeRequest('POST', '/v2/offers/build', payload);
  }

  /**
   * Token teklifi oluştur (belirli bir NFT için)
   */
  async createTokenOffer(chain, contractAddress, tokenId, price, expirationTime, collectionSlug = null) {
    // Abstract chain için contract address kontrolü
    if (chain === 'abstract' && !contractAddress.startsWith('0x')) {
      // Eğer contract address değil de slug gelmişse düzelt
      if (contractAddress === 'abstract' || contractAddress === 'pengztracted') {
        contractAddress = '0xa6C46c07F7f1966D772E29049175EBBa26262513';
        console.log('Abstract contract address düzeltildi:', contractAddress);
      }
    }
    
    console.log(`Token teklifi oluşturuluyor: ${contractAddress} - Token ID: ${tokenId} - ${price} ETH`);
    console.log(`Chain: ${chain}`);
    
    // Abstract için direkt v2 API kullan (SDK conduit key sorunu var)
    // SDK atlatılıyor, direkt v2 API kullanılacak
    
    // DuplicateOrder hatalarını önlemek için v2 API kullan
    try {
      console.log('🆕 OpenSea v2 API ile token offer oluşturuluyor...');
      return await this.tokenOfferV2.createTokenOfferV2(contractAddress, tokenId, price, expirationTime, chain, collectionSlug);
    } catch (v2Error) {
      console.error('v2 API hatası:', v2Error.message);
      
      // Ethereum için SDK'ya düşme, direkt hata dön
      if (chain === 'ethereum') {
        console.log('❌ Ethereum için v2 API başarısız, SDK kullanılmıyor');
        throw new Error(`V2 API hatası: ${v2Error.message}`);
      }
      
      console.log('⚡ Yedek yöntem kullanılıyor...');
      // Diğer chainler için devam et ve eski yöntemi dene
    }
    
    // Test modunda sadece simülasyon yap
    if (config.testMode) {
      console.log('TEST MODU: Token teklifi simüle ediliyor...');
      return {
        success: true,
        order_hash: `test-token-${Date.now()}`,
        message: 'Test mode - no real offer created'
      };
    }
    
    // Chain değişimi gerekiyorsa önce yap
    if (chain !== this.currentChain) {
      console.log(`Chain değiştiriliyor: ${this.currentChain} -> ${chain}`);
      await this.switchChain(chain);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Chain değişimi için bekle
    }
    
    // Bakiye kontrolü yap
    console.log('\n💰 Bakiye kontrolü yapılıyor...');
    const balanceCheck = await this.checkSufficientBalance(price, '0.0015', chain);
    
    if (!balanceCheck.sufficient) {
      console.error('\n' + balanceCheck.message);
      throw new Error(`Yetersiz bakiye!\n${balanceCheck.message}`);
    }
    
    console.log(balanceCheck.message);
    
    // Abstract ağı için özel işlem
    if (chain === 'abstract') {
      console.log('🎯 Abstract ağı tespit edildi, özel token offer sistemi kullanılıyor...');
      
      try {
        // Abstract offer instance'ını yeniden kullan
        if (!this.abstractOfferInstances[chain]) {
          const AbstractTokenOffer = require('./abstractTokenOffer');
          this.abstractOfferInstances[chain] = new AbstractTokenOffer(this);
        }
        
        const abstractOffer = this.abstractOfferInstances[chain];
        
        const result = await abstractOffer.createOffer(
          contractAddress,
          tokenId,
          price,
          Math.floor((expirationTime - Date.now()) / 60000) // dakika cinsinden
        );
        
        return result;
      } catch (abstractError) {
        console.error('Abstract token offer hatası:', abstractError.message);
        throw abstractError;
      }
    }
    
    try {
      // SDK'nın yüklenmesini bekle
      if (!this.sdk) {
        console.log('SDK henüz hazır değil, bekleniyor...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!this.sdk) {
          throw new Error('OpenSea SDK başlatılamadı');
        }
      }
      
      // Direkt SDK kullan - en güvenilir yöntem
      console.log('🎯 SDK ile token offer oluşturuluyor...');
      
      try {
        // Contract address düzeltmesi
        let realContractAddress = contractAddress;
        if (!contractAddress.startsWith('0x')) {
          const collectionInfo = await this.getCollectionInfo(contractAddress);
          realContractAddress = collectionInfo.contractAddress;
        }
        
        // SDK üzerinden direkt offer - zone parametresiyle
        const expirationTimeInSeconds = Math.floor(expirationTime / 1000);
        console.log(`📅 Teklif bitiş zamanı: ${new Date(expirationTime).toLocaleString()} (${expirationTimeInSeconds} saniye)`);
        
        const result = await this.sdk.createOffer({
          asset: {
            tokenId: tokenId.toString(),
            tokenAddress: realContractAddress,
            schemaName: "ERC721"
          },
          accountAddress: config.walletAddress,
          startAmount: parseFloat(price),
          expirationTime: expirationTimeInSeconds,
          paymentTokenAddress: config.getWethAddress(chain),
          // Zone parametresi - ZORUNLU
          zone: "0x000056F7000000EcE9003ca63978907a00FFD100" // Seaport 1.6 zone
        });
        
        console.log('✅ Token offer başarıyla oluşturuldu (SDK)');
        return {
          success: true,
          order_hash: result.hash || result.orderHash || result.order_hash,
          order: result
        };
        
      } catch (advancedError) {
        console.log('AdvancedTokenOffer başarısız:', advancedError.message);
        
        // Basit SDK yöntemi
        try {
          console.log('\n🎯 Basit SDK yöntemi deneniyor...');
          
          let realContractAddress = contractAddress;
          if (!contractAddress.startsWith('0x')) {
            const collectionInfo = await this.getCollectionInfo(contractAddress);
            realContractAddress = collectionInfo.contractAddress;
          }
          
          // SDK üzerinden direkt offer - zone ile
          const result = await this.sdk.createOffer({
            asset: {
              tokenId: tokenId.toString(),
              tokenAddress: realContractAddress
            },
            accountAddress: config.walletAddress,
            startAmount: parseFloat(price),
            expirationTime: Math.floor(expirationTime / 1000), // Saniyeye çevir
            paymentTokenAddress: config.wethContractAddress,
            zone: "0x000056F7000000EcE9003ca63978907a00FFD100" // Seaport 1.6 zone - ZORUNLU
          });
          
          console.log('✅ Token offer başarıyla oluşturuldu (Basit SDK)');
          return {
            success: true,
            order_hash: result.hash || result.orderHash,
            order: result
          };
          
        } catch (sdkError) {
          console.log('Basit SDK yöntemi de başarısız:', sdkError.message);
        }
      }
      
      // Yedek: SDK ile zone kullanarak dene
      console.log('🎯 SDK ile zone parametreli token offer deneniyor...');
      
      // Contract address gerekli - eğer slug geliyorsa dönüştür
      let realContractAddress = contractAddress;
      if (!contractAddress.startsWith('0x')) {
        // Collection slug gelmiş, contract address'e dönüştür
        const collectionInfo = await this.getCollectionInfo(contractAddress);
        realContractAddress = collectionInfo.contractAddress;
        console.log(`Collection slug'dan contract address alındı: ${realContractAddress}`);
      }
      
      try {
        // Son deneme: SDK parametrelerini minimal tut
        const wethAddress = config.wethAddresses[chain] || config.wethContractAddress;
        
        const offerParams = {
          asset: {
            tokenId: tokenId.toString(),
            tokenAddress: realContractAddress,
            schemaName: "ERC721"
          },
          accountAddress: config.walletAddress,
          startAmount: parseFloat(price),
          expirationTime: Math.floor(expirationTime / 1000),
          paymentTokenAddress: wethAddress,
          zone: "0x000056F7000000EcE9003ca63978907a00FFD100" // Seaport 1.6 zone - ZORUNLU
        };
        
        const offer = await this.sdk.createOffer(offerParams);
        console.log('✅ Token offer başarıyla oluşturuldu (SDK - minimal parametreler)');
        return {
          success: true,
          order_hash: offer.orderHash || offer.hash,
          order: offer
        };
        
      } catch (finalError) {
        console.log('Son SDK denemesi de başarısız:', finalError.message);
        
        // Yedek: HybridFastOffer
        try {
          const HybridFastOffer = require('./hybridFastOffer');
          const fastOffer = new HybridFastOffer(this);
          
          const result = await fastOffer.createFastCounterBid(
            realContractAddress,
            tokenId,
            price
          );
          
          console.log('Token offer HybridFastOffer ile oluşturuldu (muhtemelen orderType 3)');
          return {
            success: true,
            order_hash: result.orderHash,
            order: result,
            warning: 'Bu teklif muhtemelen onchain iptal gerektirir'
          };
          
        } catch (hybridError) {
          console.log('HybridFastOffer da başarısız, SDK ile son deneme...', hybridError.message);
          
          // Son çare: SDK yöntemi
          const wethAddress = config.wethAddresses[chain] || config.wethContractAddress;
          
          const offerParams = {
            asset: {
              tokenId: tokenId.toString(),
              tokenAddress: realContractAddress
            },
            accountAddress: config.walletAddress,
            startAmount: parseFloat(price),
            expirationTime: Math.floor(expirationTime / 1000),
            paymentTokenAddress: wethAddress,
            zone: "0x000056F7000000EcE9003ca63978907a00FFD100" // Seaport 1.6 zone - ZORUNLU
          };
          
          const offer = await this.sdk.createOffer(offerParams);
          console.log('Token offer SDK ile oluşturuldu (orderType 3 - onchain iptal gerekli)');
          return {
            success: true,
            order_hash: offer.orderHash || offer.hash,
            order: offer,
            warning: 'Bu teklif onchain iptal gerektirir'
          };
        }
      }
      
    } catch (error) {
      console.error('SDK ile token teklifi oluşturma hatası:', error);
      
      // Fallback: API ile dene
      console.log('SDK başarısız, API ile deneniyor...');
      
      // API v2 yerine direk protocol data oluştur
      throw new Error('Token offer için SDK kullanın veya minimum fiyatı artırın (0.0019 ETH / 5 USD)');
    }
  }
  
  /**
   * Teklifi iptal et (v2 API)
   */
  async cancelOffer(chain, orderHash) {
    return this.makeRequest('POST', `/api/v2/offers/${orderHash}/cancel`, null, { chain });
  }
  
  /**
   * Contract address'ten collection slug al
   * @private
   */
  async _getCollectionSlugFromContract(contractAddress, chain = 'ethereum') {
    // Önce cache'i kontrol et
    const cacheKey = `${chain}_${contractAddress}`;
    if (this.contractToSlugCache && this.contractToSlugCache[cacheKey]) {
      return this.contractToSlugCache[cacheKey];
    }
    
    // Abstract için özel mapping
    if (chain === 'abstract') {
      const abstractMappings = {
        '0xa6c46c07f7f1966d772e29049175ebba26262513': 'pengztracted-abstract',
        // Diğer Abstract koleksiyonları buraya eklenebilir
      };
      
      const lowerContract = contractAddress.toLowerCase();
      if (abstractMappings[lowerContract]) {
        const slug = abstractMappings[lowerContract];
        
        // Cache'e kaydet
        if (!this.contractToSlugCache) {
          this.contractToSlugCache = {};
        }
        this.contractToSlugCache[cacheKey] = slug;
        
        return slug;
      }
    }
    
    try {
      // OpenSea API'den contract bilgilerini al
      const response = await this.makeRequest('GET', `/api/v2/chain/${chain}/contract/${contractAddress}`);
      
      if (response && response.collection) {
        const slug = response.collection.slug;
        
        // Cache'e kaydet
        if (!this.contractToSlugCache) {
          this.contractToSlugCache = {};
        }
        this.contractToSlugCache[cacheKey] = slug;
        
        return slug;
      }
      
      throw new Error('Collection slug bulunamadı');
    } catch (error) {
      console.error('Contract to slug dönüşümü hatası:', error);
      
      // Abstract için fallback
      if (chain === 'abstract') {
        // Contract'ın kısa versiyonunu slug olarak kullan
        const shortContract = contractAddress.substring(2, 10).toLowerCase();
        return `abstract-${shortContract}`;
      }
      
      // Diğer chainler için fallback - null dön, çağıran kod contract address kullanacak
      return null;
    }
  }

  async _signOrder(orderParameters, chainName) {
    // Chain'e göre RPC URL al
    const rpcUrl = config.getRpcUrl(chainName);
    
    // Provider ve wallet oluştur - ethers v6
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    // Tüm chainler için aynı Seaport adresi kullan
    const seaportAddress = config.seaportAddress;

    // EIP-712 domain
    const domain = {
      name: 'Seaport',
      version: '1.6',
      // Chain ID'yi config'den al
      chainId: config.getChainId(chainName),
      verifyingContract: seaportAddress // Chain'e göre Seaport contract address
    };

    // EIP-712 tipleri (Seaport OrderComponents'e göre)
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
      // ethers v6 için signTypedData kullan
      const signature = await wallet.signTypedData(domain, types, orderParameters);
      console.log('Oluşturulan İmza:', signature);
      return signature;
    } catch (error) {
      console.error('Sipariş imzalama hatası:', error);
      if (error.code === 'INVALID_ARGUMENT' && error.argument === 'value') {
        console.error('Detay: Muhtemelen orderParameters içindeki bir değer (örn: salt, counter) string olarak gönderiliyor ama uint256 bekleniyor. Kontrol edin.');
      }
      throw error;
    }
  }

  /**
   * Stream API ile koleksiyon tekliflerini izle
   */
  listenToCollectionOffers(chain, collectionSlug, callback) {
    try {
      console.log(`\n📡 ${collectionSlug} koleksiyonu için dinleyici başlatılıyor...`);
      console.log('Chain:', chain);
      
      // Chain'e göre doğru stream client'ı al
      const stream = this.getStreamForChain(chain);
      
      if (!stream) {
        console.error(`❌ ${chain} için stream client başlatılamadı!`);
        return;
      }
      
      const eventKey = `collection-offer-${chain}-${collectionSlug}`;
      
      // Duplicate kontrolü kaldırıldı - collectionMonitor kendi kontrolünü yapıyor
      
      // Abstract chain için özel handling
      if (chain === 'abstract') {
        console.log('🔷 Abstract chain için collection offer listener');
        
        // Abstract stream üzerinden dinle
        stream.on(`collection_offer_${collectionSlug}`, (event) => {
          console.log(`\n🎉 === ABSTRACT COLLECTION OFFER ALGILANDI ===`);
          console.log(`Collection: ${collectionSlug}`);
          console.log('Event data:', JSON.stringify(event, null, 2));
          
          const eventPayload = event.payload?.payload || event.payload || event;
          
          // Fiyatı al ve ETH'e çevir
          let priceInETH = 0;
          if (eventPayload.base_price || eventPayload.price) {
            try {
              const priceWei = eventPayload.base_price || eventPayload.price;
              priceInETH = parseFloat(ethers.formatEther(priceWei));
            } catch (e) {
              console.error('Fiyat dönüşüm hatası:', e);
              priceInETH = 0;
            }
          }
          
          const formattedEvent = {
            maker: eventPayload.offerer || eventPayload.maker?.address || eventPayload.maker,
            price: priceInETH,
            order_hash: eventPayload.order_hash || eventPayload.orderHash,
            event_timestamp: Date.now()
          };
          
          console.log('Formatted event:', formattedEvent);
          
          if (callback) {
            callback(formattedEvent);
          }
        });
        
        this.activeListeners[eventKey] = true;
        console.log(`✅ Abstract collection offer listener aktif: ${collectionSlug}`);
        return;
      }
      
      // Diğer chainler için normal sistem
      console.log(`📡 ${chain} için normal StreamAPIClient kullanılıyor`);
      console.log('Stream API durumu:', stream ? 'Mevcut' : 'YOK');
      
      console.log(`🎯 onCollectionOffer() subscription başlatılıyor...`);
      
      // Stream API ile collection offer olaylarını dinle
      stream.onCollectionOffer(collectionSlug, (event) => {
        console.log(`\n🎉 === YENİ KOLEKSİYON TEKLİFİ ALGILANDI ===`);
        console.log(`Koleksiyon: ${collectionSlug}`);
        console.log(`Zaman: ${new Date().toLocaleString()}`);
        
        // Event payload.payload formatında geliyor
        const eventData = event.payload?.payload || event.payload || event;
        
        // Event'in tüm alanlarını göster
        console.log('\n📊 Event Detayları:');
        console.log('- Maker:', eventData.maker?.address || 'YOK');
        console.log('- Price (Wei):', eventData.base_price || 'YOK');
        console.log('- Order Hash:', eventData.order_hash || 'YOK');
        console.log('- Timestamp:', eventData.event_timestamp || Date.now());
        
        // Event'i counter-bid için uygun formata dönüştür
        // base_price wei formatında string olarak geliyor, ETH'e çevir
        let priceInWei = eventData.base_price || '0';
        let priceInETH = 0;
        try {
          // Wei'den ETH'e çevir
          priceInETH = parseFloat(ethers.formatEther(priceInWei));
          console.log(`- Price (ETH): ${priceInETH} ETH`);
        } catch (e) {
          console.error('Fiyat dönüştürme hatası:', e);
          priceInETH = 0;
        }
        
        const formattedEvent = {
          maker: eventData.maker?.address,
          price: priceInETH, // ETH cinsinden fiyat
          priceWei: priceInWei, // Wei cinsinden fiyat
          order_hash: eventData.order_hash,
          event_timestamp: eventData.event_timestamp || new Date().toISOString(),
          event_timestamp: eventData.event_timestamp || Date.now(),
          fullPayload: event
        };
        
        console.log('\n🔄 Counter-bid için formatlanmış event:', JSON.stringify(formattedEvent, null, 2));
        
        if (callback) {
          callback(formattedEvent);
        }
      });
      
      this.activeListeners[eventKey] = true;
      console.log(`✅ ${chain}:${collectionSlug} için Stream API dinleyicisi BAŞARIYLA AKTİF!`);
      console.log('Aktif dinleyici sayısı:', Object.keys(this.activeListeners).length);
      console.log('Aktif dinleyiciler:', Object.keys(this.activeListeners));
      
    } catch (error) {
      console.error(`❌ Stream API başlatma hatası (collection):`, error);
      console.error('Hata stack:', error.stack);
    }
  }
  
  /**
   * Stream API ile trait tekliflerini izle
   */
  listenToTraitOffers(chain, collectionSlug, traitType, traitValue, callback) {
    try {
      console.log(`\n📡 ${collectionSlug} - ${traitType}:${traitValue} için dinleyici başlatılıyor...`);
      console.log('Chain:', chain);
      
      // Stream API kontrolü
      if (!this.stream) {
        console.error('❌ Stream API başlatılmamış!');
        return;
      }
      
      console.log('Stream API durumu:', this.stream ? 'Mevcut' : 'YOK');
      
      const eventName = `trait-offer`;
      const eventKey = `${eventName}-${collectionSlug}-${traitType}-${traitValue}`;
      
      if (this.activeListeners[eventKey]) {
        console.log(`⚠️ ${traitType}:${traitValue} için dinleyici zaten aktif.`);
        return;
      }
      
      console.log(`🎯 onEvents() subscription başlatılıyor (trait_offer filtresi ile)...`);
      
      // Stream API ile trait offer olaylarını dinle
      this.stream.onEvents(collectionSlug, ['trait_offer'], (event) => {
        console.log(`\n🎉 === TRAIT OFFER EVENT GELDİ ===`);
        console.log(`Koleksiyon: ${collectionSlug}`);
        console.log(`Event tipi: ${event.event_type}`);
        
        // Trait bilgilerini al
        let eventTraitType = null;
        let eventTraitValue = null;
        
        // payload.trait_criteria içinde trait bilgisi var
        if (event.payload && event.payload.trait_criteria) {
          eventTraitType = event.payload.trait_criteria.trait_type;
          eventTraitValue = event.payload.trait_criteria.trait_name;
          console.log(`Event trait: ${eventTraitType}:${eventTraitValue}`);
        }
        
        console.log(`Aranan trait: ${traitType}:${traitValue}`);
        
        // Event'in bizim trait'imizle ilgili olup olmadığını kontrol et
        if (eventTraitType === traitType && eventTraitValue === traitValue) {
          console.log(`\n✅ === BİZİM TRAIT'İMİZE YENİ TEKLİF GELDİ! ===`);
          console.log(`Koleksiyon: ${collectionSlug}`);
          console.log(`Trait: ${traitType}:${traitValue}`);
          console.log(`Zaman: ${new Date().toLocaleString()}`);
          
          // Event'in tüm alanlarını göster
          console.log('\n📊 Event Detayları:');
          console.log('- Maker:', event.payload?.maker?.address || 'YOK');
          console.log('- Order Hash:', event.payload?.order_hash || 'YOK');
          console.log('- Timestamp:', event.payload?.event_timestamp || Date.now());
          
          // Fiyat bilgisini al ve ETH'e çevir
          let priceInWei = event.payload?.base_price || '0';
          let priceInETH = 0;
          try {
            // Wei'den ETH'e çevir
            priceInETH = parseFloat(ethers.formatEther(priceInWei));
            console.log(`- Price: ${priceInWei} wei = ${formatPrice(priceInETH)} WETH`);
          } catch (e) {
            console.error('Fiyat dönüştürme hatası:', e);
            priceInETH = parseFloat(priceInWei);
          }
          
          // Protocol data'dan offerer bilgisini al
          const offerer = event.payload?.protocol_data?.parameters?.offerer || event.payload?.maker?.address;
          
          const formattedEvent = {
            payload: {
              protocol_data: {
                parameters: {
                  offerer: offerer
                }
              },
              price: priceInETH,
              order_hash: event.payload?.order_hash
            },
            price: priceInETH,
            order_hash: event.payload?.order_hash,
            event_timestamp: event.payload?.event_timestamp || Date.now()
          };
          
          console.log('\n🔄 Counter-bid için formatlanmış event');
          console.log(`- Teklif sahibi: ${offerer}`);
          console.log(`- Fiyat: ${formatPrice(priceInETH)} WETH`);
          console.log(`- Order hash: ${event.payload?.order_hash}`);
          
          if (callback) {
            callback(formattedEvent);
          }
        }
      });
      
      this.activeListeners[eventKey] = true;
      console.log(`✅ ${collectionSlug} - ${traitType}:${traitValue} için Stream API dinleyicisi BAŞARIYLA AKTİF!`);
      console.log('Aktif dinleyici sayısı:', Object.keys(this.activeListeners).length);
      console.log('Aktif dinleyiciler:', Object.keys(this.activeListeners));
      
    } catch (error) {
      console.error(`❌ Stream API başlatma hatası (trait):`, error);
      console.error('Hata stack:', error.stack);
    }
  }
  
  /**
   * Stream API ile item (token) tekliflerini izle
   */
  listenToItemOffers(chain, contractAddress, tokenId, callback) {
    try {
      console.log(`\n📡 ${contractAddress} #${tokenId} için Stream API dinleyicisi başlatılıyor...`);
      console.log('Chain:', chain);
      
      // Chain'e göre doğru stream client'ı al
      const stream = this.getStreamForChain(chain);
      console.log('Stream API durumu:', stream ? 'Mevcut' : 'YOK');
      
      const eventName = `item-received-offer`;
      const eventKey = `${eventName}-${contractAddress}-${tokenId}`;
      
      if (this.activeListeners[eventKey]) {
        console.log(`⚠️ Token #${tokenId} için dinleyici zaten aktif.`);
        return;
      }
      
      console.log(`🎯 onItemReceivedOffer() subscription başlatılıyor...`);
      console.log('Contract Address:', contractAddress);
      console.log('Token ID:', tokenId.toString());
      
      // Chain bilgisini logla
      console.log(`🔗 Token offer listener için chain: ${chain}`);
      
      // Contract address'ten collection slug'ı al
      this._getCollectionSlugFromContract(contractAddress, chain).then(collectionSlug => {
        // Collection slug kontrolü
        if (!collectionSlug) {
          console.error(`❌ ${contractAddress} için collection slug bulunamadı!`);
          // Contract address ile devam et
          collectionSlug = contractAddress;
        }
        
        console.log(`Collection slug bulundu: ${collectionSlug}`);
        
        // Stream API ile item offer olaylarını dinle - collection slug kullan
        // Chain'e göre doğru stream kullan
        if (!stream) {
          console.error('❌ Stream client bulunamadı!');
          return;
        }
        
        const listenerKey = stream.onItemReceivedOffer(collectionSlug, tokenId.toString(), (event) => {
        // Event yapısını sessizce işle
        const offerData = event.payload?.payload || event.payload || event;
        
        // Fiyat bilgisini al ve ETH'e çevir
        let priceInWei = offerData.base_price || '0';
        let priceInETH = 0;
        try {
          priceInETH = parseFloat(ethers.formatEther(priceInWei));
        } catch (e) {
          priceInETH = parseFloat(priceInWei);
        }
        
        // Offerer bilgisini al
        const offerer = offerData.maker?.address || offerData.protocol_data?.parameters?.offerer;
        const orderHash = offerData.order_hash || 'YOK';
        const orderType = offerData.protocol_data?.parameters?.orderType || 'YOK';
        
        const formattedEvent = {
          payload: {
            payload: {
              protocol_data: {
                parameters: {
                  offerer: offerer
                }
              },
              base_price: priceInWei,
              maker: { address: offerer },
              order_hash: orderHash
            }
          },
          price: priceInETH,
          order_hash: orderHash,
          event_timestamp: offerData.event_timestamp || Date.now(),
          token_id: tokenId,
          contract_address: contractAddress
        };
        
        if (callback) {
          callback(formattedEvent);
        }
      });
      
        this.activeListeners[eventKey] = listenerKey;
        console.log(`✅ ${contractAddress} #${tokenId} için Stream API dinleyicisi BAŞARIYLA AKTİF!`);
        console.log('Aktif dinleyici sayısı:', Object.keys(this.activeListeners).length);
        console.log('Aktif dinleyiciler:', Object.keys(this.activeListeners));
      }).catch(error => {
        console.error('Collection slug alınırken hata:', error.message);
        
        // Abstract için özel handling - collection slug'ı biliyoruz
        if (chain === 'abstract' && contractAddress.toLowerCase() === '0xa6c46c07f7f1966d772e29049175ebba26262513') {
          console.log('Abstract pengztracted collection için sabit slug kullanılıyor...');
          const collectionSlug = 'pengztracted-abstract';
          
          const listenerKey = this.stream.onItemReceivedOffer(collectionSlug, tokenId.toString(), (event) => {
            // Event yapısını sessizce işle
            const offerData = event.payload?.payload || event.payload || event;
            
            // Fiyat bilgisini al ve ETH'e çevir
            let priceInWei = offerData.base_price || '0';
            let priceInETH = 0;
            try {
              priceInETH = parseFloat(ethers.formatEther(priceInWei));
              console.log(`- Price: ${priceInWei} wei = ${formatPrice(priceInETH)} WETH`);
            } catch (e) {
              console.error('Fiyat dönüştürme hatası:', e);
              priceInETH = parseFloat(priceInWei);
            }
            
            const formattedEvent = {
              payload: {
                payload: {
                  protocol_data: {
                    parameters: {
                      offerer: offerData.maker?.address || offerData.protocol_data?.parameters?.offerer
                    }
                  },
                  base_price: priceInWei,
                  maker: { address: offerData.maker?.address || offerData.protocol_data?.parameters?.offerer },
                  order_hash: offerData.order_hash
                }
              },
              price: priceInETH,
              order_hash: offerData.order_hash,
              event_timestamp: offerData.event_timestamp || Date.now(),
              token_id: tokenId,
              contract_address: contractAddress
            };
            
            callback(formattedEvent);
          });
          
          this.activeListeners[eventKey] = listenerKey;
        } else {
          // Diğer chainler için
          console.log('Stream API desteği yok');
        }
      });
      
    } catch (error) {
      console.error(`❌ Stream API başlatma hatası (item):`, error);
      console.error('Hata stack:', error.stack);
    }
  }
  
  /**
   * Dinleyiciyi durdur
   */
  stopListener(eventKey) {
    if (this.activeListeners[eventKey]) {
      const listenerKey = this.activeListeners[eventKey];
      this.stream.unsubscribe(listenerKey);
      delete this.activeListeners[eventKey];
      console.log(`${eventKey} için dinleyici durduruldu.`);
    }
  }
  
  /**
   * Tüm dinleyicileri durdur
   */
  stopAllListeners() {
    Object.keys(this.activeListeners).forEach(eventKey => {
      delete this.activeListeners[eventKey];
    });
    console.log('Tüm dinleyiciler durduruldu.');
  }
}

module.exports = new OpenSeaAPI();
