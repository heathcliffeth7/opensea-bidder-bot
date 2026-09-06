Şimdi senle opensea bidder bot yapıcaz node.js ile 
ve opensea.js kütüphanesini kullanıcaz


Şimdi senle openseade tokenoffer verme görevi vericez tokken offer verme görevi yapcaz
Öncellikle 
!createtask <taskismi>  (taskismiyle task oluşturur)

!settask <taskismi> koleksiyonunolduğuchain:koleskiyonismi    minprice:0.001 maxprice:0.003 type(tokenoffer,criteriaoffer,collectionoffer) eğer criteria offer ise trait belirtmek zorunda  o da trait1:trait:value    (şeklinde olucak zaten token offer veye collectionoffer ise trait yazmasına gerek yok)    offertime(min10dakika olucak) ,looptime(min 0 dakika) ,counterbid on/off(açıksa ne kadar counterbid atıcak örnek 0.001 eth yanına yazmalı ) highofferskip on/off(bu da en yüksek teklif benimse geç özelliği) ,itemlimit (bu özellik teklif kabul edilirse teklif verilen cüzdanki o koleksiyondaki sahip oluna nft sayısına bakar ve görevi durdurur örneğin itemlimit 1 yazılmışsa ,teklif kabul edildikten sonra o koleksiyondaki item sayısı  1 olacağı için görevi durdurur yada 2 olsaydı 2 tane kabul edildikten sonra durdururdu )


!starttask örnek diyince belirttiğimiz ayalarda teklifi ver 

Diyelimki opepen-edittion koleksiyonunda editionsize:four olana teklif vericez ancak rekabet edeceğimiz kişinin  teklifi 0.0013 bizde şu ayarı yaptık

!createtask ornek1
!settask orrnek1 ethereum:opepen-edition  minprice :0.001 maxprice:0.003 type:criteriaoffer trait:Edition size:Four  offertime:15min looptime:0min counterbid on 0.0001 highofferskip:on itemlimit:1

Ethereumda opepen-editon koleksiyonunda edition size’ı four olanlara criteriaoffer atar ve teklif fiyatı minimum 0.001WETHDİR maximum teklif fiyatı da 0.003 WETH’dir, teklif süresi 15dk dır sürekli döngü çalışır ancak en yüksek teklifse zaten sürekli döngü çalışmaz çünkü en yüksek teklifdir ancak teklif süresi bittiği zaman döngü süresi 0 min olduğu için hemen tekrar teklif atar yani bu durumda  zaten diğer kişinin teklifi 0.0013 olduğu counterbid fiyatı da 0.0001 olduğu  için 0.0014 teklif atarak counterlar  ve en yüksek teklif olur daha sonra başka birisi teklif atmadığı için ve en yüksek teklif olarak kaldığı için başka teklif atılmaz ancak diyelim ki bu sefer bir kişi 0.0015 teklif attı bu sefer 0.0016 olarak counterlanır yine en son yüksek teklife sahip olur ve daha teklif atılmaz ancak en son atılan teklifin süresi bittiğinde döngü süresi 0 olduğu için tekrar teklif atılır o da en yüksek teklifi counterlayabilecek şekilde tabiki max teklifi geçmeyecek, yani ilk teklif her zaman counterlayacak şekilde olmalı , criteriaoffer kısmında yarıştığımız için en yüksek teklifi o traite ait en yüksek teklifi çekmeli ve ona göre rekabet etmeliyiz 

Ondan sonra  !starttask örnek1 dersek teklif vermeye başlar ve bizim söylediğimiz kurallara uyacak şekilde



!settask örnek2 ethereum:opepen-edition minprice:0.001 maxprice:0.003 type:collectionoffer offertime:15min  looptime:0min counterbid on 0.001 highofferskip on   

Ethereumda opepen-editon koleksiyonunda  collectionoffer atar minprice:0.001 WETH’dir maxprice :0.003WETH’dir  teklif süresi 15 dakikadır döngü süresi 0 dakika olduğu için sürekli döngü halindedir ,eğer ondan yüksek teklif atılırsa 0.001 WETH counter’layacaktır counter’lar



!settask örnek4 ethereum:opepen-edition minprice:0.001 maxprice:0.003 type:tokenoffer offertime:15 looptime:0min counterbid on 0.0001  highofferskip on itemlimit 1 , tokenid’ler  txt dosyası verilir ve txt dosyasındaki tokenidlere teker teker teklif atılır , looptime 0 olduğu için hepsine attıktan sonra tekrar yeniden başlar
eğer teklif kabul edilirse itemlimit 1 olduğu için görev durur

!settask ornek1 ethereum:gemesis minprice:0.02  maxprice:0.022 type:tokenoffer offertime:15min looptime:0min counterbid on 0.0001 highofferskip on itemlimit 1 tokenidlist:16,50,896,653,478,96,85,108,963,588,963,485,763,418,125,698,453,789,362,789,413,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42
txt dosyası oluşturulmadan

Counterbid içinde teklif attığımız tokenleri izler eğer rakip teklif gelirse counterlar
!starttask örnek2 diyince görevi başlatır 


!settingstask <taskismi> o task’ın ayarlarını gösterir
!tasklist  ise çalışan tüm taskları listeler


Bunları ele alarak projeyi yapıcaz
https://docs.opensea.io/reference/stream-api-event-example-payloads#trait-offer-payload
https://docs.opensea.io/reference/stream-api-event-example-payloads#collection-offer-payload
https://docs.opensea.io/reference/stream-api-event-example-payloads#item-received-bid-payload
https://docs.opensea.io/reference/stream-api-event-example-payloads#item-received-offer-payload
https://github.com/ProjectOpenSea/seaport
https://github.com/ProjectOpenSea/seaport-js
https://github.com/ProjectOpenSea/opensea-js
https://github.com/ProjectOpenSea/stream-js
https://docs.opensea.io/reference/post_criteria_offer_v2
https://docs.opensea.io/reference/post_offer
https://docs.opensea.io/reference/get_all_offers_on_collection_v2
https://docs.opensea.io/reference/get_best_offer_on_nft_v2
https://docs.opensea.io/reference/get_collection_offers_v2
https://docs.opensea.io/reference/get_offers
https://docs.opensea.io/reference/get_trait_offers_v2
https://docs.opensea.io/reference/get_order
https://docs.opensea.io/reference/openapi-definition



ABSTRACT RPC EKLEYECEĞİN ZAMAN BUNLARI KULLAN

  - `ABSTRACT_RPC_URL`: `https://abstract-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_1`
  - `ABSTRACT_RPC_URL_2`: `https://abstract-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_2`
  - `ABSTRACT_RPC_URL_3`: `https://abstract-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_3`

  ABSTRACT CHAİN İD=2741
  ABSTRAT WETH ADRESS=0x3439153EB7AF838Ad19d56E1571FBD09333C2809
    zone: "0x000056F7000000EcE9003ca63978907a00FFD100", // Seaport 1.6 zone