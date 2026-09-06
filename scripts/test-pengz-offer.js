require('dotenv').config({ path: '../.env' });
const { ethers } = require('ethers');
const axios = require('axios');

async function testPengzOffer() {
  console.log('🐧 Pengztracted Abstract Token Offer Test\n');
  
  const config = {
    apiKey: process.env.OPENSEA_API_KEY,
    privateKey: process.env.PRIVATE_KEY,
    walletAddress: process.env.WALLET_ADDRESS
  };
  
  // Abstract chain için provider
  const provider = new ethers.JsonRpcProvider(process.env.ABSTRACT_RPC_URL || 'https://api.mainnet.abs.xyz');
  const wallet = new ethers.Wallet(config.privateKey, provider);
  
  // Test parametreleri - sizin verdiğiniz token ID'ler
  const params = {
    contractAddress: '0xa6c46c07f7f1966d772e29049175ebba26262513', // Pengztracted contract
    tokenIds: ['16', '50', '896'],
    priceInETH: '0.01',
    durationMinutes: 15
  };
  
  try {
    console.log('💰 Bakiye kontrol ediliyor...');
    const ethBalance = await provider.getBalance(wallet.address);
    console.log('ETH Bakiyesi:', ethers.formatEther(ethBalance));
    
    // WETH bakiyesi
    const wethAbi = ['function balanceOf(address) view returns (uint256)'];
    const wethContract = new ethers.Contract('0x3439153EB7AF838Ad19d56E1571FBD09333C2809', wethAbi, provider);
    const wethBalance = await wethContract.balanceOf(wallet.address);
    console.log('WETH Bakiyesi:', ethers.formatEther(wethBalance), '\n');
    
    // Her token için teklif ver
    for (const tokenId of params.tokenIds) {
      console.log(`\n🎯 Token #${tokenId} için teklif hazırlanıyor...`);
      
      try {
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
          consideration: [
            {
              itemType: 2, // ERC721
              token: params.contractAddress,
              identifierOrCriteria: tokenId,
              startAmount: "1",
              endAmount: "1",
              recipient: wallet.address
            },
            {
              itemType: 1, // ERC20 (WETH fee)
              token: "0x3439153EB7AF838Ad19d56E1571FBD09333C2809", // Abstract WETH
              identifierOrCriteria: "0",
              startAmount: (ethers.parseEther(params.priceInETH) * 50n / 10000n).toString(), // 0.5% fee
              endAmount: (ethers.parseEther(params.priceInETH) * 50n / 10000n).toString(),
              recipient: "0x0000a26b00c1F0DF003000390027140000fAa719" // OpenSea fee recipient
            }
          ],
          orderType: 3, // PARTIAL_RESTRICTED
          startTime: now.toString(),
          endTime: (now + params.durationMinutes * 60).toString(),
          zoneHash: ethers.ZeroHash,
          salt: ethers.hexlify(ethers.randomBytes(32)),
          conduitKey: "0x61159fefdfada89302ed55f8b9e89e2d67d8258712b3a3f89aa88525877f1d5e", // Abstract conduit key
          totalOriginalConsiderationItems: 2,
          counter: "4261708516436045846285944668025016340433" // On-chain counter
        };
        
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
        
        // API'ye gönder
        const payload = {
          parameters: orderParams,
          signature: signature,
          protocol_address: "0x0000000000000068f116a894984e2db1123eb395"
        };
        
        console.log(`📤 Token #${tokenId} için OpenSea API'ye gönderiliyor...`);
        
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
        
        console.log(`✅ Token #${tokenId} başarılı!`);
        console.log('Order Hash:', response.data.order_hash);
        
      } catch (error) {
        console.error(`❌ Token #${tokenId} hatası:`, error.response?.data?.errors || error.message);
        
        // Duplicate order hatası ise counter artır
        if (error.response?.data?.errors?.[0]?.includes('duplicate')) {
          console.log('💡 Duplicate order hatası - Counter artırılmalı');
        }
      }
      
      // API rate limit için bekle
      if (tokenId !== params.tokenIds[params.tokenIds.length - 1]) {
        console.log('⏳ 2 saniye bekleniyor...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('\n✅ Test tamamlandı!');
    
  } catch (error) {
    console.error('❌ Test hatası:', error.message);
  }
}

testPengzOffer();