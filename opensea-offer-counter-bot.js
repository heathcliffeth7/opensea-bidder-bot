import { OpenSeaStreamClient } from '@opensea/stream-js';
import { OpenSeaSDK, Chain } from 'opensea-js';
import { ethers } from 'ethers';
import axios from 'axios';

class OfferCounterBot {
  constructor(apiKey, privateKey, rpcUrl) {
    // OpenSea Stream client
    this.streamClient = new OpenSeaStreamClient({ 
      token: apiKey,
      network: 'mainnet'
    });
    
    // Ethereum provider ve wallet
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    // OpenSea SDK
    this.openseaSDK = new OpenSeaSDK(this.provider, {
      chain: Chain.Mainnet,
      apiKey: apiKey
    });
    
    // API key
    this.apiKey = apiKey;
    
    // Takip edilen tokenler ve teklifler
    this.trackedTokens = new Map(); // key: `${contractAddress}-${tokenId}`
    this.activeOffers = new Map();
    
    // Rate limiting için
    this.lastApiCall = 0;
    this.apiCallDelay = 300; // 300ms delay between API calls
  }
  
  // API çağrısı için rate limiting
  async rateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    if (timeSinceLastCall < this.apiCallDelay) {
      await new Promise(resolve => setTimeout(resolve, this.apiCallDelay - timeSinceLastCall));
    }
    this.lastApiCall = Date.now();
  }
  
  // Token'ın en iyi teklifini al
  async getBestOffer(collectionSlug, tokenId) {
    await this.rateLimit();
    
    try {
      const response = await axios.get(
        `https://api.opensea.io/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`,
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Accept': 'application/json'
          }
        }
      );
      
      if (response.data && response.data.price) {
        return {
          price: ethers.formatEther(response.data.price.value),
          maker: response.data.maker,
          orderHash: response.data.order_hash
        };
      }
      
      return null;
    } catch (error) {
      console.error(`En iyi teklif alınamadı (${collectionSlug}/${tokenId}):`, error.message);
      return null;
    }
  }
  
  // Token'a ilk teklif ver ve takibe al
  async makeInitialOfferAndTrack(contractAddress, tokenId, collectionSlug, offerPercentage = 0.9) {
    const tokenKey = `${contractAddress}-${tokenId}`;
    
    try {
      console.log(`Token ${tokenId} için en iyi teklif kontrol ediliyor...`);
      
      // Mevcut en iyi teklifi al
      const bestOffer = await this.getBestOffer(collectionSlug, tokenId);
      
      let offerAmount;
      if (bestOffer && bestOffer.price) {
        // En iyi teklifin %X'i kadar teklif ver (genelde %101-105 arası)
        offerAmount = parseFloat(bestOffer.price) * 1.01;
        console.log(`Mevcut en iyi teklif: ${bestOffer.price} ETH, Counter teklif: ${offerAmount} ETH`);
      } else {
        // Floor price'ın %X'i kadar teklif ver
        const floorPrice = await this.getFloorPrice(collectionSlug);
        offerAmount = floorPrice * offerPercentage;
        console.log(`En iyi teklif yok, Floor price'ın %${offerPercentage * 100}'ü teklif ediliyor: ${offerAmount} ETH`);
      }
      
      // Teklif ver
      const offer = await this.openseaSDK.createOffer({
        asset: {
          tokenId: tokenId,
          tokenAddress: contractAddress
        },
        accountAddress: this.wallet.address,
        startAmount: offerAmount
      });
      
      // Token'ı takip listesine ekle
      this.trackedTokens.set(tokenKey, {
        contractAddress,
        tokenId,
        collectionSlug,
        ourOfferPrice: offerAmount,
        maxCounterPrice: offerAmount * 2 // Maksimum 2x'e kadar counter'la
      });
      
      this.activeOffers.set(tokenKey, offer);
      
      console.log(`Token ${tokenId} takibe alındı ve teklif verildi: ${offerAmount} ETH`);
      
    } catch (error) {
      console.error(`İlk teklif hatası (Token ${tokenId}):`, error);
    }
  }
  
  // Collection floor price'ını al
  async getFloorPrice(collectionSlug) {
    await this.rateLimit();
    
    try {
      const response = await axios.get(
        `https://api.opensea.io/api/v2/collections/${collectionSlug}/stats`,
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'Accept': 'application/json'
          }
        }
      );
      
      return response.data.total.floor_price || 0.01;
    } catch (error) {
      console.error(`Floor price alınamadı (${collectionSlug}):`, error.message);
      return 0.01; // Default floor price
    }
  }
  
  // Tüm collection'ları stream'den takip et
  startGlobalTracking() {
    // Tüm collection'lar için offer event'lerini dinle
    this.streamClient.onItemReceivedOffer('*', async (event) => {
      await this.handleOfferEvent(event);
    });
    
    console.log('Global offer takibi başlatıldı');
  }
  
  // Gelen teklif event'ini işle
  async handleOfferEvent(event) {
    const payload = event.payload;
    const contractAddress = payload.item.nft_id.split('/')[1];
    const tokenId = payload.item.nft_id.split('/')[2];
    const tokenKey = `${contractAddress}-${tokenId}`;
    
    // Bu token'ı takip ediyor muyuz?
    if (!this.trackedTokens.has(tokenKey)) {
      return;
    }
    
    const newOfferPrice = parseFloat(payload.payment_token.eth_price);
    const offerMaker = payload.maker.address;
    
    // Kendi teklifimizse işlem yapma
    if (offerMaker.toLowerCase() === this.wallet.address.toLowerCase()) {
      return;
    }
    
    const trackedToken = this.trackedTokens.get(tokenKey);
    
    console.log(`Token ${tokenId} için yeni teklif: ${newOfferPrice} ETH (${offerMaker})`);
    
    // Eğer yeni teklif bizim teklifimizden yüksekse counter'la
    if (newOfferPrice > trackedToken.ourOfferPrice) {
      await this.counterOffer(tokenKey, newOfferPrice);
    }
  }
  
  // Teklifi counter'la
  async counterOffer(tokenKey, currentHighestOffer) {
    const trackedToken = this.trackedTokens.get(tokenKey);
    if (!trackedToken) {
      return;
    }
    
    // Yeni teklif miktarını hesapla (%1 fazlası)
    const counterOfferAmount = currentHighestOffer * 1.01;
    
    // Maksimum counter fiyatını kontrol et
    if (counterOfferAmount > trackedToken.maxCounterPrice) {
      console.log(`Token ${trackedToken.tokenId} için limit aşıldı. Max: ${trackedToken.maxCounterPrice}, İstenen: ${counterOfferAmount}`);
      return;
    }
    
    try {
      console.log(`Token ${trackedToken.tokenId} için counter teklif: ${counterOfferAmount} ETH`);
      
      // Önceki teklifimizi iptal et
      if (this.activeOffers.has(tokenKey)) {
        await this.openseaSDK.cancelOrder({
          order: this.activeOffers.get(tokenKey),
          accountAddress: this.wallet.address
        });
      }
      
      // Yeni teklif ver
      const newOffer = await this.openseaSDK.createOffer({
        asset: {
          tokenId: trackedToken.tokenId,
          tokenAddress: trackedToken.contractAddress
        },
        accountAddress: this.wallet.address,
        startAmount: counterOfferAmount
      });
      
      // Güncelle
      trackedToken.ourOfferPrice = counterOfferAmount;
      this.activeOffers.set(tokenKey, newOffer);
      
      console.log(`Counter teklif başarılı: ${counterOfferAmount} ETH`);
      
    } catch (error) {
      console.error(`Counter teklif hatası (Token ${trackedToken.tokenId}):`, error);
    }
  }
  
  // 300 token'ı toplu takibe al
  async trackMultipleTokens(tokenList) {
    console.log(`${tokenList.length} token takibe alınıyor...`);
    
    // Global stream takibini başlat
    this.startGlobalTracking();
    
    // Batch halinde işle (10'ar 10'ar)
    const batchSize = 10;
    for (let i = 0; i < tokenList.length; i += batchSize) {
      const batch = tokenList.slice(i, i + batchSize);
      
      const promises = batch.map(token => 
        this.makeInitialOfferAndTrack(
          token.contractAddress,
          token.tokenId,
          token.collectionSlug,
          token.offerPercentage || 0.9
        )
      );
      
      await Promise.allSettled(promises);
      
      console.log(`${Math.min(i + batchSize, tokenList.length)}/${tokenList.length} token işlendi`);
      
      // Her batch arasında biraz bekle
      if (i + batchSize < tokenList.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('Tüm tokenler takibe alındı');
  }
  
  // Takip durumunu göster
  getStatus() {
    console.log(`\n=== Bot Durumu ===`);
    console.log(`Takip edilen token sayısı: ${this.trackedTokens.size}`);
    console.log(`Aktif teklif sayısı: ${this.activeOffers.size}`);
    
    let totalOfferValue = 0;
    this.trackedTokens.forEach((token, key) => {
      totalOfferValue += token.ourOfferPrice;
    });
    
    console.log(`Toplam teklif değeri: ${totalOfferValue.toFixed(4)} ETH`);
    console.log(`==================\n`);
  }
  
  // Bot'u durdur
  stop() {
    this.streamClient.disconnect();
    console.log('Bot durduruldu');
  }
}

// Kullanım örneği
async function main() {
  const bot = new OfferCounterBot(
    process.env.OPENSEA_API_KEY,
    process.env.PRIVATE_KEY,
    process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY'
  );
  
  // 300 token listesi örneği
  const tokenList = [
    {
      contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', // BAYC
      tokenId: '1',
      collectionSlug: 'boredapeyachtclub',
      offerPercentage: 0.9 // Floor price'ın %90'ı
    },
    {
      contractAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
      tokenId: '2',
      collectionSlug: 'boredapeyachtclub',
      offerPercentage: 0.85
    },
    // ... 298 token daha
  ];
  
  // CSV'den token listesi yükle (opsiyonel)
  // const tokenList = await loadTokenListFromCSV('tokens.csv');
  
  // Tüm tokenları takibe al
  await bot.trackMultipleTokens(tokenList);
  
  // Her 5 dakikada bir durum göster
  setInterval(() => {
    bot.getStatus();
  }, 5 * 60 * 1000);
  
  console.log('Offer counter bot çalışıyor...');
  console.log('Çıkmak için Ctrl+C');
}

// CSV'den token listesi yükle
async function loadTokenListFromCSV(filePath) {
  const fs = require('fs').promises;
  const csv = require('csv-parse/sync');
  
  const fileContent = await fs.readFile(filePath, 'utf8');
  const records = csv.parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });
  
  return records.map(record => ({
    contractAddress: record.contract_address,
    tokenId: record.token_id,
    collectionSlug: record.collection_slug,
    offerPercentage: parseFloat(record.offer_percentage) || 0.9
  }));
}

// Hata yakalama
process.on('unhandledRejection', (error) => {
  console.error('Beklenmeyen hata:', error);
});

process.on('SIGINT', () => {
  console.log('\nBot durduruluyor...');
  process.exit(0);
});

main().catch(console.error);