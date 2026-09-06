const { ethers } = require('ethers');
const config = require('../config');

class CollectionOfferMonitor {
  constructor(api, taskManager) {
    this.api = api;
    this.taskManager = taskManager;
    this.monitoredCollections = new Map(); // collection -> { tokens: Set, listener: string }
  }

  /**
   * Collection için tek listener kur, tüm token offer'ları dinle
   */
  setupCollectionListener(task, contractAddress, tokenId = null) {
    const taskName = task.name;
    const collectionSlug = task.settings.collection; // Collection slug'ı al
    
    // Collection monitoring için slug'ı ana key olarak kullan
    const monitorKey = collectionSlug || contractAddress;
    
    // Bu collection için zaten listener var mı?
    if (this.monitoredCollections.has(contractAddress)) {
      console.log(`📡 Bu collection için listener zaten mevcut: ${contractAddress}`);
      return;
    }

    // Yeni listener kur
    console.log(`\n🔌 Collection listener kuruluyor: ${contractAddress}`);
    console.log(`Task: ${taskName}`);
    console.log(`Collection slug: ${collectionSlug}`);
    
    // Token listesini oluştur
    const tokens = new Set();
    const tasks = new Map();
    
    // Task'tan token listesini al
    if (task.settings && task.settings.tokenIdList) {
      task.settings.tokenIdList.forEach(tid => {
        tokens.add(tid.toString());
        tasks.set(tid.toString(), taskName);
      });
      console.log(`Token listesi yüklendi: ${task.settings.tokenIdList.length} token`);
      console.log(`Token ID'ler: ${Array.from(tokens).join(', ')}`);
    } else if (task.settings && task.settings.tokenIds) {
      task.settings.tokenIds.forEach(tid => {
        tokens.add(tid.toString());
        tasks.set(tid.toString(), taskName);
      });
      console.log(`Token listesi yüklendi: ${task.settings.tokenIds.length} token`);
      console.log(`Token ID'ler: ${Array.from(tokens).join(', ')}`);
    }

    // Stream API ile collection listener kur
    console.log(`📡 Stream API channel'a katılınıyor: collection:${contractAddress}`);
    
    // Stream API bağlantısını kontrol et
    if (!this.api.stream.isConnected) {
      console.log('⚠️ Stream API bağlantısı hazır değil, biraz bekleyelim...');
      setTimeout(() => {
        this.setupCollectionListener(task, contractAddress, tokenId);
      }, 2000);
      return;
    }
    
    // Channel'a katıl - OptimizedStreamClient üzerinden
    console.log(`📡 OptimizedStreamClient üzerinden collection dinleniyor...`);
    
    // Collection slug kullan (Stream API slug ile çalışır)
    if (collectionSlug) {
      this.api.stream.listenToItemReceivedBids(collectionSlug);
      console.log(`✅ Collection dinleniyor: ${collectionSlug}`);
    } else {
      // Slug yoksa contract address'i dene
      this.api.stream.listenToItemReceivedBids(contractAddress);
      console.log(`✅ Contract address ile dinleniyor: ${contractAddress}`);
    }
    
    // Event listener - OptimizedStreamClient'tan gelen eventler
    const bidHandler = async (data) => {
      try {
        // data formatı: { collection, tokenId, price, priceWei, maker, orderHash, fullPayload }
        if (data.collection !== collectionSlug && data.collection !== contractAddress) {
          return;
        }
        
        console.log(`\n📡 [CollectionOfferMonitor] Bid event alındı!`);
        console.log(`Collection: ${data.collection}`);
        console.log(`Token ID: ${data.tokenId}`);
        console.log(`Fiyat: ${data.price.toFixed(4)} ETH`);
        console.log(`Teklif sahibi: ${data.maker}`);
          console.log(`Contract address: ${contractAddress}`);
          console.log(`Collection slug: ${collectionSlug}`);
        }
        
        // item_received_bid veya item_received_offer event'i mi?
        if (message.event === 'item_received_bid' || 
            message.event === 'item_received_offer' ||
            message.event === 'offer' ||
            message.event === 'bid' ||
            message.event === 'item_offer') {
          console.log(`\n🔔 Collection bid/offer event alındı: ${message.event}`);
          console.log(`Topic: ${message.topic}`);
          
          // Önce token ID'yi al
          let tokenId = null;
          const eventPayload = message.payload?.payload || message.payload;
          
          // Token ID'yi bul - Stream API'de genelde consideration'da geliyor
          if (eventPayload?.protocol_data?.parameters?.consideration?.[0]?.identifierOrCriteria) {
            tokenId = eventPayload.protocol_data.parameters.consideration[0].identifierOrCriteria.toString();
          } else if (eventPayload?.item?.nft_id) {
            const parts = eventPayload.item.nft_id.split('/');
            tokenId = parts[parts.length - 1];
          }
          
          console.log(`Token ID: ${tokenId}`);
          
          // Bu token bizim listede mi?
          if (tokenId && tokens.has(tokenId.toString())) {
            console.log(`✅ Token #${tokenId} izlenen listede, event işlenecek`);
            await this.handleCollectionEvent(message, contractAddress, collectionSlug, tokens, tasks);
          } else {
            console.log(`❌ Token #${tokenId} izlenen listede değil`);
            console.log(`İzlenen tokenler:`, Array.from(tokens));
          }
        }
      } catch (error) {
        // JSON parse hatalarını sessizce atla
      }
    };
    
