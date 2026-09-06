/**
 * Batch Token Processor - Hızlı ve verimli token teklif işleyici
 * Rate limit'i aşmadan maksimum hızda çalışır
 */

const { formatPrice } = require('../utils/helpers');
const config = require('../config');
const axios = require('axios');
const EthereumWorkerPool = require('./ethereumWorkerPool');

class BatchTokenProcessor {
  constructor(api) {
    this.api = api;
    this.batchSize = 10; // Varsayılan batch boyutu (chain'e göre değişir)
    this.delayBetweenBatches = 1000; // Varsayılan batch arası bekleme
    this.delayBetweenTokens = 100; // Token'lar arası 100ms bekle (rate limit koruması)
    this.currentApiKeyIndex = 0; // API key rotasyonu için
    this.parallelApiManager = api.parallelApi; // Paralel API manager referansı
    
    // Ethereum için paralel axios instance'ları
    this.axiosInstances = null;
    
    // API key başına istek sayacı
    this.apiKeyRequestCounts = {}; // { apiKey: count }
    this.batchCount = 0; // Toplam batch sayacı
    
    // Ethereum için worker pool
    this.ethereumWorkerPool = null;
  }

  /**
   * Token listesini batch'ler halinde işle
   */
  async processBatch(task, tokens, contractAddress, offerTime) {
    const { chain, collection, minPrice, maxPrice, highOfferSkip, counterbidEnabled } = task.settings;
    const results = [];
    let processedCount = 0;
    this.batchStartTime = Date.now(); // Batch başlangıç zamanını kaydet
    
    // v2 API ile tüm chainler için paralel işlem güvenli
    console.log(`📊 Batch işlem başlatılıyor - Chain: ${chain}`);
    
    // Collection bilgisini batch başında bir kez çek
    let collectionInfo = null;
    let collectionSlug = collection; // Varsayılan olarak collection parametresini kullan
    
    if (chain !== 'abstract') { // Abstract için zaten sabit mapping var
      try {
        console.log(`\n🔍 Collection bilgisi alınıyor: ${collection}`);
        const startTime = Date.now();
        collectionInfo = await this.api.getCollectionInfo(collection);
        console.log(`✅ Collection bilgisi alındı (${Date.now() - startTime}ms)`);
        console.log(`Contract Address: ${collectionInfo.contractAddress}`);
        
        // Collection slug'ı belirle
        if (collectionInfo && collectionInfo.slug) {
          collectionSlug = collectionInfo.slug;
          console.log(`Collection Slug: ${collectionSlug}`);
        }
      } catch (error) {
        console.log(`⚠️ Collection bilgisi alınamadı, devam ediliyor: ${error.message}`);
      }
    }
    
    // Chain'e göre özel ayarlar
    if (chain === 'ethereum') {
      // Ethereum için WORKER POOL kullan
      console.log(`✨ ETHEREUM WORKER POOL AKTİF - ${config.apiKeys?.length || 1} paralel worker`);
      
      // Worker pool yoksa oluştur
      if (!this.ethereumWorkerPool) {
        this.ethereumWorkerPool = new EthereumWorkerPool(this.api);
      }
      
      // Worker pool ile işle
      const results = await this.ethereumWorkerPool.processTokens(tokens, task, contractAddress, offerTime, collection, collectionSlug);
      
      // Özet rapor
      const totalTime = Date.now() - this.batchStartTime;
      console.log(`\n🎯 === ETHEREUM WORKER POOL RAPORU ===`);
      console.log(`🚀 Toplam işlenen: ${tokens.length} token`);
      console.log(`⌚ Toplam süre: ${totalTime}ms`);
      console.log(`🌯 Token başına ortalama: ${(totalTime / tokens.length).toFixed(2)}ms`);
      
      return results;
    } else {
      // Abstract ve diğerleri için normal ayarlar
      this.batchSize = 10; // Abstract ve diğerleri için normal
      this.delayBetweenBatches = 1000; // Abstract için 1 saniye
      this.ethereumTokenDelay = 50; // Abstract için 50ms
      this.ethereumRequestDelay = 0; // Abstract için ekstra bekleme yok
    }
    this.ethereumRequestCounter = 0; // İstek sayacı
    
    console.log(`\n🚀 Batch Token Processor başlatıldı`);
    console.log(`Chain: ${chain}`);
    if (chain !== 'ethereum') {
      console.log(`Toplam token: ${tokens.length}, Batch boyutu: ${this.batchSize}`);
      console.log(`Batch sayısı: ${Math.ceil(tokens.length / this.batchSize)}`);
    }
    console.log(`⚡ ${chain === 'ethereum' ? 'Ethereum WORKER POOL' : 'ULTRA HIZLI'} MOD`);
    console.log(`API Key rotasyonu: ${config.apiKeys && config.apiKeys.length > 1 ? 'AÇIK' : 'KAPALI'}`);
    
    // Chain kontrolü ve değişimi
    if (chain !== this.api.currentChain) {
      console.log(`\n🔄 Chain değiştiriliyor: ${this.api.currentChain} -> ${chain}`);
      await this.api.switchChain(chain);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Chain değişimi için bekle
      console.log(`✅ Chain değiştirildi: ${chain}`);
    }
    
    // Axios instance oluşturma kaldırıldı - Fire & Forget kullanıyoruz
    
    // Token'ları batch'lere ayır
    for (let batchStart = 0; batchStart < tokens.length; batchStart += this.batchSize) {
      const batch = tokens.slice(batchStart, Math.min(batchStart + this.batchSize, tokens.length));
      const batchNumber = Math.floor(batchStart / this.batchSize) + 1;
      const totalBatches = Math.ceil(tokens.length / this.batchSize);
      
      console.log(`\n📦 Batch ${batchNumber}/${totalBatches} işleniyor (${batch.length} token)...`);
      
      // API key rotasyonu - her batch için farklı API key kullan (GARANTİ)
      if (config.apiKeys && config.apiKeys.length > 1) {
        // Batch numarasına göre API key seç - her batch farklı key kullanacak
        this.currentApiKeyIndex = (this.batchCount % config.apiKeys.length);
        this.batchCount++; // Batch sayacını artır
        
        const selectedApiKey = config.apiKeys[this.currentApiKeyIndex];
        console.log(`🔑 Batch ${batchNumber} için API Key #${this.currentApiKeyIndex + 1} kullanılıyor`);
        
        // API key başına istek sayacını güncelle
        if (!this.apiKeyRequestCounts[selectedApiKey]) {
          this.apiKeyRequestCounts[selectedApiKey] = 0;
        }
        this.apiKeyRequestCounts[selectedApiKey] += batch.length;
        
        console.log(`📊 API Key #${this.currentApiKeyIndex + 1} toplam istek: ${this.apiKeyRequestCounts[selectedApiKey]}`);
        
        // Ethereum için API key başına limit kontrolü - daha agresif
        if (chain === 'ethereum' && this.apiKeyRequestCounts[selectedApiKey] >= 30) {
          console.log(`⚠️ API Key #${this.currentApiKeyIndex + 1} limit yaklaşıyor (${this.apiKeyRequestCounts[selectedApiKey]} istek), 10 saniye ekstra bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          // API key sayacını sıfırla
          this.apiKeyRequestCounts[selectedApiKey] = 0;
        }
        
        // API client'ın header'ını güncelle
        if (this.api.apiClient) {
          this.api.apiClient.defaults.headers['X-API-KEY'] = selectedApiKey;
        }
      }
      
      // Tüm chainler için FIRE & FORGET sistemi
      console.log('🔥🔥🔥 GERÇEK FIRE & FORGET - Hiçbir şey beklenmeyecek!');
      console.log(`${batch.length} token için işlemler başlatılıyor...`);
      console.log(`Chain: ${chain} - Token arası gecikme: ${chain === 'ethereum' ? `${this.ethereumTokenDelay}ms` : '50ms'}`);
      
      const batchStartTime = Date.now();
      
      // Ethereum için daha kontrollü başlatma
      if (chain === 'ethereum') {
        // Ethereum için sequential başlatma - her token birbiri ardına
        batch.forEach((tokenId, index) => {
          const apiKeyIndex = index % 3; // 3 API key arasında dağıt
          const tokenDelay = this.ethereumTokenDelay * index; // Her token için artan gecikme
          
          setTimeout(() => {
            this._fireAndForgetTokenOffer(tokenId, task, contractAddress, offerTime, chain, collection, apiKeyIndex);
          }, tokenDelay);
        });
      } else {
        // Abstract ve diğerleri için paralel
        batch.forEach((tokenId, index) => {
          const apiKeyIndex = index % 3; // 3 API key arasında dağıt
          const tokenDelay = 50 * index; // Abstract: 50ms artan gecikme
          
          setTimeout(() => {
            this._fireAndForgetTokenOffer(tokenId, task, contractAddress, offerTime, chain, collection, apiKeyIndex);
          }, tokenDelay);
        });
      }
      
      console.log(`✅ ${batch.length} token ${Date.now() - batchStartTime}ms'de başlatıldı!`);
      
      console.log(`📊 Teklifler arka planda işleniyor...`);
      
      // Fire & forget olduğu için dummy sonuçlar dön
      const batchResults = batch.map(tokenId => ({
        tokenId,
        success: true,
        status: 'fire_and_forget',
        message: 'İşlem arka planda devam ediyor'
      }));
      
      results.push(...batchResults);
      
      // İstatistikleri göster (fire & forget olduğu için başlatılan sayıyı göster)
      processedCount += batch.length;
      
      console.log(`📊 Batch ${batchNumber}: ${batch.length} token işleme başlatıldı`);
      console.log(`Toplam ilerleme: ${processedCount}/${tokens.length} token başlatıldı`);
      
      // Sonraki batch'e geçmeden önce bekle - chain'e göre
      if (batchStart + this.batchSize < tokens.length) {
        let batchDelay = chain === 'ethereum' ? this.delayBetweenBatches : 1000; // Ethereum: 4s, Abstract: 1s
        
        // Ethereum için her 3 batch'te bir ekstra 3 saniye bekle
        if (chain === 'ethereum') {
          this.ethereumBatchCounter = (this.ethereumBatchCounter || 0) + 1;
          if (this.ethereumBatchCounter % 3 === 0) {
            console.log(`⏸️ 3 batch tamamlandı, ekstra 3 saniye bekleniyor...`);
            batchDelay += 3000; // 3 saniye ekstra
          }
        }
        
        console.log(`⏳ Sonraki batch için ${batchDelay/1000} saniye bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
    
    // Özet rapor
    const totalStartupTime = Date.now() - (this.batchStartTime || Date.now());
    console.log(`\n🔥 === GERÇEK FIRE & FORGET RAPORU ===`);
    console.log(`🚀 Toplam başlatılan: ${tokens.length} token`);
    console.log(`⚡ Batch sayısı: ${Math.ceil(tokens.length / this.batchSize)}`);
    console.log(`⏱️ TÜM İŞLEMLER BAŞLATILDI: ${totalStartupTime}ms`);
    console.log(`🎯 Token başına ortalama: ${(totalStartupTime / tokens.length).toFixed(2)}ms`);
    console.log(`\n📊 Teklifler arka planda paralel işleniyor...`);
    console.log(`💡 Her token bağımsız çalışıyor, best offer gelir gelmez teklif atılıyor!`)
    
    return results;
  }
  
  async _processToken(tokenId, task, contractAddress, offerTime, chain, collection) {
    const { minPrice, maxPrice, highOfferSkip, counterbidEnabled } = task.settings;
    
    try {
      // Token bilgilerini al
      const nftInfo = await this._getNFTInfo(chain, collection, tokenId);
      if (!nftInfo) {
        return { tokenId, success: false, error: 'Token bulunamadı' };
      }
      
      // En iyi teklifi kontrol et
      console.log(`🔍 Token #${tokenId} analiz ediliyor...`);
      const bestOffer = await this._getBestOffer(chain, collection, tokenId);
      
      // highOfferSkip kontrolü
      if (highOfferSkip && bestOffer && this._isOurOffer(bestOffer)) {
        console.log(`✓ Token #${tokenId}: En yüksek teklif bizde, atlanıyor`);
        return { tokenId, success: false, error: 'En yüksek teklif bizde' };
      }
      
      // Best offer varsa ve counterbid aktifse, HEMEN teklif at
      if (bestOffer && counterbidEnabled) {
        const bestPrice = this.api._extractPrice(bestOffer);
        const counterbidPrice = bestPrice + task.settings.counterbidAmount;
        
        console.log(`⚡ ANINDA COUNTERBID: Token #${tokenId}`);
        console.log(`   Mevcut: ${formatPrice(bestPrice)} → Yeni: ${formatPrice(counterbidPrice)} ETH`);
        
        // Max price kontrolü
        if (counterbidPrice > task.settings.maxPrice) {
          console.log(`   ❌ Max price aşıldı (${formatPrice(task.settings.maxPrice)}), teklif atılmıyor`);
          return { tokenId, success: false, error: 'Counterbid max price aşıyor' };
        }
        
        // HEMEN teklif at - kuyruk yok, bekleme yok
        const expirationTime = Date.now() + offerTime;
        const offerResult = await this._createOffer(
          chain,
          contractAddress || collection,
          tokenId,
          counterbidPrice,
          expirationTime
        );
        
        if (offerResult.success) {
          console.log(`   ✅ Counterbid başarılı: ${formatPrice(counterbidPrice)} ETH`);
          return {
            tokenId,
            success: true,
            price: counterbidPrice,
            orderHash: offerResult.order_hash,
            isCounterbid: true
          };
        } else {
          console.log(`   ❌ Counterbid başarısız: ${offerResult.error}`);
          return { tokenId, success: false, error: offerResult.error };
        }
      }
      
      // Mevcut tekliflerimizi kontrol et (Abstract için özellikle önemli)
      if (chain === 'abstract') {
        try {
          const existingOffers = await this.api.makeRequest('GET', `/api/v2/orders/${chain}/seaport/offers`, null, {
            asset_contract_address: contractAddress,
            token_ids: tokenId,
            maker: this.api.wallet.address || config.walletAddress
          });
          
          if (existingOffers && existingOffers.orders && existingOffers.orders.length > 0) {
            console.log(`⚠️ Token #${tokenId}: Bu token için zaten ${existingOffers.orders.length} aktif teklifimiz var`);
            console.log(`Mevcut teklif fiyatı: ${this.api._extractPrice(existingOffers.orders[0])} ETH`);
            return { tokenId, success: false, error: 'Bu token için zaten aktif teklif var' };
          }
        } catch (e) {
          console.log('Mevcut teklif kontrolü başarısız, devam ediliyor');
        }
      }
      
      // Token teklifleri için: En yüksek teklif max price'dan yüksekse hiç teklif verme
      if (task.settings.type === 'tokenoffer' && bestOffer) {
        let bestOfferPrice = 0;
        
        // Fiyat çıkarma
        if (this.api && this.api._extractPrice) {
          bestOfferPrice = this.api._extractPrice(bestOffer);
        } else {
          // Fallback
          if (bestOffer.price) {
            if (typeof bestOffer.price === 'number') {
              bestOfferPrice = bestOffer.price;
            } else if (bestOffer.price.amount) {
              bestOfferPrice = parseFloat(bestOffer.price.amount);
            } else if (bestOffer.price.eth) {
              bestOfferPrice = parseFloat(bestOffer.price.eth);
            } else if (bestOffer.price.value) {
              bestOfferPrice = parseFloat(bestOffer.price.value);
            }
          } else if (bestOffer.current_price) {
            bestOfferPrice = parseFloat(bestOffer.current_price);
          }
        }
        
        // Wei'den ETH'e çevir (eğer gerekiyorsa)
        if (bestOfferPrice > 1000000) {
          bestOfferPrice = bestOfferPrice / 1e18;
        }
        
        if (bestOfferPrice > task.settings.maxPrice) {
          console.log(`✓ Token #${tokenId}: En yüksek teklif (${formatPrice(bestOfferPrice)}) max price'ı (${formatPrice(task.settings.maxPrice)}) aşıyor, teklif verilmeyecek`);
          return { tokenId, success: false, error: 'En yüksek teklif max price\'ı aşıyor' };
        }
      }
      
      // Normal akış - counterbid yoksa min price kullan
      const offerPrice = this._calculateOfferPrice(task, bestOffer);
      
      // Teklif ver
      const expirationTime = Date.now() + offerTime;
      console.log(`💰 Token #${tokenId}: ${formatPrice(offerPrice)} ETH teklif veriliyor...`);
      
      const offerResult = await this._createOffer(
        chain, 
        contractAddress || collection, 
        tokenId, 
        offerPrice, 
        expirationTime
      );
      
      if (offerResult.success) {
        console.log(`✅ Token #${tokenId}: ${formatPrice(offerPrice)} ETH teklif verildi`);
        return { 
          tokenId, 
          success: true, 
          price: offerPrice,
          orderHash: offerResult.order_hash
        };
      } else {
        return { tokenId, success: false, error: offerResult.error };
      }
      
    } catch (error) {
      console.error(`❌ Token #${tokenId} hatası:`, error.message);
      return { tokenId, success: false, error: error.message };
    }
  }
  
  /**
   * Token'ı ultra hızlı asenkron işle - API key index ile
   */
  async _processTokenAsync(tokenId, task, contractAddress, offerTime, chain, collection, apiKeyIndex = 0) {
    const startTime = Date.now();
    
    // Fire & forget metodunu çağır - API key değişimi orada yapılacak
    this._fireAndForgetTokenOffer(tokenId, task, contractAddress, offerTime, chain, collection, apiKeyIndex);
    
    // Hemen dön - hiçbir şeyi bekleme!
    return {
      tokenId,
      success: true,
      status: 'fire_and_forget',
      apiKeyUsed: apiKeyIndex,
      message: 'İşlem arka planda devam ediyor'
    };
  }

  /**
   * GERÇEK Fire & Forget token offer - hiçbir şeyi bekleme!
   */
  async _fireAndForgetTokenOffer(tokenId, task, contractAddress, offerTime, chain, collection, apiKeyIndex = 0) {
    const { minPrice, maxPrice, highOfferSkip, counterbidEnabled, counterbidAmount } = task.settings;
    const startTime = Date.now();
    
    console.log(`🔥 Token #${tokenId}: Fire & Forget başlatıldı (API Key #${apiKeyIndex + 1})`);
    
    // API key değişimi için geçici değişken
    const originalApiKey = this.api.apiClient?.defaults?.headers['X-API-KEY'];
    const selectedApiKey = config.apiKeys?.[apiKeyIndex] || originalApiKey;
    
    // API key'i değiştir
    if (selectedApiKey && selectedApiKey !== originalApiKey) {
      this.api.apiClient.defaults.headers['X-API-KEY'] = selectedApiKey;
    }
    
    // Abstract chain için mevcut teklif kontrolü KALDIRILDI - rate limit koruması için
    // Fire & forget sisteminde gereksiz API çağrısı yapmıyoruz
    /*
    if (chain === 'abstract') {
      this.api.makeRequest('GET', `/api/v2/orders/${chain}/seaport/offers`, null, {
        asset_contract_address: contractAddress,
        token_ids: tokenId,
        maker: this.api.wallet?.address || config.walletAddress
      })
      .then(existingOffers => {
        if (existingOffers?.orders?.length > 0) {
          console.log(`⚠️ Token #${tokenId}: Zaten aktif teklif var, iptal`);
          // API key'i geri yükle
          if (originalApiKey && selectedApiKey !== originalApiKey) {
            this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
          }
          return;
        }
      })
      .catch(() => {}); // Hata olsa bile devam et
    }
    */
    
    // Best offer'ı DIREKT API'den al - fallback'siz, hızlı!
    const bestOfferUrl = `/api/v2/offers/collection/${collection}/nfts/${tokenId}/best`;
    
    // Direkt axios ile istek at - daha hızlı!
    const headers = {
      'X-API-KEY': selectedApiKey || config.apiKeys?.[apiKeyIndex] || config.apiKey,
      'Accept': 'application/json'
    };
    
    // Global rate limit koruması - Ethereum için
    if (chain === 'ethereum') {
      // Son istek zamanını kontrol et
      const now = Date.now();
      const lastRequestKey = `lastRequest_${apiKeyIndex}`;
      const lastRequest = this[lastRequestKey] || 0;
      const timeSinceLastRequest = now - lastRequest;
      
      // Minimum 200ms arayla istek at (saniyede max 5 istek per API key)
      const minDelay = 200;
      if (timeSinceLastRequest < minDelay) {
        const waitTime = minDelay - timeSinceLastRequest;
        console.log(`⏳ API Key #${apiKeyIndex + 1} için ${waitTime}ms bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Son istek zamanını güncelle
      this[lastRequestKey] = Date.now();
    }
    
    // Ethereum için her istek başına 150ms ekstra bekleme
    const requestDelay = chain === 'ethereum' && this.ethereumRequestDelay ? this.ethereumRequestDelay : 0;
    
    setTimeout(() => {
      axios.get(`https://api.opensea.io${bestOfferUrl}`, { 
        headers,
        timeout: 5000 // 5 saniye timeout
      })
      .then(response => {
        const bestOfferTime = Date.now() - startTime;
        console.log(`📊 Token #${tokenId}: Best offer ${bestOfferTime}ms'de geldi`);
        
        const bestOffer = response.data;
        
        // Best offer yoksa min price kullan
        if (!bestOffer || Object.keys(bestOffer).length === 0) {
          console.log(`💰 Token #${tokenId}: Best offer yok, min price kullanılıyor`);
        }
        // En yüksek teklif bizdeyse atla
        else if (highOfferSkip && this._isOurOffer(bestOffer)) {
          console.log(`✓ Token #${tokenId}: En yüksek teklif bizde, atlanıyor`);
          // API key'i geri yükle
          if (originalApiKey && selectedApiKey !== originalApiKey) {
            this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
          }
          return;
        }
        
        // Teklif fiyatını hesapla
        let offerPrice = minPrice;
        if (bestOffer && Object.keys(bestOffer).length > 0 && counterbidEnabled) {
          const bestPrice = this.api._extractPrice(bestOffer);
          if (bestPrice > 0) {
            // Collection offer kontrolü
            if (bestOffer.criteria?.encoded_token_ids === '*') {
              console.log(`📦 Token #${tokenId}: Collection offer bulundu: ${formatPrice(bestPrice)} ETH`);
              
              const calculatedPrice = bestPrice + counterbidAmount;
              
              if (calculatedPrice > maxPrice) {
                console.log(`❌ Token #${tokenId}: Counterbid (${formatPrice(calculatedPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor, atlanıyor`);
                // API key'i geri yükle
                if (originalApiKey && selectedApiKey !== originalApiKey) {
                  this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
                }
                return;
              }
              
              offerPrice = calculatedPrice;
              console.log(`⚡ Token #${tokenId}: Collection offer'a counterbid: ${formatPrice(bestPrice)} → ${formatPrice(offerPrice)} ETH`);
            } else {
              // Gerçek token-specific offer
              const calculatedPrice = bestPrice + counterbidAmount;
              
              if (calculatedPrice > maxPrice) {
                console.log(`❌ Token #${tokenId}: Counterbid (${formatPrice(calculatedPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor, atlanıyor`);
                // API key'i geri yükle
                if (originalApiKey && selectedApiKey !== originalApiKey) {
                  this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
                }
                return;
              }
              
              offerPrice = calculatedPrice;
              console.log(`⚡ Token #${tokenId}: Token-specific offer'a counterbid: ${formatPrice(bestPrice)} → ${formatPrice(offerPrice)} ETH`);
            }
          }
        }
        
        // TEKLİFİ ANINDA AT - direkt çalıştır!
        const expirationTime = Date.now() + offerTime;
        console.log(`🚀 Token #${tokenId}: Teklif atılıyor (${Date.now() - startTime}ms)`);
        
        // HEMEN teklif at - Fire & Forget
        this._createOffer(
          chain,
          contractAddress || collection,
          tokenId,
          offerPrice,
          expirationTime
        );
        
        const totalTime = Date.now() - startTime;
        console.log(`✅ Token #${tokenId}: ${formatPrice(offerPrice)} ETH teklif gönderildi - ${totalTime}ms`);
        
        // Fire & forget başarılı teklif için counter-bid listener callback
        if (task.settings.counterbidEnabled && task.onFireAndForgetSuccess) {
          console.log(`🎯 Fire & forget token #${tokenId} için counter-bid listener kuruluyor...`);
          task.onFireAndForgetSuccess(tokenId, offerPrice);
        }
        
        // API key'i geri yükle
        if (originalApiKey && selectedApiKey !== originalApiKey) {
          this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
        }
      })
      .catch(error => {
        // 404 hatası veya timeout = best offer yok, min price ile devam et
        if ((error.response && error.response.status === 404) || error.code === 'ECONNABORTED') {
          const reason = error.code === 'ECONNABORTED' ? 'timeout' : '404';
          console.log(`💰 Token #${tokenId}: Best offer yok (${reason}), min price ile teklif veriliyor`);
          
          // Min price ile teklif at - HEMEN
          const expirationTime = Date.now() + offerTime;
          
          // HEMEN teklif at - Fire & Forget
          this._createOffer(
            chain,
            contractAddress || collection,
            tokenId,
            minPrice,
            expirationTime
          );
          
          const totalTime = Date.now() - startTime;
          console.log(`✅ Token #${tokenId}: ${formatPrice(minPrice)} ETH (min price) teklif gönderildi - ${totalTime}ms`);
          
          // Fire & forget başarılı teklif için counter-bid listener callback
          if (task.settings.counterbidEnabled && task.onFireAndForgetSuccess) {
            console.log(`🎯 Fire & forget token #${tokenId} için counter-bid listener kuruluyor...`);
            task.onFireAndForgetSuccess(tokenId, minPrice);
          }
          
          // API key'i geri yükle
          if (originalApiKey && selectedApiKey !== originalApiKey) {
            this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
          }
        } else {
          console.error(`❌ Token #${tokenId} best offer hatası:`, error.message);
          // Best offer hatasında da API key'i geri yükle
          if (originalApiKey && selectedApiKey !== originalApiKey) {
            this.api.apiClient.defaults.headers['X-API-KEY'] = originalApiKey;
          }
        }
      });
    }, requestDelay); // Ethereum için 150ms, Abstract için 0ms bekleme
    
    // HEMEN DÖN - hiçbir şeyi bekleme!
    console.log(`⚡ Token #${tokenId}: İşlem arka planda devam ediyor...`);
  }

  /**
   * Ultra hızlı token işleme - best offer gelir gelmez teklif at
   */
  async _processTokenUltraFast(tokenId, task, contractAddress, offerTime, chain, collection) {
    // Fire & forget metodunu çağır
    this._fireAndForgetTokenOffer(tokenId, task, contractAddress, offerTime, chain, collection);
    
    // Hemen başarılı dön
    return {
      tokenId,
      success: true,
      status: 'processing',
      message: 'Fire & Forget - İşlem arka planda'
    };
  }

  /**
   * Hızlandırılmış token işleme - minimum kontrol, maksimum hız (ESKİ - KULLLANILMIYOR)
   */
  async _processTokenFast(tokenId, task, contractAddress, offerTime, chain, collection) {
    // Bu metod artık _processTokenUltraFast'ı çağırıyor
    return this._processTokenUltraFast(tokenId, task, contractAddress, offerTime, chain, collection);
  }

  /**
   * NFT bilgilerini al (cache'li)
   */
  async _getNFTInfo(chain, collection, tokenId) {
    try {
      // NFT bilgisi almak yerine sadece var olup olmadığını kontrol et
      // Bu daha az API çağrısı yapar
      return { exists: true };
    } catch (error) {
      if (error.message && (error.message.includes('bulunamadı') || error.message.includes('404'))) {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * En iyi teklifi al
   */
  async _getBestOffer(chain, collection, tokenId) {
    try {
      console.log(`📊 Token #${tokenId} için teklifler kontrol ediliyor...`);
      const bestOffer = await this.api.getBestOfferForNFT(chain, collection, tokenId);
      
      if (bestOffer && bestOffer.offer) {
        const price = this.api._extractPrice(bestOffer.offer);
        console.log(`🎯 En yüksek teklif: ${formatPrice(price)} ETH`);
        return bestOffer.offer;
      } else {
        console.log('⚪ Aktif teklif yok');
        return null;
      }
    } catch (error) {
      console.log(`⚠️ Teklif kontrol hatası: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Teklif fiyatını hesapla
   */
  _calculateOfferPrice(task, bestOffer) {
    console.log('\n📊 _calculateOfferPrice çağrıldı:');
    console.log(`- bestOffer: ${bestOffer ? 'VAR' : 'YOK'}`);
    console.log(`- minPrice: ${formatPrice(task.settings.minPrice)} ETH`);
    console.log(`- maxPrice: ${formatPrice(task.settings.maxPrice)} ETH`);
    console.log(`- counterbidAmount: ${formatPrice(task.settings.counterbidAmount)} ETH`);

    // En yüksek teklif yoksa min price'ı kullan
    if (!bestOffer) {
      console.log('💡 TEKLİF YOK - Min price kullanılıyor:', formatPrice(task.settings.minPrice));
      return task.settings.minPrice;
    }

    // En yüksek teklifi al
    let currentHighestOffer = this.api._extractPrice(bestOffer);
    console.log(`- _extractPrice ile fiyat: ${formatPrice(currentHighestOffer)} ETH`);

    // Counterbid kapalıysa sadece min price'ı kullan
    if (!task.settings.counterbidEnabled) {
      console.log('⚠️ COUNTERBID KAPALI - Min price kullanılıyor:', formatPrice(task.settings.minPrice));
      return task.settings.minPrice;
    }

    console.log(`\n🎯 EN YÜKSEK TEKLİF BULUNDU: ${formatPrice(currentHighestOffer)} ETH`);

    // Counterbid hesapla
    const newOffer = currentHighestOffer + task.settings.counterbidAmount;
    
    // Min ve max kontrolleri
    if (newOffer < task.settings.minPrice) {
      console.log(`⚠️ Counterbid (${formatPrice(newOffer)}) min fiyattan düşük, min fiyat kullanılıyor: ${formatPrice(task.settings.minPrice)}`);
      return task.settings.minPrice;
    }
    
    if (newOffer > task.settings.maxPrice) {
      console.log(`⚠️ Counterbid (${formatPrice(newOffer)}) max fiyatı aşıyor, teklif verilmeyecek`);
      return null;
    }

    console.log(`✅ COUNTERBID HESAPLANDI:`);
    console.log(`   Mevcut teklif: ${formatPrice(currentHighestOffer)} ETH`);
    console.log(`   + Counterbid: ${formatPrice(task.settings.counterbidAmount)} ETH`);
    console.log(`   = YENİ TEKLİF: ${formatPrice(newOffer)} ETH`);
    
    return newOffer;
  }
  
  /**
   * Teklif bizim mi kontrol et
   */
  _isOurOffer(offer) {
    if (!offer) return false;
    
    const ourAddress = this.api.walletAddress?.toLowerCase();
    if (!ourAddress) return false;
    
    // Offerer kontrolü
    if (offer.maker && offer.maker.address) {
      return offer.maker.address.toLowerCase() === ourAddress;
    }
    
    if (offer.offerer) {
      return offer.offerer.toLowerCase() === ourAddress;
    }
    
    if (offer.protocol_data && offer.protocol_data.parameters && offer.protocol_data.parameters.offerer) {
      return offer.protocol_data.parameters.offerer.toLowerCase() === ourAddress;
    }
    
    return false;
  }
  
  /**
   * Ethereum için paralel batch işleme
   */
  async processParallelBatch(tokens, task, contractAddress, offerTime, chain, collection, collectionInfo = null) {
    const { minPrice, maxPrice, highOfferSkip, counterbidEnabled, counterbidAmount } = task.settings;
    
    // Collection slug'ı collectionInfo'dan al (varsa)
    const collectionSlug = collectionInfo?.slug || collection;
    
    console.log(`\n🚀 PARALEL BATCH İŞLEME BAŞLADI - ${tokens.length} token`);
    console.log('📊 3 API key ile eşzamanlı çalışacak');
    
    // Ethereum için istek sayacı
    this.ethereumParallelCounter = 0;
    
    // Her token için promise oluştur - STAGGERED START ile
    // Ethereum için optimizasyon: 10 token = 1 saniye (Abstract etkilenmeyecek)
    const staggerDelay = chain === 'ethereum' ? 100 : 50; // Ethereum: 100ms, diğerleri: 50ms
    console.log(`⏱️  Staggered start: Her token ${staggerDelay}ms arayla başlayacak`);
    
    if (chain === 'ethereum') {
      console.log(`🏁 Ethereum için optimize edildi: ${tokens.length} token ~${(tokens.length * staggerDelay) / 1000} saniyede başlayacak`);
      console.log(`🔄 Her 10 istekten sonra 1 saniye ekstra bekleme olacak`);
    }
    
    const promises = tokens.map((tokenId, index) => {
      const apiKeyIndex = index % 3; // 3 API key arasında dağıt
      const axiosInstance = this.axiosInstances[apiKeyIndex];
      
      // API key başına istek sayacını artır
      const apiKey = axiosInstance.defaults.headers['X-API-KEY'];
      this.apiKeyRequestCounts[apiKey] = (this.apiKeyRequestCounts[apiKey] || 0) + 1;
      
      // Staggered start - her token biraz gecikmeyle başlasın
      return new Promise((resolve) => {
        setTimeout(async () => {
          // Ethereum için her 10 istekten sonra 1 saniye bekle
          if (chain === 'ethereum') {
            this.ethereumParallelCounter++;
            if (this.ethereumParallelCounter % 10 === 0) {
              console.log(`⏸️ Ethereum paralel: ${this.ethereumParallelCounter} istek yapıldı, 1 saniye bekleniyor...`);
              await new Promise(res => setTimeout(res, 1000));
            }
          }
          
          // Her token için bağımsız işlem
          this._processTokenParallel(
            tokenId, 
            task, 
            contractAddress, 
            offerTime, 
            chain, 
            collection, 
            apiKeyIndex,
            axiosInstance,
            collectionSlug // Collection slug'ı geçir
          ).then(resolve)
          .catch(error => {
            console.error(`❌ Token #${tokenId} paralel işlem hatası:`, error.message);
            resolve({ tokenId, success: false, error: error.message });
          });
        }, index * staggerDelay); // Her token için artan gecikme
      });
    });
    
    // Tüm promise'leri paralel başlat
    const results = await Promise.allSettled(promises);
    
    // Sonuçları logla
    const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.length - successful;
    
    console.log(`\n📊 Paralel Batch Sonucu:`);
    console.log(`✅ Başarılı: ${successful}`);
    console.log(`❌ Başarısız: ${failed}`);
    
    return results;
  }
  
  /**
   * Paralel token işleme - Ethereum için
   */
  async _processTokenParallel(tokenId, task, contractAddress, offerTime, chain, collection, apiKeyIndex, axiosInstance, collectionSlug = null) {
    const { minPrice, maxPrice, highOfferSkip, counterbidEnabled, counterbidAmount } = task.settings;
    const startTime = Date.now();
    
    console.log(`🔥 Token #${tokenId}: Paralel işlem başladı (API Key #${apiKeyIndex + 1})`);
    
    try {
      // 1. Best offer'ı paralel al
      const bestOfferUrl = `/api/v2/offers/collection/${collection}/nfts/${tokenId}/best`;
      let bestOffer = null;
      let offerPrice = minPrice;
      
      try {
        const response = await axiosInstance.get(bestOfferUrl);
        bestOffer = response.data;
        
        if (bestOffer && Object.keys(bestOffer).length > 0) {
          console.log(`✅ Token #${tokenId}: Best offer alındı (${Date.now() - startTime}ms)`);
          
          // High offer skip kontrolü
          if (highOfferSkip && this._isOurOffer(bestOffer)) {
            console.log(`⏭️ Token #${tokenId}: En yüksek teklif bizde, atlanıyor`);
            return { tokenId, success: false, error: 'En yüksek teklif bizde' };
          }
          
          // Counterbid hesapla
          if (counterbidEnabled) {
            const bestPrice = this.api._extractPrice(bestOffer);
            
            // Collection offer kontrolü
            if (bestOffer.criteria?.encoded_token_ids === '*') {
              console.log(`📦 Token #${tokenId}: Collection offer bulundu: ${formatPrice(bestPrice)} ETH`);
              
              const calculatedPrice = bestPrice + counterbidAmount;
              
              if (calculatedPrice > maxPrice) {
                console.log(`❌ Token #${tokenId}: Counterbid (${formatPrice(calculatedPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor`);
                return { tokenId, success: false, error: 'Max price aşıldı' };
              }
              
              offerPrice = calculatedPrice;
              console.log(`💰 Token #${tokenId}: Collection offer'a counterbid: ${formatPrice(bestPrice)} → ${formatPrice(offerPrice)} ETH`);
            } else {
              // Gerçek token-specific offer
              const calculatedPrice = bestPrice + counterbidAmount;
              
              if (calculatedPrice > maxPrice) {
                console.log(`❌ Token #${tokenId}: Counterbid (${formatPrice(calculatedPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor`);
                return { tokenId, success: false, error: 'Max price aşıldı' };
              }
              
              offerPrice = calculatedPrice;
              console.log(`💰 Token #${tokenId}: Token-specific offer'a counterbid: ${formatPrice(bestPrice)} → ${formatPrice(offerPrice)} ETH`);
            }
          }
        } else {
          console.log(`⚪ Token #${tokenId}: Best offer yok, min price kullanılıyor`);
        }
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`⚪ Token #${tokenId}: Best offer yok (404), min price kullanılıyor`);
        } else {
          throw error;
        }
      }
      
      // 2. Hemen create offer - ASENKRON ÇALIŞTIR
      console.log(`🚀 Token #${tokenId}: Teklif oluşturuluyor (${Date.now() - startTime}ms)`);
      
      // Teklifi asenkron at ama sonucu bekle (paralel işlem için)
      const offerPromise = this.api.createTokenOffer(
        chain,
        contractAddress || collection,
        tokenId,
        offerPrice,
        Date.now() + offerTime,
        collectionSlug // Collection slug'ı geçir
      );
      
      // Hızlı sonuç için direkt dön
      const result = await offerPromise;
      
      const totalTime = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Token #${tokenId}: ${formatPrice(offerPrice)} ETH - ${totalTime}ms'de tamamlandı`);
        
        // Counter-bid listener callback
        if (counterbidEnabled && task.onFireAndForgetSuccess) {
          task.onFireAndForgetSuccess(tokenId, offerPrice);
        }
        
        return { tokenId, success: true, price: offerPrice, time: totalTime };
      } else {
        console.log(`❌ Token #${tokenId}: Teklif başarısız - ${result.error || 'Bilinmeyen hata'}`);
        return { tokenId, success: false, error: result.error };
      }
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ Token #${tokenId} hatası (${totalTime}ms):`, error.message);
      
