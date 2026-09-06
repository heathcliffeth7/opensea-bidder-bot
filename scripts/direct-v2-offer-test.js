require('dotenv').config({ path: '../.env' });
const { ethers } = require('ethers');
const axios = require('axios');

/**
 * Doğrudan v2 API ile offer testi
 */
async function directV2OfferTest() {
  console.log('🚀 Direct v2 Offer Test\n');
  
  const config = {
    apiKey: process.env.OPENSEA_API_KEY,
    privateKey: process.env.PRIVATE_KEY,
    walletAddress: process.env.WALLET_ADDRESS
  };
  
  // Abstract chain için provider
  const provider = new ethers.JsonRpcProvider(process.env.ABSTRACT_RPC_URL || 'https://api.mainnet.abs.xyz');
  const wallet = new ethers.Wallet(config.privateKey, provider);
  
  // Test parametreleri
  const params = {
    contractAddress: '0x8888888b82468e03b3f86501e8e7c4cf5682bc3e',
    tokenId: '1', // Genelde token 1 mevcuttur
    priceInETH: '0.01',
    durationMinutes: 15
  };
  
  try {
    // Bakiye kontrolü
    console.log('💰 Bakiye kontrol ediliyor...');
    const ethBalance = await provider.getBalance(wallet.address);
    console.log('ETH Bakiyesi:', ethers.formatEther(ethBalance));
    
    // WETH bakiyesi
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const wethContract = new ethers.Contract('0x3439153EB7AF838Ad19d56E1571FBD09333C2809', wethAbi, provider);
    const wethBalance = await wethContract.balanceOf(wallet.address);
    console.log('WETH Bakiyesi:', ethers.formatEther(wethBalance), '\n');
    
    // Order parametreleri
    const now = Math.floor(Date.now() / 1000);
    const orderParams = {
      offerer: wallet.address,
      zone: "0x000056F7000000EcE9003ca63978907a00FFD100",
      offer: [{
        itemType: 1, // ERC20
        token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809", // Abstract WETH
        identifierOrCriteria: "0",
        startAmount: ethers.parseEther(params.priceInETH).toString(),
        endAmount: ethers.parseEther(params.priceInETH).toString()
      }],
      consideration: [{
        itemType: 2, // ERC721
        token: params.contractAddress,
        identifierOrCriteria: params.tokenId,
        startAmount: "1",
        endAmount: "1",
        recipient: wallet.address
      }],
      orderType: 3, // PARTIAL_RESTRICTED
      startTime: now.toString(),
      endTime: (now + params.durationMinutes * 60).toString(),
      zoneHash: ethers.ZeroHash,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e", // Abstract için özel conduit key
      totalOriginalConsiderationItems: 1,
      counter: "0"
    };
    
    console.log('📝 Order parametreleri hazırlandı');
    console.log('Start time:', new Date(now * 1000).toLocaleString());
    console.log('End time:', new Date((now + params.durationMinutes * 60) * 1000).toLocaleString());
    
    // İmzala
    const domain = {
      name: "Seaport",
      version: "1.6",
      chainId: 2741, // Abstract
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
    console.log('✅ Order imzalandı\n');
    
    // API'ye gönder
    const payload = {
      parameters: orderParams,
      signature: signature,
      protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
    };
    
    console.log('📤 OpenSea API\'ye gönderiliyor...');
    
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
    
    console.log('✅ Başarılı!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Hata:', error.message);
    if (error.response?.data) {
      console.error('API yanıtı:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

directV2OfferTest();