    // StreamClient'tan gelen 'message' event'lerini dinle
    this.api.stream.on('message', messageHandler);
    
    // Handler'ı sakla (kaldırmak için)
    this.messageHandlers = this.messageHandlers || new Map();
    this.messageHandlers.set(listenerKey, messageHandler);

    // Kaydet
    this.monitoredCollections.set(contractAddress, {
      tokens: tokens,
      tasks: tasks,
      listener: listenerKey,
      collectionSlug: collectionSlug
    });

    console.log(`✅ Collection listener aktif: ${contractAddress}`);
    console.log(`Collection slug: ${collectionSlug}`);
    console.log(`Task: ${taskName}`);
    console.log(`\n`);
  }

  /**
   * Collection event'ini işle
   */
  async handleCollectionEvent(message, contractAddress, collectionSlug, tokens, tasks) {
    console.log('\n=== handleCollectionEvent ÇAĞRILDI ===');
    console.log('Contract Address:', contractAddress);
    console.log('Message topic:', message.topic);
    
    const { payload } = message;
    
    // OpenSea dokümantasyonuna göre payload yapısı: payload.payload
    const eventData = payload?.payload || payload;
    if (!eventData) {
      console.log('⚠️ Event payload bulunamadı');
      return;
    }
    
    // Debug: Event payload yapısını göster
    console.log('\n📋 Event Payload Yapısı:');
    console.log('- protocol_data var mı?', !!eventData.protocol_data);
    console.log('- item var mı?', !!eventData.item);
    if (eventData.protocol_data?.parameters?.consideration?.[0]) {
      console.log('- consideration[0]:', eventData.protocol_data.parameters.consideration[0]);
    }

    // Token ID'yi bul - Stream API event yapısına göre
    let tokenId = null;
    
    // ÖNCELİK 1: Stream API'de token ID protocol_data.parameters.consideration[0].identifierOrCriteria içinde geliyor
    if (eventData.protocol_data?.parameters?.consideration?.[0]?.identifierOrCriteria) {
      tokenId = eventData.protocol_data.parameters.consideration[0].identifierOrCriteria.toString();
      console.log(`✅ Token ID bulundu (consideration'dan): ${tokenId}`);
      
      // Debug için tüm consideration array'ini göster
      console.log(`Consideration array:`, eventData.protocol_data.parameters.consideration);
    }
    // ÖNCELİK 2: offer array'inden almayı dene (bazen burada da geliyor)
    else if (eventData.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria) {
      tokenId = eventData.protocol_data.parameters.offer[0].identifierOrCriteria.toString();
      console.log(`✅ Token ID bulundu (offer'dan): ${tokenId}`);
      console.log(`Offer array:`, eventData.protocol_data.parameters.offer);
    }
    // ÖNCELİK 3: item.nft_id'den almayı dene
    else if (eventData.item?.nft_id) {
      const parts = eventData.item.nft_id.split('/');
      tokenId = parts[parts.length - 1];
      console.log(`✅ Token ID bulundu (nft_id'den): ${tokenId}`);
      console.log(`Full nft_id: ${eventData.item.nft_id}`);
    } 
    // ÖNCELİK 4: metadata.name'den al
    else if (eventData.item?.metadata?.name) {
      const match = eventData.item.metadata.name.match(/#(\d+)/);
      if (match) {
        tokenId = match[1];
        console.log(`✅ Token ID bulundu (metadata.name'den): ${tokenId}`);
      }
    }
    
    // Token ID bulunamadıysa tüm eventData'yı logla
    if (!tokenId) {
      console.log('❌ Token ID bulunamadı! Event data structure:');
      console.log(JSON.stringify(eventData, null, 2));
      return;
    }

    console.log(`Token ID: ${tokenId}`);

    // Token ID'yi string'e çevir
    tokenId = tokenId.toString();
    
    // Debug için token bilgisini göster
    console.log(`\n📍 Token Offer Event - Token #${tokenId}`);
    console.log(`Collection: ${contractAddress}`);
    
    // Önce bu token için aktif bir teklifimiz var mı kontrol et
    const tokenKeyWithSlug = collectionSlug ? `${collectionSlug}-${tokenId}` : null;
    const tokenKeyWithContract = `${contractAddress}-${tokenId}`;
    
    // Token offers'da bu token var mı?
    let hasActiveOffer = false;
    if (tokenKeyWithSlug && this.taskManager.tokenOffers[tokenKeyWithSlug]) {
      hasActiveOffer = true;
      console.log(`✅ Bu token için aktif teklifimiz var (slug key): ${tokenKeyWithSlug}`);
    } else if (this.taskManager.tokenOffers[tokenKeyWithContract]) {
      hasActiveOffer = true;
      console.log(`✅ Bu token için aktif teklifimiz var (contract key): ${tokenKeyWithContract}`);
    }
    
    if (!hasActiveOffer) {
      console.log(`❌ Token #${tokenId} için aktif teklifimiz yok, counterbid yapılmayacak`);
      return;
    }
    
    // Aktif teklifi al
    let activeOffer = null;
    let usedTokenKey = null;
    
    if (hasActiveOffer) {
      activeOffer = tokenKeyWithSlug ? this.taskManager.tokenOffers[tokenKeyWithSlug] : null;
      usedTokenKey = tokenKeyWithSlug;
      
      if (!activeOffer) {
        activeOffer = this.taskManager.tokenOffers[tokenKeyWithContract];
        usedTokenKey = tokenKeyWithContract;
      }
      
      console.log(`Aktif teklif: ${activeOffer.price} ETH`);
      console.log(`Kullanılan key: ${usedTokenKey}`);
    }

    // Bu token hangi task'a ait? activeOffer'dan task bilgisini alalım
    let task = null;
    let taskName = null;
    
    // Tüm task'ları kontrol et, bu collection'a ait olanı bul
    for (const [name, t] of Object.entries(this.taskManager.tasks)) {
      if (t.settings && 
          (t.settings.collection === collectionSlug || 
           t.settings.contractAddress === contractAddress) &&
          t.isActive) {
        task = t;
        taskName = name;
        break;
      }
    }
    
    if (!task) {
      console.log(`Bu collection için aktif task bulunamadı`);
      return;
    }
    
    console.log(`Task bulundu: ${taskName}`);

    // Teklif sahibini kontrol et - OpenSea dokümantasyonuna göre
    const offerMaker = eventData.maker?.address || 
                      eventData.protocol_data?.parameters?.offerer ||
                      eventData.payload?.maker?.address;
    
    if (!offerMaker) {
      console.log('Teklif sahibi bulunamadı');
      return;
    }

    if (offerMaker.toLowerCase() === config.walletAddress.toLowerCase()) {
      console.log('Kendi teklifimiz, atlanıyor');
      return;
    }

    // Fiyat bilgisini al - OpenSea dokümantasyonuna göre base_price kullanılıyor
    let priceETH = 0;
    const basePrice = eventData.base_price || eventData.payload?.base_price;
    
    if (basePrice) {
      try {
        priceETH = parseFloat(ethers.formatEther(basePrice));
        console.log(`Gelen teklif fiyatı: ${priceETH} ETH`);
      } catch (e) {
        console.error('Fiyat dönüştürme hatası:', e);
      }
    } else {
      console.log('⚠️ Fiyat bilgisi bulunamadı');
      return;
    }

    // Task ayarlarını kontrol et
    if (!task.settings.counterbidEnabled) {
      console.log('Counterbid bu görev için devre dışı');
      return;
    }

    // Fiyat limitlerini kontrol et
    const minPrice = task.settings.minPrice || 0;
    const maxPrice = task.settings.maxPrice || Infinity;
    const counterbidAmount = task.settings.counterbidAmount || 0.0001;
    
    // Yeni teklif fiyatını hesapla
    let newOfferPrice = priceETH + counterbidAmount;
    
    // Max price kontrolü
    if (newOfferPrice > maxPrice) {
      console.log(`❌ Yeni teklif (${newOfferPrice} ETH) maksimum fiyatı (${maxPrice} ETH) aşıyor`);
      return;
    }
    
    // Min price kontrolü (ilk teklif için)
    if (!hasActiveOffer && newOfferPrice < minPrice) {
      newOfferPrice = minPrice;
      console.log(`İlk teklif minimum fiyata ayarlandı: ${minPrice} ETH`);
    }

    console.log(`\n🔔 === ${hasActiveOffer ? 'COUNTER-BID' : 'İLK TEKLİF'} ===`);
    console.log(`Collection: ${contractAddress}`);
    console.log(`Token: #${tokenId}`);
    console.log(`Task: ${taskName}`);
    console.log(`Rakip teklif sahibi: ${offerMaker}`);
    console.log(`Rakip teklif: ${priceETH.toFixed(4)} ETH`);
    console.log(`Bizim yeni teklif: ${newOfferPrice.toFixed(4)} ETH`);

    // Counter-bid handler'a gönder - handler'ın beklediği formatta
    const mockEvent = {
      protocol_data: {
        parameters: {
          offerer: offerMaker
        }
      },
      maker: {
        address: offerMaker
      },
      base_price: basePrice || '0', // Wei cinsinden fiyat
      order_hash: eventData.order_hash || `stream_${Date.now()}`,
      expiration_date: eventData.expiration_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    console.log(`\n🎯 Counter-bid için event gönderiliyor`);
    await this.taskManager._handleTokenOfferEvent(task, contractAddress, tokenId, mockEvent);
  }

  /**
   * Collection listener'ı durdur
   */
  stopCollectionListener(contractAddress) {
    if (this.monitoredCollections.has(contractAddress)) {
      const listenerKey = `collection_offers_${contractAddress}`;
      
      // StreamClient handler'ı kaldır
      if (this.messageHandlers && this.messageHandlers.has(listenerKey)) {
        const handler = this.messageHandlers.get(listenerKey);
        this.api.stream.removeListener('message', handler);
        this.messageHandlers.delete(listenerKey);
      }
      
      this.monitoredCollections.delete(contractAddress);
      console.log(`🛑 Collection listener durduruldu: ${contractAddress}`);
    }
  }

  /**
   * Durum raporu
   */
  getStatus() {
    const status = {};
    for (const [contract, data] of this.monitoredCollections) {
      status[contract] = {
        tokenCount: data.tokens.size,
        tokens: Array.from(data.tokens),
        tasks: Array.from(data.tasks.entries()),
        collectionSlug: data.collectionSlug
      };
    }
    return status;
  }
}

module.exports = CollectionOfferMonitor;