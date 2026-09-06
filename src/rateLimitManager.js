const EventEmitter = require('events');

/**
 * OpenSea API Rate Limit Yönetici
 * - API isteklerini kuyruğa alır
 * - Rate limit'leri takip eder
 * - Otomatik retry ve backoff
 */
class RateLimitManager extends EventEmitter {
  constructor() {
    super();
    
    // Rate limit ayarları
    this.limits = {
      // OpenSea API limitleri - 3 API key ile optimize edilmiş
      perSecond: 8,      // Saniyede max 8 istek (daha güvenli)
      perMinute: 300,    // Dakikada max 300 istek
      burst: 8           // Burst için max 8 istek
    };
    
    // İstek kuyruğu
    this.queue = [];
    this.processing = false;
    
    // Rate limit takibi
    this.requestCounts = {
      second: [],
      minute: []
    };
    
    // Backoff ayarları
    this.backoffMultiplier = 2;
    this.maxBackoffTime = 60000; // 60 saniye
    this.currentBackoff = 0;
    
    // API key rotasyonu
    this.apiKeys = [];
    this.currentKeyIndex = 0;
    
    // API key başına istek takibi
    this.apiKeyRequests = {}; // { apiKey: { minute: [] } }
    this.apiKeyLastUsed = {}; // { apiKey: timestamp } - Son kullanım zamanı
    this.apiKeyRequestCounts = {}; // { apiKey: totalCount } - Toplam istek sayacı
    this.apiKeyLimits = {
      perMinute: 80, // API key başına dakikada maksimum 80 istek
      minDelay: 125 // API key başına minimum 125ms gecikme (saniyede max 8 istek)
    };
    
    // İstatistikler
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      rateLimitHits: 0,
      errors: 0
    };
    
    // Yeni: İstek sayacı ve bekleme ayarları
    this.requestCounter = 0; // Toplam istek sayacı
    this.ethereumRequestCounter = 0; // Ethereum için ayrı sayaç
    this.REQUESTS_BEFORE_PAUSE = 10; // 10 istekten sonra bekle
    this.PAUSE_DURATION = 500; // 500ms bekleme
    this.ETHEREUM_PAUSE_DURATION = 1000; // Ethereum için 1 saniye bekleme
    
