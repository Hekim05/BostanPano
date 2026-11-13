# Bostan Pano + Sezon Rehberi — Birleştirme Planı

Güz 2026 Rehberi (`hekim05.github.io/Guz-Rehberi-2026`) ileride tüm sezonu kapsayan bir rehbere dönüşecek ve Bostan Pano ile tek uygulamada birleşecek. Bu belge, iki uygulamanın bugünden uyumlu kalması için alınan kararları ve birleştirme adımlarını özetler.

## Bugünden uyumlu olanlar

| Konu | Durum |
|---|---|
| Alan adı | İkisi de `hekim05.github.io` üzerinde. Tarayıcı verisi (`localStorage`) aynı kökene ait olduğundan Rehber'deki **saha günlüğü kayıtları birleşmeden sonra da kaybolmaz**. |
| Renkler | Pano'nun renkleri Rehber'le aynı: yeşil `#157a38`, koyu yeşil `#0f5a29`, turuncu `#e08a12`, aynı metin, çizgi ve gölge tonları. |
| Sekme yapısı | İkisi de adres çubuğundaki `#sekme` ile çalışıyor. Bildirimler ve kısayollar bu yapıya bağlanabiliyor. |
| Sesli okuma | İkisi de cihazın kendi Türkçe sesini kullanıyor. İnternet gerekmiyor, ücret yok. |
| Yayın düzeni | Sürüm numarası, ağ öncelikli service worker ve "Yeni sürüm yüklendi" uyarısı ikisinde de aynı mantıkta. |

## Birleştirmede çözülecek çakışmalar

| Çakışma | Karar |
|---|---|
| İki uygulamada da `#takvim` var | Pano'daki **Takvim** etkinlik ve eğitim takvimi olarak kalır. Rehber'deki takvim **Ekim Takvimi** (`#ekim-takvimi`) adını alır. |
| İki uygulamada da `#soru` var | Pano'daki **Soru Sor** (ekiple yazışma) kalır. Rehber'deki çevrimdışı soru-cevap **Sık Sorulanlar** (`#sss`) olur. |
| Güvenlik politikası (CSP) | Rehber hiçbir dış kaynağa izin vermiyor. Pano ise Firebase'e bağlanıyor. Birleşik uygulamada CSP yalnızca şu adreslere izin verir: `www.gstatic.com`, `*.googleapis.com`, `*.firebaseio.com`, `*.cloudfunctions.net`, `youtube-nocookie.com`, `drive.google.com`. |
| Giriş | Rehber herkese açık, Pano onay istiyor. **Karar:** Rehber bölümü giriş yapmadan da açılır. Duyuru, doküman ve soru bölümleri için onay gerekir. |
| Simgeler | Ortak simge olarak kent bostanı logosu kullanılır. |

## Birleşik uygulamanın yapısı (hedef)

```
Ana sayfa   : "Bu dönem" kartı (Rehber'deki dönem tanımları) + son duyurular
Duyurular   : (Pano)
Rehber      : Ekim Takvimi · Fidelik · Dikim · Bakım · Türler · Hastalık · Araçlar · Sık Sorulanlar · Sunum
Takvim      : Etkinlik ve eğitimler (Pano)
Dokümanlar  : Drive'dan gelen dosyalar (Pano)
Soru Sor    : Ekiple birebir yazışma (Pano)
Kayıt       : Saha günlüğü (Rehber, cihazda saklanır)
```

## Adımlar

1. **Sezon rehberi içeriğini veriye dönüştürmek.** Rehber'deki dönem tanımları (`PHASES`) ve tür bilgileri HTML'den ayrı bir `rehber-veri.json` dosyasına taşınır. Böylece aynı içeriği hem eski rehber hem Pano okuyabilir. Sezon ekledikçe yalnızca bu dosya büyür.
2. **Pano'ya Rehber sekmesi eklemek.** İçerik bu veri dosyasından çizilir. İlk aşamada mevcut rehber sayfalarına bağlantı da yeterlidir.
3. **Eski adresi yönlendirmek.** `Guz-Rehberi-2026` deposundaki `index.html` küçük bir yönlendirme sayfasına dönüşür: eski service worker'ı kaldırır ve kullanıcıyı Pano'nun Rehber sekmesine götürür. Telefonuna eski rehberi ekleyen kursiyer de kendiliğinden yeni uygulamaya geçer.
4. **(İsteğe bağlı) Dönemleri panelden yönetmek.** "Bu dönem" kartı ve kontrol listeleri Firestore'a taşınırsa ekip, kod değiştirmeden sezon içeriğini yönetim panelinden güncelleyebilir.

## Şimdilik dikkat edilecekler

- Rehber'deki `localStorage` anahtarlarının adı değiştirilmemeli, yoksa saha günlükleri eşleşmez. Pano'nun kendi anahtarları `bp-` önekiyle başlıyor, çakışma yok.
- Rehber'e yeni bölüm eklenirken sekme kimliği olarak `duyuru`, `takvim`, `belge`, `soru` kullanılmamalı.
