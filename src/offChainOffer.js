const axios = require('axios');
const { ethers } = require('ethers');
const { OpenSeaSDK, Chain } = require('opensea-js');
const config = require('../config');

/**
 * OpenSea Off-chain (gas ücretsiz) teklif sistemi
 * SDK'nin zone parametresiyle offchain iptal edilebilir token offer oluşturur
 */
class OffChainOffer {
  constructor() {
    this.providers = {};
    this.wallets = {};
    this.sdks = {};
    this.currentChain = 'ethereum';
    
    // OpenSea API client (yedek için)
    this.apiClient = axios.create({
      baseURL: 'https://api.opensea.io',
      headers: {
        'X-API-KEY': config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
  }
  
  /**
   * Belirli bir chain için SDK başlat
   */
  async initializeForChain(chain) {
    if (!this.sdks[chain]) {
      const rpcUrl = config.getRpcUrl(chain);
      this.providers[chain] = new ethers.JsonRpcProvider(rpcUrl);
      this.wallets[chain] = new ethers.Wallet(config.privateKey, this.providers[chain]);
      
      // Chain mapping for SDK
      let sdkChain;
      switch(chain) {
        case 'ethereum':
          sdkChain = Chain.Mainnet;
          break;
        case 'polygon':
          sdkChain = Chain.Polygon;
          break;
        case 'sepolia':
          sdkChain = Chain.Sepolia;
          break;
        case 'abstract':
          // Abstract için özel ayar
          sdkChain = { name: 'abstract', chainId: 2741 };
          break;
        default:
          sdkChain = Chain.Mainnet;
      }
      
      this.sdks[chain] = new OpenSeaSDK(this.wallets[chain], {
        chain: sdkChain,
        apiKey: config.apiKey
      });
    }
    this.currentChain = chain;
  }

  /**
   * Off-chain token teklifi oluştur (SDK ile)
   */
  async createOffChainOffer(contractAddress, tokenId, offerPriceETH, expirationMinutes = 15, chain = 'ethereum') {
    try {
      console.log(`\n🔐 SDK ile off-chain teklif oluşturuluyor (gas ücretsiz) - Chain: ${chain}...`);
      
      // Chain için SDK'yı başlat
      await this.initializeForChain(chain);
      const sdk = this.sdks[chain];
      
      const expirationTime = Math.floor((Date.now() + (expirationMinutes * 60 * 1000)) / 1000);
      
      // SDK ile zone parametreli token offer oluştur
      const offerParams = {
        asset: {
          tokenId: tokenId.toString(),
          tokenAddress: contractAddress
        },
        accountAddress: config.walletAddress,
        startAmount: parseFloat(offerPriceETH),
        expirationTime: expirationTime,
        paymentTokenAddress: config.getWethAddress ? config.getWethAddress(chain) : config.wethContractAddress,
        // Zone parametresi - offchain iptal edilebilir yapar
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100"
      };
      
      console.log('📤 SDK createOffer çağrılıyor (zone ile)...');
      const offer = await sdk.createOffer(offerParams);
      
      console.log('✅ Off-chain teklif başarıyla oluşturuldu!');
      console.log(`📋 Order hash: ${offer.orderHash || offer.order_hash || 'N/A'}`);
      console.log(`💸 Gas ücreti: 0 (off-chain iptal edilebilir)`);
      
      // Order detaylarını kontrol et
      if (offer.protocolData?.parameters) {
        console.log(`🔍 Zone: ${offer.protocolData.parameters.zone}`);
        console.log(`🔍 OrderType: ${offer.protocolData.parameters.orderType}`);
      }
      
      return {
        success: true,
        orderHash: offer.orderHash || offer.order_hash,
        offChain: true,
        gasUsed: 0,
        fullResponse: offer
      };
      
    } catch (error) {
      console.error('❌ SDK off-chain teklif hatası:', error.message);
      
      // Yedek olarak eski sistemi dene
      if (error.message.includes('zone') || error.message.includes('SDK')) {
        console.log('🔄 Yedek sistem deneniyor...');
        return await this.createOffChainOfferLegacy(contractAddress, tokenId, offerPriceETH, expirationMinutes, chain);
      }
      
      throw error;
    }
  }

  /**
   * Off-chain token teklifi oluştur (eski yöntem - yedek)
   */
  async createOffChainOfferLegacy(contractAddress, tokenId, offerPriceETH, expirationMinutes = 15, chain = 'ethereum') {
    try {
      console.log('\n🔐 Off-chain teklif oluşturuluyor (yedek sistem)...');
      
      // Chain için wallet'ı al
      if (!this.wallets[chain]) {
        await this.initializeForChain(chain);
      }
      const wallet = this.wallets[chain];
      const walletAddress = await wallet.getAddress();
      const offerWei = ethers.parseEther(offerPriceETH.toString());
      const now = Math.floor(Date.now() / 1000);
      const expirationTime = now + (expirationMinutes * 60);
      
      // OpenSea fee hesapla (%0.5)
      const feeWei = offerWei * 50n / 10000n;
      
      // Order parametreleri
      const orderParameters = {
        offerer: walletAddress,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone
        offer: [{
          itemType: 1, // ERC20 (WETH)
          token: config.getWethAddress ? config.getWethAddress(chain) : (config.wethContractAddress || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
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
          {
            itemType: 1, // ERC20 (WETH) - OpenSea fee
            token: config.getWethAddress ? config.getWethAddress(chain) : (config.wethContractAddress || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
            identifierOrCriteria: "0",
            startAmount: feeWei.toString(),
            endAmount: feeWei.toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
          }
        ],
        orderType: 0, // FULL_OPEN
        startTime: now.toString(),
        endTime: expirationTime.toString(),
        zoneHash: ethers.ZeroHash,
        salt: ethers.hexlify(ethers.randomBytes(32)),
        conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000", // OpenSea conduit
        totalOriginalConsiderationItems: 2,
        counter: "0" // Off-chain için counter 0
      };

      // EIP-712 imza oluştur
      const signature = await this.signOrder(orderParameters);
      
      // API'ye gönder
      const response = await this.submitOffChainOrder(orderParameters, signature);
      
      console.log('✅ Off-chain teklif başarıyla oluşturuldu!');
      console.log(`📋 Order hash: ${response.order?.order_hash || response.order?.hash || response.order_hash || 'N/A'}`);
      console.log(`💸 Gas ücreti: 0 (off-chain)`);
      
      return {
        success: true,
        orderHash: response.order?.order_hash || response.order?.hash || response.order_hash,
        offChain: true,
        gasUsed: 0,
        fullResponse: response
      };
      
    } catch (error) {
      console.error('❌ Off-chain teklif hatası:', error.message);
      throw error;
    }
  }

  /**
   * EIP-712 imza oluştur
   */
  async signOrder(orderParameters) {
    const domain = {
      name: "Seaport",
      version: "1.6", // OpenSea şu anda 1.6 kullanıyor
      chainId: 1,
      verifyingContract: "0x0000000000000068f116a894984e2db1123eb395" // Seaport 1.6 address
    };

    const types = {
      OrderComponents: [
        { name: "offerer", type: "address" },
        { name: "zone", type: "address" },
        { name: "offer", type: "OfferItem[]" },
        { name: "consideration", type: "ConsiderationItem[]" },
        { name: "orderType", type: "uint8" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
        { name: "zoneHash", type: "bytes32" },
        { name: "salt", type: "uint256" },
        { name: "conduitKey", type: "bytes32" },
        { name: "counter", type: "uint256" }
      ],
      OfferItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" }
      ],
      ConsiderationItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "recipient", type: "address" }
      ]
    };

    // Parametreleri imza için hazırla (counter olmadan)
    const message = {
      ...orderParameters,
      counter: orderParameters.counter
    };

    return await this.wallet.signTypedData(domain, types, message);
  }

  /**
   * Off-chain order'ı API'ye gönder
   */
  async submitOffChainOrder(parameters, signature) {
    try {
      // OpenSea API v2 endpoint
      const endpoint = '/api/v2/orders/ethereum/seaport/offers';
      
      const payload = {
        parameters: {
          ...parameters,
          totalOriginalConsiderationItems: parameters.consideration.length
        },
        signature: signature,
        protocol_address: "0x0000000000000068f116a894984e2db1123eb395" // Seaport 1.6
      };

      console.log('📤 Off-chain order gönderiliyor...');
      
      const response = await this.apiClient.post(endpoint, payload);
      
      console.log('API yanıtı:', JSON.stringify(response.data, null, 2));
      
      return response.data;
      
    } catch (error) {
      if (error.response) {
        console.error('API Hatası:', error.response.status, error.response.data);
        
        // Eğer counter hatası alırsak, counter'ı güncelle
        if (error.response.data?.errors?.[0]?.includes('counter')) {
          console.log('⚠️ Counter güncel değil, yeniden denenecek...');
          throw new Error('Counter mismatch - retry needed');
        }
      }
      throw error;
    }
  }

  /**
   * Collection için off-chain teklif
   */
  async createOffChainCollectionOffer(collectionSlug, offerPriceETH, expirationMinutes = 15) {
    console.log('\n🔐 Off-chain collection teklifi oluşturuluyor...');
    
    // Collection bilgilerini al
    const collectionInfo = await this.getCollectionInfo(collectionSlug);
    if (!collectionInfo || !collectionInfo.contractAddress) {
      throw new Error('Collection bilgileri alınamadı');
    }

    const walletAddress = await this.wallet.getAddress();
    const offerWei = ethers.parseEther(offerPriceETH.toString());
    const now = Math.floor(Date.now() / 1000);
    const expirationTime = now + (expirationMinutes * 60);
    
    // OpenSea fee
    const feeWei = offerWei * 50n / 10000n;

    const orderParameters = {
      offerer: walletAddress,
      zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone
      offer: [{
        itemType: 1, // ERC20 (WETH)
        token: config.wethContractAddress || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        identifierOrCriteria: "0",
        startAmount: offerWei.toString(),
        endAmount: offerWei.toString()
      }],
      consideration: [
        {
          itemType: 4, // ERC721_WITH_CRITERIA (collection offer)
          token: collectionInfo.contractAddress,
          identifierOrCriteria: "0", // Tüm collection
          startAmount: "1",
          endAmount: "1",
          recipient: walletAddress
        },
        {
          itemType: 1, // ERC20 (WETH) - fee
          token: config.getWethAddress ? config.getWethAddress(chain) : (config.wethContractAddress || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
          identifierOrCriteria: "0",
          startAmount: feeWei.toString(),
          endAmount: feeWei.toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ],
      orderType: 1, // PARTIAL_OPEN - Collection offer için
      startTime: now.toString(),
      endTime: expirationTime.toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
      totalOriginalConsiderationItems: 2,
      counter: "0"
    };

    const signature = await this.signOrder(orderParameters);
    const response = await this.submitOffChainOrder(orderParameters, signature);
    
    console.log('✅ Off-chain collection teklifi oluşturuldu!');
    return {
      success: true,
      orderHash: response.order_hash || response.orderHash,
      offChain: true,
      gasUsed: 0
    };
  }

  async getCollectionInfo(collectionSlug) {
    try {
      const response = await this.apiClient.get(`/api/v2/collections/${collectionSlug}`);
      return {
        contractAddress: response.data.contracts?.[0]?.address,
        ...response.data
      };
    } catch (error) {
      console.error('Collection bilgileri alınamadı:', error.message);
      return null;
    }
  }

  /**
   * Off-chain teklifi iptal et
   * NOT: OpenSea'nin gas-free iptal özelliği sadece web arayüzünde mevcut.
   * API üzerinden gas-free iptal şu anda desteklenmiyor.
   * 
   * Alternatifler:
   * 1. Kısa süreli teklifler verin (15-30 dakika)
   * 2. On-chain counter increment ile tüm teklifleri iptal edin
   * 3. Web arayüzünden manuel iptal
   */
  async cancelOffChainOffer(orderHash, chain = 'ethereum') {
    console.warn('\n⚠️ UYARI: OpenSea API\'si gas-free iptal desteklemiyor!');
    console.log('Gas-free iptal sadece OpenSea web arayüzünde mevcut.');
    console.log('\nAlternatifler:');
    console.log('1. Kısa süreli teklifler verin (otomatik iptal)');
    console.log('2. incrementCounter() ile tüm teklifleri iptal edin (az gas)');
    console.log('3. Web arayüzünden manuel iptal (gas ücretsiz)\n');
    
    throw new Error('Gas-free iptal API\'de desteklenmiyor. Web arayüzünü kullanın.');
  }
  
  /**
   * Seaport counter'ı artırarak tüm teklifleri iptal et
   * Bu yöntem az gas kullanır ve tüm aktif teklifleri iptal eder
   */
  async incrementCounter() {
    try {
      console.log('\n🔄 Seaport counter artırılıyor (tüm teklifler iptal edilecek)...');
      
      const seaportAbi = [
        "function incrementCounter() external returns (uint256 newCounter)"
      ];
      
      const seaportContract = new ethers.Contract(
        "0x0000000000000068f116a894984e2db1123eb395",
        seaportAbi,
        this.wallet
      );
      
      const tx = await seaportContract.incrementCounter();
      console.log(`📤 Transaction gönderildi: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`✅ Tüm teklifler iptal edildi! Gas kullanılan: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);
      
      return {
        success: true,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      console.error('❌ Counter increment hatası:', error.message);
      throw error;
    }
  }

  /**
   * Aktif off-chain teklifleri listele
   */
  async getActiveOffers(walletAddress) {
    try {
      const endpoint = `/api/v2/orders/ethereum/seaport/offers`;
      const params = {
        maker: walletAddress,
        limit: 50
      };
      
      const response = await this.apiClient.get(endpoint, { params });
      
      return response.data.orders || [];
      
    } catch (error) {
      console.error('Aktif teklifler alınamadı:', error.message);
      return [];
    }
  }
}

module.exports = OffChainOffer;