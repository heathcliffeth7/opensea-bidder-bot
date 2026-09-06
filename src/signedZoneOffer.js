const axios = require('axios');
const { ethers } = require('ethers');
const config = require('../config');

/**
 * OpenSea SignedZone Offer Sistemi
 * Gas-free iptal edilebilen teklifler için
 */
class SignedZoneOffer {
  constructor(chain = 'ethereum') {
    this.chain = chain;
    this.provider = new ethers.JsonRpcProvider(config.getRpcUrl(chain));
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    
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
   * SignedZone token teklifi oluştur (Gas-free iptal edilebilir)
   */
  async createSignedZoneOffer(contractAddress, tokenId, offerPriceETH, expirationMinutes = 15) {
    try {
      console.log('\n🔐 SignedZone teklif oluşturuluyor (gas-free iptal edilebilir)...');
      
      const walletAddress = await this.wallet.getAddress();
      const offerWei = ethers.parseEther(offerPriceETH.toString());
      const now = Math.floor(Date.now() / 1000);
      const expirationTime = now + (expirationMinutes * 60);
      
      // OpenSea fee (%0.5)
      const feeWei = offerWei * 50n / 10000n;
      
      // SignedZone parametreleri
      const orderParameters = {
        offerer: walletAddress,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone
        offer: [{
          itemType: 1, // ERC20 (WETH)
          token: config.getWethAddress(this.chain),
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
            token: config.wethContractAddress || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            identifierOrCriteria: "0",
            startAmount: feeWei.toString(),
            endAmount: feeWei.toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
          }
        ],
        orderType: 2, // FULL_RESTRICTED - Zone kullanımı için
        startTime: now.toString(),
        endTime: expirationTime.toString(),
        zoneHash: ethers.ZeroHash,
        salt: ethers.hexlify(ethers.randomBytes(32)),
        conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
        totalOriginalConsiderationItems: 2,
        counter: "0"
      };

      // İmza oluştur
      const signature = await this.signOrder(orderParameters);
      
      // POST /api/v2/orders endpoint'i kullan
      const postPayload = {
        parameters: orderParameters,
        signature: signature,
        protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
      };

      console.log('📤 SignedZone order gönderiliyor...');
      
      const response = await this.apiClient.post('/api/v2/orders/ethereum/seaport-v1.6/offers', postPayload);
      
      if (response.data.order_hash) {
        console.log('✅ SignedZone teklif başarıyla oluşturuldu!');
        console.log(`📋 Order hash: ${response.data.order_hash}`);
        console.log(`💸 Gas ücreti: 0 (off-chain)`);
        console.log(`🚫 Gas-free iptal: EVET`);
        
        return {
          success: true,
          orderHash: response.data.order_hash,
          offChain: true,
          gasUsed: 0,
          gasFreeCancel: true,
          zone: "0x000056F7000000EcE9003ca63978907a00FFD100" // Seaport 1.6 zone
        };
      }
      
    } catch (error) {
      console.error('❌ SignedZone teklif hatası:', error.message);
      if (error.response) {
        console.error('API yanıtı:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * EIP-712 imza oluştur
   */
  async signOrder(orderParameters) {
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: config.getChainId(this.chain),
      verifyingContract: "0x0000000000000068f116a894984e2db1123eb395"
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

    return await this.wallet.signTypedData(domain, types, orderParameters);
  }

  /**
   * Gas-free iptal (SignedZone order'lar için)
   */
  async cancelSignedZoneOffer(orderHash, chain = 'ethereum') {
    try {
      console.log('\n🚫 SignedZone teklif iptal ediliyor (gas-free)...');
      console.log(`Order hash: ${orderHash}`);
      
      const endpoint = `/api/v2/orders/chain/${chain}/protocol/0x0000000000000068f116a894984e2db1123eb395/${orderHash}/cancel`;
      
      const response = await this.apiClient.post(endpoint);
      
      console.log('✅ SignedZone teklif gas-free iptal edildi!');
      return {
        success: true,
        cancelled: true,
        gasUsed: 0
      };
      
    } catch (error) {
      console.error('❌ SignedZone iptal hatası:', error.message);
      if (error.response) {
        console.error('API yanıtı:', error.response.data);
      }
      throw error;
    }
  }

  async getCollectionSlug(contractAddress) {
    // Önce cache'den bak
    const knownCollections = {
      '0xbe9371326f91345777b04394448c23e2bfeaa826': 'gemesis'
    };
    
    if (knownCollections[contractAddress.toLowerCase()]) {
      return knownCollections[contractAddress.toLowerCase()];
    }
    
    // API'den al
    try {
      const response = await this.apiClient.get(`/api/v2/chain/ethereum/contract/${contractAddress}`);
      return response.data.collection?.slug || contractAddress;
    } catch (error) {
      return contractAddress;
    }
  }
}

module.exports = SignedZoneOffer;