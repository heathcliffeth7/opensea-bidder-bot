const EventEmitter = require('events');
const { formatPrice } = require('../utils/helpers');
const config = require('../config');

/**
 * Async Token Offer Manager - Tamamen paralel ve non-blocking token offer sistemi
 * Hiçbir işlem diğerini beklemez
 */
class AsyncTokenOfferManager extends EventEmitter {
  constructor(api) {
    super();
    this.api = api;
    this.activeRequests = new Map(); // Aktif istekleri takip
    this.completedRequests = new Map(); // Tamamlanan istekler
    this.requestCounter = 0;
    
    // API key havuzu yönetimi
    this.apiKeyPool = {
      keys: config.apiKeys || [config.apiKey],
      usage: new Array(config.apiKeys?.length || 1).fill(0),
      lastUsed: new Array(config.apiKeys?.length || 1).fill(0)
    };
    
    // Performans metrikleri
    this.metrics = {
      totalRequests: 0,
      activeRequests: 0,
      completedRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageTime: 0,
      requestsPerSecond: 0,
      startTime: Date.now()
    };
    
    // Metrik güncelleyici
    setInterval(() => this.updateMetrics(), 1000);
    
    console.log('⚡ Async Token Offer Manager başlatıldı');
    console.log(`🔑 ${this.apiKeyPool.keys.length} API key ile çalışıyor`);
  }
  
  /**
   * Toplu token offer - tamamen paralel
   */
  async fireAndForgetBulkOffers(tokens, task) {
    console.log(`\n🚀 ${tokens.length} token için paralel teklif başlatılıyor...`);
    const startTime = Date.now();
    
    // Her token için anında ve bağımsız olarak teklif başlat
    tokens.forEach((tokenData, index) => {
      // Her teklifi hemen başlat, hiçbirini bekleme
      this.fireAndForgetOffer(tokenData, task, index);
    });
    
    console.log(`✅ ${tokens.length} teklif ${Date.now() - startTime}ms'de başlatıldı`);
    console.log('📊 Teklifler arka planda işleniyor...');
    
    // İstatistikleri göster
    this.showStats();
  }
  
  /**
   * Tek token offer - fire and forget
   */
  fireAndForgetOffer(tokenData, task, index = 0) {
    const requestId = ++this.requestCounter;
    const apiKeyIndex = this.getOptimalApiKey();
    
    // İsteği kaydet
    this.activeRequests.set(requestId, {
      tokenId: tokenData.tokenId,
      startTime: Date.now(),
      apiKeyIndex
    });
    
    // Metrik güncelle
    this.metrics.totalRequests++;
    this.metrics.activeRequests = this.activeRequests.size;
    
    // Asenkron olarak işle - main thread'i bloklamadan
    setImmediate(async () => {
      try {
        const result = await this.processTokenOffer(tokenData, task, apiKeyIndex);
        
        // Başarılı
        this.handleSuccess(requestId, result);
      } catch (error) {
        // Hata
        this.handleError(requestId, error);
      }
    });
  }
  
