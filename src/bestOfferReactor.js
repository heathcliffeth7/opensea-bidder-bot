const EventEmitter = require('events');
const { formatPrice } = require('../utils/helpers');
const config = require('../config');

/**
 * Best Offer Reactor - En yüksek tekliflere anında tepki veren sistem
 * Non-blocking ve yüksek performanslı
 */
class BestOfferReactor extends EventEmitter {
  constructor(api) {
    super();
    this.api = api;
    this.offerQueue = []; // Öncelikli kuyruk
    this.processing = false;
    this.activeOffers = new Map(); // TokenId -> offer bilgisi
    this.recentOffers = new Map(); // Son atılan teklifler (duplicate önleme)
    this.RECENT_OFFER_TTL = 30000; // 30 saniye
    
    // Performans metrikleri
    this.metrics = {
      totalReactions: 0,
      successfulOffers: 0,
      failedOffers: 0,
      averageResponseTime: 0,
      responseTimes: []
    };
    
    console.log('🚀 Best Offer Reactor başlatıldı');
    
    // Kuyruk işleyiciyi başlat
    this.startQueueProcessor();
  }
  
  /**
   * Best offer alındığında tetiklenir
   */
  async onBestOfferReceived(tokenId, contractAddress, currentBestOffer, task) {
    const startTime = Date.now();
    
    // Duplicate kontrolü
    const offerKey = `${contractAddress}-${tokenId}`;
    const lastOffer = this.recentOffers.get(offerKey);
    if (lastOffer && (Date.now() - lastOffer.timestamp < this.RECENT_OFFER_TTL)) {
      if (lastOffer.price >= currentBestOffer.price) {
        console.log(`⏭️ Token #${tokenId}: Son 30 saniye içinde daha yüksek teklif verilmiş, atlanıyor`);
        return;
      }
    }
    
    // Counterbid hesapla
    const counterbidPrice = currentBestOffer.price + task.settings.counterbidAmount;
    
    // Max price kontrolü
    if (counterbidPrice > task.settings.maxPrice) {
      console.log(`🚫 Token #${tokenId}: Counterbid (${formatPrice(counterbidPrice)}) max price'ı aşıyor`);
      return;
    }
    
    // Kuyruğa ekle - yüksek öncelikle
    const offerData = {
      tokenId,
      contractAddress,
      price: counterbidPrice,
      expirationTime: Date.now() + task.settings.offerTime,
      priority: 100, // Yüksek öncelik
      task,
      addedAt: Date.now(),
      currentBest: currentBestOffer.price
    };
    
    this.offerQueue.push(offerData);
    this.offerQueue.sort((a, b) => b.priority - a.priority);
    
    console.log(`\n⚡ BEST OFFER REAKSİYON:`);
    console.log(`Token #${tokenId}: ${formatPrice(currentBestOffer.price)} → ${formatPrice(counterbidPrice)} ETH`);
    console.log(`Kuyrukta bekleyen: ${this.offerQueue.length} teklif`);
    
    // İşlemi tetikle (non-blocking)
    this.processQueueImmediate();
    
    // Metrik güncelle
    const responseTime = Date.now() - startTime;
    this.updateMetrics('queued', responseTime);
  }
  
  /**
   * Kuyruk işleyiciyi başlat
   */
  startQueueProcessor() {
    setInterval(() => {
      if (!this.processing && this.offerQueue.length > 0) {
        this.processQueue();
      }
    }, 100); // Her 100ms'de kontrol et
  }
  
  /**
   * Kuyruğu hemen işle (non-blocking)
   */
  processQueueImmediate() {
    if (this.processing) return;
    
    // setImmediate ile ana thread'i bloklamadan işle
    setImmediate(() => this.processQueue());
  }
  
