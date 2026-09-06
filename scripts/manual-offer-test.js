require('dotenv').config({ path: '../.env' });
const { ethers } = require('ethers');
const axios = require('axios');

async function manualOfferTest() {
  console.log('🎯 Manual Offer Test - Token #896\n');
  
  const config = {
    apiKey: process.env.OPENSEA_API_KEY,
    privateKey: process.env.PRIVATE_KEY,
    walletAddress: process.env.WALLET_ADDRESS
  };
  
  const provider = new ethers.JsonRpcProvider(process.env.ABSTRACT_RPC_URL || 'https://api.mainnet.abs.xyz');
  const wallet = new ethers.Wallet(config.privateKey, provider);
  
  try {
    // Counter al
    console.log('1️⃣ Counter alınıyor...');
    const seaportAbi = ['function getCounter(address offerer) view returns (uint256)'];
    const seaportContract = new ethers.Contract(
      '0x0000000000000068f116a894984e2db1123eb395',
      seaportAbi,
      provider
    );
    
    const currentCounter = await seaportContract.getCounter(wallet.address);
    console.log('Counter:', currentCounter.toString());
    
    // Offer parametreleri
    const params = {
      contractAddress: '0xa6c46c07f7f1966d772e29049175ebba26262513',
      tokenId: '896',
      priceInETH: '0.01',
      durationMinutes: 15
    };
    
    const now = Math.floor(Date.now() / 1000);
    const orderParams = {
      offerer: wallet.address,
      zone: "0x000056F7000000EcE9003ca63978907a00FFD100",
      offer: [{
        itemType: 1,
        token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
        identifierOrCriteria: "0",
        startAmount: ethers.parseEther(params.priceInETH).toString(),
        endAmount: ethers.parseEther(params.priceInETH).toString()
      }],
      consideration: [
        {
          itemType: 2,
          token: params.contractAddress,
          identifierOrCriteria: params.tokenId,
          startAmount: "1",
          endAmount: "1",
          recipient: wallet.address
        },
        {
          itemType: 1,
          token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809",
          identifierOrCriteria: "0",
          startAmount: (ethers.parseEther(params.priceInETH) * 50n / 10000n).toString(),
          endAmount: (ethers.parseEther(params.priceInETH) * 50n / 10000n).toString(),
          recipient: "0x0000a26b00c1F0DF003000390027140000fAa719"
        }
      ],
      orderType: 3,
      startTime: now.toString(),
      endTime: (now + params.durationMinutes * 60).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e",
      totalOriginalConsiderationItems: 2,
      counter: currentCounter.toString()
    };
    
    // İmzala
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: 2741,
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
    
    const signature = await wallet.signTypedData(domain, types, orderParams);
    
    console.log('\n2️⃣ Order imzalandı');
    console.log('Salt:', orderParams.salt);
    
    // API'ye gönder
    const payload = {
      parameters: orderParams,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    console.log('\n3️⃣ API\'ye gönderiliyor...');
    
    const response = await axios.post(
      'https://api.opensea.io/api/v2/orders/abstract/seaport/offers',
      payload,
      {
        headers: {
          'X-API-KEY': config.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('\n✅ Başarılı!');
    console.log('Order Hash:', response.data.order.order_hash);
    console.log('Token #896 için 0.01 WETH teklif verildi!');
    
  } catch (error) {
    console.error('\n❌ Hata:', error.response?.data?.errors || error.message);
  }
}

manualOfferTest();