const { ethers } = require('ethers');
const config = require('../config');
const HybridFastOffer = require('./hybridFastOffer');
const UltraFastBidder = require('./ultraFastBidder');
const OffChainOffer = require('./offChainOffer');
const FastCounterBid = require('./fastCounterBid');

class CollectionOfferMonitorV2 {
  constructor(api, taskManager) {
    this.api = api;
    this.taskManager = taskManager;
    this.monitoredCollections = new Map(); // collection -> { tokens: Set, tasks: Map }
    this.bidHandlers = new Map(); // collection -> handler function
    this.fastOffer = new HybridFastOffer(api); // Hızlı teklif sistemi
    this.ultraFastBidder = new UltraFastBidder(api); // Ultra hızlı paralel teklif sistemi
    this.offChainOffer = new OffChainOffer(); // Off-chain (gas ücretsiz) teklif sistemi
    this.fastCounterBid = new FastCounterBid(api); // Yeni hızlı counter-bid sistemi
    this.processedEvents = new Set(); // Duplicate event'leri önlemek için
    this.processedOrderHashes = new Map(); // Order hash cache - duplicate kontrolu için
  }

  /**
   * Collection için listener kur
   */
  setupCollectionListener(task, contractAddress, tokenId = null) {
    const taskName = task.name;
    const collectionSlug = task.settings.collection;
    const isAbstract = task.settings.chain === 'abstract';
    
    console.log(`\n🔌 === SETUP COLLECTION LISTENER ===`);
    console.log(`Collection: ${collectionSlug || contractAddress}`);
    console.log(`Task: ${taskName}`);
    console.log(`Chain: ${task.settings.chain || 'ethereum'}`);
    console.log(`Type: ${task.settings.type}`);
    console.log(`CounterBid Enabled: ${task.settings.counterbidEnabled}`);
    console.log(`Is Abstract: ${isAbstract}`);
    // Stream log'ları aşağıda stream tanımlandıktan sonra
    
    // Bu collection için zaten listener var mı?
    if (this.monitoredCollections.has(collectionSlug)) {
      const monitorData = this.monitoredCollections.get(collectionSlug);
      
      // Token listesine ekle
      if (tokenId) {
        const tokenIdStr = tokenId.toString();
        const wasAdded = !monitorData.tokens.has(tokenIdStr);
        monitorData.tokens.add(tokenIdStr);
        monitorData.tasks.set(tokenIdStr, taskName);
        
        if (wasAdded) {
          console.log(`🆕 Yeni token eklendi: #${tokenIdStr}`);
          
          // Abstract chain için yeni token listener ekle
          if (isAbstract) {
            const stream = this.api.getStreamForChain(task.settings.chain || 'abstract');
            if (stream) {
              this._addAbstractTokenListener(tokenIdStr, collectionSlug, task, stream);
            }
          }
        }
      } else if (task.settings.tokenIdList) {
        task.settings.tokenIdList.forEach(tid => {
          monitorData.tokens.add(tid.toString());
          monitorData.tasks.set(tid.toString(), taskName);
        });
      }
      
      console.log(`📡 Collection için listener zaten mevcut, token listesi güncellendi`);
      console.log(`Toplam token sayısı: ${monitorData.tokens.size}`);
      console.log(`Token listesi: [${Array.from(monitorData.tokens).join(', ')}]`);
      return;
    }

    // Yeni monitoring başlat
    const tokens = new Set();
    const tasks = new Map();
    
    // Token listesini yükle
    if (task.settings.tokenIdList) {
      task.settings.tokenIdList.forEach(tid => {
        tokens.add(tid.toString());
        tasks.set(tid.toString(), taskName);
      });
    } else if (task.settings.tokenIds) {
      task.settings.tokenIds.forEach(tid => {
        tokens.add(tid.toString());
        tasks.set(tid.toString(), taskName);
      });
    }
    
    console.log(`Token listesi: [${Array.from(tokens).join(', ')}]`);
    
    // Chain'e göre stream client'ı al - task'tan gelen chain bilgisini kullan
    const chain = task.settings.chain || 'ethereum';
    const stream = this.api.getStreamForChain(chain);
    console.log(`📌 Stream client alındı - Chain: ${chain}`);
    
    // Stream bağlantısını kontrol et (Abstract chain için opsiyonel)
    if (!stream) {
      console.log(`⚠️ ${chain} için stream client başlatılıyor, 2 saniye sonra tekrar denenecek...`);
      setTimeout(() => this.setupCollectionListener(task, contractAddress, tokenId), 2000);
      return;
    }
    
    if (chain !== 'abstract' && stream.connected === false) {
      console.log('⚠️ Stream API bağlı değil, 2 saniye sonra tekrar denenecek...');
      setTimeout(() => this.setupCollectionListener(task, contractAddress, tokenId), 2000);
      return;
    } else if (chain === 'abstract') {
      console.log('ℹ️ Abstract chain - Stream API opsiyonel');
    }
    
    console.log(`stream exists: ${!!stream}`);
    console.log(`stream type: ${stream?.constructor?.name}`);
    
    // Bid event handler - HIZLANDIRILMIŞ
    const bidHandler = async (data) => {
      // Data formatını kontrol et - zaten normalize gelebilir
      if (!data.type && data.order_hash) {
        // api.js'den gelen format için type ekle
        data.type = 'collection_offer';
      }
      
      // Hızlı kontroller
      if (data.collection !== collectionSlug) return;
      if (data.maker && data.maker.toLowerCase() === config.walletAddress.toLowerCase()) return;
      
      // Duplicate kontrolü
      const eventHash = data.orderHash;
      const duplicateKey = `${data.maker}_${data.priceWei}_${data.collection}`;
      const now = Date.now();
      
      if (!this.processedOrderHashes) this.processedOrderHashes = new Set();
      
      // OrderHash kontrolü
      if (this.processedOrderHashes.has(eventHash)) return;
      
      // Maker/price kontrolü (5 saniye)
      if (this.processedEvents.has(duplicateKey)) {
        const lastProcessTime = this.processedEventsTime.get(duplicateKey);
        if (lastProcessTime && (now - lastProcessTime) < 5000) return;
      }
      
      // Task type kontrolü - collection offer task'ında sadece collection offer'ları işle
      const isCollectionTask = task.settings.type === 'collectionoffer';
      const isCollectionEvent = data.type === 'collection_offer';
      
      // Collection offer task'ında token offer event'leri sessizce atla
      if (isCollectionTask && !isCollectionEvent && data.tokenId) {
        return; // Sessizce atla, log gösterme
      }
      
      // Collection offer ise
      if (isCollectionEvent || (isCollectionTask && !data.tokenId)) {
        // Detaylı log
        console.log(`\n💎 === COLLECTION OFFER EVENT ===`);
        console.log(`Collection: ${collectionSlug}`);
        console.log(`Price: ${data.price} ETH (${data.priceWei} wei)`);
        console.log(`Maker: ${data.maker}`);
        console.log(`Order Hash: ${data.orderHash}`);
        
        // Event'i hemen işle
        await this.handleCollectionOffer(data, task, contractAddress, collectionSlug);
        
        // Event başarıyla işlendi, duplicate olarak işaretle
        this.processedOrderHashes.set(eventHash, Date.now());
        this.processedEvents.add(duplicateKey);
        if (!this.processedEventsTime) this.processedEventsTime = new Map();
        this.processedEventsTime.set(duplicateKey, now);
        
        // Temizleme
        setTimeout(() => {
          this.processedOrderHashes.delete(eventHash);
          this.processedEvents.delete(duplicateKey);
          this.processedEventsTime.delete(duplicateKey);
        }, 60 * 1000);
        
        return;
      }
      
      // Token offer ise - önce bizim aktif teklifimiz var mı kontrol et
      const tokenKey = `${collectionSlug}-${data.tokenId}`;
      const hasActiveOffer = this.taskManager.tokenOffers && this.taskManager.tokenOffers[tokenKey];
      
      // Eğer bu token için aktif teklifimiz yoksa, sessizce atla
      if (!hasActiveOffer) {
        return; // Hiç log gösterme
      }
      
      // Token izleniyor mu kontrol et
      if (!tokens.has(data.tokenId)) {
        return; // Sessizce atla
      }
      
      // Kendi teklifimiz mi?
      if (data.maker.toLowerCase() === config.walletAddress.toLowerCase()) {
        return; // Sessizce atla
      }
      
      // Sadece bizim aktif teklifimiz olan token'lar için log göster
      console.log(`\n🎯 [${collectionSlug}] Token #${data.tokenId} teklif aldı!`);
      console.log(`   Fiyat: ${data.price.toFixed(4)} ETH`);
      console.log(`   Teklif sahibi: ${data.maker}`);
      console.log(`   ✅ BU BİZİM TEKLİF VERDİĞİMİZ TOKEN!`)
      
      // Counter-bid için event tetikle
      await this.handleTokenBid(data, task, contractAddress, collectionSlug);
      
      // Event başarıyla işlendi, duplicate olarak işaretle
      this.processedOrderHashes.set(eventHash, Date.now());
      this.processedEvents.add(duplicateKey);
      if (!this.processedEventsTime) this.processedEventsTime = new Map();
      this.processedEventsTime.set(duplicateKey, now);
      
      // Temizleme
      setTimeout(() => {
        this.processedOrderHashes.delete(eventHash);
        this.processedEvents.delete(duplicateKey);
        this.processedEventsTime.delete(duplicateKey);
      }, 60 * 1000);
    };
    
    // Collection offer task ise
    if (task.settings.type === 'collectionoffer') {
      console.log(`📡 Collection offer listener kuruluyor...`);
      
      // Abstract chain için özel handling
      if (isAbstract) {
        // Abstract stream client üzerinden collection offer dinle
        const collectionOfferHandler = async (event) => {
          console.log(`\n🚀🚀🚀 [collectionOfferHandler] ABSTRACT COLLECTION OFFER EVENT ALINDI! 🚀🚀🚀`);
          console.log(`[collectionOfferHandler] Task name: ${task.name}`);
          console.log(`[collectionOfferHandler] Task counterbid enabled: ${task.settings.counterbidEnabled}`);
          console.log(`[collectionOfferHandler] Collection slug: ${collectionSlug}`);
          console.log(`[collectionOfferHandler] Contract address: ${contractAddress}`);
          console.log(`[collectionOfferHandler] Raw event:`, JSON.stringify(event, null, 2));
          
          // Event listener durumunu kontrol et
          if (stream) {
            console.log(`[collectionOfferHandler] All event listeners:`, stream.eventNames());
            console.log(`[collectionOfferHandler] General listener count:`, stream.listenerCount('collection_offer'));
            console.log(`[collectionOfferHandler] Specific listener count:`, stream.listenerCount(`collection_offer_${collectionSlug}`));
          }
          
          // Event payload'ını al - farklı formatları destekle
          let eventPayload = event;
          if (event.payload?.payload) {
            eventPayload = event.payload.payload;
          } else if (event.payload) {
            eventPayload = event.payload;
          }
          
          console.log(`[collectionOfferHandler] EventPayload keys:`, Object.keys(eventPayload));
          
          // Offerer'ı al - farklı yerlerden deneyerek
          const maker = eventPayload.protocol_data?.parameters?.offerer || 
                       eventPayload.offerer ||
                       eventPayload.maker?.address ||
                       eventPayload.maker ||
                       eventPayload.payload?.maker?.address ||
                       eventPayload.payload?.offerer ||
                       'unknown';
          
          console.log(`[collectionOfferHandler] Maker found: ${maker}`);
          
          // Fiyatı al - farklı yerlerden deneyerek
          let priceInEth = 0;
          let priceWei = '0';
          
          // Farklı fiyat alanlarını kontrol et
          const possiblePriceFields = [
            eventPayload.base_price,
            eventPayload.price?.value,
            eventPayload.price,
            eventPayload.payload?.base_price,
            eventPayload.payload?.price?.value,
            eventPayload.payload?.price
          ];
          
          for (const priceField of possiblePriceFields) {
            if (priceField) {
              priceWei = priceField.toString();
              break;
            }
          }
          
          console.log(`[collectionOfferHandler] Price wei found: ${priceWei}`);
          
          if (priceWei && priceWei !== '0') {
            try {
              priceInEth = parseFloat(ethers.formatEther(priceWei));
              console.log(`[collectionOfferHandler] Price conversion: ${priceWei} wei = ${priceInEth} ETH`);
            } catch (e) {
              console.error('[collectionOfferHandler] Fiyat dönüşüm hatası:', e);
              priceInEth = 0;
            }
          }
          
          // Order hash'i al
          const orderHash = eventPayload.order_hash || 
                          eventPayload.orderHash || 
                          eventPayload.payload?.order_hash ||
                          eventPayload.payload?.orderHash ||
                          `${collectionSlug}_${priceWei}_${Date.now()}`;
          
          // bidHandler'ın beklediği formata dönüştür
          const formattedData = {
            type: 'collection_offer',
            collection: collectionSlug,
            price: priceInEth,
            priceWei: priceWei,
            maker: maker,
            orderHash: orderHash,
            quantity: eventPayload.quantity || eventPayload.payload?.quantity || 1,
            fullPayload: event
          };
          
          console.log(`\n💎 [collectionOfferHandler] FORMATTED DATA:`, formattedData);
          console.log(`\n🎯 [collectionOfferHandler] bidHandler çağrılıyor...`);
          
          // bidHandler'ı çağır
          bidHandler(formattedData);
          console.log(`✅ [collectionOfferHandler] bidHandler çağrıldı!`);
        };
        
        // Abstract stream client'a listener ekle
        if (stream && isAbstract) {
          console.log(`\n🔧 Abstract stream setup başlıyor...`);
          console.log(`Stream client type: ${stream.constructor.name}`);
          
          // Önce collection'a subscribe ol
          stream.subscribeToCollection(collectionSlug);
          console.log(`📡 Abstract stream'de ${collectionSlug} collection'ına subscribe olunuyor...`);
          
          // Yeni format için direkt handler - HIZLANDIRILMIŞ
          const directCollectionOfferHandler = async (data) => {
            // Direkt gelen data'yı kontrol et
            if (data && data.type === 'collection_offer' && data.collection === collectionSlug) {
              // Event zaten doğru formatta, direkt bidHandler'a gönder
              await bidHandler(data);
            } else if (data && !data.type) {
              // Eski format event, collectionOfferHandler'a yönlendir
              await collectionOfferHandler(data);
            }
          };
          
          // Sadece collection slug bazlı listener kullan - duplicate event'leri önlemek için
          const slugEventName = `collection_offer_${collectionSlug}`;
          
          console.log(`\n📌 Collection offer listener ekleniyor: ${slugEventName}`);
          
          // Önce eski listener'ları temizle (varsa)
          stream.removeAllListeners(slugEventName);
          
          // Yeni listener ekle
          stream.on(slugEventName, directCollectionOfferHandler);
          
          console.log(`✅ Abstract collection offer listener eklendi!`);
          console.log(`✅ Listener sayısı (${slugEventName}): ${stream.listenerCount(slugEventName)}`);
          
          // Debug: Tüm event listener'ları göster
          console.log(`\n📋 Tüm aktif event listener'lar:`, stream.eventNames());
          console.log(`📋 Her event için listener sayısı:`, 
            stream.eventNames().map(e => `${e}: ${stream.listenerCount(e)}`));
        } else if (isAbstract) {
          console.log(`⚠️ Abstract stream client bulunamadı`);
          console.log(`stream: ${stream}`);
        }
      } else {
        // ETH chain için mevcut sistem
        this.api.listenToCollectionOffers(task.settings.chain || 'ethereum', collectionSlug, (event) => {
          // api.js'den gelen event zaten doğru formatta
          const formattedData = {
            type: 'collection_offer',
            collection: collectionSlug,
            price: event.price || 0,              // Direkt kullan
            priceWei: event.priceWei || '0',      // Direkt kullan
            maker: event.maker || 'unknown',       // Direkt kullan
            orderHash: event.order_hash,           // Direkt kullan
            quantity: 1,
            fullPayload: event.fullPayload || event
          };
          
          bidHandler(formattedData);
        });
      }
    } else {
      // Token offer task - her token için ayrı listener kur
      
      // Abstract chain için özel handling
      if (isAbstract) {
        console.log(`\n🔷 === ABSTRACT CHAIN TOKEN OFFER LISTENER KURULUMU ===`);
        console.log(`Collection: ${collectionSlug}`);
        console.log(`Contract: ${contractAddress}`);
        console.log(`Token sayısı: ${tokens.size}`);
        
        // Abstract stream client kontrolü
        if (!stream) {
          console.error('❌ Abstract stream client bulunamadı!');
          console.log(`API object keys:`, Object.keys(this.api));
          console.log(`stream: ${stream}`);
          return;
        }
        
        console.log(`\n📡 === ABSTRACT STREAM SUBSCRIPTION BAŞLATILIYOR ===`);
        console.log(`Stream client type: ${stream.constructor.name}`);
        console.log(`Stream connected: ${stream.isConnected || stream.connected}`);
        console.log(`WebSocket state: ${stream.ws?.readyState}`);
        
        // Önce collection'a subscribe ol
        console.log(`\n🔔 Collection'a subscribe olunuyor: ${collectionSlug}`);
        stream.subscribeToCollection(collectionSlug);
        
        // Subscribe'dan sonra biraz bekle
        setTimeout(() => {
          console.log(`\n📊 Subscription durumu kontrol ediliyor...`);
          if (stream.successfulCollectionFormats) {
            console.log(`✅ Başarılı collection formatları:`, 
              Array.from(stream.successfulCollectionFormats.entries()));
          }
          if (stream.successfulTopics) {
            console.log(`✅ Başarılı topic'ler:`, stream.successfulTopics);
          }
        }, 2000);
        
        // Her token için Abstract stream listener kur
        tokens.forEach(tokenId => {
          console.log(`\n📡 Abstract Token #${tokenId} için listener kuruluyor...`);
          
          // Token offer handler
          const abstractTokenOfferHandler = (event) => {
            console.log(`\n🚀🚀🚀 [Abstract Token Offer] EVENT ALINDI! 🚀🚀🚀`);
            console.log(`Event type: ${event.type || 'unknown'}`);
            console.log(`Collection: ${event.collection}`);
            console.log(`Token ID: ${event.tokenId}`);
            console.log(`Raw event:`, JSON.stringify(event, null, 2));
            
            // Token ID kontrolü
            if (event.tokenId !== tokenId.toString()) {
              console.log(`⚠️ Farklı token ID: ${event.tokenId} !== ${tokenId}`);
              return;
            }
            
            // Collection kontrolü
            if (event.collection !== collectionSlug) {
              console.log(`⚠️ Farklı collection: ${event.collection} !== ${collectionSlug}`);
              return;
            }
            
            console.log(`✅ Token ve collection eşleşti!`);
            
            // Fiyat dönüşümü
            let priceInEth = 0;
            let priceWei = event.price || event.priceWei || '0';
            
            if (priceWei && priceWei !== '0') {
              try {
                priceInEth = parseFloat(ethers.formatEther(priceWei));
                console.log(`💰 Fiyat: ${priceWei} wei = ${priceInEth} ETH`);
              } catch (e) {
                console.error('Fiyat dönüşüm hatası:', e);
              }
            }
            
            // bidHandler formatına dönüştür
            const formattedData = {
              collection: collectionSlug,
              tokenId: tokenId.toString(),
              price: priceInEth,
              priceWei: priceWei,
              maker: event.offerer || event.maker || 'unknown',
              orderHash: event.orderHash || `abstract_${tokenId}_${priceWei}_${Date.now()}`,
              fullPayload: event.payload || event
            };
            
            console.log(`\n💎 [Abstract Token Offer] FORMATTED DATA:`, formattedData);
            console.log(`\n🎯 bidHandler çağrılıyor...`);
            
            // bidHandler'ı çağır
            bidHandler(formattedData);
            console.log(`✅ bidHandler çağrıldı!`);
          };
          
          // Farklı event isimleri için listener ekle
          const eventNames = [
            'item_received_offer',
            'offer_received',
            `item_received_bid_${collectionSlug}_${tokenId}`,
            `token_offer_${collectionSlug}_${tokenId}`,
            'item_received_bid'
          ];
          
          eventNames.forEach(eventName => {
            console.log(`📌 Event listener ekleniyor: ${eventName}`);
            stream.on(eventName, abstractTokenOfferHandler);
            console.log(`✅ Listener count (${eventName}): ${stream.listenerCount(eventName)}`);
          });
        });
        
        console.log(`\n✅ Abstract token offer listener'lar kuruldu!`);
        console.log(`📊 Toplam izlenen token: ${tokens.size}`);
        
      } else {
        // Normal chain için mevcut sistem
        tokens.forEach(tokenId => {
          console.log(`📡 Token #${tokenId} için listener kuruluyor...`);
          
          // listenToItemOffers'dan gelen veriyi bidHandler formatına dönüştür
          const tokenBidHandler = (event) => {
            // event formatı: { payload: { payload: { protocol_data, base_price, order_hash, maker } } }
            console.log(`\n[DEBUG] Token bid event alındı:`, JSON.stringify(event).substring(0, 500));
            
            // Event payload'ını al
            const eventPayload = event.payload?.payload || event.payload || event;
            
            // Offerer'ı al - farklı yerlerden deneyerek
            const maker = eventPayload.protocol_data?.parameters?.offerer || 
                         eventPayload.maker?.address ||
                         eventPayload.maker ||
                         'unknown';
            
            // Fiyatı al - base_price wei formatında geliyor
            let priceInEth = 0;
            if (eventPayload.base_price) {
              try {
                priceInEth = parseFloat(ethers.formatEther(eventPayload.base_price));
              } catch (e) {
                console.error('Fiyat dönüşüm hatası:', e);
                priceInEth = 0;
              }
            }
            
            // bidHandler'ın beklediği formata dönüştür
            const formattedData = {
              collection: collectionSlug,
              tokenId: tokenId.toString(),
              price: priceInEth,
              priceWei: eventPayload.base_price || '0',
              maker: maker,
              orderHash: eventPayload.order_hash || event.order_hash,
              fullPayload: event
            };
            
            console.log(`[DEBUG] Formatted bid data:`, formattedData);
            
            // bidHandler'ı çağır
            bidHandler(formattedData);
          };
          
          this.api.listenToItemOffers(task.settings.chain || 'ethereum', contractAddress, tokenId, tokenBidHandler);
        });
      }
    }
    
    // Handler'ı sakla
    this.bidHandlers.set(collectionSlug, bidHandler);
    
    // Collection'ı kaydet
    this.monitoredCollections.set(collectionSlug, {
      tokens: tokens,
      tasks: tasks,
      contractAddress: contractAddress,
      handler: bidHandler
    });
    
    console.log(`✅ Collection dinleniyor: ${collectionSlug}`);
    console.log(`📡 ${tokens.size} token takip ediliyor\n`);
  }

