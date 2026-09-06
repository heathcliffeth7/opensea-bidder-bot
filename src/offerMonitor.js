const { ethers } = require('ethers');
const config = require('../config');

class OfferMonitor {
  constructor(api) {
    this.api = api;
    this.monitoredTokens = new Map(); // tokenKey -> { lastOffer, taskName, callback }
    this.pollInterval = 5000; // 5 saniye
    this.isRunning = false;
  }

  /**
   * Token offer monitoring başlat
   */
  startMonitoring(chain, contractAddress, tokenId, taskName, callback) {
    const tokenKey = `${contractAddress}-${tokenId}`;
    
    console.log(`\n📡 Token offer monitoring başlatılıyor: ${tokenKey}`);
    console.log(`- Chain: ${chain}`);
    console.log(`- Contract: ${contractAddress}`);
    console.log(`- Token ID: ${tokenId}`);
    console.log(`- Poll interval: ${this.pollInterval / 1000} saniye`);
    
    this.monitoredTokens.set(tokenKey, {
      chain,
      contractAddress,
      tokenId,
      taskName,
      callback,
      lastOfferHash: null,
      lastCheckTime: 0
    });
    
    // Eğer monitoring çalışmıyorsa başlat
    if (!this.isRunning) {
      this.isRunning = true;
      this._startPolling();
    }
    
    console.log(`✅ Token monitoring aktif: ${tokenKey}\n`);
  }

  /**
   * Token monitoring durdur
   */
  stopMonitoring(contractAddress, tokenId) {
    const tokenKey = `${contractAddress}-${tokenId}`;
    if (this.monitoredTokens.has(tokenKey)) {
      this.monitoredTokens.delete(tokenKey);
      console.log(`🛑 Token monitoring durduruldu: ${tokenKey}`);
      
      // Eğer hiç monitored token kalmadıysa polling'i durdur
      if (this.monitoredTokens.size === 0) {
        this.isRunning = false;
      }
    }
  }

  /**
   * Polling loop
   */
  async _startPolling() {
    while (this.isRunning) {
      const startTime = Date.now();
      
      // Her token için teklifleri kontrol et
      for (const [tokenKey, monitorData] of this.monitoredTokens) {
        try {
          await this._checkTokenOffers(tokenKey, monitorData);
        } catch (error) {
          console.error(`Token offer kontrol hatası (${tokenKey}):`, error.message);
        }
      }
      
      // Bir sonraki poll'a kadar bekle
      const elapsed = Date.now() - startTime;
      const waitTime = Math.max(0, this.pollInterval - elapsed);
      if (waitTime > 0 && this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    console.log('🛑 Offer monitoring durduruldu.');
  }

  /**
   * Tek bir token için teklifleri kontrol et
   */
  async _checkTokenOffers(tokenKey, monitorData) {
    const { chain, contractAddress, tokenId, callback, lastOfferHash } = monitorData;
    
    try {
      // API'den token tekliflerini al
      const response = await fetch(
        `https://api.opensea.io/api/v2/offers/collection/${contractAddress}/nfts/${tokenId}`,
        {
          headers: {
            'X-API-KEY': config.apiKey,
            'Accept': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.offers && data.offers.length > 0) {
        const topOffer = data.offers[0]; // En yüksek teklif
        
        // Yeni teklif var mı kontrol et
        if (topOffer.order_hash !== lastOfferHash) {
          // Teklif bizim değilse callback'i çağır
          const offerMaker = topOffer.maker.address.toLowerCase();
          if (offerMaker !== config.walletAddress.toLowerCase()) {
            console.log(`\n🔔 === YENİ TOKEN TEKLİFİ ALGILANDI ===`);
            console.log(`Token: ${contractAddress} #${tokenId}`);
            console.log(`Teklif sahibi: ${topOffer.maker.address}`);
            console.log(`Fiyat: ${ethers.formatEther(topOffer.price.value)} WETH`);
            console.log(`Order hash: ${topOffer.order_hash}`);
            console.log(`Zaman: ${new Date().toLocaleString()}`);
            
            // Callback'i çağır (Stream API event formatında)
            const mockEvent = {
              event_type: 'item_received_offer',
              payload: {
                order_hash: topOffer.order_hash,
                base_price: topOffer.price.value,
                maker: topOffer.maker.address,
                protocol_data: {
                  parameters: {
                    offerer: topOffer.maker.address,
                    orderType: 0 // Token offer
                  }
                },
                item: {
                  nft_id: `${chain}/${contractAddress}/${tokenId}`,
                  metadata: {
                    name: `Token #${tokenId}`
                  }
                }
              }
            };
            
            await callback(mockEvent);
          }
          
          // Son teklif hash'ini güncelle
          monitorData.lastOfferHash = topOffer.order_hash;
        }
      }
      
      // Son kontrol zamanını güncelle
      monitorData.lastCheckTime = Date.now();
      
    } catch (error) {
      // Rate limit veya diğer hatalar için sessizce devam et
      if (!error.message.includes('429')) {
        console.error(`Token offer kontrolü başarısız (${tokenKey}):`, error.message);
      }
    }
  }

  /**
   * Aktif monitoring durumunu göster
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      monitoredTokens: Array.from(this.monitoredTokens.keys()),
      pollInterval: this.pollInterval
    };
  }
}

module.exports = OfferMonitor;