# OpenSea Bidder Bot

Bu bot, OpenSea üzerinde otomatik teklif verme işlemlerini gerçekleştirmek için geliştirilmiş bir Node.js uygulamasıdır. Bot, farklı teklif türlerini (token offer, criteria offer, collection offer) destekler ve belirtilen parametrelere göre çalışır.

## Özellikler

- **Token Offer**: Belirli NFT'lere (token ID'ye göre) teklif verme
- **Criteria Offer**: Belirli özelliklere (trait) sahip NFT'lere teklif verme
- **Collection Offer**: Bir koleksiyondaki tüm NFT'lere teklif verme
- **Counterbid**: Rakip teklifleri otomatik olarak geçme
- **HighOfferSkip**: En yüksek teklif zaten bizdeyse teklif vermeme
- **ItemLimit**: Belirli sayıda NFT'ye sahip olunca görevi durdurma
- **Döngü Zamanı**: Belirtilen süre sonunda tekrar teklif verme

## Kurulum

1. Gerekli bağımlılıkları yükleyin:

```bash
npm install
```

2. `.env.example` dosyasını `.env` olarak kopyalayın ve gerekli bilgileri doldurun:

```bash
cp .env.example .env
```

3. `.env` dosyasını düzenleyin:

```
# OpenSea API Anahtarı
OPENSEA_API_KEY=your_opensea_api_key_here

# Ethereum Cüzdan Bilgileri
PRIVATE_KEY=your_private_key_here
WALLET_ADDRESS=your_wallet_address_here

# Ağ Ayarları (mainnet veya testnet)
NETWORK=testnet

# WETH Kontrat Adresi (Ağa göre değişir)
WETH_CONTRACT_ADDRESS=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2

# RPC Sağlayıcı URL
RPC_URL=https://mainnet.infura.io/v3/your-infura-key
```

## Kullanım

Botu başlatmak için:

```bash
node index.js
```

### Komutlar

Bot aşağıdaki komutları destekler:

- `!createtask <taskismi>`: Yeni bir görev oluşturur
- `!settask <taskismi> [parametreler]`: Görev ayarlarını belirler
- `!starttask <taskismi>`: Görevi başlatır
- `!stoptask <taskismi>`: Görevi durdurur
- `!settingstask <taskismi>`: Görev ayarlarını gösterir
- `!tasklist`: Tüm görevleri listeler
- `!help`: Yardım bilgilerini gösterir
- `!exit`: Programdan çıkar

### Görev Ayarları

Görev ayarları aşağıdaki formatta belirtilir:

```
!settask <taskismi> koleksiyonunolduğuchain:koleskiyonismi minprice:0.001 maxprice:0.003 type:criteriaoffer trait:Edition size:Four offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1
```

#### Parametreler

- `chain:collection`: Zincir ve koleksiyon adı (örn. `ethereum:opepen-edition`)
- `minprice:X`: Minimum teklif fiyatı (WETH)
- `maxprice:X`: Maksimum teklif fiyatı (WETH)
- `type:X`: Teklif türü (`tokenoffer`, `criteriaoffer`, `collectionoffer`)
- `trait:X size:Y`: Trait tipi ve değeri (sadece `criteriaoffer` için gerekli)
- `offertime:Xmin`: Teklif süresi (dakika)
- `looptime:Xmin`: Döngü süresi (dakika)
- `counterbid on X`: Counterbid özelliği (açık/kapalı) ve artış miktarı
- `highofferskip:on/off`: En yüksek teklif bizdeyse atlama özelliği
- `itemlimit:X`: Sahip olunacak maksimum NFT sayısı
- `tokenids:X.txt`: Token ID'leri içeren dosya (sadece `tokenoffer` için)

### Örnekler

1. **Criteria Offer (Trait Bazlı Teklif)**:

```
!createtask ornek1
!settask ornek1 ethereum:opepen-edition minprice:0.001 maxprice:0.003 type:criteriaoffer trait:Edition size:Four offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1
!starttask ornek1
```

2. **Collection Offer (Koleksiyon Teklifi)**:

```
!createtask ornek2
!settask ornek2 ethereum:opepen-edition minprice:0.001 maxprice:0.003 type:collectionoffer offertime:15min looptime:0min counterbid on 0.001 highofferskip:on
!starttask ornek2
```

3. **Token Offer (Belirli NFT'lere Teklif)**:

```
!createtask ornek3
!settask ornek3 ethereum:opepen-edition minprice:0.001 maxprice:0.003 type:tokenoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1 tokenids:tokens.txt
!starttask ornek3
```

## Token ID Dosyası

Token offer için, token ID'leri bir metin dosyasında belirtilmelidir. Dosya, `data` klasöründe bulunmalı ve her satırda bir token ID içermelidir:

```
1234
5678
9012
```

## Notlar

- OpenSea API anahtarı almak için [OpenSea Geliştirici Portalı](https://docs.opensea.io/reference/api-keys)'nı ziyaret edin.
- Ethereum cüzdanınızda yeterli WETH olduğundan emin olun.
- API sınırlamalarını aşmamak için dikkatli olun.
- Testnet üzerinde test etmeniz önerilir.

## Lisans

MIT
