const { ethers } = require('ethers');
const config = require('../config');

/**
 * Abstract chain için özel token offer sistemi
 */
class AbstractTokenOffer {
  constructor(api) {
    this.api = api;
    // OpenSea'nin Abstract için doğru conduit key'i (OpenSea tarafından onaylanmış)
    this.abstractConduitKey = '0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e';
    // Order cache - duplicate'leri önlemek için
    this.recentOrders = new Map();
    this.orderLock = new Map(); // Token başına lock
    this.orderCounter = 0; // Her order için artan counter
    this.lastCounterUsed = null; // Son kullanılan counter
    this.counterIncrement = 0; // Counter increment
    this.duplicateOrderHashes = new Set(); // Gördüğümüz duplicate hash'ler
    this.counterCache = new Map(); // Counter cache - wallet başına
    this.counterLastFetch = new Map(); // Counter son fetch zamanı
    this.COUNTER_CACHE_TTL = 5000; // 5 saniye cache (30 saniye yerine)
    this.orderHashCache = new Map(); // Order hash cache
    
    // Duplicate detection bypass için
    this.collectionBlacklist = new Map(); // collection -> expiry timestamp
    this.failedAttempts = new Map(); // collection -> failed attempt count
    this.MAX_FAILED_ATTEMPTS = 3; // Max deneme sayısı
    this.BLACKLIST_DURATION = 24 * 60 * 60 * 1000; // 24 saat
  }