  /**
   * Kuyruğu işle
   */
  async processQueue() {
    if (this.processing || this.offerQueue.length === 0) return;
    
    this.processing = true;
    const startTime = Date.now();
    
    try {
      // Maksimum 10 teklifi paralel işle
      const batch = this.offerQueue.splice(0, 10);
      console.log(`\n🔄 ${batch.length} best offer counterbid işleniyor...`);
      
      // API key'lere göre dağıt
      const apiKeyBatches = [[], [], []];
      batch.forEach((offer, index) => {
        apiKeyBatches[index % 3].push(offer);
      });
      
      // Her API key için paralel işlem
      const promises = apiKeyBatches.map(async (keyBatch, keyIndex) => {
        if (keyBatch.length === 0) return [];
        
        const keyPromises = keyBatch.map(async (offer) => {
          try {
            // Chain kontrolü
            const chain = offer.task.settings.chain;
            if (chain !== this.api.currentChain) {
              await this.api.switchChain(chain);
            }
            
            // Teklif ver
            const result = await this.createQuickOffer(offer, keyIndex);
            
            if (result.success) {
              // Başarılı teklifi kaydet
              const offerKey = `${offer.contractAddress}-${offer.tokenId}`;
              this.recentOffers.set(offerKey, {
                price: offer.price,
                timestamp: Date.now(),
                orderHash: result.order_hash
              });
              
              console.log(`✅ Token #${offer.tokenId}: Counterbid başarılı (${formatPrice(offer.price)} ETH)`);
              this.updateMetrics('success', Date.now() - offer.addedAt);
            } else {
              console.log(`❌ Token #${offer.tokenId}: Counterbid başarısız - ${result.error}`);
              this.updateMetrics('failed', Date.now() - offer.addedAt);
            }
            
            return result;
          } catch (error) {
            console.error(`Token #${offer.tokenId} hata:`, error.message);
            this.updateMetrics('failed', Date.now() - offer.addedAt);
            return { success: false, error: error.message };
          }
        });
        
        return Promise.allSettled(keyPromises);
      });
      
      // Tüm işlemleri bekle
      await Promise.all(promises);
      
      const elapsed = Date.now() - startTime;
      console.log(`⏱️ Batch işlem süresi: ${elapsed}ms (${batch.length} teklif)`);
      
    } catch (error) {
      console.error('Best offer queue işleme hatası:', error);
    } finally {
      this.processing = false;
    }
  }
  
  /**
   * Hızlı teklif oluştur
   */
  async createQuickOffer(offerData, apiKeyIndex = 0) {
    const { tokenId, contractAddress, price, expirationTime, task } = offerData;
    
    try {
      // Abstract chain için özel işlem
      if (task.settings.chain === 'abstract') {
        // API key'i geçici olarak değiştir
        const originalApiKey = this.api.apiClient?.defaults?.headers['X-API-KEY'];
        if (config.apiKeys && config.apiKeys[apiKeyIndex]) {
          this.api.apiClient.defaults.headers['X-API-KEY'] = config.apiKeys[apiKeyIndex];
        }
        
        try {
          // Abstract offer instance kontrolü ve lazy initialization
          if (!this.api.abstractOfferInstances[task.settings.chain]) {
            const AbstractTokenOffer = require('./abstractTokenOffer');
            this.api.abstractOfferInstances[task.settings.chain] = new AbstractTokenOffer(this.api);
          }
          const abstractOffer = this.api.abstractOfferInstances[task.settings.chain];
          
          return await abstractOffer.createOffer(
            contractAddress,
            tokenId,
            price,
            Math.floor((expirationTime - Date.now()) / 60000) // Dakika cinsinden
          );
        } finally {
          // Original API key'i geri yükle
          if (originalApiKey) {
            this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
          }
        }
      } else {
        // Diğer chainler için normal token offer
        return await this.api.createTokenOffer(
          task.settings.chain,
          contractAddress,
          tokenId,
          price,
          expirationTime
        );
      }
    } catch (error) {
      console.error(`❌ Quick offer hatası (Token #${tokenId}):`, error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Metrikleri güncelle
   */
  updateMetrics(status, responseTime) {
    this.metrics.totalReactions++;
    
    if (status === 'success') {
      this.metrics.successfulOffers++;
    } else if (status === 'failed') {
      this.metrics.failedOffers++;
    }
    
    if (responseTime) {
      this.metrics.responseTimes.push(responseTime);
      // Son 100 response time'ı tut
      if (this.metrics.responseTimes.length > 100) {
        this.metrics.responseTimes.shift();
      }
      
      // Ortalama hesapla
      const sum = this.metrics.responseTimes.reduce((a, b) => a + b, 0);
      this.metrics.averageResponseTime = Math.round(sum / this.metrics.responseTimes.length);
    }
  }
  
  /**
   * Metrikleri göster
   */
  getMetrics() {
    const successRate = this.metrics.totalReactions > 0 
      ? (this.metrics.successfulOffers / this.metrics.totalReactions * 100).toFixed(2)
      : 0;
      
    return {
      ...this.metrics,
      successRate: `${successRate}%`,
      queueLength: this.offerQueue.length,
      activeOffers: this.activeOffers.size,
      recentOffers: this.recentOffers.size
    };
  }
  
  /**
   * Temizle
   */
  cleanup() {
    // Eski kayıtları temizle
    const now = Date.now();
    for (const [key, offer] of this.recentOffers.entries()) {
      if (now - offer.timestamp > this.RECENT_OFFER_TTL) {
        this.recentOffers.delete(key);
      }
    }
  }
}

module.exports = BestOfferReactor;