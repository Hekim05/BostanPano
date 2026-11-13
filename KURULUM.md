# Bostan Pano — Kurulum Rehberi

Kursiyer adresi: `https://hekim05.github.io/BostanPano/`
Yönetim paneli: `https://hekim05.github.io/BostanPano/yonetim.html`

Kurulum bir kez yapılır. 1–6. adımlar telefondan da yapılabilir. 7. adım için bilgisayar gerekir.

---

## 1. Firebase projesi
1. https://console.firebase.google.com adresine **birime ait Google hesabıyla** girin. Kişisel hesap kullanmayın.
2. **Proje ekle** → ad: `bostan-pano`. Google Analytics gerekmez.
3. **Blaze planına geçin**: sol alttaki *Spark* yazısına dokunun → *Upgrade*. Bir kart tanımlanır.
4. **Harcama tavanı koyun**: Proje ayarları → *Usage and billing* → *Details & settings*.
   - *Budget alerts*: aylık 1 USD bütçe tanımlayın. Aşılırsa e-posta gelir.
   - *Service-level spend caps* → *Cloud Functions*: 1 USD tavan koyun. Tavana ulaşılırsa fonksiyonlar o ay için durur.

## 2. Veritabanı
*Build → Firestore Database → Create database*
- Konum: **eur3 (Europe)**
- Mod: **Production mode**

## 3. Giriş yöntemleri
*Build → Authentication → Get started → Sign-in method*
- **Anonymous** → Enable (kursiyerler için)
- **Google** → Enable (yöneticiler için)

Ardından *Settings → Authorized domains → Add domain*: `hekim05.github.io`

## 4. Web uygulaması ve bildirim anahtarı
1. Proje ayarları → *Genel* → *Uygulamalarınız* → **</>** (Web) → ad: `Bostan Pano` → kaydet.
   Ekranda çıkan `firebaseConfig` bloğunu (apiKey, authDomain, projectId…) Claude'a gönderin.
2. Proje ayarları → *Cloud Messaging* → *Web Push certificates* → **Generate key pair**.
   Çıkan uzun anahtarı da gönderin.
3. Proje ayarları → *Genel* bölümündeki **Proje numarasını** (yalnızca rakamlardan oluşur) not edin.

## 5. Google Drive klasörü
1. ✅ Klasörler hazır: Drive'ınızda **Bostan Pano Dokümanları** klasörü ve içinde `Genel`, `Mutlukent`, `Ata Bostan`, `Çiğdem Emekli Kampüsü`, `Alacaatlı` alt klasörleri var. Klasör kimliği uygulamaya işlendi.
   - *Genel* klasöründeki dosyaları herkes görür. Bostan klasörlerindekileri yalnızca o bostanın kursiyerleri görür.
   - Alt klasörlerin adlarını değiştirmeyin; uygulama klasörleri adlarından tanıyor.
2. Ana klasörü **Paylaş** ile şu adrese *Görüntüleyen* yetkisiyle açın:
   `PROJE-NUMARASI-compute@developer.gserviceaccount.com`
   (PROJE-NUMARASI yerine 4. adımdaki numarayı yazın.)
   Klasörü "bağlantıya sahip olan herkes" şeklinde paylaşmayın. Gerek yok, dosyalar gizli kalır.
3. Drive API'yi açın: https://console.cloud.google.com/apis/library/drive.googleapis.com → projeyi seçin → **Enable**.

## 6. İlk yönetici
*Firestore Database → Start collection*
- Koleksiyon kimliği: `ayarlar`
- Belge kimliği: `yoneticiler`
- Alanlar:
  - `sahip` (string): kendi Google e-postanız, **küçük harfle**
  - `emailler` (array): içine aynı e-postayı string olarak ekleyin

Diğer yöneticileri (en fazla 6 kişi) sonradan panelin **Ayarlar** bölümünden eklersiniz.

## 7. Güvenlik kuralları ve sunucu fonksiyonları (bilgisayarda, bir kez)
Gerekenler: Node.js 20 (https://nodejs.org) ve Git.

```bash
npm install -g firebase-tools
firebase login                      # birime ait Google hesabıyla
git clone https://github.com/Hekim05/BostanPano.git
cd BostanPano
firebase use --add                  # listeden bostan-pano projesini seçin, takma ad: default
cd functions
npm install
```

```bash
cd ..
firebase deploy --only firestore,functions
```

İlk yüklemede birkaç servis açılacağı için 5–10 dakika sürebilir. Sorulursa "cleanup policy" için varsayılanı (1 gün) kabul edin.

## 8. Panelden son ayarlar
1. Yönetim panelini açın → **Google ile giriş yap**.
2. **Ayarlar** → her bostan için **Üret** → **Kodları kaydet**.
3. **Ayarlar** → diğer yöneticileri e-postayla ekleyin (toplam 6 kişi).
4. **Ayarlar** → **Yeni soru bildirimlerini aç**. Bunu her yönetici kendi telefonunda bir kez yapar.

## 9. Canlı güvenlik testi (yayına almadan önce)
Yönetici olmayan ikinci bir telefonla şunları deneyin:

| Deneme | Beklenen |
|---|---|
| Yanlış kodla katılma | "Kod hatalı" uyarısı |
| Doğru kod, onay öncesi | "İsteğiniz alındı" ekranı, içerik görünmez |
| Onaydan sonra | Yalnızca *Tüm bostanlar* ve kendi bostanının duyuruları görünür |
| Başka birinin yorumunda "Sil" düğmesi | Görünmez |
| 20 saniye içinde iki yorum | İkincisi reddedilir |
| Engelle → kursiyerin ekranı | Anında "Erişim kapalı" |
| Dokümanlar | Yalnızca *Genel* ve kendi bostanının klasörü görünür |

## Günlük kullanım
- **Doküman eklemek:** Dosyayı Drive'daki ilgili alt klasöre atın. En geç 1–2 dakika içinde uygulamada görünür. Google Dokümanlar/Sunular PDF olarak indirilir.
- **Video:** YouTube'a *Liste dışı* olarak yükleyin ya da Drive'a koyun. Bağlantısını duyuruya yapıştırın.
- **Makale:** Metni yapıştırın. Boş satır yeni paragraf olur, `## ` ara başlık yapar, `- ` madde işareti koyar, `**kalın**` kalın yazar. Kursiyer **Dinle** düğmesiyle metni sesli dinleyebilir.
- **Takvim aktarma:** *Takvim → Excel / Word'den aktar → Excel şablonunu indir.* Word dosyasında aynı sütunlara sahip bir tablo olmalıdır. Satırlar önce önizlemede gösterilir, hatalı satırlar eklenmez.
- **Yeni sezon:** *Ayarlar*'dan bostan kodlarını değiştirin. Mevcut üyeler etkilenmez.
- **Kursiyer telefon değiştirirse:** Kodu yeniden girip istek gönderir, siz onaylarsınız. Eski kaydı *Kursiyerler* bölümünden silebilirsiniz.

## Gizlilik özeti
- Kursiyerden ad, telefon ya da e-posta alınmaz. Yalnızca takma ad ve bostan bilgisi tutulur.
- Kursiyerler birbirini listeleyemez ve birbirine mesaj gönderemez. Yorumlarda yalnızca takma ad görünür.
- Soru Sor yazışmalarını yalnızca kursiyerin kendisi ve yöneticiler görür. Cevaplar "Bostan Pano Ekibi" imzasıyla gider.
- Yönetici e-postaları kursiyerlere hiçbir yerde gösterilmez.