  async createOffer(contractAddress, tokenId, priceInETH, durationInMinutes = 15) {
    try {
      console.log('\n🎯 Abstract Token Offer Oluşturuluyor');
      console.log('Contract:', contractAddress);
      console.log('Token ID:', tokenId);
      console.log('Fiyat:', priceInETH, 'WETH');
      console.log('Süre:', durationInMinutes, 'dakika');
      
      // Abstract chain'e geç
      if (this.api.currentChain !== 'abstract') {
        console.log('Abstract chain\'e geçiliyor...');
        await this.api.switchChain('abstract');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Bakiyeleri kontrol et
      console.log('\n💰 Bakiye kontrolü...');
      const balances = await this.api.checkBalances();
      console.log('ETH Bakiyesi:', balances.eth.formatted, 'ETH');
      console.log('WETH Bakiyesi:', balances.weth.formatted, 'WETH');
      
      // Collection slug'ı al
      let collectionSlug = contractAddress;
      if (contractAddress.startsWith('0x')) {
        try {
          collectionSlug = await this.api._getCollectionSlugFromContract(contractAddress, 'abstract');
          console.log('Collection slug:', collectionSlug);
        } catch (e) {
          console.log('Collection slug alınamadı, contract address ile devam ediliyor');
        }
      }
      
      // Önce mevcut offer'ları kontrol et
      const hasExistingOffer = await this._checkExistingOffers(contractAddress, tokenId, collectionSlug);
      if (hasExistingOffer) {
        console.log('\n⚠️ Bu token için zaten aktif bir offer var!');
        console.log('💡 Çözüm: Counter artırarak eski offer\'ları iptal edin');
        return {
          success: false,
          error: 'Active offer already exists',
          requiresCancel: true
        };
      }
      
      // Direkt Seaport order kullan (SDK Abstract'ı tam desteklemiyor)
      return await this._createSeaportOrder(contractAddress, tokenId, priceInETH, durationInMinutes);
      
    } catch (error) {
      console.error('❌ Abstract token offer hatası:', error);
      console.error('Hata detayı:', error.message);
      throw error;
    }
  }
  
  async _checkExistingOffers(contractAddress, tokenId, collectionSlug) {
    try {
      console.log('\n🔍 Mevcut offer\'lar kontrol ediliyor...');
      
      // 1. Collection slug varsa best offer'ı kontrol et
      if (collectionSlug && collectionSlug !== contractAddress) {
        try {
          const bestOfferResponse = await this.api.makeRequest(
            'GET',
            `/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`
          );
          
          if (bestOfferResponse && bestOfferResponse.price) {
            console.log('En yüksek offer:', bestOfferResponse.price.value, bestOfferResponse.price.currency);
            console.log('Offer sahibi:', bestOfferResponse.maker?.address);
            
            // Bizim offer'ımız mı kontrol et
            if (bestOfferResponse.maker?.address?.toLowerCase() === config.walletAddress.toLowerCase()) {
              console.log('⚠️ En yüksek offer size ait!');
              return true;
            }
          }
        } catch (e) {
          console.log('Best offer sorgulanamadı:', e.message);
        }
      }
      
      // 2. Tüm offer'ları kontrol et
      try {
        const offersResponse = await this.api.makeRequest(
          'GET',
          `/api/v2/orders/abstract/seaport/offers?asset_contract_address=${contractAddress}&token_ids=${tokenId}&maker=${config.walletAddress}`
        );
        
        if (offersResponse.orders && offersResponse.orders.length > 0) {
          console.log(`\n⚠️ ${offersResponse.orders.length} adet aktif offer'ınız var!`);
          
          offersResponse.orders.forEach((order, index) => {
            console.log(`\nOffer ${index + 1}:`);
            console.log('Order Hash:', order.order_hash);
            console.log('Created:', new Date(order.created_date).toLocaleString());
            console.log('Expires:', order.expiration_date ? new Date(order.expiration_date).toLocaleString() : 'N/A');
            console.log('Current Price:', order.current_price);
          });
          
          return true;
        }
      } catch (e) {
        console.log('Offer listesi alınamadı:', e.message);
      }
      
      console.log('✅ Aktif offer bulunamadı, yeni offer oluşturulabilir.');
      return false;
      
    } catch (error) {
      console.log('Offer kontrol hatası:', error.message);
      // Hata durumunda yine de devam et
      return false;
    }
  }
  
  async _createSeaportOrder(contractAddress, tokenId, price, expirationMinutes) {
    try {
      console.log('\n📝 Seaport order oluşturuluyor...');
      
      // Token için lock kontrolü - non-blocking
      const lockKey = `${contractAddress}-${tokenId}`;
      if (this.orderLock.get(lockKey)) {
        console.log(`⚠️ Token ${tokenId} için zaten bir order oluşturuluyor, farklı salt ile yeni deneme...`);
        // Bekleme yerine direkt farklı parametrelerle dene
        const adjustedPrice = (parseFloat(price) + 0.000001).toFixed(6);
        return this._createSeaportOrder(contractAddress, tokenId, adjustedPrice, expirationMinutes);
      }
      
      // Lock'u ayarla - timestamp ile
      this.orderLock.set(lockKey, Date.now());
      
      // Önceki order'ları kontrol et
      const orderCacheKey = `${contractAddress}-${tokenId}-${price}`;
      const lastOrderTime = this.lastOrderTimes?.get(orderCacheKey);
      if (lastOrderTime && (Date.now() - lastOrderTime < 30000)) { // 30 saniye içinde aynı order
        console.log(`⚠️ Bu token ve fiyat için 30 saniye içinde zaten order oluşturuldu, bekleniyor...`);
        this.orderLock.delete(lockKey);
        
        // Farklı bir fiyat dene (küçük bir miktar ekle)
        const adjustedPrice = (parseFloat(price) + 0.00001).toFixed(5);
        console.log(`💡 Fiyat ayarlanıyor: ${price} -> ${adjustedPrice} ETH`);
        return this._createSeaportOrder(contractAddress, tokenId, adjustedPrice, expirationMinutes);
      }
      
      // Order zamanını kaydet
      if (!this.lastOrderTimes) {
        this.lastOrderTimes = new Map();
      }
      this.lastOrderTimes.set(orderCacheKey, Date.now());
      
      const expirationTime = Date.now() + (expirationMinutes * 60 * 1000);
      const walletAddress = config.walletAddress;
      
      // Abstract WETH adresi
      const abstractWethAddress = config.getWethAddress('abstract');
      
      // OpenSea fee (%2.5)
      // Floating point precision hatalarını önlemek için fiyatı 6 decimal'e yuvarla
      const roundedPrice = parseFloat(price).toFixed(6);
      console.log(`💰 Fiyat yuvarlama: ${price} -> ${roundedPrice} ETH`);
      const offerWei = ethers.parseEther(roundedPrice);
      const feeWei = (offerWei * 250n) / 10000n;
      
      // Her order için benzersiz parametreler
      // StartTime'ı şu anki zamandan 5 saniye sonraya ayarla (blockchain latency için)
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const startTime = currentTimestamp + 5;
      const endTime = Math.floor(expirationTime / 1000);
      
      // Counter'ı blockchain'den al - SALT OLUŞTURMADAN ÖNCE!
      let counter;
      try {
        counter = await this._getCounter();
        console.log('🔢 Blockchain counter kullanılıyor:', counter);
      } catch (e) {
        console.log('⚠️ Counter alınamadı, varsayılan değer kullanılıyor');
        counter = "0";
      }
      
      // Salt'ı çok daha güçlü ve benzersiz üret
      // Timestamp + random + counter + wallet + token kombinasyonu
      const randomBytes = ethers.randomBytes(16);
      const uniqueData = [
        contractAddress,
        tokenId.toString(),
        currentTimestamp.toString(),
        Math.random().toString(),
        counter.toString(), // Artık counter tanımlı
        walletAddress,
        ethers.hexlify(randomBytes)
      ].join('-');
      const uniqueHash = ethers.keccak256(ethers.toUtf8Bytes(uniqueData));
      const salt = uniqueHash;
      
      console.log('⏰ Timestamps:');
      console.log(`   Current: ${new Date(currentTimestamp * 1000).toISOString()}`);
      console.log(`   Start: ${new Date(startTime * 1000).toISOString()}`);
      console.log(`   End: ${new Date(endTime * 1000).toISOString()}`);
      console.log('🔐 Salt (unique):', salt);
      
      // Zone ve orderType ayarları - OpenSea v2 için
      const useZone = true; // Zone KULLAN
      const orderType = 3; // PARTIAL_RESTRICTED - Token offer için
      const zone = "0x000056F7000000EcE9003ca63978907a00FFD100"; // Seaport 1.6 zone
      
      const orderParameters = {
        offerer: walletAddress,
        zone: zone,
        offer: [{
          itemType: 1, // ERC20 (WETH)
          token: abstractWethAddress,
          identifierOrCriteria: "0",
          startAmount: offerWei.toString(),
          endAmount: offerWei.toString()
        }],
        consideration: [
          {
            itemType: 2, // ERC721
            token: contractAddress,
            identifierOrCriteria: tokenId.toString(),
            startAmount: "1",
            endAmount: "1",
            recipient: walletAddress
          },
          // OpenSea fee %0.5 (50 basis points)
          {
            itemType: 1, // ERC20 (WETH) - OpenSea fee
            token: abstractWethAddress,
            identifierOrCriteria: "0",
            startAmount: (offerWei * 50n / 10000n).toString(), // 0.5% fee
            endAmount: (offerWei * 50n / 10000n).toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
          }
        ],
        orderType: orderType,
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        zoneHash: ethers.ZeroHash,
        salt: salt,
        conduitKey: this.abstractConduitKey,
        totalOriginalConsiderationItems: 2, // NFT + OpenSea fee
        counter: counter
      };
      
      // OpenSea'nin kabul ettiği protocol address'lerden birini kullan
      const protocolAddress = '0x0000000000000068f116a894984e2db1123eb395';
      
      // Hemen başarılı dön, imzalama ve API çağrısı arka planda yapılacak
      console.log(`🔥 Token #${tokenId}: Fire & forget order başlatıldı`);
      
      // Fire & forget - imzalama ve API çağrısı  
      setTimeout(async () => {
        try {
          // İmzala
          const signature = await this.api._signOrder(orderParameters, 'abstract');
          console.log(`📝 Token #${tokenId}: Order imzalandı`);
          
          // API payload - OpenSea v2 formatı
          const payload = {
            parameters: orderParameters,
            signature: signature,
            protocol_address: protocolAddress
          };
          
          // Order cache kontrolü
          const orderKey = `${contractAddress}-${tokenId}-${walletAddress}`;
          const cachedOrder = this.recentOrders.get(orderKey);
          if (cachedOrder && (Date.now() - cachedOrder.timestamp < 300000)) { // 5 dakika cache
            console.log(`⚠️ Token #${tokenId}: Yakın zamanda order oluşturulmuş`);
            console.log('Cache Order Hash:', cachedOrder.orderHash);
            this.orderLock.delete(lockKey);
            return;
          }
          
          // Order hash'i manuel hesapla
          const orderHash = await this._calculateOrderHash(orderParameters);
          console.log(`🔍 Token #${tokenId}: Order Hash: ${orderHash}`);
          
          // Hash cache kontrolü
          if (this.orderHashCache.has(orderHash)) {
            console.log(`⚠️ Token #${tokenId}: Bu order hash zaten kullanılmış!`);
            this.orderLock.delete(lockKey);
            return;
          }
          
          // Debug log
          console.log(`\n🔍 Token #${tokenId} - DEBUG:`, {
            token: contractAddress,
            tokenId: tokenId,
            price: price,
            counter: orderParameters.counter,
            salt: orderParameters.salt.substring(0, 10) + '...'
          });
          
          // OpenSea API'ye gönder - async/await ile ama fire & forget
          const response = await this.api.makeRequest('POST', '/api/v2/orders/abstract/seaport/offers', payload);
          
          // Başarılı order'ı cache'e ekle
          const responseOrderHash = response.order?.order_hash || response.order?.hash || response.order_hash || response.hash;
          this.recentOrders.set(orderKey, {
            timestamp: Date.now(),
            orderHash: responseOrderHash
          });
          
          // Order hash'i cache'e ekle
          this.orderHashCache.set(orderHash, true);
          
          // Lock'ı kaldır
          this.orderLock.delete(lockKey);
          
          console.log(`✅ Token #${tokenId}: Order başarılı! Hash: ${responseOrderHash}`);
          
        } catch (error) {
          // Lock'ı kaldır
          this.orderLock.delete(lockKey);
          console.error(`❌ Token #${tokenId} order hatası:`, error.message);
          
          // Hata detaylarını logla
          if (error.response?.data?.errors) {
            console.log(`Token #${tokenId} hata detayı:`, error.response.data.errors);
          }
        }
      }, 0); // 0ms delay - hemen çalıştır ama non-blocking
      
      // Hemen başarılı dön - işlem arka planda devam ediyor
      return {
        success: true,
        order_hash: 'processing',
        chain: 'abstract',
        status: 'fire_and_forget'
      };
      
    } catch (error) {
      // Lock'ı kaldır
      const lockKey = `${contractAddress}-${tokenId}`;
      this.orderLock.delete(lockKey);
      
      console.error('Abstract Seaport order hatası:', error);
      
      // Hata detaylarını analiz et
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        console.log('\n🔍 HATA ANALİZİ:');
        
        // Duplicate order hatası için özel kontrol
        if (error.response.status === 400) {
          if (errorData.errors) {
            const errorsArray = Array.isArray(errorData.errors) ? errorData.errors : [errorData.errors];
            
            for (const err of errorsArray) {
              const errMessage = typeof err === 'string' ? err : (err.message || err.detail || '');
              if (errMessage.toLowerCase().includes('duplicate')) {
                console.log('❌ DUPLICATE ORDER TESPİT EDİLDİ!');
                
                // Order hash'i al
                const duplicateHashMatch = errMessage.match(/0x[a-fA-F0-9]{64}/);
                if (duplicateHashMatch) {
                  const duplicateHash = duplicateHashMatch[0];
                  console.log('Duplicate order hash:', duplicateHash);
                  
                  // Hash'i set'e ekle
                  this.duplicateOrderHashes.add(duplicateHash);
                  console.log('Görülen duplicate hash sayısı:', this.duplicateOrderHashes.size);
                  
                  // Bizim hesapladığımız hash'ı da hesaplayalım
                  console.log('\n🔍 Hash karşılaştırması:');
                  console.log('OpenSea hash:', duplicateHash);
                }
                
                console.log('Muhtemel sebepler:');
                console.log('1. Aynı offerer + token + fiyat kombinasyonu');
                console.log('2. Önceki order hala aktif');
                console.log('3. Counter değeri eski');
                
                console.log('\n💡 Otomatik çözüm deneniyor...');
                
                // Counter cache'i temizle
                this.counterCache.clear();
                this.counterLastFetch.clear();
                
                // Otomatik counter artırma denemesi - her duplicate için dene
                const attemptKey = `${contractAddress}-${tokenId}-increment`;
                const lastAttempt = this.incrementAttempts?.get(attemptKey) || 0;
                const now = Date.now();
                
                // Son denemeden 10 saniye geçmişse tekrar dene
                if (now - lastAttempt > 10000) {
                  console.log('\n🔧 Counter otomatik artırılıyor...');
                  
                  if (!this.incrementAttempts) {
                    this.incrementAttempts = new Map();
                  }
                  this.incrementAttempts.set(attemptKey, now);
                  
                  try {
                    const provider = this.api.provider || await this.api.getProviderForChain('abstract');
                    const signer = new ethers.Wallet(config.privateKey, provider);
                    const seaportAbi = ['function incrementCounter() returns (uint256)'];
                    const seaportContract = new ethers.Contract(
                      '0x0000000000000068f116a894984e2db1123eb395',
                      seaportAbi,
                      signer
                    );
                    
                    const tx = await seaportContract.incrementCounter();
                    console.log('📤 Counter artırma TX:', tx.hash);
                    console.log('⏳ Onay bekleniyor...');
                    await tx.wait();
                    console.log('✅ Counter artırıldı! Tekrar deneniyor...');
                    
                    // Counter cache'i temizle
                    this.counterCache.clear();
                    this.counterLastFetch.clear();
                    
                    // 1 saniye bekle ve tekrar dene
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return this._createSeaportOrder(contractAddress, tokenId, price, expirationMinutes);
                    
                  } catch (incrementError) {
                    console.log('❌ Counter artırma başarısız:', incrementError.message);
                  }
                }
                
                return {
                  success: false,
                  error: 'Duplicate order detected',
                  duplicateHash: duplicateHashMatch ? duplicateHashMatch[0] : 'unknown',
                  suggestion: 'Counter increment failed, manual intervention needed'
                };
              }
            }
          }
        }
      }
      
      // Conduit key hatası ise açıkla
      if (error.message && error.message.includes('conduit key')) {
        console.log('\n⚠️ OpenSea Abstract için henüz tam destek sunmuyor olabilir.');
        console.log('Alternatif: Ethereum üzerinden cross-chain offer deneyin.');
      }
      
      throw error;
    }
  }
  
