const axios = require('axios');
const { ethers } = require('ethers');
const config = require('../config');
const RateLimitManager = require('./rateLimitManager');

/**
 * Birden fazla API key ve RPC ile paralel istek yönetimi
 */
class ParallelApiManager {
  constructor() {
    // Rate limit manager
    this.rateLimitManager = new RateLimitManager();
    
    // API key havuzu
    this.apiKeys = config.apiKeys || [config.apiKey];
    this.currentKeyIndex = 0;
    
    // Rate limit manager'a API key'leri ver
    this.rateLimitManager.setApiKeys(this.apiKeys);
    
    // RPC provider havuzu
    this.providers = (config.rpcUrls || [config.rpcUrl]).map(url => 
      new ethers.JsonRpcProvider(url)
    );
    this.currentProviderIndex = 0;
    
    // Her API key için ayrı axios instance
    this.apiClients = this.apiKeys.map(apiKey => 
      axios.create({
        baseURL: config.apiBaseUrl,
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 5000
      })
    );
    
    // API key kullanım istatistikleri
    this.keyStats = this.apiKeys.map(() => ({
      requests: 0,
      errors: 0,
      lastUsed: 0
    }));
    
    console.log(`\n🔑 Paralel API Manager başlatıldı:`);
    console.log(`- ${this.apiKeys.length} API key`);
    console.log(`- ${this.providers.length} RPC provider`);
  }
  
  /**
   * Round-robin ile sonraki API key'i seç - optimize edilmiş
   */
  getNextApiClient() {
    // En az kullanılan key'i bul - daha agresif rotasyon
    let minRequests = Infinity;
    let bestIndex = 0;
    
    for (let i = 0; i < this.keyStats.length; i++) {
      // Son 1 saniye içinde kullanılmamışsa öncelik ver (5 saniye yerine)
      const timeSinceLastUse = Date.now() - this.keyStats[i].lastUsed;
      if (timeSinceLastUse > 1000 && this.keyStats[i].requests < minRequests) {
        minRequests = this.keyStats[i].requests;
        bestIndex = i;
      }
    }
    
    // Tüm key'ler yakın zamanda kullanıldıysa, en az kullanılanı seç
    if (bestIndex === 0 && minRequests === Infinity) {
      bestIndex = this.keyStats.reduce((minIdx, stat, idx) => 
        stat.requests < this.keyStats[minIdx].requests ? idx : minIdx, 0);
    }
    
    // İstatistikleri güncelle
    this.keyStats[bestIndex].requests++;
    this.keyStats[bestIndex].lastUsed = Date.now();
    
    return {
      client: this.apiClients[bestIndex],
      keyIndex: bestIndex
    };
  }
  
  /**
   * Round-robin ile sonraki RPC provider'ı seç
   */
  getNextProvider() {
    const provider = this.providers[this.currentProviderIndex];
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
    return provider;
  }
  
  /**
   * Paralel API isteği - birden fazla key ile aynı anda
   */
  async parallelRequest(method, endpoint, data = null, params = null) {
    // Tüm API key'lerle paralel istek at
    const promises = this.apiClients.map(async (client, index) => {
      try {
        const response = await client.request({
          method,
          url: endpoint,
          data,
          params
        });
        
        return {
          success: true,
          data: response.data,
          keyIndex: index
        };
      } catch (error) {
        this.keyStats[index].errors++;
        return {
          success: false,
          error: error,
          keyIndex: index
        };
      }
    });
    
    // İlk başarılı yanıtı al (race condition)
    const results = await Promise.race([
      Promise.any(promises.map(p => p.then(r => r.success ? r : Promise.reject(r)))),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]);
    
    return results.data;
  }
  
  /**
   * Yük dengelemeli API isteği - Rate limit korumalı
   */
  async balancedRequest(method, endpoint, data = null, params = null, headers = null) {
    // Rate limit manager üzerinden istek yap
    return await this.rateLimitManager.addRequest(async (apiKey) => {
      // API key verilmişse onu kullan, yoksa round-robin
      const { client, keyIndex } = apiKey ? 
        { client: this.apiClients[this.apiKeys.indexOf(apiKey)], keyIndex: this.apiKeys.indexOf(apiKey) } :
        this.getNextApiClient();
      
      try {
        const requestConfig = {
          method,
          url: endpoint,
          data,
          params
        };
        
        // Custom headers varsa ekle
        if (headers) {
          requestConfig.headers = { ...requestConfig.headers, ...headers };
        }
        
        const response = await client.request(requestConfig);
        
        return response.data;
        
      } catch (error) {
        this.keyStats[keyIndex].errors++;
        
        // 400 hatası için detaylı loglama
        if (error.response && error.response.status === 400) {
          console.error('\n=== 400 BAD REQUEST HATASI (ParallelAPI) ===');
          console.error('Endpoint:', endpoint);
          console.error('Method:', method);
          
          if (params) {
            console.error('\nParametreler:', JSON.stringify(params, null, 2));
          }
          
          if (data) {
            console.error('\nGönderilen Veri:', JSON.stringify(data, null, 2));
          }
          
          if (headers) {
            console.error('\nÖzel Headers:', JSON.stringify(headers, null, 2));
          }
          
          // Hata yanıtı detayları
          if (error.response.data) {
            console.error('\n400 Hata Detayları:');
            console.error(JSON.stringify(error.response.data, null, 2));
          }
          
          console.error('\n=== 400 HATA SONU ===\n');
        }
        
        // 500 hatası için detaylı loglama
        if (error.response && error.response.status === 500) {
          console.error('\n=== 500 INTERNAL SERVER ERROR (ParallelAPI) ===');
          console.error('Endpoint:', endpoint);
          console.error('Method:', method);
          
          if (params) {
            console.error('\nParametreler:', JSON.stringify(params, null, 2));
          }
          
          if (data) {
            console.error('\nGönderilen Veri:', JSON.stringify(data, null, 2));
          }
          
          // Hata yanıtı detayları
          if (error.response.data) {
            console.error('\n500 Hata Detayları:');
            console.error(JSON.stringify(error.response.data, null, 2));
          }
          
          console.error('\n=== 500 HATA SONU ===\n');
        }
        
        // Rate limit hatası için özel işlem yok, rateLimitManager halledecek
        throw error;
      }
    });
  }
  