  /**
   * Token offer'ı işle
   */
  async processTokenOffer(tokenData, task, apiKeyIndex) {
    const { tokenId, contractAddress } = tokenData;
    const { chain, minPrice, maxPrice, offerTime, counterbidEnabled, counterbidAmount } = task.settings;
    
    // API key'i geçici olarak değiştir
    const originalApiKey = this.api.apiClient?.defaults?.headers['X-API-KEY'];
    const selectedApiKey = this.apiKeyPool.keys[apiKeyIndex];
    
    try {
      // API key'i set et
      if (selectedApiKey && selectedApiKey !== originalApiKey) {
        this.api.apiClient.defaults.headers['X-API-KEY'] = selectedApiKey;
      }
      
      // Chain kontrolü - asenkron
      if (chain !== this.api.currentChain) {
        await this.api.switchChain(chain);
      }
      
      // Best offer kontrolü - paralel
      let offerPrice = minPrice;
      
      if (counterbidEnabled) {
        try {
          const bestOffer = await this.api.getBestOfferForNFT(chain, contractAddress, tokenId);
          if (bestOffer?.offer) {
            const bestPrice = this.api._extractPrice(bestOffer.offer);
            
            // Collection offer kontrolü
            if (bestOffer.offer.criteria?.encoded_token_ids === '*') {
              console.log(`📦 Token #${tokenId}: Collection offer bulundu: ${formatPrice(bestPrice)} ETH`);
              
              const calculatedPrice = bestPrice + counterbidAmount;
              
              if (calculatedPrice > maxPrice) {
                console.log(`❌ Token #${tokenId}: Counterbid (${formatPrice(calculatedPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor, atlanıyor`);
                return null; // Skip this token
              }
              
              offerPrice = calculatedPrice;
              console.log(`🎯 Token #${tokenId}: Collection offer'a counterbid: ${formatPrice(bestPrice)} → ${formatPrice(offerPrice)} ETH`);
            } else {
              // Gerçek token-specific offer
              const calculatedPrice = bestPrice + counterbidAmount;
              
              if (calculatedPrice > maxPrice) {
                console.log(`❌ Token #${tokenId}: Counterbid (${formatPrice(calculatedPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor, atlanıyor`);
                return null; // Skip this token
              }
              
              offerPrice = calculatedPrice;
              console.log(`🎯 Token #${tokenId}: Token-specific offer'a counterbid: ${formatPrice(bestPrice)} → ${formatPrice(offerPrice)} ETH`);
            }
            
            // Best offer reactor'ı da tetikle (non-blocking)
            if (this.api.bestOfferReactor) {
              setImmediate(() => {
                this.api.bestOfferReactor.onBestOfferReceived(
                  tokenId,
                  contractAddress,
                  { price: bestPrice, offer: bestOffer.offer },
                  task
                );
              });
            }
          }
        } catch (e) {
          // Best offer alınamazsa min price kullan
          console.log(`Token #${tokenId}: Best offer alınamadı, min price kullanılıyor`);
        }
      }
      
      // Teklif ver
      const expirationTime = Date.now() + offerTime;
      let result;
      
      if (chain === 'abstract') {
        // Abstract chain için özel işlem
        const abstractOffer = this.api.abstractOfferInstances[chain];
        if (!abstractOffer) {
          // Lazy initialization
          const AbstractTokenOffer = require('./abstractTokenOffer');
          this.api.abstractOfferInstances[chain] = new AbstractTokenOffer(this.api);
        }
        
        result = await this.api.abstractOfferInstances[chain].createOffer(
          contractAddress,
          tokenId,
          offerPrice,
          Math.floor(offerTime / 60000)
        );
      } else {
        // Normal chain
        result = await this.api.createTokenOffer(
          chain,
          contractAddress,
          tokenId,
          offerPrice,
          expirationTime
        );
      }
      
      return {
        ...result,
        tokenId,
        price: offerPrice,
        apiKeyUsed: apiKeyIndex
      };
      
    } finally {
      // Original API key'i geri yükle
      if (originalApiKey) {
        this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
      }
      
      // API key kullanımını güncelle
      this.apiKeyPool.usage[apiKeyIndex]++;
      this.apiKeyPool.lastUsed[apiKeyIndex] = Date.now();
    }
  }
  
  /**
   * En optimal API key'i seç
   */
  getOptimalApiKey() {
    let bestIndex = 0;
    let minScore = Infinity;
    
    for (let i = 0; i < this.apiKeyPool.keys.length; i++) {
      // Skor = kullanım sayısı + (son kullanımdan geçen süre / 1000)
      const timeSinceLastUse = (Date.now() - this.apiKeyPool.lastUsed[i]) / 1000;
      const score = this.apiKeyPool.usage[i] - timeSinceLastUse;
      
      if (score < minScore) {
        minScore = score;
        bestIndex = i;
      }
    }
    
    return bestIndex;
  }
  