  async _getCounter() {
    try {
      const provider = this.api.provider;
      const walletAddress = config.walletAddress;
      
      if (!provider) {
        console.log('⚠️ Provider yok, varsayılan counter kullanılıyor');
        return "0";
      }
      
      // Cache kontrolü
      const cacheKey = walletAddress.toLowerCase();
      const cachedCounter = this.counterCache.get(cacheKey);
      const lastFetch = this.counterLastFetch.get(cacheKey) || 0;
      const now = Date.now();
      
      // Cache geçerliyse kullan
      if (cachedCounter && (now - lastFetch) < this.COUNTER_CACHE_TTL) {
        console.log(`📦 Cached counter kullanılıyor: ${cachedCounter}`);
        return cachedCounter;
      }
      
      console.log('🔍 Blockchain\'den counter değeri alınıyor...');
      
      // Seaport contract ABI
      const seaportAbi = [
        'function getCounter(address offerer) view returns (uint256)'
      ];
      
      const seaportAddress = '0x0000000000000068f116a894984e2db1123eb395';
      const seaportContract = new ethers.Contract(seaportAddress, seaportAbi, provider);
      
      try {
        const currentCounter = await seaportContract.getCounter(walletAddress);
        const counterStr = currentCounter.toString();
        console.log(`✅ Blockchain counter değeri: ${counterStr}`);
        
        // Cache'e kaydet
        this.counterCache.set(cacheKey, counterStr);
        this.counterLastFetch.set(cacheKey, now);
        
        // Son kullanılan counter'ı güncelle
        this.lastCounterUsed = counterStr;
        
        return counterStr;
        
      } catch (counterError) {
        console.log('⚠️ Counter alınamadı:', counterError.message);
        
        // Cache'de varsa onu kullan
        if (cachedCounter) {
          console.log('📦 Hata durumunda cached counter kullanılıyor:', cachedCounter);
          return cachedCounter;
        }
        
        // Son kullanılan counter varsa onu kullan
        if (this.lastCounterUsed) {
          console.log('📦 Son kullanılan counter:', this.lastCounterUsed);
          return this.lastCounterUsed;
        }
        
        return "0";
      }
    } catch (error) {
      console.log('Counter oluşturma hatası:', error.message);
      return this.lastCounterUsed || "0";
    }
  }
  
