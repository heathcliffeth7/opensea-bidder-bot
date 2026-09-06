const { ethers } = require('ethers');
const config = require('../config');

/**
 * Gelişmiş Token Offer Oluşturucu
 * OpenSea'nin en güncel API formatına uygun
 */
class AdvancedTokenOffer {
  constructor(api) {
    this.api = api;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
  }

  async createTokenOffer(contractAddress, tokenId, priceInEth, expirationMinutes = 15) {
    try {
      console.log('\n🚀 Gelişmiş Token Offer oluşturuluyor...');
      console.log(`Contract: ${contractAddress}`);
      console.log(`Token ID: ${tokenId}`);
      console.log(`Fiyat: ${priceInEth} ETH`);
      
      // Collection slug'ı al
      let collectionSlug;
      try {
        // Eğer zaten slug ise direkt kullan
        if (!contractAddress.startsWith('0x')) {
          collectionSlug = contractAddress;
          const collectionInfo = await this.api.getCollectionInfo(contractAddress);
          contractAddress = collectionInfo.contractAddress;
        } else {
          // Contract address'ten slug'ı bulmaya çalış
          const response = await this.api.makeRequest('GET', `/api/v2/chain/ethereum/contract/${contractAddress}`);
          collectionSlug = response.collection || 'unknown';
        }
      } catch (e) {
        console.log('Collection slug alınamadı:', e.message);
        // Varsayılan olarak gemesis kullan
        collectionSlug = 'gemesis';
      }
      
      // Seaport 1.6 order parametreleri
      const now = Math.floor(Date.now() / 1000);
      const orderParameters = {
        offerer: config.walletAddress,
        zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone
        offer: [
          {
            itemType: 1, // ERC20 (WETH)
            token: config.wethContractAddress,
            identifierOrCriteria: "0",
            startAmount: ethers.parseEther(priceInEth.toString()).toString(),
            endAmount: ethers.parseEther(priceInEth.toString()).toString()
          }
        ],
        consideration: [
          {
            itemType: 2, // ERC721
            token: contractAddress,
            identifierOrCriteria: tokenId.toString(),
            startAmount: "1",
            endAmount: "1",
            recipient: config.walletAddress
          },
          {
            itemType: 1, // ERC20 (Fee)
            token: config.wethContractAddress,
            identifierOrCriteria: "0",
            startAmount: ethers.parseEther((priceInEth * 0.005).toString()).toString(), // 0.5% fee
            endAmount: ethers.parseEther((priceInEth * 0.005).toString()).toString(),
            recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
          }
        ],
        orderType: 2, // FULL_RESTRICTED
        startTime: now.toString(),
        endTime: (now + (expirationMinutes * 60)).toString(),
        zoneHash: ethers.ZeroHash,
        salt: ethers.hexlify(ethers.randomBytes(32)),
        conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
        totalOriginalConsiderationItems: 2,
        counter: (await this._getCounter()).toString() // Gerçek counter'ı al
      };
      
      // Order'ı imzala
      const signature = await this._signSeaportOrder(orderParameters);
      
      // API payload - token offer için asset formatı
      const payload = {
        asset: {
          collection: collectionSlug,
          contract: contractAddress,
          token_id: tokenId.toString()
        },
        maker: {
          address: config.walletAddress
        },
        price: {
          currency: "WETH",
          value: ethers.parseEther(priceInEth.toString()).toString()
        },
        protocol_data: {
          parameters: orderParameters,
          signature: signature
        },
        protocol_address: "0x0000000000000068F116a894984e2DB1123eB395" // Seaport 1.6
      };
      
      console.log('Token offer payload hazır, API\'ye gönderiliyor...');
      
      // API isteği
      const response = await this.api.makeRequest('POST', '/api/v2/offers', payload);
      
      if (response && response.order) {
        console.log('✅ Token offer başarıyla oluşturuldu!');
        console.log(`Order hash: ${response.order.order_hash}`);
        return {
          success: true,
          order_hash: response.order.order_hash,
          order: response.order
        };
      }
      
      throw new Error('Beklenmeyen API yanıtı');
      
    } catch (error) {
      console.error('❌ Token offer hatası:', error.message);
      
      if (error.response && error.response.data) {
        console.error('API Hatası:', JSON.stringify(error.response.data, null, 2));
      }
      
      throw error;
    }
  }
  
  async _signSeaportOrder(orderParameters) {
    // EIP-712 domain
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: 1, // Ethereum mainnet
      verifyingContract: "0x0000000000000068F116a894984e2DB1123eB395"
    };
    
    // EIP-712 types
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
    
    // İmzala
    const signature = await this.wallet.signTypedData(domain, types, orderParameters);
    return signature;
  }
  
  async _getCounter() {
    try {
      // Seaport contract ABI (sadece counter fonksiyonu için)
      const seaportAbi = [
        "function getCounter(address offerer) view returns (uint256)"
      ];
      
      const seaportContract = new ethers.Contract(
        "0x0000000000000068F116a894984e2DB1123eB395",
        seaportAbi,
        this.provider
      );
      
      const counter = await seaportContract.getCounter(config.walletAddress);
      console.log(`Counter değeri: ${counter.toString()}`);
      return counter.toString();
    } catch (error) {
      console.log('Counter alınamadı, 0 kullanılıyor:', error.message);
      return "0";
    }
  }
}

module.exports = AdvancedTokenOffer;