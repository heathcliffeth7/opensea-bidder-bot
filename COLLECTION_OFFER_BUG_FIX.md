# Collection Offer Bug Düzeltmesi

## Problem

OpenSea API'de `/api/v2/offers/collection/{collection}/nfts/{tokenId}/best` endpoint'i çağrıldığında, eğer o token için spesifik bir offer yoksa, API collection offer'ı "best offer" olarak dönüyor.

### Örnek:
- Galverse collection için en yüksek collection offer: 0.0205 ETH
- Token #653 için spesifik offer: YOK
- API response: Collection offer'ı (0.0205 ETH) best offer olarak dönüyor

## Sorunun Detayı

```json
{
  "price": {
    "value": "20500000000000000"
  },
  "criteria": {
    "encoded_token_ids": "*"  // <-- Bu collection offer olduğunu gösteriyor
  }
}
```

`encoded_token_ids: "*"` değeri, bu offer'ın tüm collection için geçerli olduğunu, spesifik bir token için olmadığını gösteriyor.

## Eski Davranış

Kod, collection offer'ı token-specific offer gibi işliyordu:
1. Collection offer price'ı alınıyor (örn: 0.0205 ETH)
2. Counterbid amount ekleniyor (+0.0001 ETH)
3. Token için 0.0206 ETH teklif veriliyor

Bu yanlıştı çünkü collection offer zaten o token için geçerli bir teklif değildi.

## Yeni Davranış

Kod artık collection offer'ları tanıyor ve doğru şekilde işliyor:

```javascript
if (bestOffer.criteria?.encoded_token_ids === '*') {
  // Bu bir collection offer, token-specific değil
  // Min price kullan
  offerPrice = minPrice;
} else {
  // Gerçek token-specific offer
  // Normal counterbid mantığını uygula
  offerPrice = bestPrice + counterbidAmount;
}
```

## Etkilenen Dosyalar

1. `src/ethereumWorkerPool.js` - Line 175-190
2. `src/asyncTokenOfferManager.js` - Line 123-134  
3. `src/batchTokenProcessor.js` - Line 499-525, 843-853

## Sonuç

Bu düzeltme ile:
- Collection offer'lar artık token-specific offer olarak kullanılmıyor
- Token'lar için doğru fiyatlar hesaplanıyor
- Gereksiz yüksek teklifler verilmiyor
- Min price stratejisi doğru çalışıyor