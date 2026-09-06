/**
 * Ethereum Worker Pool - Burst + Pipeline Hybrid
 * Best offer gelir gelmez teklif at, paralel devam et
 */

const axios = require('axios');
const { formatPrice } = require('../utils/helpers');
const config = require('../config');

class EthereumWorkerPool {
  constructor(api) {
    this.api = api;
    this.workers = [];
    this.apiKeys = config.apiKeys || [config.apiKey];
    
    // Her API key için bir worker oluştur
    this.apiKeys.forEach((apiKey, index) => {
      this.workers.push({
        id: index + 1,
        apiKey: apiKey,
        isProcessing: false,
        processedCount: 0,
        errorCount: 0,
        axios: null,
        activeRequests: 0, // Aktif istek sayısı
        maxConcurrent: 3 // Worker başına maksimum eşzamanlı istek (güvenli)
      });
    });
    
    console.log(`🚀 Ethereum Worker Pool başlatıldı: ${this.workers.length} worker`);
    console.log(`⚡ BURST + PIPELINE: Best offer gelir gelmez teklif at`);
  }
  
  /**
   * Token'ları burst + pipeline pattern ile işle
   */
  async processTokens(tokens, task, contractAddress, offerTime, collection, collectionSlug = null) {
    console.log(`\n⚡ ETHEREUM BURST + PIPELINE - ${tokens.length} token işlenecek`);
    console.log(`💥 Pattern: 20 token burst → best offer gelir gelmez teklif → 3s cooldown`);
    
    const results = [];
    const BURST_SIZE = 20; // Optimal burst size
    const COOLDOWN_MS = 3000; // 3 saniye cooldown
    
    // Worker'ları hazırla
    this.initializeWorkers();
    
    // Progressive backoff'u sıfırla
    if (this.api.rateLimitManager && this.api.rateLimitManager.resetEthereumBackoff) {
      this.api.rateLimitManager.resetEthereumBackoff();
    }
    
    // Token'ları 20'li gruplara böl
    for (let i = 0; i < tokens.length; i += BURST_SIZE) {
      const burstTokens = tokens.slice(i, Math.min(i + BURST_SIZE, tokens.length));
      const burstNumber = Math.floor(i / BURST_SIZE) + 1;
      const totalBursts = Math.ceil(tokens.length / BURST_SIZE);
      
      console.log(`\n🔥 BURST ${burstNumber}/${totalBursts} başlıyor (${burstTokens.length} token)`);
      const burstStartTime = Date.now();
      
      // Pipeline ile işle - best offer gelir gelmez teklif at
      const burstResults = await this.processBurstPipeline(burstTokens, task, contractAddress, offerTime, collection, collectionSlug);
      
      results.push(...burstResults);
      
      // Burst özeti
      const totalBurstTime = Date.now() - burstStartTime;
      const successCount = burstResults.filter(r => r.success).length;
      console.log(`\n📈 Burst ${burstNumber} Özeti:`);
      console.log(`   ⏱️  Toplam süre: ${totalBurstTime}ms`);
      console.log(`   ✅ Başarılı: ${successCount}/${burstTokens.length}`);
      console.log(`   🎯 Ortalama: ${(totalBurstTime / burstTokens.length).toFixed(0)}ms/token`);
      
      // Cooldown (son burst değilse)
      if (i + BURST_SIZE < tokens.length) {
        console.log(`\n⏸️  ${COOLDOWN_MS/1000} saniye cooldown...`);
        await new Promise(resolve => setTimeout(resolve, COOLDOWN_MS));
      }
    }
    
    // Final istatistikler
    this.showStats(results);
    
    return results;
  }
  