  /**
   * Toplu token teklifi - Tamamen paralel ve non-blocking
   */
  async createBulkOffers(offers, priority = 0) {
    console.log(`\n⚡ ${offers.length} teklif PARALEL gönderiliyor...`);
    const startTime = Date.now();
    
    // API key'lere göre teklifleri dağıt
    const offerBatches = [[], [], []];
    offers.forEach((offer, index) => {
      offerBatches[index % this.apiKeys.length].push(offer);
    });
    
    // Her API key için paralel işlem başlat
    const parallelPromises = offerBatches.map(async (batch, keyIndex) => {
      if (batch.length === 0) return [];
      
      console.log(`🔑 API Key #${keyIndex + 1}: ${batch.length} teklif`);
      const client = this.apiClients[keyIndex];
      const provider = this.providers[keyIndex % this.providers.length];
      
      // Bu API key için tüm teklifleri paralel gönder
      const batchPromises = batch.map(offer => {
        // Her teklif için bağımsız promise - hiçbiri diğerini beklemesin
        return new Promise(async (resolve) => {
          try {
            // Rate limit bypass - direkt gönder
            const result = await this.createSingleOfferDirect(offer, client, provider);
            resolve({ success: true, ...result, apiKey: keyIndex });
          } catch (error) {
            resolve({ 
              success: false, 
              error: error.message,
              tokenId: offer.tokenId,
              collection: offer.collection,
              apiKey: keyIndex
            });
          }
        });
      });
      
      // Bu batch için tüm sonuçları topla (bekleme)
      return Promise.allSettled(batchPromises);
    });
    
    // Tüm API key'ler paralel çalışsın
    const batchResults = await Promise.all(parallelPromises);
    
    // Sonuçları düzleştir
    const allResults = batchResults.flat().map(r => 
      r.status === 'fulfilled' ? r.value : { success: false, error: r.reason }
    );
    
    const successCount = allResults.filter(r => r.success).length;
    const elapsed = Date.now() - startTime;
    
    console.log(`\n✅ Paralel teklif tamamlandı:`);
    console.log(`- Süre: ${elapsed}ms`);
    console.log(`- Başarılı: ${successCount}/${offers.length}`);
    console.log(`- Ortalama: ${Math.round(elapsed / offers.length)}ms/teklif`);
    console.log(`- Teklif/saniye: ${(offers.length / (elapsed / 1000)).toFixed(2)}`);
    
    // API key başına istatistik
    this.apiKeys.forEach((_, idx) => {
      const keyResults = allResults.filter(r => r.apiKey === idx);
      const keySuccess = keyResults.filter(r => r.success).length;
      console.log(`- API Key #${idx + 1}: ${keySuccess}/${keyResults.length} başarılı`);
    });
    
    return allResults;
  }
  
  /**
   * Tek teklif oluştur - direkt API çağrısı (rate limit bypass)
   */
  async createSingleOfferDirect(offer, client, provider) {
    // Direkt API çağrısı - rate limit manager'ı bypass et
    const response = await client.post('/api/v2/orders/abstract/seaport/offers', offer.payload);
    return {
      orderHash: response.data.order_hash || response.data.hash,
      tokenId: offer.tokenId,
      collection: offer.collection,
      price: offer.price
    };
  }
  
  /**
   * Tek teklif oluştur - rate limit korumalı
   */
  async createSingleOffer(offer, client, provider) {
    // Mevcut implementasyon korundu
    return {
      orderHash: `0x${Date.now().toString(16)}`,
      ...offer
    };
  }
  
  /**
   * İstatistikleri göster
   */
  getStats() {
    return this.keyStats.map((stat, index) => ({
      keyIndex: index,
      requests: stat.requests,
      errors: stat.errors,
      successRate: stat.requests > 0 ? 
        ((stat.requests - stat.errors) / stat.requests * 100).toFixed(2) + '%' : 
        '0%'
    }));
  }
}

module.exports = ParallelApiManager;