  /**
   * Collection offer işle - HIZLANDIRILMIŞ
   */
  async handleCollectionOffer(offerData, task, contractAddress, collectionSlug) {
    const { price, priceWei, maker, orderHash, quantity, event_timestamp } = offerData;
    
    // Event yaşı kontrolü (30 saniyeden eski event'leri reddet)
    if (event_timestamp) {
      const eventTime = new Date(event_timestamp).getTime();
      const now = Date.now();
      const eventAge = (now - eventTime) / 1000; // saniye cinsinden
      
      if (eventAge > 30) {
        console.log(`⏭️ Eski event atlanıyor (${eventAge.toFixed(1)}s yaşında): ${collectionSlug} - ${price} ETH`);
        return;
      }
      console.log(`📅 Event yaşı: ${eventAge.toFixed(1)}s`);
    }
    const collectionKey = `collection-${collectionSlug}`;
    
    console.log(`\n🎯 === HANDLE COLLECTION OFFER ===`);
    console.log(`Collection: ${collectionSlug}`);
    console.log(`Price: ${price} ETH (wei: ${priceWei})`);
    console.log(`Maker: ${maker}`);
    console.log(`Order Hash: ${orderHash}`);
    console.log(`Task counterbid enabled: ${task.settings.counterbidEnabled}`);
    console.log(`Task settings:`, {
      minPrice: task.settings.minPrice,
      maxPrice: task.settings.maxPrice,
      counterbidAmount: task.settings.counterbidAmount
    });
    
    // Duplicate kontrolü
    if (orderHash && this.processedOrderHashes.has(orderHash)) {
      const lastProcessedTime = this.processedOrderHashes.get(orderHash);
      const timeSinceProcessed = (Date.now() - lastProcessedTime) / 1000;
      console.log(`🔄 Duplicate event atlanıyor (${timeSinceProcessed.toFixed(1)}s önce işlendi): ${orderHash}`);
      return;
    }
    
    // Order hash'i kaydet
    if (orderHash) {
      this.processedOrderHashes.set(orderHash, Date.now());
      // 5 dakika sonra cache'den temizle
      setTimeout(() => {
        this.processedOrderHashes.delete(orderHash);
      }, 5 * 60 * 1000);
    }
    
    // Hızlı kontroller
    if (maker && maker.toLowerCase() === config.walletAddress.toLowerCase()) {
      console.log(`⚠️ Kendi teklifimiz, atlanıyor`);
      return;
    }
    if (!task.settings.counterbidEnabled) {
      console.log(`⚠️ Counterbid kapalı`);
      return;
    }
    if (task.settings.streamApiEnabled === false) {
      console.log(`⚠️ Stream API kapalı`);
      return;
    }
    
    // HIZLI TEKLİF KONTROLÜ - API çağrısını minimize et
    let ourPrice = null;
    
    console.log(`\n📊 Mevcut teklif bilgisi aranıyor...`);
    console.log(`- Task lastOfferPrice: ${task.lastOfferPrice}`);
    console.log(`- CollectionKey: ${collectionKey}`);
    console.log(`- CollectionOffers cache:`, this.taskManager.collectionOffers ? Object.keys(this.taskManager.collectionOffers) : 'YOK');
    
    // 1. Önce task'tan kontrol et (en hızlı)
    if (task.lastOfferPrice) {
      ourPrice = task.lastOfferPrice;
      console.log(`✅ Task'tan alındı: ${ourPrice} ETH`);
    }
    // 2. CollectionOffers cache'den kontrol et
    else if (this.taskManager.collectionOffers && this.taskManager.collectionOffers[collectionKey]) {
      ourPrice = this.taskManager.collectionOffers[collectionKey].price;
      console.log(`✅ Cache'den alındı: ${ourPrice} ETH`);
    }
    // 3. MinPrice'ı fallback olarak kullan (API'ye gitmeden)
    else if (task.settings.minPrice) {
      ourPrice = task.settings.minPrice;
      console.log(`⚡ MinPrice kullanılıyor: ${ourPrice} ETH (Hızlı counterbid için)`);
    }
    
    if (!ourPrice) {
      console.log(`⚠️ Teklif bilgisi bulunamadı, counterbid yapılamıyor`);
      return;
    }
    
    // Hızlı fiyat karşılaştırması
    console.log(`\n💰 Fiyat karşılaştırması:`);
    console.log(`- Gelen teklif: ${price} ETH`);
    console.log(`- Bizim teklif: ${ourPrice} ETH`);
    
    if (price <= ourPrice) {
      console.log(`✅ Gelen teklif bizimkinden düşük veya eşit, counter-bid gerekmez`);
      return;
    }
    
    console.log(`⚡ COUNTER-BID GEREKLİ: ${collectionSlug} | Rakip: ${price} > Bizim: ${ourPrice} ETH`);
    
    // Hızlı counter-bid
    try {
      const counterbidAmount = task.settings.counterbidAmount || 0.0001;
      // OpenSea 4 decimal precision için round et
      const newPrice = Math.round((price + counterbidAmount) * 10000) / 10000;
      
      // Max price kontrolü
      if (newPrice > task.settings.maxPrice) {
        console.log(`⛔ Counter-bid (${newPrice.toFixed(4)} ETH) max price'ı (${task.settings.maxPrice} ETH) aşıyor!`);
        return;
      }
      
      // Hemen teklif at
      const chain = task.settings.chain || 'ethereum';
      // offerTime zaten milisaniye cinsinden geliyor, direkt kullan
      const expirationTimeMs = Date.now() + (task.settings.offerTime || 15 * 60 * 1000);
      
      console.log(`🔄 Counter-bid parametreleri:`);
      console.log(`- Chain: ${chain}`);
      console.log(`- Collection: ${collectionSlug}`);
      console.log(`- New Price: ${newPrice} ETH`);
      console.log(`- Expiration (minutes): ${task.settings.offerTime / 60000}`);
      console.log(`- Expiration (timestamp): ${expirationTimeMs}`);
      
      const result = await this.api.createCollectionOffer(
        chain,
        collectionSlug,
        newPrice,
        expirationTimeMs
      );
      
      if (result.success) {
        // Cache güncelle
        if (!this.taskManager.collectionOffers) {
          this.taskManager.collectionOffers = {};
        }
        
        this.taskManager.collectionOffers[collectionKey] = {
          price: newPrice,
          taskName: task.name,
          expirationTime: expirationTimeMs,
          chain: chain,
          contractAddress: contractAddress,
          orderHash: result.orderHash || result.order_hash
        };
        
        // Task bilgilerini güncelle
        task.lastOfferPrice = newPrice;
        task.lastOfferTime = Date.now();
        
        console.log(`✅ COUNTER-BID BAŞARILI! ${collectionSlug} → ${newPrice.toFixed(4)} ETH | Order: ${result.orderHash}`);
      } else {
        console.error(`❌ Counter-bid hatası: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Counter-bid exception: ${error.message}`);
    }
  }

  /**
   * Token teklifi işle
   */
  async handleTokenBid(bidData, task, contractAddress, collectionSlug) {
    const { tokenId, price, priceWei, maker, orderHash, fullPayload } = bidData;
    // TaskManager collection slug kullanıyor, contract address değil!
    const tokenKey = `${collectionSlug}-${tokenId}`;
    
    console.log(`\n🔔 === COUNTER-BID DEĞERLENDİRMESİ ===`);
    console.log(`Token: ${collectionSlug} #${tokenId}`);
    console.log(`Token Key: ${tokenKey}`);
    console.log(`Yeni teklif: ${price.toFixed(4)} ETH`);
    console.log(`Teklif sahibi: ${maker}`);
    console.log(`Task Chain: ${task.settings.chain}`);
    console.log(`Collection Slug: ${collectionSlug}`);
    console.log(`Contract Address: ${contractAddress}`);
    
    // Debug: Event detayları
    console.log(`\n📋 Event Detayları:`);
    console.log(`- Order Hash: ${orderHash}`);
    console.log(`- Price Wei: ${priceWei}`);
    console.log(`- Maker: ${maker}`);
    
    // Debug: Mevcut token offers'ı göster
    console.log(`\n📦 Mevcut tokenOffers durumu:`);
    console.log(`- Toplam token offer sayısı: ${Object.keys(this.taskManager.tokenOffers).length}`);
    console.log(`- Tüm key'ler:`, Object.keys(this.taskManager.tokenOffers));
    console.log(`- Aranan key: "${tokenKey}"`);
    console.log(`- Key mevcut mu?: ${this.taskManager.tokenOffers.hasOwnProperty(tokenKey)}`);
    
    // Bizim aktif teklifimiz var mı?
    const ourOffer = this.taskManager.tokenOffers[tokenKey];
    if (!ourOffer) {
      console.log(`⚠️ Bu token için aktif teklifimiz yok`);
      console.log(`🔍 Alternatif key'ler kontrol ediliyor...`);
      
      // Contract address ile de dene
      const altKey1 = `${contractAddress}-${tokenId}`;
      const altKey2 = `${task.settings.collection}-${tokenId}`;
      
      console.log(`- Alt key 1: "${altKey1}" - Mevcut mu?: ${this.taskManager.tokenOffers.hasOwnProperty(altKey1)}`);
      console.log(`- Alt key 2: "${altKey2}" - Mevcut mu?: ${this.taskManager.tokenOffers.hasOwnProperty(altKey2)}`);
      
      // Benzer key'leri ara
      const similarKeys = Object.keys(this.taskManager.tokenOffers).filter(k => k.includes(tokenId));
      if (similarKeys.length > 0) {
        console.log(`🔍 Token ID içeren key'ler bulundu:`, similarKeys);
      }
      
      return;
    }
    
    // Price kontrolü - undefined veya null kontrolü
    if (ourOffer.price === undefined || ourOffer.price === null || typeof ourOffer.price !== 'number') {
      console.log(`⚠️ Token offer'da geçerli price bilgisi yok!`);
      console.log(`Token Key: ${tokenKey}`);
      console.log(`Offer detayı:`, ourOffer);
      return;
    }
    
    console.log(`🎯 Bizim teklifimiz: ${ourOffer.price.toFixed(4)} ETH`);
    console.log(`📦 Teklif detayları:`, ourOffer);
    
    // Yeni teklif bizden yüksek mi?
    if (price <= ourOffer.price) {
      console.log(`✅ Yeni teklif (${price.toFixed(4)} ETH) bizim teklifimizden (${ourOffer.price.toFixed(4)} ETH) düşük veya eşit`);
      console.log(`🚫 Counter-bid gerekmez`);
      return;
    }
    
    console.log(`\n🚨 YENİ TEKLİF BİZDEN YÜKSEK!`);
    console.log(`📊 Rakip: ${price.toFixed(4)} ETH > Bizim: ${ourOffer.price.toFixed(4)} ETH`);
    console.log(`🎯 Counter-bid yapılacak...`);
    
    // Counter-bid fiyat hesaplaması
    const counterbidAmount = task.settings.counterbidAmount || 0.0001;
    const newPrice = price + counterbidAmount;
    
    console.log(`💵 Counter-bid hesaplaması:`);
    console.log(`  - Rakip teklif: ${price.toFixed(4)} ETH`);
    console.log(`  - Counter miktarı: ${counterbidAmount} ETH`);
    console.log(`  - Yeni teklif: ${newPrice.toFixed(4)} ETH`);
    
    // Max price kontrolü
    if (task.settings.maxPrice && newPrice > task.settings.maxPrice) {
      console.log(`⛔ Yeni teklif (${newPrice.toFixed(4)} ETH) max price'ı (${task.settings.maxPrice} ETH) aşıyor!`);
      console.log(`🚫 Counter-bid yapılamaz`);
      return;
    }
    
    console.log(`✅ Max price kontrolü geçti`);
    
    // FastCounterBid sistemini kullan
    try {
      console.log(`\n🚀 FastCounterBid sistemi başlatılıyor...`);
      
      // Stream'den gelen veriyi kullan - API'ye gitmeye gerek yok!
      // Çünkü zaten event'ten gelen fiyat en güncel
      const streamOffer = {
        price: {
          value: priceWei,
          currency: 'WETH',
          decimals: 18
        },
        maker: {
          address: maker
        },
        order_hash: orderHash
      };
      
      console.log(`📊 Stream'den gelen teklif kullanılıyor: ${price.toFixed(4)} ETH`);
      console.log(`💲 Wei değeri: ${priceWei}`);
      
      // Direkt FastCounterBid'e gönder
      const result = await this.fastCounterBid.createCounterBid(
        task,
        tokenId,
        streamOffer
      );
      
      if (result.success) {
        // Token offers'ı güncelle
        this.taskManager.tokenOffers[tokenKey] = {
          price: result.price,
          taskName: task.name,
          expirationTime: Date.now() + (15 * 60 * 1000),
          chain: task.settings.chain || 'ethereum',
          contractAddress: contractAddress || this.monitoredCollections.get(collectionSlug)?.contractAddress,
          offChain: true,
          orderHash: result.orderHash
        };
        
        console.log(`\n🎉 COUNTER-BID BAŞARILI!`);
        console.log(`📦 Token: ${collectionSlug} #${tokenId}`);
        console.log(`💰 Yeni fiyat: ${result.price.toFixed(4)} ETH`);
        console.log(`🎫 Order Hash: ${result.orderHash}`);
        console.log(`⏱ Zaman: ${new Date().toLocaleString()}`);
      } else {
        throw new Error(result.error || 'FastCounterBid başarısız');
      }
      
    } catch (error) {
      console.error(`\n❌ COUNTER-BID HATASI!`);
      console.error(`📦 Token: ${collectionSlug} #${tokenId}`);
      console.error(`📝 Hata: ${error.message}`);
      console.error(`🔍 Stack:`, error.stack);
    }
  }

  /**
   * Abstract chain için yeni token listener ekle
   * @private
   */
  _addAbstractTokenListener(tokenId, collectionSlug, task, stream) {
    console.log(`\n🆕 Abstract chain'de yeni token listener ekleniyor: #${tokenId}`);
    
    const bidHandler = this.bidHandlers.get(collectionSlug);
    if (!bidHandler) {
      console.error(`❌ bidHandler bulunamadı: ${collectionSlug}`);
      return;
    }
    
    // Token offer handler
    const abstractTokenOfferHandler = (event) => {
      console.log(`\n🚀🚀🚀 [Abstract Token Offer - Yeni Token] EVENT ALINDI! 🚀🚀🚀`);
      console.log(`Event type: ${event.type || 'unknown'}`);
      console.log(`Collection: ${event.collection}`);
      console.log(`Token ID: ${event.tokenId}`);
      console.log(`Raw event:`, JSON.stringify(event, null, 2));
      
      // Token ID kontrolü
      if (event.tokenId !== tokenId.toString()) {
        console.log(`⚠️ Farklı token ID: ${event.tokenId} !== ${tokenId}`);
        return;
      }
      
      // Collection kontrolü
      if (event.collection !== collectionSlug) {
        console.log(`⚠️ Farklı collection: ${event.collection} !== ${collectionSlug}`);
        return;
      }
      
      console.log(`✅ Token ve collection eşleşti!`);
      
      // Fiyat dönüşümü
      let priceInEth = 0;
      let priceWei = event.price || event.priceWei || '0';
      
      if (priceWei && priceWei !== '0') {
        try {
          priceInEth = parseFloat(ethers.formatEther(priceWei));
          console.log(`💰 Fiyat: ${priceWei} wei = ${priceInEth} ETH`);
        } catch (e) {
          console.error('Fiyat dönüşüm hatası:', e);
        }
      }
      
      // bidHandler formatına dönüştür
      const formattedData = {
        collection: collectionSlug,
        tokenId: tokenId.toString(),
        price: priceInEth,
        priceWei: priceWei,
        maker: event.offerer || event.maker || 'unknown',
        orderHash: event.orderHash || `abstract_${tokenId}_${priceWei}_${Date.now()}`,
        fullPayload: event.payload || event
      };
      
      console.log(`\n💎 [Abstract Token Offer - Yeni Token] FORMATTED DATA:`, formattedData);
      console.log(`\n🎯 bidHandler çağrılıyor...`);
      
      // bidHandler'ı çağır
      bidHandler(formattedData);
      console.log(`✅ bidHandler çağrıldı!`);
    };
    
    // Farklı event isimleri için listener ekle
    const eventNames = [
      'item_received_offer',
      'offer_received',
      `item_received_bid_${collectionSlug}_${tokenId}`,
      `token_offer_${collectionSlug}_${tokenId}`,
      'item_received_bid'
    ];
    
    eventNames.forEach(eventName => {
      console.log(`📌 Event listener ekleniyor: ${eventName}`);
      stream.on(eventName, abstractTokenOfferHandler);
      console.log(`✅ Listener count (${eventName}): ${stream.listenerCount(eventName)}`);
    });
    
    console.log(`✅ Yeni token için Abstract listener'lar kuruldu: #${tokenId}`);
  }

  /**
   * Token'ı monitoring'den kaldır
   */
  removeToken(contractAddress, tokenId) {
    // Collection slug'ı bul
    let targetCollection = null;
    for (const [collection, data] of this.monitoredCollections) {
      if (data.contractAddress === contractAddress) {
        targetCollection = collection;
        break;
      }
    }
    
    if (targetCollection) {
      const data = this.monitoredCollections.get(targetCollection);
      data.tokens.delete(tokenId.toString());
      
      console.log(`🛑 Token #${tokenId} monitoring'den kaldırıldı`);
      
      // Eğer hiç token kalmadıysa collection'ı da kaldır
      if (data.tokens.size === 0) {
        this.removeCollection(targetCollection);
      }
    }
  }

  /**
   * Collection monitoring'i durdur
   */
  removeCollection(collectionSlug) {
    if (this.monitoredCollections.has(collectionSlug)) {
      const data = this.monitoredCollections.get(collectionSlug);
      
      // Task'tan chain bilgisini al ve stream'i belirle
      const task = Object.values(this.taskManager.tasks).find(t => t.settings.collection === collectionSlug);
      const chain = task?.settings?.chain || 'ethereum';
      const stream = this.api.getStreamForChain(chain);
      
      // Event handler'ı kaldır
      if (data.handler && stream) {
        stream.removeListener('item_received_bid', data.handler);
      }
      
      // Collection offer listener'larını kaldır (Abstract chain için)
      if (stream) {
        const generalEventName = 'collection_offer';
        const slugEventName = `collection_offer_${collectionSlug}`;
        const contractEventName = data.contractAddress ? `collection_offer_${data.contractAddress}` : null;
        
        // Tüm listener'ları kaldır
        stream.removeAllListeners(generalEventName);
        stream.removeAllListeners(slugEventName);
        if (contractEventName) {
          stream.removeAllListeners(contractEventName);
        }
        
        console.log(`🛑 Collection offer listener'ları kaldırıldı`);
      }
      
      this.monitoredCollections.delete(collectionSlug);
      this.bidHandlers.delete(collectionSlug);
      
      console.log(`🛑 Collection monitoring durduruldu: ${collectionSlug}`);
    }
  }
}

module.exports = CollectionOfferMonitorV2;