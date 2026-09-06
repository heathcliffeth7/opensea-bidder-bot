const { ethers } = require('ethers');
const config = require('../config');
const { formatPrice } = require('../utils/helpers');

/**
 * Hızlı counter-bid sistemi - v2 API ile off-chain teklifler
 */
class FastCounterBid {
  constructor(api) {
    this.api = api;
    this.activeCounterBids = new Map(); // tokenId -> lastBidInfo
    this.minCounterbidDelay = 1000; // Minimum 1 saniye bekle
  }

  /**
   * Token için hızlı counter-bid yap
   */
  async createCounterBid(task, tokenId, currentBestOffer) {
    const { chain, collection, minPrice, maxPrice, counterbidAmount } = task.settings;
    
    try {
      // Son counter-bid kontrolü
      const lastBidKey = `${collection}-${tokenId}`;
      const lastBid = this.activeCounterBids.get(lastBidKey);
      
      if (lastBid) {
        const timeSinceLastBid = Date.now() - lastBid.timestamp;
        if (timeSinceLastBid < this.minCounterbidDelay) {
          console.log(`⏳ Son tekliften bu yana ${timeSinceLastBid}ms geçti, bekleniyor...`);
          await new Promise(resolve => setTimeout(resolve, this.minCounterbidDelay - timeSinceLastBid));
        }
      }
      
      // Mevcut en yüksek teklifi al
      let currentHighestPrice = 0;
      if (currentBestOffer) {
        currentHighestPrice = this.api._extractPrice(currentBestOffer);
      }
      
      console.log(`\n🎯 HIZLI COUNTER-BID - Token #${tokenId}`);
      console.log(`Mevcut en yüksek: ${formatPrice(currentHighestPrice)} ETH`);
      
      // Yeni teklif fiyatını hesapla
      const newOfferPrice = currentHighestPrice + counterbidAmount;
      
      // Max price kontrolü
      if (newOfferPrice > maxPrice) {
        console.log(`❌ Counter-bid (${formatPrice(newOfferPrice)}) max price'ı (${formatPrice(maxPrice)}) aşıyor!`);
        return { success: false, error: 'Max price aşıldı' };
      }
      
      // Min price kontrolü
      const finalPrice = Math.max(newOfferPrice, minPrice);
      console.log(`✅ Yeni teklif: ${formatPrice(finalPrice)} ETH`);
      
      // Contract address al
      let contractAddress;
      if (task.contractAddress) {
        contractAddress = task.contractAddress;
      } else {
        // Abstract chain için sabit mapping kullan
        if (chain === 'abstract' && collection === 'pengztracted-abstract') {
          contractAddress = '0xa6C46c07F7f1966D772E29049175EBBa26262513';
        } else {
          // Collection'dan contract address al
          const collectionInfo = await this.api.getCollectionInfo(collection);
          contractAddress = collectionInfo.contractAddress;
        }
      }
      
      if (!contractAddress) {
        throw new Error('Contract address bulunamadı');
      }
      
      // Teklif süresi - 15 dakika
      const offerTime = Date.now() + (15 * 60 * 1000);
      
      // v2 API ile teklif ver
      console.log(`🚀 v2 API ile teklif gönderiliyor...`);
      const startTime = Date.now();
      
      const result = await this.api.createTokenOffer(
        chain,
        contractAddress,
        tokenId,
        finalPrice,
        offerTime
      );
      
      const elapsed = Date.now() - startTime;
      
      if (result.order_hash) {
        console.log(`✅ Counter-bid başarılı! (${elapsed}ms)`);
        console.log(`Order Hash: ${result.order_hash}`);
        
        // Son teklifi kaydet
        this.activeCounterBids.set(lastBidKey, {
          tokenId,
          price: finalPrice,
          orderHash: result.order_hash,
          timestamp: Date.now()
        });
        
        return {
          success: true,
          tokenId,
          price: finalPrice,
          orderHash: result.order_hash,
          time: elapsed
        };
      } else {
        throw new Error('Order hash alınamadı');
      }
      
    } catch (error) {
      console.error(`❌ Counter-bid hatası:`, error.message);
      return {
        success: false,
        tokenId,
        error: error.message
      };
    }
  }
  
  /**
   * Toplu counter-bid - birden fazla token için
   */
  async createBulkCounterBids(task, tokens) {
    console.log(`\n⚡ ${tokens.length} token için toplu counter-bid başlatılıyor...`);
    const startTime = Date.now();
    
    // Paralel olarak tüm counter-bid'leri yap
    const results = await Promise.all(
      tokens.map(async (tokenInfo) => {
        try {
          return await this.createCounterBid(task, tokenInfo.tokenId, tokenInfo.currentBestOffer);
        } catch (error) {
          return {
            success: false,
            tokenId: tokenInfo.tokenId,
            error: error.message
          };
        }
      })
    );
    
    const elapsed = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    console.log(`\n📊 Toplu counter-bid tamamlandı:`);
    console.log(`- Süre: ${elapsed}ms`);
    console.log(`- Başarılı: ${successCount}/${tokens.length}`);
    console.log(`- Ortalama: ${Math.round(elapsed / tokens.length)}ms/token`);
    
    return results;
  }
  
  /**
   * Aktif counter-bid'leri temizle
   */
  clearOldBids(maxAge = 15 * 60 * 1000) { // 15 dakika
    const now = Date.now();
    for (const [key, bid] of this.activeCounterBids.entries()) {
      if (now - bid.timestamp > maxAge) {
        this.activeCounterBids.delete(key);
      }
    }
  }
  
  /**
   * İstatistikleri göster
   */
  getStats() {
    return {
      activeBids: this.activeCounterBids.size,
      bids: Array.from(this.activeCounterBids.values()).map(bid => ({
        tokenId: bid.tokenId,
        price: formatPrice(bid.price),
        age: Math.round((Date.now() - bid.timestamp) / 1000) + 's'
      }))
    };
  }
}

module.exports = FastCounterBid;