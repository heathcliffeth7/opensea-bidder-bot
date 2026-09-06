#!/usr/bin/env node

/**
 * Multi-chain test script
 * ethereum:gemesis ve abstract:pengztracted-abstract task'larını test eder
 */

require('dotenv').config();
const api = require('./src/api');

async function testMultiChain() {
  console.log('\n🚀 Multi-chain Stream Test Başlıyor...\n');
  
  // Ethereum için listener
  console.log('1️⃣ Ethereum chain için gemesis koleksiyonu dinleniyor...');
  api.listenToCollectionOffers('ethereum', 'gemesis', (event) => {
    console.log('\n✅ ETHEREUM EVENT ALGıLANDI!');
    console.log('Chain: ethereum');
    console.log('Collection: gemesis');
    console.log('Event:', event);
  });
  
  // Biraz bekle
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Abstract için listener  
  console.log('\n2️⃣ Abstract chain için pengztracted-abstract koleksiyonu dinleniyor...');
  api.listenToCollectionOffers('abstract', 'pengztracted-abstract', (event) => {
    console.log('\n✅ ABSTRACT EVENT ALGILANDI!');
    console.log('Chain: abstract');
    console.log('Collection: pengztracted-abstract');
    console.log('Event:', event);
  });
  
  console.log('\n📡 Her iki chain de dinleniyor...');
  console.log('Ctrl+C ile durdurun\n');
  
  // Stream client durumlarını kontrol et
  setInterval(() => {
    console.log('\n📊 Stream Client Durumları:');
    if (api.streamClients) {
      api.streamClients.forEach((client, chain) => {
        console.log(`- ${chain}: ${client.isConnected || client.connected ? '🟢 Bağlı' : '🔴 Bağlı değil'}`);
      });
    }
  }, 30000); // 30 saniyede bir kontrol
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Test sonlandırılıyor...');
  process.exit(0);
});

// Test'i başlat
testMultiChain().catch(console.error);