  /**
   * Worker'ları hazırla
   */
  initializeWorkers() {
    this.workers.forEach(worker => {
      worker.axios = axios.create({
        baseURL: 'https://api.opensea.io',
        timeout: 2000, // Daha kısa timeout
        headers: {
          'X-API-KEY': worker.apiKey,
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        httpAgent: new (require('http').Agent)({ keepAlive: true }),
        httpsAgent: new (require('https').Agent)({ keepAlive: true })
      });
    });
  }
  
  /**
   * Burst'ı pipeline ile işle
   */
  async processBurstPipeline(tokens, task, contractAddress, offerTime, collection, collectionSlug = null) {
    const { minPrice, maxPrice, highOfferSkip, counterbidEnabled, counterbidAmount } = task.settings;
    
    // Collection slug yoksa collection parametresini kullan
    if (!collectionSlug) {
      collectionSlug = collection;
    }
    const results = [];
    const resultMap = new Map();
    
    // Token'ları worker'lara dağıt
    const tokenGroups = this.distributeTokensToWorkers(tokens);
    
    // Her worker için pipeline promise
    const workerPromises = this.workers.map(async (worker, index) => {
      const workerTokens = tokenGroups[index];
      if (!workerTokens || workerTokens.length === 0) return [];
      
      // Worker'lar arasında küçük delay
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, index * 100));
      }
      
      // Her token için pipeline işlem
      const tokenPromises = workerTokens.map(async tokenId => {
        const tokenStartTime = Date.now();
        
        try {
          // Rate limit kontrolü
          while (worker.activeRequests >= worker.maxConcurrent) { // Dinamik limit
            await new Promise(resolve => setTimeout(resolve, 5)); // Ultra kısa bekleme
          }
          
          worker.activeRequests++;
          
          // 1. Best offer al
          let bestOffer = null;
          let offerPrice = minPrice;
          let skipToken = false;
          
          try {
            const response = await worker.axios.get(`/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`);
            bestOffer = response.data;
            
            // DEBUG: Raw API response
            if (bestOffer && bestOffer.price) {
              console.log(`[Worker ${worker.id}] Token #${tokenId}: API Response - Raw value: ${bestOffer.price.value}, ETH: ${bestOffer.price.value / 1e18}`);
              
              // Check if this is a collection offer - yeni flag veya eski yöntem
              const isCollectionOffer = bestOffer.isCollectionOffer || 
                                       bestOffer.criteria?.encoded_token_ids === '*' ||
                                       bestOffer.protocol_data?.parameters?.consideration?.[0]?.itemType === 4;
              
              if (isCollectionOffer) {
                console.log(`[Worker ${worker.id}] Token #${tokenId}: ⚠️  This is a COLLECTION OFFER (not token-specific)`);
              }
            }
            
            if (bestOffer && Object.keys(bestOffer).length > 0) {
              if (highOfferSkip && this.isOurOffer(bestOffer)) {
                console.log(`[Worker ${worker.id}] Token #${tokenId}: En yüksek teklif bizde, atlanıyor`);
                skipToken = true;
              } else if (counterbidEnabled) {
                const bestPrice = this.api._extractPrice(bestOffer);
                
                // DEBUG: _extractPrice sonucu
                console.log(`[Worker ${worker.id}] Token #${tokenId}: _extractPrice result: ${bestPrice} ETH`);
                
                // Collection offer veya token-specific offer kontrolü
                const isCollectionOffer = bestOffer.isCollectionOffer || 
                                         bestOffer.criteria?.encoded_token_ids === '*' ||
                                         bestOffer.protocol_data?.parameters?.consideration?.[0]?.itemType === 4;
                
                if (isCollectionOffer) {
                  // Collection offer bulundu, buna da counterbid yap
                  console.log(`[Worker ${worker.id}] Token #${tokenId}: 📦 Collection offer bulundu: ${formatPrice(bestPrice)} ETH`);
                  
                  const calculatedPrice = bestPrice + counterbidAmount;
                  
                  if (calculatedPrice > maxPrice) {
                    console.log(`[Worker ${worker.id}] Token #${tokenId}: Counterbid (${formatPrice(calculatedPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor, atlanıyor`);
                    skipToken = true;
                  } else {
                    offerPrice = calculatedPrice;
                    console.log(`[Worker ${worker.id}] Token #${tokenId}: Collection offer'a counterbid: ${formatPrice(bestPrice)} → ${formatPrice(offerPrice)} ETH`);
                  }
                } else {
                  // Gerçek token-specific offer
                  const calculatedPrice = bestPrice + counterbidAmount;
                  
                  if (calculatedPrice > maxPrice) {
                    console.log(`[Worker ${worker.id}] Token #${tokenId}: Counterbid (${formatPrice(calculatedPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor, atlanıyor`);
                    skipToken = true;
                  } else {
                    offerPrice = calculatedPrice;
                    console.log(`[Worker ${worker.id}] Token #${tokenId}: Token-specific offer'a counterbid: ${formatPrice(bestPrice)} → ${formatPrice(offerPrice)} ETH`);
                  }
                }
              }
            } else {
              console.log(`[Worker ${worker.id}] Token #${tokenId}: Best offer yok, min price kullanılıyor`);
            }
          } catch (error) {
            if (error.response?.status === 404) {
              console.log(`[Worker ${worker.id}] Token #${tokenId}: Best offer yok (404)`);
            } else if (error.response?.status === 429) {
              console.log(`[Worker ${worker.id}] ⚠️ 429 rate limit Token #${tokenId}`);
              worker.errorCount++;
              worker.activeRequests--;
              return {
                tokenId,
                success: false,
                error: '429 Rate limit',
                workerId: worker.id
              };
            } else {
              throw error;
            }
          } finally {
            worker.activeRequests--;
          }
          
          // Skip edilecekse durma
          if (skipToken) {
            return {
              tokenId,
              success: false,
              error: 'Skipped',
              workerId: worker.id
            };
          }
          
          // 2. HEMEN teklif at (best offer geldikten hemen sonra)
          const offerStartTime = Date.now();
          console.log(`[Worker ${worker.id}] Token #${tokenId}: Teklif atılıyor...`);
          
          // Rate limit kontrolü
          while (worker.activeRequests >= worker.maxConcurrent) { // Dinamik limit
            await new Promise(resolve => setTimeout(resolve, 5)); // Ultra kısa bekleme
          }
          
          worker.activeRequests++;
          
          try {
            const offerResult = await this.api.createTokenOffer(
              'ethereum',
              contractAddress || collection,
              tokenId,
              offerPrice,
              Date.now() + offerTime,
              collectionSlug // Collection slug'ı parametre olarak geç
            );
            
            const totalTime = Date.now() - tokenStartTime;
            
            if (offerResult.success) {
              worker.processedCount++;
              console.log(`[Worker ${worker.id}] ✅ Token #${tokenId}: ${formatPrice(offerPrice)} ETH - ${totalTime}ms`);
              
              return {
                tokenId,
                success: true,
                price: offerPrice,
                time: totalTime,
                workerId: worker.id
              };
            } else {
              worker.errorCount++;
              console.log(`[Worker ${worker.id}] ❌ Token #${tokenId}: ${offerResult.error}`);
              
              return {
                tokenId,
                success: false,
                error: offerResult.error,
                workerId: worker.id
              };
            }
          } catch (error) {
            worker.errorCount++;
            console.error(`[Worker ${worker.id}] ❌ Create offer error Token #${tokenId}:`, error.message);
            
            if (error.response?.status === 429) {
              console.log(`[Worker ${worker.id}] 429 hatası, worker yavaşlatılıyor...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            return {
              tokenId,
              success: false,
              error: error.message,
              workerId: worker.id
            };
          } finally {
            worker.activeRequests--;
          }
          
        } catch (error) {
          console.error(`[Worker ${worker.id}] Token #${tokenId} genel hata:`, error.message);
          return {
            tokenId,
            success: false,
            error: error.message,
            workerId: worker.id
          };
        }
      });
      
      // Worker'ın tüm token'larını bekle
      const results = await Promise.all(tokenPromises);
      return results;
    });
    
    // Tüm worker'ların bitmesini bekle
    const allWorkerResults = await Promise.all(workerPromises);
    
    // Sonuçları birleştir
    return allWorkerResults.flat();
  }
  
  /**
   * Token'ları worker'lara eşit dağıt
   */
  distributeTokensToWorkers(tokens) {
    const groups = Array(this.workers.length).fill(null).map(() => []);
    
    tokens.forEach((token, index) => {
      const workerIndex = index % this.workers.length;
      groups[workerIndex].push(token);
    });
    
    return groups;
  }
  
  /**
   * Teklif bizim mi kontrol et
   */
  isOurOffer(offer) {
    if (!offer) return false;
    
    const ourAddress = this.api.walletAddress?.toLowerCase();
    if (!ourAddress) return false;
    
    if (offer.maker?.address) {
      return offer.maker.address.toLowerCase() === ourAddress;
    }
    
    if (offer.offerer) {
      return offer.offerer.toLowerCase() === ourAddress;
    }
    
    return false;
  }
  
  /**
   * İstatistikleri göster
   */
  showStats(results) {
    console.log('\n📊 === BURST + PIPELINE İSTATİSTİKLERİ ===');
    
    let totalProcessed = 0;
    let totalErrors = 0;
    
    this.workers.forEach(worker => {
      totalProcessed += worker.processedCount;
      totalErrors += worker.errorCount;
      
      const successRate = worker.processedCount > 0 
        ? ((worker.processedCount / (worker.processedCount + worker.errorCount)) * 100).toFixed(2)
        : 0;
        
      console.log(`Worker ${worker.id}: ${worker.processedCount} başarılı, ${worker.errorCount} hata (${successRate}% başarı)`);
    });
    
    const totalAttempts = results.length;
    const totalSuccess = results.filter(r => r.success).length;
    const totalSuccessRate = totalAttempts > 0
      ? ((totalSuccess / totalAttempts) * 100).toFixed(2)
      : 0;
      
    console.log(`\nTOPLAM: ${totalSuccess}/${totalAttempts} başarılı (${totalSuccessRate}% başarı)`);
    console.log(`⚡ Burst + Pipeline hybrid ile maksimum hız`);
  }
}

module.exports = EthereumWorkerPool;