  async _calculateOrderHash(orderParameters) {
    try {
      // Seaport order hash hesaplama
      // OrderComponents type hash
      const orderComponentsType = [
        'OrderComponents(',
        'address offerer,',
        'address zone,',
        'OfferItem[] offer,',
        'ConsiderationItem[] consideration,',
        'uint8 orderType,',
        'uint256 startTime,',
        'uint256 endTime,',
        'bytes32 zoneHash,',
        'uint256 salt,',
        'bytes32 conduitKey,',
        'uint256 counter',
        ')'
      ].join('');
      
      const offerItemType = 'OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)';
      const considerationItemType = 'ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)';
      
      // Type hash'leri hesapla
      const orderHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'address', 'address', 'bytes32', 'bytes32', 'uint8', 'uint256', 'uint256', 'bytes32', 'uint256', 'bytes32', 'uint256'],
        [
          ethers.id(orderComponentsType),
          orderParameters.offerer,
          orderParameters.zone,
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32[]'],
            [orderParameters.offer.map(item => 
              ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'uint8', 'address', 'uint256', 'uint256', 'uint256'],
                [ethers.id(offerItemType), item.itemType, item.token, item.identifierOrCriteria, item.startAmount, item.endAmount]
              ))
            )]
          )),
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32[]'],
            [orderParameters.consideration.map(item => 
              ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
                ['bytes32', 'uint8', 'address', 'uint256', 'uint256', 'uint256', 'address'],
                [ethers.id(considerationItemType), item.itemType, item.token, item.identifierOrCriteria, item.startAmount, item.endAmount, item.recipient]
              ))
            )]
          )),
          orderParameters.orderType,
          orderParameters.startTime,
          orderParameters.endTime,
          orderParameters.zoneHash,
          orderParameters.salt,
          orderParameters.conduitKey,
          orderParameters.counter
        ]
      );
      
      return orderHash;
    } catch (error) {
      console.log('Hash hesaplama hatası:', error.message);
      // Basit bir fallback hash
      return ethers.id(`${orderParameters.offerer}-${orderParameters.salt}-${orderParameters.counter}`);
    }
  }
  
}

module.exports = AbstractTokenOffer;