  /**
   * Başarılı istek işle
   */
  handleSuccess(requestId, result) {
    const request = this.activeRequests.get(requestId);
    if (!request) return;
    
    const duration = Date.now() - request.startTime;
    
    // Aktif listeden kaldır, tamamlanan listeye ekle
    this.activeRequests.delete(requestId);
    this.completedRequests.set(requestId, {
      ...request,
      ...result,
      duration,
      success: true
    });
    
    // Metrikleri güncelle
    this.metrics.successfulRequests++;
    this.metrics.completedRequests++;
    this.metrics.activeRequests = this.activeRequests.size;
    
    console.log(`✅ Token #${result.tokenId}: Teklif başarılı (${formatPrice(result.price)} ETH) - ${duration}ms`);
    
    // Event emit et
    this.emit('offerCompleted', {
      success: true,
      tokenId: result.tokenId,
      price: result.price,
      duration,
      orderHash: result.order_hash
    });
  }
  
  /**
   * Hatalı istek işle
   */
  handleError(requestId, error) {
    const request = this.activeRequests.get(requestId);
    if (!request) return;
    
    const duration = Date.now() - request.startTime;
    
    // Aktif listeden kaldır
    this.activeRequests.delete(requestId);
    this.completedRequests.set(requestId, {
      ...request,
      duration,
      success: false,
      error: error.message
    });
    
    // Metrikleri güncelle
    this.metrics.failedRequests++;
    this.metrics.completedRequests++;
    this.metrics.activeRequests = this.activeRequests.size;
    
    console.log(`❌ Token #${request.tokenId}: Teklif başarısız - ${error.message} (${duration}ms)`);
    
    // Event emit et
    this.emit('offerCompleted', {
      success: false,
      tokenId: request.tokenId,
      error: error.message,
      duration
    });
  }
  
  /**
   * Metrikleri güncelle
   */
  updateMetrics() {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000; // saniye
    this.metrics.requestsPerSecond = (this.metrics.totalRequests / elapsed).toFixed(2);
    
    // Ortalama süre hesapla
    let totalDuration = 0;
    let count = 0;
    
    for (const [_, request] of this.completedRequests) {
      if (request.duration) {
        totalDuration += request.duration;
        count++;
      }
    }
    
    if (count > 0) {
      this.metrics.averageTime = Math.round(totalDuration / count);
    }
    
    // Eski tamamlanan istekleri temizle (bellek yönetimi)
    if (this.completedRequests.size > 1000) {
      const toDelete = this.completedRequests.size - 1000;
      let deleted = 0;
      
      for (const [id, _] of this.completedRequests) {
        if (deleted >= toDelete) break;
        this.completedRequests.delete(id);
        deleted++;
      }
    }
  }
  
  /**
   * İstatistikleri göster
   */
  showStats() {
    console.log('\n📊 === ASYNC MANAGER İSTATİSTİKLERİ ===');
    console.log(`Toplam istek: ${this.metrics.totalRequests}`);
    console.log(`Aktif istek: ${this.metrics.activeRequests}`);
    console.log(`Başarılı: ${this.metrics.successfulRequests}`);
    console.log(`Başarısız: ${this.metrics.failedRequests}`);
    console.log(`İstek/saniye: ${this.metrics.requestsPerSecond}`);
    console.log(`Ortalama süre: ${this.metrics.averageTime}ms`);
    
    // API key kullanım istatistikleri
    console.log('\n🔑 API Key Kullanımı:');
    this.apiKeyPool.keys.forEach((_, index) => {
      const usage = this.apiKeyPool.usage[index];
      const lastUsed = this.apiKeyPool.lastUsed[index];
      const timeSince = lastUsed ? `${((Date.now() - lastUsed) / 1000).toFixed(1)}s önce` : 'Kullanılmadı';
      console.log(`  Key #${index + 1}: ${usage} istek (son: ${timeSince})`);
    });
  }
  
  /**
   * Tüm aktif istekleri iptal et
   */
  cancelAll() {
    console.log(`⚠️ ${this.activeRequests.size} aktif istek iptal ediliyor...`);
    this.activeRequests.clear();
    this.metrics.activeRequests = 0;
  }
}

module.exports = AsyncTokenOfferManager;