    console.log('🚦 Rate Limit Manager başlatıldı');
    console.log(`📊 Limitler: ${this.limits.perSecond}/saniye, ${this.limits.perMinute}/dakika`);
    console.log(`⏸️ Her ${this.REQUESTS_BEFORE_PAUSE} istekten sonra ${this.PAUSE_DURATION}ms bekleme`);
  }
  
  /**
   * API anahtarlarını ayarla
   */
  setApiKeys(keys) {
    this.apiKeys = keys.filter(k => k && !k.includes('YOUR_'));
    console.log(`🔑 ${this.apiKeys.length} API anahtarı yüklendi`);
  }
  
  /**
   * İstek ekle - PARALEL VERSİYON
   */
  async addRequest(requestFn, priority = 0, chain = null) {
    // Direkt çalıştır, kuyruk yok!
    return this.executeParallelRequest(requestFn, chain);
  }
  
  /**
   * Paralel istek çalıştır - KONTROLLÜ VERSİYON
   */
  async executeParallelRequest(requestFn, chain = null) {
    // İstek sayacını artır
    this.requestCounter++;
    
    // Tüm chainler için aynı işlem - Abstract gibi
    {
      // Her 10 istekten sonra bekle
      if (this.requestCounter % this.REQUESTS_BEFORE_PAUSE === 0) {
        console.log(`⏸️ ${this.requestCounter} istek yapıldı, ${this.PAUSE_DURATION}ms bekleniyor...`);
        await this.wait(this.PAUSE_DURATION);
      }
      
      // Mini gecikme - rate limit koruması
      await this.wait(50); // 50ms mini gecikme
    }
    
    // API key al - chain parametresi ile
    const apiKey = this.getNextApiKey(chain);
    
    // İstatistikleri güncelle (non-blocking)
    setTimeout(() => {
      this.updateRequestCounts();
      this.stats.totalRequests++;
    }, 0);
    
    try {
      // İsteği çalıştır
      const result = await requestFn(apiKey);
      
      // Başarı istatistiğini güncelle (non-blocking)
      setTimeout(() => {
        this.stats.successfulRequests++;
      }, 0);
      
      return result;
    } catch (error) {
      // Hata istatistiğini güncelle (non-blocking)
      setTimeout(() => {
        this.stats.errors++;
        if (error.response?.status === 429) {
          this.stats.rateLimitHits++;
          console.log(`⚠️ Rate limit uyarısı - API Key #${this.currentKeyIndex}`);
          
          // 429 hatası aldığımızda biraz daha bekle
          this.currentBackoff = Math.min(this.currentBackoff + 100, 1000);
        }
      }, 0);
      
      // 429 hatası ise ekstra bekleme
      if (error.response?.status === 429) {
        // Chain'e göre farklı bekleme süresi
        const waitTime = chain === 'ethereum' ? 10000 : 2000; // Ethereum: 10s, diğerleri: 2s
        console.log(`⏳ 429 hatası algılandı, ${waitTime/1000} saniye bekleniyor...`);
        await this.wait(waitTime);
        
        // Ethereum için progressive backoff
        if (chain === 'ethereum') {
          this.ethereumBackoffMultiplier = (this.ethereumBackoffMultiplier || 1) * 1.5;
          const additionalWait = Math.min(waitTime * this.ethereumBackoffMultiplier, 30000);
          console.log(`⏳ Ethereum progressive backoff: +${additionalWait/1000} saniye`);
          await this.wait(additionalWait);
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Kuyruğu işle
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      // Rate limit kontrolü
      if (await this.shouldWait()) {
        const waitTime = this.getWaitTime();
        console.log(`⏳ Rate limit - ${Math.ceil(waitTime/1000)}s bekleniyor...`);
        await this.wait(waitTime);
      }
      
      const request = this.queue.shift();
      
      try {
        // API key rotasyonu
        const apiKey = this.getNextApiKey();
        
        // İsteği çalıştır
        const result = await this.executeRequest(request, apiKey);
        
        // Başarılı
        this.stats.successfulRequests++;
        this.currentBackoff = 0;
        request.resolve(result);
        
      } catch (error) {
        // Hata yönetimi
        await this.handleError(error, request);
      }
      
      // İstek sayısını güncelle
      this.updateRequestCounts();
      
      // Küçük bekleme (burst koruması) - saniyede 10 istek için 100ms
      await this.wait(100);
    }
    
    this.processing = false;
  }
  
  /**
   * İsteği çalıştır
   */
  async executeRequest(request, apiKey) {
    this.stats.totalRequests++;
    
    try {
      // Request function'a API key'i parametre olarak geç
      const result = await request.fn(apiKey);
      return result;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Hata yönetimi
   */
  async handleError(error, request) {
    this.stats.errors++;
    
    // Rate limit hatası
    if (error.response?.status === 429) {
      this.stats.rateLimitHits++;
      
      const retryAfter = this.parseRetryAfter(error.response);
      const backoffTime = Math.max(retryAfter * 1000, this.currentBackoff);
      
      console.log(`🚫 Rate limit aşıldı! ${Math.ceil(backoffTime/1000)}s bekleniyor...`);
      
      // Backoff'u artır
      this.currentBackoff = Math.min(backoffTime * this.backoffMultiplier, this.maxBackoffTime);
      
      // Retry
      if (request.retries < request.maxRetries) {
        request.retries++;
        console.log(`🔄 Yeniden deneme ${request.retries}/${request.maxRetries}`);
        
        // Kuyruğun başına ekle (öncelikli)
        this.queue.unshift(request);
        
        // Bekleme süresi
        await this.wait(backoffTime);
      } else {
        request.reject(new Error('Max retry aşıldı: ' + error.message));
      }
      
    } else {
      // Diğer hatalar
      if (request.retries < request.maxRetries) {
        request.retries++;
        console.log(`⚠️ Hata: ${error.message} - Yeniden deneme ${request.retries}/${request.maxRetries}`);
        
        // Kuyruğa tekrar ekle
        this.queue.push(request);
        
        // Kısa bekleme
        await this.wait(1000 * request.retries);
      } else {
        request.reject(error);
      }
    }
  }
  
  /**
   * Rate limit kontrolü
   */
  async checkRateLimit(chain = null) {
    // Tüm chainler için aynı kontrol
    const now = Date.now();
    
    // Dakika limiti kontrolü
    const recentMinute = this.requestCounts.minute.filter(t => now - t < 60000);
    if (recentMinute.length >= this.limits.perMinute) {
      console.log(`⚠️ Rate limit yaklaşıyor: ${recentMinute.length}/${this.limits.perMinute} istek/dakika`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Minimal bekleme süresi - KONTROLLÜ MOD
   */
  getMinimalWaitTime() {
    // Rate limit koruması - minimum 50ms bekle
    return 50; // 429 hatalarını azaltmak için
  }
  
  /**
   * Rate limit kontrolü
   */
  async shouldWait(chain = null) {
    // Tüm chainler için aynı kontrol
    const now = Date.now();
    
    // Saniye limiti kontrolü
    const recentSecond = this.requestCounts.second.filter(t => now - t < 1000);
    if (recentSecond.length >= this.limits.perSecond) {
      return true;
    }
    
    // Dakika limiti kontrolü  
    const recentMinute = this.requestCounts.minute.filter(t => now - t < 60000);
    if (recentMinute.length >= this.limits.perMinute) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Bekleme süresini hesapla
   */
  getWaitTime() {
    const now = Date.now();
    
    // Saniye limiti
    const recentSecond = this.requestCounts.second.filter(t => now - t < 1000);
    if (recentSecond.length >= this.limits.perSecond) {
      const oldestInSecond = Math.min(...recentSecond);
      return Math.max(1000 - (now - oldestInSecond), 100);
    }
    
    // Dakika limiti
    const recentMinute = this.requestCounts.minute.filter(t => now - t < 60000);
    if (recentMinute.length >= this.limits.perMinute) {
      const oldestInMinute = Math.min(...recentMinute);
      return Math.max(60000 - (now - oldestInMinute), 1000);
    }
    
    return 100; // Varsayılan minimum bekleme
  }
  
  /**
   * İstek sayılarını güncelle
   */
  updateRequestCounts() {
    const now = Date.now();
    
    // Yeni isteği ekle
    this.requestCounts.second.push(now);
    this.requestCounts.minute.push(now);
    
    // Eski kayıtları temizle
    this.requestCounts.second = this.requestCounts.second.filter(t => now - t < 1000);
    this.requestCounts.minute = this.requestCounts.minute.filter(t => now - t < 60000);
  }
  
  /**
   * Retry-After header'ını parse et
   */
  parseRetryAfter(response) {
    const retryAfter = response.headers['retry-after'];
    if (retryAfter) {
      // Saniye olarak dön
      return parseInt(retryAfter) || 60;
    }
    
    // Rate limit mesajından süreyi çıkar
    const message = response.data?.detail || response.data?.message || '';
    const match = message.match(/(\d+)\s*second/i);
    if (match) {
      return parseInt(match[1]);
    }
    
    return 60; // Varsayılan 60 saniye
  }
  
  /**
   * Sonraki API key'i al - Dakikalık limit kontrolü ile (AGRESİF ROTASYON)
   */
  getNextApiKey(chain = null) {
    if (this.apiKeys.length === 0) {
      return null;
    }
    
    // Normal rotasyon (Abstract ve diğer chainler için) - HER ZAMAN ROTASYON YAP
    const currentIndex = this.currentKeyIndex;
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    
    const selectedKey = this.apiKeys[currentIndex];
    
    // İstek zamanını kaydet
    if (!this.apiKeyRequests[selectedKey]) {
      this.apiKeyRequests[selectedKey] = { minute: [] };
    }
    if (!this.apiKeyRequestCounts[selectedKey]) {
      this.apiKeyRequestCounts[selectedKey] = 0;
    }
    
    const now = Date.now();
    this.apiKeyRequests[selectedKey].minute.push(now);
    this.apiKeyLastUsed[selectedKey] = now; // Son kullanım zamanını güncelle
    this.apiKeyRequestCounts[selectedKey]++; // Toplam istek sayacını artır
    
    console.log(`🔑 API Key #${currentIndex + 1} seçildi (Toplam: ${this.apiKeyRequestCounts[selectedKey]} istek)`);
    
    return selectedKey;
  }
  
  /**
   * Bekleme fonksiyonu
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * İstatistikleri getir
   */
  getStats() {
    const successRate = this.stats.totalRequests > 0 
      ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2)
      : 0;
      
    return {
      ...this.stats,
      successRate: `${successRate}%`,
      queueLength: this.queue.length,
      currentBackoff: `${this.currentBackoff}ms`,
      apiKeyCount: this.apiKeys.length
    };
  }
  
  /**
   * Kuyruğu temizle
   */
  clearQueue() {
    const cleared = this.queue.length;
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    console.log(`🧹 ${cleared} istek temizlendi`);
  }
  
  /**
   * Acil durum - tüm işlemleri durdur
   */
  emergency() {
    console.log('🚨 ACİL DURUM - Tüm işlemler durduruluyor!');
    this.processing = false;
    this.clearQueue();
    this.currentBackoff = this.maxBackoffTime;
  }
  
  /**
   * Progressive backoff'u sıfırla
   */
  resetEthereumBackoff() {
    this.ethereumBackoffMultiplier = 1;
    console.log('✅ Ethereum progressive backoff sıfırlandı');
  }
}

module.exports = RateLimitManager;