      // 429 hatası için özel işlem
      if (error.response?.status === 429 || error.message?.includes('429')) {
        console.log(`⏳ Token #${tokenId}: 429 hatası, 2 saniye bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      return { tokenId, success: false, error: error.message, time: totalTime };
    }
  }
  
  /**
   * Teklif oluştur - ASYNC VERSION (await kullanmaz)
   */
  _createOffer(chain, contractAddress, tokenId, price, expirationTime, collectionSlug = null) {
    // Direkt API çağrısı yap - hızlı sonuç
    try {
      // Chain değişimi createTokenOffer içinde yapılıyor
      console.log(`🔗 Token offer oluşturuluyor - Token #${tokenId}, Chain: ${chain}`);
      
      // Floating point precision hatalarını önlemek için fiyatı yuvarla
      const roundedPrice = parseFloat(price).toFixed(6);
      console.log(`💰 Token #${tokenId}: Fiyat ${price} -> ${roundedPrice} ETH`);
      
      // HEMEN teklif at - asenkron ama sonucu döndür
      const offerPromise = this.api.createTokenOffer(
        chain,
        contractAddress,
        tokenId,
        parseFloat(roundedPrice),
        expirationTime,
        collectionSlug
      );
      
      // Promise'i handle et
      offerPromise
        .then(result => {
          console.log(`✅ Token #${tokenId}: Teklif başarılı`);
          if (result.order_hash) {
            console.log(`Order Hash: ${result.order_hash}`);
          }
        })
        .catch(error => {
          console.error(`❌ Token #${tokenId} offer hatası:`, error.message);
        });
      
      // Hemen dön - sonucu bekleme
      return { success: true, status: 'processing' };
    } catch (error) {
      console.error(`Token #${tokenId} offer hatası:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = BatchTokenProcessor;