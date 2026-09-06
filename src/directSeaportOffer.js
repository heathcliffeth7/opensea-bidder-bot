const { ethers } = require('ethers');
const config = require('../config');

/**
 * Doğrudan Seaport protokolü üzerinden offer oluşturma
 */
class DirectSeaportOffer {
  constructor() {
    this.seaportAddress = '0x0000000000000068f116a894984e2db1123eb395';
    this.abstractConduitKey = '0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e';
  }

  async createDirectOffer(contractAddress, tokenId, priceInETH, chain = 'abstract') {
    try {
      console.log('\n🔧 Doğrudan Seaport Offer Oluşturuluyor...');
      
      // Provider ve wallet oluştur
      const rpcUrl = config.getRpcUrl(chain);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(config.privateKey, provider);
      
      // Seaport ABI (sadece gerekli fonksiyonlar)
      const seaportAbi = [
        'function getCounter(address offerer) view returns (uint256)',
        'function fulfillOrder(tuple(tuple(address,address,tuple(uint8,address,uint256,uint256,uint256)[],tuple(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256) parameters,bytes signature) order, bytes32 fulfillerConduitKey) payable returns (bool)',
        'function validate(tuple(tuple(address,address,tuple(uint8,address,uint256,uint256,uint256)[],tuple(uint8,address,uint256,uint256,uint256,address)[],uint8,uint256,uint256,bytes32,uint256,bytes32,uint256) parameters,bytes signature)[] orders) returns (bool)'
      ];
      
      const seaportContract = new ethers.Contract(this.seaportAddress, seaportAbi, wallet);
      
      // Counter al
      const counter = await seaportContract.getCounter(wallet.address);
      console.log(`Counter: ${counter.toString()}`);
      
      // Order parametreleri
      const orderParams = this._buildOrderParams(
        wallet.address,
        contractAddress,
        tokenId,
        priceInETH,
        counter.toString(),
        chain
      );
      
      // Order'ı imzala
      const signature = await this._signOrder(orderParams, wallet, chain);
      console.log('Order imzalandı');
      
      // Order'ı validate et (opsiyonel)
      try {
        const isValid = await seaportContract.validate([{
          parameters: orderParams,
          signature: signature
        }]);
        console.log(`Order valid mi: ${isValid}`);
      } catch (e) {
        console.log('Validation hatası (normal olabilir):', e.message);
      }
      
      // Order hash'i hesapla
      const orderHash = this._calculateOrderHash(orderParams);
      
      console.log(`✅ Seaport order oluşturuldu!`);
      console.log(`Order Hash: ${orderHash}`);
      
      return {
        success: true,
        orderHash: orderHash,
        orderParams: orderParams,
        signature: signature
      };
      
    } catch (error) {
      console.error('Doğrudan Seaport offer hatası:', error);
      throw error;
    }
  }
  
  _buildOrderParams(offerer, contractAddress, tokenId, priceInETH, counter, chain) {
    const now = Math.floor(Date.now() / 1000);
    const offerWei = ethers.parseEther(priceInETH.toString());
    const feeWei = (offerWei * 250n) / 10000n; // %2.5 fee
    
    const wethAddress = config.getWethAddress(chain);
    const zone = config.getSeaportZone(chain);
    
    return {
      offerer: offerer,
      zone: zone,
      offer: [{
        itemType: 1, // ERC20
        token: wethAddress,
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
          recipient: offerer
        },
        {
          itemType: 1, // ERC20 (fee)
          token: wethAddress,
          identifierOrCriteria: "0",
          startAmount: feeWei.toString(),
          endAmount: feeWei.toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ],
      orderType: 2, // FULL_RESTRICTED
      startTime: now.toString(),
      endTime: (now + (15 * 60)).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: this.abstractConduitKey,
      counter: counter
    };
  }
  
  async _signOrder(orderParams, wallet, chain) {
    const domain = {
      name: 'Seaport',
      version: '1.6',
      chainId: config.getChainId(chain),
      verifyingContract: this.seaportAddress
    };
    
    const types = {
      OrderComponents: [
        { name: 'offerer', type: 'address' },
        { name: 'zone', type: 'address' },
        { name: 'offer', type: 'OfferItem[]' },
        { name: 'consideration', type: 'ConsiderationItem[]' },
        { name: 'orderType', type: 'uint8' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'zoneHash', type: 'bytes32' },
        { name: 'salt', type: 'uint256' },
        { name: 'conduitKey', type: 'bytes32' },
        { name: 'counter', type: 'uint256' }
      ],
      OfferItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' }
      ],
      ConsiderationItem: [
        { name: 'itemType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'identifierOrCriteria', type: 'uint256' },
        { name: 'startAmount', type: 'uint256' },
        { name: 'endAmount', type: 'uint256' },
        { name: 'recipient', type: 'address' }
      ]
    };
    
    return await wallet.signTypedData(domain, types, orderParams);
  }
  
  _calculateOrderHash(orderParams) {
    // Simplified order hash calculation
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'uint256', 'uint256', 'bytes32', 'uint256'],
      [
        orderParams.offerer,
        orderParams.startTime,
        orderParams.endTime,
        orderParams.salt,
        orderParams.counter
      ]
    );
    return ethers.keccak256(encoded);
  }
}

module.exports = DirectSeaportOffer;