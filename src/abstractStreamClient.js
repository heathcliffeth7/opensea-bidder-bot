const WebSocket = require('ws');
const EventEmitter = require('events');
const { getAbstractContractAddress, getAbstractCollectionSlug } = require('./abstractCollections');

/**
 * Abstract chain için OpenSea Stream API client
 * Phoenix protokolü kullanarak WebSocket üzerinden event dinler
 */
class AbstractStreamClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.apiKey = null;
    this.collections = new Set();
    this.heartbeatInterval = null;
    this.reconnectTimeout = null;
    this.isConnected = false;
    this.ref = 0;
    this.urlIndex = 0;
    this.topicFormatIndex = 0;
    this.reconnectCount = 0;
  }

  /**
   * Stream client'ı başlat
   */
  async initialize(apiKey) {
    this.apiKey = apiKey;
    await this.connect();
  }

  /**
   * WebSocket bağlantısı kur
   */
  async connect() {
    try {
      // Abstract chain için farklı URL formatları dene
      const urls = [
        `wss://stream.openseabeta.com/socket/websocket?token=${this.apiKey}&chain=abstract`,
        `wss://stream.openseabeta.com/socket/websocket?token=${this.apiKey}&chain=2741`,
        `wss://stream.openseabeta.com/socket/websocket?token=${this.apiKey}&network=abstract`,
        `wss://stream.openseabeta.com/socket/websocket?token=${this.apiKey}&chain_id=2741`,
        `wss://abstract.stream.openseabeta.com/socket/websocket?token=${this.apiKey}`,
        `wss://stream.openseabeta.com/abstract/socket/websocket?token=${this.apiKey}`,
        `wss://stream.openseabeta.com/socket/websocket?token=${this.apiKey}` // Fallback
      ];
      
      // Her reconnect'te farklı URL dene
      const url = urls[this.urlIndex % urls.length];
      console.log(`\n[AbstractStream] WebSocket bağlantısı kuruluyor... (Deneme ${this.reconnectCount + 1})`);
      console.log(`[AbstractStream] URL #${this.urlIndex + 1}:`, url);
      
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        console.log('\n🌟🌟🌟 [AbstractStream] WEBSOCKET BAĞLANTISI KURULDU! 🌟🌟🌟');
        console.log(`✅ Başarılı URL: ${url}`);
        console.log(`📍 URL Index: ${this.urlIndex}`);
        this.successfulUrl = url;
        this.isConnected = true;
        this.startHeartbeat();
        
        // Önceden takip edilen collection'ları yeniden subscribe et
        for (const collection of this.collections) {
          this.subscribeToCollection(collection);
        }
        
        this.emit('connected', { url: url, urlIndex: this.urlIndex });
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // TÜM MESAJLARI LOGLA
          console.log('\n📩 [AbstractStream] WebSocket Message Received:');
          console.log(`⏰ Time: ${new Date().toISOString()}`);
          console.log(`📝 Event: ${message.event || 'unknown'}`);
          console.log(`📌 Topic: ${message.topic || 'none'}`);
          
          // Heartbeat ve phx_reply'ları özel logla
          if (message.event === 'heartbeat') {
            console.log(`💗 Heartbeat`);
          } else if (message.event === 'phx_reply') {
            console.log(`🔔 Phoenix Reply - Status: ${message.payload?.status}`);
            console.log(`Full phx_reply:`, JSON.stringify(message, null, 2));
          } else {
            // Diğer tüm mesajları detaylı logla
            console.log(`📦 Full Message:`, JSON.stringify(message, null, 2));
          }
          
          this.handleMessage(message);
        } catch (error) {
          console.error('[AbstractStream] Mesaj parse hatası:', error);
          console.error('Raw data:', data.toString());
        }
      });
      
      this.ws.on('close', (code, reason) => {
        console.log('[AbstractStream] WebSocket bağlantısı kapandı');
        console.log(`[AbstractStream] Close code: ${code}, reason: ${reason}`);
        this.isConnected = false;
        this.stopHeartbeat();
        this.emit('disconnected', { code, reason });
        
        // Code'a göre özel işlemler
        if (code === 1011) {
          console.log('[AbstractStream] Code 1011 - Server rejected, trying different URL format...');
          this.urlIndex++; // Sonraki URL'yi dene
          this.topicFormatIndex++; // Sonraki topic formatını dene
        } else if (code === 1006) {
          console.log('[AbstractStream] Code 1006 - Anormal kapanma (muhtemelen 502 hatası)');
          this.reconnectDelay = 10000; // 10 saniye bekle
        }
        
        this.reconnectCount++;
        
        // Max reconnect denemesi kontrolü
        if (this.reconnectCount > 10) {
          console.log('⚠️ [AbstractStream] 10 denemeden fazla başarısız, 30 saniye bekleyeceğiz...');
          this.reconnectDelay = 30000; // 30 saniye bekle
          this.reconnectCount = 0; // Sayacı sıfırla
        }
        
        // Otomatik yeniden bağlan
        this.scheduleReconnect();
      });
      
      this.ws.on('error', (error) => {
        console.error('[AbstractStream] WebSocket hatası:', error);
        this.emit('error', error);
        
        // 502 hatası durumunda özel işlem
        if (error.message && error.message.includes('502')) {
          console.log('⚠️ 502 hatası algılandı - OpenSea sunucu hatası, daha uzun bekleyeceğiz...');
          this.reconnectDelay = 10000; // 502 için 10 saniye bekle
        }
      });
      
    } catch (error) {
      console.error('[AbstractStream] Bağlantı hatası:', error);
      throw error;
    }
  }

  /**
   * Collection'a subscribe ol
   */
  subscribeToCollection(collectionSlug) {
    console.log(`\n🎯🎯🎯 [AbstractStream] SUBSCRIBE TO COLLECTION CALLED 🎯🎯🎯`);
    console.log(`📦 Collection Slug: ${collectionSlug}`);
    console.log(`🔌 WebSocket Connected: ${this.isConnected}`);
    console.log(`📡 WebSocket ReadyState: ${this.ws?.readyState}`);
    
    if (!this.isConnected) {
      console.log(`⚠️ WebSocket bağlı değil, collection Set'e ekleniyor...`);
      this.collections.add(collectionSlug);
      console.log(`📋 Bekleyen collections: ${Array.from(this.collections).join(', ')}`);
      return;
    }
    
    // Abstract chain için çalışan topic formatları
    const topics = [
      `collection:${collectionSlug}`,                    // ✅ Çalışıyor
      `collection:abstract:${collectionSlug}`,           // ✅ Çalışıyor
      `collection:${collectionSlug}:abstract`            // ✅ Çalışıyor
    ];
    
    // Her reconnect'te farklı topic formatı dene
    const topicIndex = this.topicFormatIndex % topics.length;
    const topic = topics[topicIndex];
    
    console.log(`\n🔄 [AbstractStream] TOPIC DENEME #${topicIndex + 1}/${topics.length}`);
    console.log(`📝 Topic: ${topic}`);
    console.log(`📦 Collection: ${collectionSlug}`);
    console.log(`🔢 Current Ref: ${this.ref}`);
    
    const messageRef = this.getNextRef();
    const message = {
      topic: topic,
      event: 'phx_join',
      payload: {
        chain: 'abstract',
        chain_id: 2741,
        network: 'abstract-mainnet',
        collection: collectionSlug
      },
      ref: messageRef
    };
    
    console.log(`\n🚀 === PHOENIX JOIN MESSAGE SENDING ===`);
    console.log(`📨 Full Message:`, JSON.stringify(message, null, 2));
    console.log(`🆔 Message Ref: ${messageRef}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    
    // Ref ile topic'i eşleştir (reply'da hangi topic olduğunu bilelim)
    if (!this.pendingSubscriptions) this.pendingSubscriptions = new Map();
    this.pendingSubscriptions.set(messageRef, { topic, collectionSlug });
    
    try {
      this.ws.send(JSON.stringify(message));
      console.log(`✅ Message sent successfully!`);
      this.collections.add(collectionSlug);
      console.log(`📋 Active collections: ${Array.from(this.collections).join(', ')}`);
    } catch (error) {
      console.error(`❌ Message send error:`, error);
    }
  }

  /**
   * Collection'dan unsubscribe ol
   */
  unsubscribeFromCollection(collectionSlug) {
    if (!this.isConnected) {
      this.collections.delete(collectionSlug);
      return;
    }
    
    const topic = `collection:${collectionSlug}`;
    const message = {
      topic: topic,
      event: 'phx_leave',
      payload: {},
      ref: this.getNextRef()
    };
    
    console.log(`[AbstractStream] ${collectionSlug} collection'ından unsubscribe olunuyor...`);
    this.ws.send(JSON.stringify(message));
    this.collections.delete(collectionSlug);
  }
  
  /**
   * Token offer'larına subscribe ol
   */
  subscribeToTokenOffers(collectionSlug, tokenId) {
    if (!this.isConnected) {
      this.collections.add(`${collectionSlug}_${tokenId}`);
      return;
    }
    
    // Önce collection'a subscribe ol
    this.subscribeToCollection(collectionSlug);
    
    console.log(`[AbstractStream] Token offer subscription: ${collectionSlug} #${tokenId}`);
    
    // Token-specific event'ler Phoenix'te collection level'da gelir
    // Filtre client tarafında yapılır
  }

  /**
   * Gelen mesajları işle
   */
  handleMessage(message) {
    const { event, topic, payload } = message;
    
    // Phoenix protokol mesajları
    if (event === 'phx_reply') {
      console.log(`\n🔔🔔🔔 [AbstractStream] PHX_REPLY RECEIVED 🔔🔔🔔`);
      console.log(`📌 Topic: ${topic}`);
      console.log(`🆔 Ref: ${message.ref}`);
      console.log(`📊 Status: ${payload.status}`);
      
      // Pending subscription bilgisini al
      let subscriptionInfo = null;
      if (this.pendingSubscriptions && message.ref) {
        subscriptionInfo = this.pendingSubscriptions.get(message.ref);
        if (subscriptionInfo) {
          console.log(`📦 Collection: ${subscriptionInfo.collectionSlug}`);
          console.log(`🎯 Original Topic: ${subscriptionInfo.topic}`);
        }
      }
      
      if (payload.status === 'ok') {
        console.log(`\n✅✅✅ [AbstractStream] SUBSCRIPTION BAŞARILI! ✅✅✅`);
        console.log(`📌 Topic: ${topic}`);
        console.log(`🔗 WebSocket URL: ${this.ws?.url || 'Unknown'}`);
        console.log(`📊 Reply details:`, JSON.stringify(payload, null, 2));
        
        // Collection subscription başarılı
        if (subscriptionInfo) {
          console.log(`\n🎉 COLLECTION SUBSCRIPTION SUCCESS!`);
          console.log(`✅ Collection: ${subscriptionInfo.collectionSlug}`);
          console.log(`✅ Topic Format: ${subscriptionInfo.topic}`);
          console.log(`✅ This format works for Abstract!`);
          
          // Başarılı formatı kaydet
          if (!this.successfulCollectionFormats) this.successfulCollectionFormats = new Map();
          this.successfulCollectionFormats.set(subscriptionInfo.collectionSlug, subscriptionInfo.topic);
        }
        
        // Başarılı topic'i kaydet
        if (!this.successfulTopics) this.successfulTopics = [];
        this.successfulTopics.push(topic);
        console.log(`✅ Başarılı topic listesi:`, this.successfulTopics);
      } else {
        console.error(`\n❌ [AbstractStream] SUBSCRIPTION BAŞARISIZ!`);
        console.error(`Topic: ${topic}`);
        console.error(`Status: ${payload.status}`);
        console.error(`Response:`, JSON.stringify(payload.response || payload, null, 2));
        
        if (subscriptionInfo) {
          console.error(`❌ Collection: ${subscriptionInfo.collectionSlug}`);
          console.error(`❌ Failed Topic Format: ${subscriptionInfo.topic}`);
          
          // Farklı bir format dene
          console.log(`\n🔄 Trying different topic format...`);
          this.topicFormatIndex++;
          
          // Biraz bekleyip tekrar dene
          setTimeout(() => {
            this.subscribeToCollection(subscriptionInfo.collectionSlug);
          }, 1000);
        }
      }
      
      // Pending subscription'ı temizle
      if (this.pendingSubscriptions && message.ref) {
        this.pendingSubscriptions.delete(message.ref);
      }
      
      return;
    }
    
    // TÜM EVENT'LERİ DETAYLI LOGLA (Phoenix hariç)
    if (event && !event.startsWith('phx_') && event !== 'phx_close') {
      console.log(`\n🔥🔥🔥 [AbstractStream] EVENT ALINDI 🔥🔥🔥`);
      console.log(`- Event Type: ${event}`);
      console.log(`- Topic: ${topic}`);
      console.log(`- Timestamp: ${new Date().toISOString()}`);
      console.log(`- Full Message:`, JSON.stringify(message, null, 2));
      
      // Payload detayları
      if (payload) {
        console.log(`\n📦 PAYLOAD DETAYLARI:`);
        console.log(JSON.stringify(payload, null, 2));
      }
    }
    
    // OpenSea event'leri
    if (topic && topic.startsWith('collection:')) {
      // Topic'ten collection slug'ı çıkar
      let collection = '';
      
      // Farklı topic formatlarını handle et
      if (topic.includes(':abstract:')) {
        // Format: collection:abstract:pengztracted-abstract
        collection = topic.split(':abstract:')[1];
      } else if (topic.endsWith(':abstract')) {
        // Format: collection:pengztracted-abstract:abstract
        const parts = topic.split(':');
        collection = parts[1]; // pengztracted-abstract
      } else {
        // Format: collection:pengztracted-abstract
        collection = topic.replace('collection:', '');
      }
      
      console.log(`[AbstractStream] Topic: ${topic} -> Collection: ${collection}`);
      
      switch (event) {
        case 'item_received_offer':
        case 'item_received_bid':
          console.log(`\n🎉 [AbstractStream] ${event.toUpperCase()} EVENT ALGILANDI!`);
          console.log(`Collection: ${collection}`);
          console.log(`Event payload:`, JSON.stringify(payload, null, 2).substring(0, 500) + '...');
          this.handleItemReceivedOffer(collection, payload);
          break;
          
        case 'collection_offer':
        case 'collection_bid':
        case 'collection_received_offer':
        case 'abstract_collection_offer':
        case 'collection_offer_created':
          console.log(`\n🎯 [AbstractStream] COLLECTION OFFER EVENT: ${event}`);
          console.log(`Collection: ${collection}`);
          this.handleCollectionOffer(collection, payload);
          break;
          
        case 'trait_offer':
          this.handleTraitOffer(collection, payload);
          break;
          
        case 'item_listed':
        case 'item_sold':
        case 'item_cancelled':
        case 'item_transferred':
        case 'item_metadata_updated':
          // Bu event'leri şimdilik emit ediyoruz, gerekirse işlenebilir
          this.emit(event, { collection, ...payload });
          break;
          
        default:
          console.log(`\n⚠️ [AbstractStream] BİLİNMEYEN EVENT TİPİ!`);
          console.log(`- Event: ${event}`);
          console.log(`- Topic: ${topic}`);
          console.log(`- Collection: ${collection}`);
          console.log(`- Payload:`, JSON.stringify(payload, null, 2));
          
          // Eğer bu bir collection ile ilgili event ise, collection offer olarak dene
          if (event && event.toLowerCase().includes('collection')) {
            console.log(`🔄 Collection offer olarak işleniyor...`);
            this.handleCollectionOffer(collection, payload);
          }
      }
    }
  }

  /**
   * Item'a teklif geldiğinde
   */
  handleItemReceivedOffer(collection, payload) {
    // Token ID'yi çıkar
    let tokenId = null;
    if (payload.item?.nft_id) {
      const parts = payload.item.nft_id.split('/');
      tokenId = parts[parts.length - 1];
    } else if (payload.payload?.item?.nft_id) {
      const parts = payload.payload.item.nft_id.split('/');
      tokenId = parts[parts.length - 1];
    }
    
    // Abstract chain için contract address'i dinamik olarak al
    const contractAddress = getAbstractContractAddress(collection) || 
                          payload.asset_contract_criteria?.address ||
                          payload.payload?.asset_contract_criteria?.address;
    
    // Maker bilgisini al
    const maker = payload.maker?.address || 
                  payload.payload?.maker?.address ||
                  payload.protocol_data?.parameters?.offerer ||
                  payload.payload?.protocol_data?.parameters?.offerer ||
                  'unknown';
    
    // Fiyat bilgisi (wei formatında)
    const priceWei = payload.base_price || 
                     payload.payload?.base_price || 
                     payload.price?.value ||
                     payload.payload?.price?.value ||
                     '0';
    
    // Order hash
    const orderHash = payload.order_hash || 
                     payload.payload?.order_hash ||
                     payload.orderHash ||
                     payload.payload?.orderHash ||
                     `abstract_${tokenId}_${priceWei}_${Date.now()}`;
    
    const offerData = {
      type: 'item_offer',
      collection: collection,
      chain: 'abstract', // Chain bilgisi her zaman abstract
      tokenId: tokenId ? tokenId.toString() : null,
      contractAddress: contractAddress,
      offerer: maker, // offerer field'ı tutuldu (eski kod uyumluluğu)
      maker: maker,   // maker field'ı eklendi (yeni kod için)
      price: priceWei, // Wei formatında
      priceWei: priceWei, // Açık wei field'ı
      expirationTime: payload.expiration_date || payload.payload?.expiration_date,
      orderHash: orderHash,
      payload: payload.payload || payload
    };
    
    console.log(`\n🎯🎯🎯 [AbstractStream] ITEM OFFER ALGILANDI! 🎯🎯🎯`);
    console.log(`📦 Collection: ${collection}`);
    console.log(`🎨 Token ID: ${offerData.tokenId}`);
    console.log(`📍 Contract Address: ${contractAddress}`);
    console.log(`💰 Fiyat: ${offerData.price} wei`);
    console.log(`👤 Teklif sahibi: ${offerData.maker}`);
    console.log(`🆔 Order hash: ${offerData.orderHash}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    
    // DEBUG: Payload yapısını göster
    console.log(`\n📋 PAYLOAD STRUCTURE:`);
    console.log(`- payload.item?.nft_id: ${payload.item?.nft_id}`);
    console.log(`- payload.maker?.address: ${payload.maker?.address}`);
    console.log(`- payload.base_price: ${payload.base_price}`);
    console.log(`- payload.order_hash: ${payload.order_hash}`);
    
    // Tüm listener'lara event emit et
    console.log(`\n📡 Emitting events...`);
    
    // Event emit et - CollectionOfferMonitorV2 format
    // Birden fazla event ismiyle emit et, böylece tüm listener'lar yakalayabilir
    const eventData = {
      collection: collection,
      chain: 'abstract', // Chain bilgisi eklendi
      tokenId: tokenId,
      price: priceWei,
      priceWei: priceWei,
      maker: maker,
      offerer: maker,
      orderHash: orderHash,
      payload: payload
    };
    
    // Farklı event isimleriyle emit et
    this.emit('item_received_offer', eventData);
    this.emit('offer_received', eventData);
    this.emit(`item_received_bid_${collection}_${tokenId}`, eventData);
    this.emit(`token_offer_${collection}_${tokenId}`, eventData);
    this.emit('item_received_bid', eventData);
    
    console.log(`\n✅ Tüm event'ler emit edildi!`);
    console.log(`📊 Active listeners:`, this.eventNames());
    console.log(`📊 Listener counts:`, this.eventNames().map(e => `${e}: ${this.listenerCount(e)}`));
  }

  /**
   * Collection offer geldiğinde
   */
  handleCollectionOffer(collection, payload) {
    // Abstract chain için contract address'i dinamik olarak al
    const contractAddress = getAbstractContractAddress(collection) || 
                          payload.asset_contract_criteria?.address ||
                          payload.payload?.asset_contract_criteria?.address ||
                          '0xa6C46c07F7f1966D772E29049175EBBa26262513'; // Default Pengztracted
    
    // Maker bilgisini al - farklı yerlerden deneyerek
    const maker = payload.maker?.address || 
                  payload.payload?.maker?.address ||
                  payload.protocol_data?.parameters?.offerer ||
                  payload.payload?.protocol_data?.parameters?.offerer ||
                  payload.offerer ||
                  payload.payload?.offerer ||
                  'unknown';
    
    // Fiyat bilgisi (wei formatında)
    const priceWei = payload.base_price || 
                     payload.payload?.base_price || 
                     payload.price?.value ||
                     payload.payload?.price?.value ||
                     payload.price ||
                     payload.payload?.price ||
                     '0';
    
    // Order hash
    const orderHash = payload.order_hash || 
                     payload.payload?.order_hash ||
                     payload.orderHash ||
                     payload.payload?.orderHash ||
                     `abstract_collection_${collection}_${priceWei}_${Date.now()}`;
    
    // Quantity
    const quantity = payload.quantity || 
                    payload.payload?.quantity || 
                    payload.protocol_data?.parameters?.offer?.[0]?.endAmount ||
                    payload.payload?.protocol_data?.parameters?.offer?.[0]?.endAmount ||
                    1;
    
    console.log(`\n🎉🎉🎉 [AbstractStream] COLLECTION OFFER EVENT ALGILANDI! 🎉🎉🎉`);
    console.log(`📦 Collection: ${collection}`);
    console.log(`📍 Contract Address: ${contractAddress}`);
    console.log(`💰 Fiyat: ${priceWei} wei`);
    console.log(`👤 Teklif sahibi: ${maker}`);
    console.log(`🆔 Order hash: ${orderHash}`);
    console.log(`📊 Quantity: ${quantity}`);
    console.log(`\n📨 FULL PAYLOAD:`, JSON.stringify(payload, null, 2));
    
    // CollectionOfferMonitorV2'nin beklediği formata uygun event data oluştur
    const formattedData = {
      type: 'collection_offer',
      collection: collection,
      chain: 'abstract', // Chain bilgisi her zaman abstract
      price: 0, // Ether cinsinden fiyat (aşağıda hesaplanacak)
      priceWei: priceWei,
      maker: maker,
      orderHash: orderHash,
      quantity: quantity,
      fullPayload: payload
    };
    
    // Wei'den Ether'e çevir
    if (priceWei && priceWei !== '0') {
      try {
        const { ethers } = require('ethers');
        formattedData.price = parseFloat(ethers.formatEther(priceWei));
        console.log(`💵 Fiyat dönüşümü: ${priceWei} wei = ${formattedData.price} ETH`);
      } catch (e) {
        console.error('[AbstractStream] Fiyat dönüşüm hatası:', e);
        formattedData.price = 0;
      }
    }
    
    console.log(`\n💎 [AbstractStream] FORMATTED DATA FOR HANDLER:`, formattedData);
    
    // Event emit et - CollectionOfferMonitorV2 format
    console.log(`\n🔔 Emitting collection offer events...`);
    console.log(`🔔 Event listeners for 'collection_offer': ${this.listenerCount('collection_offer')}`);
    console.log(`🔔 All event names with listeners: ${this.eventNames()}`);
    
    // Event duplicate kontrolü için unique ID oluştur
    const eventUniqueId = `${orderHash}_${Date.now()}`;
    
    // Sadece collection'a özel event emit et - multiple event'leri önlemek için
    const collectionSpecificEvent = `collection_offer_${collection}`;
    console.log(`\n🔔 Collection offer event emit ediliyor: ${collectionSpecificEvent}`);
    console.log(`🔔 Event listeners for '${collectionSpecificEvent}': ${this.listenerCount(collectionSpecificEvent)}`);
    
    if (this.listenerCount(collectionSpecificEvent) > 0) {
      this.emit(collectionSpecificEvent, formattedData);
      console.log(`✅ Emitted: ${collectionSpecificEvent} (UniqueID: ${eventUniqueId})`);
    } else {
      console.log(`⚠️ No listeners for ${collectionSpecificEvent}, event not emitted`);
      
      // Eğer collection-specific listener yoksa, genel listener'ı kontrol et (fallback)
      if (this.listenerCount('collection_offer') > 0) {
        console.log(`🔄 Fallback: Emitting general collection_offer event`);
        this.emit('collection_offer', formattedData);
      }
    }
    
    console.log(`\n✅ Tüm collection offer event'leri emit edildi!`);
  }

  /**
   * Trait offer geldiğinde
   */
  handleTraitOffer(collection, payload) {
    const offerData = {
      type: 'trait_offer',
      collection: collection,
      chain: 'abstract',
      trait: payload.trait,
      offerer: payload.maker?.address,
      price: payload.base_price,
      quantity: payload.quantity || 1,
      expirationTime: payload.expiration_date,
      orderHash: payload.order_hash,
      payload: payload
    };
    
    console.log(`[AbstractStream] Trait offer alındı: ${collection} ${offerData.trait.type}:${offerData.trait.value} - ${offerData.price} WETH`);
    this.emit('offer_received', offerData);
  }

  /**
   * Heartbeat gönder
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        const message = {
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: this.getNextRef()
        };
        
        this.ws.send(JSON.stringify(message));
      }
    }, 30000); // 30 saniye
  }

  /**
   * Heartbeat'i durdur
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Yeniden bağlanmayı planla
   */
  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    // reconnectDelay varsa onu kullan, yoksa varsayılan 5 saniye
    const delay = this.reconnectDelay || 5000;
    
    console.log(`[AbstractStream] ${delay/1000} saniye sonra yeniden bağlanılacak...`);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectDelay = null; // Bir sonraki reconnect için sıfırla
      this.connect();
    }, delay);
  }

  /**
   * Sonraki ref numarasını al
   */
  getNextRef() {
    return ++this.ref;
  }

  /**
   * Bağlantıyı kapat
   */
  disconnect() {
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.collections.clear();
  }

  /**
   * Event listener sayısını döndür - EventEmitter'dan miras alınan metod
   * Bu metod zaten EventEmitter'da var ama açık bir şekilde override ediyoruz
   */
  listenerCount(eventName) {
    // EventEmitter'ın built-in listenerCount metodunu kullan
    return super.listenerCount(eventName);
  }
}

module.exports = AbstractStreamClient;