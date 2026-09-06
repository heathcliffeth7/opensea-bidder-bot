const { ethers } = require('ethers');
const config = require('../config');

/**
 * Hybrid yaklaşım: OpenSea SDK'yı optimize ederek hızlandırma
 */
class HybridFastOffer {
  constructor(api) {
    this.api = api;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.walletAddress = null;
    this.initWallet();
  }

  async initWallet() {
    try {
      this.walletAddress = await this.wallet.getAddress();
    } catch (error) {
      console.error('Wallet adresi alınamadı:', error);
      this.walletAddress = config.walletAddress;
    }
  }

  /**
   * Optimized counter-bid
   * SDK kullanır ama gereksiz kontrolleri atlar
   */
  async createFastCounterBid(collectionSlug, tokenId, offerPriceETH) {
    console.log('\n⚡ HIZLI COUNTER-BID BAŞLIYOR...');
    const startTime = Date.now();
    
    try {
      // 1. NFT bilgilerini ALMA - zaman kaybı
      console.log('✅ NFT kontrolü atlandı (hız için)');
      
      // 2. Bakiye kontrolü - paralel yap
      const balancePromise = this.checkBalanceFast(offerPriceETH);
      
      // 3. Gas fiyatını yükselt
      const feeData = await this.provider.getFeeData();
      const fastGasPrice = feeData.gasPrice * 130n / 100n; // %30 fazla
      console.log(`⛽ Hızlı gas: ${ethers.formatUnits(fastGasPrice, 'gwei')} gwei`);
      
      // 4. Bakiye kontrolü sonucu
      const hasBalance = await balancePromise;
      if (!hasBalance) {
        throw new Error('Yetersiz bakiye!');
      }
      
      // 5. SDK ile teklif - ama optimize edilmiş
      console.log('📤 Teklif gönderiliyor...');
      const offerStartTime = Date.now();
      
      // Transaction options ile hızlandır
      const txOptions = {
        gasPrice: fastGasPrice,
        gasLimit: 300000 // Sabit gas limit
      };
      
      // Direkt SDK kullan (loop'u önlemek için)
      if (!this.api.sdk) {
        throw new Error('SDK hazır değil');
      }
      
      // Contract address al
      let contractAddress = collectionSlug;
      if (!collectionSlug.startsWith('0x')) {
        const collectionInfo = await this.api.getCollectionInfo(collectionSlug);
        contractAddress = collectionInfo.contractAddress;
      }
      
      // SDK ile hızlı teklif - zone parametresi ile
      const offerParams = {
        asset: {
          tokenId: tokenId.toString(),
          tokenAddress: contractAddress
        },
        accountAddress: this.walletAddress || config.walletAddress,
        startAmount: parseFloat(offerPriceETH),
        expirationTime: Math.floor((Date.now() + (15 * 60 * 1000)) / 1000),
        paymentTokenAddress: config.wethContractAddress,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100" // Seaport 1.6 zone - ZORUNLU
      };
      
      const order = await this.api.sdk.createOffer(offerParams);
      
      const offerTime = Date.now() - offerStartTime;
      const totalTime = Date.now() - startTime;
      
      console.log(`\n✅ HIZLI COUNTER-BID TAMAMLANDI!`);
      console.log(`⏱️  Teklif süresi: ${offerTime}ms`);
      console.log(`⏱️  Toplam süre: ${totalTime}ms`);
      console.log(`📋 Order hash: ${order.order_hash || order.orderHash}`);
      
      return {
        success: true,
        orderHash: order.order_hash || order.orderHash,
        timing: {
          offer: offerTime,
          total: totalTime
        }
      };
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`\n❌ Hızlı counter-bid hatası (${totalTime}ms):`, error.message);
      throw error;
    }
  }
  
  /**
   * Hızlı bakiye kontrolü
   */
  async checkBalanceFast(requiredETH) {
    try {
      // Sadece WETH bakiyesi kontrol et
      const wethContract = new ethers.Contract(
        config.wethContractAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      
      const balance = await wethContract.balanceOf(this.wallet.address);
      const required = ethers.parseEther(requiredETH.toString());
      
      return balance >= required;
    } catch (error) {
      console.error('Bakiye kontrol hatası:', error);
      return false;
    }
  }
}

module.exports = HybridFastOffer;