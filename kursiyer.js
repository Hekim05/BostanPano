import {
  APP_VERSION, AYAR, ayarEksik, auth, db, fns, BOSTANLAR, bostanAdi, yasakAd,
  $, $$, esc, toast, tarihYaz, saatBaslat, makaleHtml, videoGomme, sesliOku, Takvim, swKaydet, ayarEksikEkrani,
  youtubeId, videoKapak, eklerHtml, onizlemeleriYukle, belgeAc, turBilgisi,
} from './ortak.js';
import { signInAnonymously, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, collection, query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const ana = $('#ana');
saatBaslat($('#saat'));
const swKayit = swKaydet();

let uid = null, uye = null, onizleme = false;
let aboneler = [];
const kapat = () => { aboneler.forEach((f) => f()); aboneler = []; };

if (ayarEksik) ayarEksikEkrani(ana);
else onAuthStateChanged(auth, async (k) => {
  if (!k) { try { await signInAnonymously(auth); } catch (e) { ana.innerHTML = '<div class="ortala kart">Bağlantı kurulamadı. İnternetinizi kontrol edip sayfayı yenileyin.</div>'; } return; }
  uid = k.uid;
  // Yönetici bu cihazda Google ile girmişse: kursiyer görünümü (önizleme)
  if (!k.isAnonymous) {
    try { await getDoc(doc(db, 'ayarlar', 'yoneticiler')); return onizlemeBaslat(); }
    catch (e) { await signOut(auth); return; }
  }
  // Üyelik durumunu canlı izle (onay / engel anında yansır)
  onSnapshot(doc(db, 'uyeler', uid), (s) => {
    const onceki = uye && uye.durum;
    uye = s.exists() ? s.data() : null;
    if (!uye) return katilEkrani();
    if (uye.durum === 'bekliyor') return bekleEkrani();
    if (uye.durum === 'engelli') return engelEkrani();
    if (onceki !== 'onayli') uygulamayiAc();
  }, () => katilEkrani());
});

// ---------- Kullanım istatistiği (yalnızca sayı; ekip kimseyi tanımaz) ----------
const bugunTR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
let sonAktiflik = 0;
async function aktiflikBildir() {
  if (onizleme || !uye || uye.durum !== 'onayli' || document.hidden) return;
  if (Date.now() - sonAktiflik < 65000) return;
  sonAktiflik = Date.now();
  try { await setDoc(doc(db, 'aktiflik', uid), { son: serverTimestamp(), bostan: uye.bostan }); } catch (e) {}
  const gun = bugunTR();
  let kayitli = '';
  try { kayitli = localStorage.getItem('bp-ziyaret-gun') || ''; } catch (e) {}
  if (kayitli !== gun) {
    try {
      await setDoc(doc(db, 'ziyaretler', gun, 'kisiler', uid), { bostan: uye.bostan, tarih: serverTimestamp() });
      localStorage.setItem('bp-ziyaret-gun', gun);
    } catch (e) { /* bugün zaten kayıtlıysa sorun değil */ try { localStorage.setItem('bp-ziyaret-gun', gun); } catch (er) {} }
  }
}
setInterval(aktiflikBildir, 3 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) aktiflikBildir(); });

// ---------- Yönetici önizlemesi ----------
function onizlemeBaslat() {
  onizleme = true;
  let b = 'mutlukent';
  try { b = localStorage.getItem('bp-onizleme-bostan') || b; } catch (e) {}
  uye = { bostan: b, takmaAd: 'Yönetici önizlemesi', durum: 'onayli' };
  uygulamayiAc();
}
function onizlemeSeridi() {
  if (!onizleme) return '';
  return `<div class="oniz-serit"><span title="Kursiyer görünümü: yorum, tepki ve soru gönderme kapalı">👁 Önizleme</span>
    <select id="onizBostan" aria-label="Bostan">${Object.entries(BOSTANLAR).map(([k, v]) => `<option value="${k}" ${uye.bostan === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <a href="yonetim.html">‹ Panel</a></div>`;
}
document.addEventListener('change', (e) => {
  if (e.target.id !== 'onizBostan') return;
  try { localStorage.setItem('bp-onizleme-bostan', e.target.value); } catch (er) {}
  uye = { ...uye, bostan: e.target.value };
  belgeVeri = null; belgeYuklendi = 0;
  uygulamayiAc();
});

// ---------- Katılma ----------
function katilEkrani() {
  kapat(); $('#menu').classList.add('gizli');
  $('#altBaslik').textContent = 'Kent bostanı duyuru panosu';
  ana.innerHTML = `<div class="ortala">
    <div class="kart">
      <img class="logo" src="logo.png" alt="">
      <h2 style="text-align:center">Bostan Pano'ya katıl</h2>
      <label for="kBostan">Bostanınız</label>
      <select id="kBostan"><option value="">Seçin…</option>${Object.entries(BOSTANLAR).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <label for="kKod">Bostan kodu</label>
      <input id="kKod" type="text" autocomplete="off" autocapitalize="characters" placeholder="Ekipten aldığınız kod">
      <label for="kAd">Takma adınız</label>
      <input id="kAd" type="text" maxlength="20" autocomplete="off" placeholder="Örn. Domates Sever">
      <p class="yardim">Yorumlarda bu ad görünür. Gerçek adınızı yazmanız gerekmez. Harf, rakam ve boşluk; 2–20 karakter.</p>
      <p class="hata" id="kHata"></p>
      <button class="btn ana tam" id="kGonder">Katılma isteği gönder</button>
    </div>
    <div class="bilgi">🔒 Telefon numaranız, adınız veya e-postanız istenmez. Diğer kursiyerler sizinle iletişim kuramaz; yalnızca yorumlarınızda takma adınızı görür.</div>
  </div>`;
  $('#kGonder').onclick = async () => {
    const bostan = $('#kBostan').value, kod = $('#kKod').value.trim().toUpperCase(), takmaAd = $('#kAd').value.trim().replace(/\s+/g, ' ');
    const hata = $('#kHata');
    if (!bostan) return (hata.textContent = 'Bostanınızı seçin.');
    if (!kod) return (hata.textContent = 'Bostan kodunu yazın.');
    if (!/^[A-Za-zÇĞİÖŞÜçğıöşü0-9 ]{2,20}$/.test(takmaAd)) return (hata.textContent = 'Takma ad 2–20 karakter olmalı; yalnızca harf, rakam ve boşluk.');
    if (yasakAd(takmaAd)) return (hata.textContent = 'Bu takma ad kullanılamaz. Ekip ya da resmi bir görevli izlenimi veren adlar seçilemez.');
    $('#kGonder').disabled = true; hata.textContent = '';
    try {
      await setDoc(doc(db, 'uyeler', uid), { bostan, kod, takmaAd, durum: 'bekliyor', tarih: serverTimestamp() });
    } catch (e) {
      hata.textContent = 'Kod hatalı ya da bu bostana ait değil. Ekipten kodu tekrar isteyin.';
      $('#kGonder').disabled = false;
    }
  };
}

function bekleEkrani() {
  kapat(); $('#menu').classList.add('gizli');
  ana.innerHTML = `<div class="ortala kart" style="text-align:center">
    <img class="logo" src="logo.png" alt="">
    <h2>İsteğiniz alındı</h2>
    <p><b>${esc(uye.takmaAd)}</b> · ${esc(bostanAdi(uye.bostan))}</p>
    <p>Ekip onayladığında pano kendiliğinden açılacak. Bu sayfayı kapatabilirsiniz.</p>
    <p class="yardim">Kayıt döneminde onay genellikle aynı gün içinde verilir.</p></div>`;
}

function engelEkrani() {
  kapat(); $('#menu').classList.add('gizli');
  ana.innerHTML = `<div class="ortala kart" style="text-align:center"><img class="logo" src="logo.png" alt="">
    <h2>Erişim kapalı</h2><p>Bu cihazın panoya erişimi kapatıldı. Bir hata olduğunu düşünüyorsanız bostanınızdaki ekip üyesiyle görüşün.</p></div>`;
}

// ---------- Uygulama ----------
let sekme = null;

// ---------- Yenilikler: son görülme zamanları (cihazda) ----------
const GORULEN = 'bp-gorulen';
let gorulen;
try { gorulen = JSON.parse(localStorage.getItem(GORULEN)); } catch (e) {}
if (!gorulen || typeof gorulen !== 'object') { const n = Date.now(); gorulen = { duyuru: n, takvim: n, belge: n }; }
const onceki = { ...gorulen };
function gorulenKaydet() { try { localStorage.setItem(GORULEN, JSON.stringify(gorulen)); } catch (e) {} }
gorulenKaydet();
const msOf = (t) => (t && t.seconds ? t.seconds * 1000 : t ? Date.parse(t) || 0 : 0);
// Uygulama arka plana geçince açık sekme görülmüş sayılır; geri gelince yeni gelenler işaretlenir
document.addEventListener('visibilitychange', () => {
  if (!sekme || !(sekme in gorulen)) return;
  if (document.hidden) { gorulen[sekme] = Date.now(); gorulenKaydet(); }
  else { onceki[sekme] = gorulen[sekme]; if (sekme === 'duyuru') duyurulariCiz(); if (sekme === 'takvim') takvimVer(); if (sekme === 'belge') belgeleriYukle(true); }
});
function rozetYaz(s, n) {
  const btn = $(`#menu [data-sekme="${s}"]`);
  if (!btn) return;
  btn.querySelector('.rozet')?.remove();
  if (n > 0) btn.insertAdjacentHTML('beforeend', `<span class="rozet">${n > 9 ? '9+' : n}</span>`);
}
function rozetleriGuncelle() {
  const say = {
    duyuru: duyurular.filter((d) => msOf(d.tarih) > gorulen.duyuru).length,
    takvim: etkinlikler.filter((e) => msOf(e.eklenme) > gorulen.takvim).length,
    belge: 0, _b: belgeVeri ? belgeVeri.reduce((t, b) => t + b.dosyalar.filter((f) => msOf(f.tarih) > gorulen.belge).length, 0) : 0,
  };
  say.duyuru += say._b; delete say._b; delete say.belge;
  Object.entries(say).forEach(([s, n]) => rozetYaz(s, s === sekme ? 0 : n));
}
const bolumler = {};

function uygulamayiAc() {
  kapat();
  $('#altBaslik').textContent = `${bostanAdi(uye.bostan)} · ${uye.takmaAd}`;
  $('#menu').classList.remove('gizli');
  ana.innerHTML = `${onizlemeSeridi()}
    <section id="b-duyuru"></section>
    <section id="b-takvim" class="gizli"><h2>Takvim</h2><div id="takvimKok"></div></section>
    <section id="b-soru" class="gizli"></section>
    <section id="b-ara" class="gizli"></section>
    <p class="alt-bilgi">Bostan Pano · Sürüm ${APP_VERSION}<br><button class="linkbtn" id="bildirimAc">🔔 Bildirimleri aç</button></p>`;
  $('#aramaKutu').classList.remove('gizli');
  duyurulariBaslat();
  takvimiBaslat();
  soruyuBaslat();
  $('#bildirimAc').onclick = bildirimAc;
  if (onizleme) $('#bildirimAc').classList.add('gizli');
  setTimeout(() => belgeleriYukle(false, true), 2500); // yeni doküman rozeti için
  if (!onizleme) { sessizTokenYenile(); aktiflikBildir(); }
  const h = location.hash.replace('#', '');
  sekmeAc(['duyuru', 'takvim', 'belge', 'soru'].includes(h) ? h : 'duyuru');
}

$$('#menu button').forEach((b) => (b.onclick = () => sekmeAc(b.dataset.sekme)));
function sekmeAc(s, alt) {
  if (s === 'belge') { s = 'duyuru'; alt = 'belge'; }
  if (s === 'duyuru') { altBolum = alt || null; if (!alt) acikDuyuru = null; }
  if (sekme && sekme !== s && s in gorulen) gorulen[sekme] = Date.now();
  if (s in gorulen) { onceki[s] = gorulen[s]; gorulen[s] = Date.now(); }
  gorulenKaydet();
  sekme = s;
  $$('#menu button').forEach((b) => b.classList.toggle('aktif', b.dataset.sekme === s));
  ['duyuru', 'takvim', 'belge', 'soru'].forEach((x) => $('#b-' + x) && $('#b-' + x).classList.toggle('gizli', x !== s));
  $('#b-ara')?.classList.add('gizli');
  if (s === 'soru') okunduIsaretle();
  if (s === 'duyuru') duyurulariCiz();
  if (s === 'takvim') takvimVer();
  rozetleriGuncelle();
  history.replaceState(null, '', '#' + (s === 'duyuru' && altBolum === 'belge' ? 'belge' : s));
  window.scrollTo(0, 0);
}

// İki ayrı sorgu (genel + kendi bostanı) birleştirilir; kurallar başka bostanın içeriğine izin vermez
function ikiliDinle(koleksiyon, ekSorgu, cb) {
  const parcalar = { hepsi: [], kendi: [] };
  const birlestir = () => cb([...parcalar.hepsi, ...parcalar.kendi]);
  [['hepsi', 'hepsi'], ['kendi', uye.bostan]].forEach(([anahtar, deger]) => {
    const q = query(collection(db, koleksiyon), where('bostan', '==', deger), ...ekSorgu);
    aboneler.push(onSnapshot(q, (s) => { parcalar[anahtar] = s.docs.map((d) => ({ id: d.id, ...d.data() })); birlestir(); },
      (e) => console.warn(koleksiyon, e)));
  });
}

// ---------- Duyurular ----------
const EMOJILER = ['👍', '❤️', '🌱', '👏', '🙏', '😊'];
const acikYorum = new Set();
const yorumAbone = {};

function benimTepkim(did) { try { return localStorage.getItem('bp-t-' + did) || ''; } catch (e) { return ''; } }
function tepkiKaydet(did, em) { try { em ? localStorage.setItem('bp-t-' + did, em) : localStorage.removeItem('bp-t-' + did); } catch (e) {} }

let duyurular = [];
function duyurulariBaslat() {
  bolumler.duyuru = $('#b-duyuru');
  bolumler.duyuru.innerHTML = '<div class="bos">Duyurular yükleniyor…</div>';
  ikiliDinle('duyurular', [orderBy('tarih', 'desc'), limit(30)], (liste) => {
    duyurular = liste.sort((a, b) => (b.sabit ? 1 : 0) - (a.sabit ? 1 : 0) || (b.tarih?.seconds || 0) - (a.tarih?.seconds || 0));
    duyurulariCiz();
    rozetleriGuncelle();
  });
}

let gorunum = 'kart', acikDuyuru = null;
try { gorunum = localStorage.getItem('bp-gorunum') || 'kart'; } catch (e) {}

function medyaKapak(d, sinif) {
  const yt = youtubeId(d.video);
  if (yt) return `<div class="${sinif}" style="background-image:url('https://i.ytimg.com/vi/${yt}/mqdefault.jpg')"></div>`;
  const ilk = (d.ekler || []).find((f) => f.onizleme !== false);
  if (ilk) return `<div class="${sinif}" data-onizleme="${esc(ilk.id)}" data-boyut="480"></div>`;
  return sinif === 'kucuk-gorsel' ? `<div class="${sinif}" style="display:flex;align-items:center;justify-content:center;font-size:20px">📣</div>` : '';
}
const duzMetin = (m) => String(m || '').replace(/[#*]/g, '').replace(/\s+/g, ' ').trim();

let altBolum = null; // null = üç balon, 'duyuru' | 'makale' | 'belge' = liste
const tipi = (x) => (x.tip === 'makale' ? 'makale' : 'duyuru');
const ALT_AD = { duyuru: 'Duyurular', makale: 'Makaleler', belge: 'Eğitim dokümanları' };

function anaBalonlar() {
  const balon = (alt, simge, govde, sayi, yeni) => `<article class="kart tikla ana-balon" data-alt="${alt}" role="button" tabindex="0">
      <div class="bolum-ust" style="margin:0 0 8px"><h3 style="margin:0">${simge} ${ALT_AD[alt]}</h3>
        <span class="ustsatir" style="margin:0">${yeni ? `<span class="yeni-etiket">${yeni} yeni</span>` : ''}<span>${sayi}</span></span></div>
      ${govde}
      <div style="text-align:right;font-weight:600;color:var(--yesil-koyu);margin-top:8px">Tümünü aç ›</div></article>`;
  const yazili = (alt, simge) => {
    const l = duyurular.filter((x) => tipi(x) === alt).sort((a, b) => msOf(b.tarih) - msOf(a.tarih));
    const yeni = l.filter((x) => msOf(x.tarih) > onceki.duyuru).length;
    const x = l[0];
    const govde = x ? `${medyaKapak(x, 'kart-gorsel')}<div class="ustsatir"><span>Son eklenen · ${tarihYaz(x.tarih, false)}</span></div>
        <b style="display:block;line-height:1.3">${esc(x.baslik)}</b>${x.metin ? `<p class="ozet" style="margin:4px 0 0">${esc(duzMetin(x.metin).slice(0, 220))}</p>` : ''}`
      : `<div class="bos">Henüz ${alt === 'makale' ? 'makale' : 'duyuru'} yok.</div>`;
    return balon(alt, simge, govde, l.length ? l.length + ' kayıt' : '', yeni);
  };
  let belgeGovde = '<div class="bos">Dokümanlar yükleniyor…</div>', belgeSayi = '', belgeYeni = 0;
  if (belgeVeri) {
    const tum = belgeVeri.flatMap((b) => b.dosyalar).sort((a, b) => msOf(b.tarih) - msOf(a.tarih));
    belgeYeni = tum.filter((f) => msOf(f.tarih) > gorulen.belge).length;
    belgeSayi = tum.length ? tum.length + ' dosya' : '';
    const f = tum[0];
    belgeGovde = f ? `${f.onizleme ? `<div class="kart-gorsel" data-onizleme="${esc(f.id)}" data-boyut="480"></div>` : ''}
        <div class="ustsatir"><span>Son eklenen · ${tarihYaz(f.tarih, false)}</span></div><b style="display:block;line-height:1.3;word-break:break-word">${esc(f.ad)}</b>`
      : '<div class="bos">Henüz doküman eklenmemiş.</div>';
  }
  return `<div class="izgara">${yazili('duyuru', '📣')}${yazili('makale', '📖')}${balon('belge', '📁', belgeGovde, belgeSayi, belgeYeni)}</div>`;
}

function duyurulariCiz() {
  const k = bolumler.duyuru;
  if (!k) return;
  const d = acikDuyuru && duyurular.find((x) => x.id === acikDuyuru);
  if (d) return detayCiz(d);
  acikDuyuru = null;
  if (!altBolum) {
    k.innerHTML = `<div class="bolum-ust"><h2>Paylaşımlar</h2></div><div id="seritKok"></div>${anaBalonlar()}`;
    onizlemeleriYukle(k); seritCiz();
    return;
  }
  const geri = `<button class="linkbtn" data-anageri>‹ Paylaşımlar</button>`;
  if (altBolum === 'belge') {
    if (!$('#belgeKok')) { onceki.belge = gorulen.belge; gorulen.belge = Date.now(); gorulenKaydet(); k.innerHTML = `${geri}<div class="bolum-ust"><h2>Eğitim dokümanları</h2></div><div id="belgeKok"></div>`; }
    belgeleriYukle();
    return;
  }
  const liste = duyurular.filter((x) => tipi(x) === altBolum);
  const ust = `${geri}<div class="bolum-ust"><h2>${ALT_AD[altBolum]}</h2><div class="sekmeler" role="group" aria-label="Görünüm">
      <button data-gorunum="kart" class="${gorunum === 'kart' ? 'aktif' : ''}">▦ Kart</button><button data-gorunum="liste" class="${gorunum === 'liste' ? 'aktif' : ''}">☰ Liste</button></div></div>`;
  if (!liste.length) { k.innerHTML = ust + `<div class="kart bos">Henüz ${altBolum === 'makale' ? 'makale' : 'duyuru'} yok.</div>`; return; }
  const yeniMi = (x) => msOf(x.tarih) > onceki.duyuru;
  if (gorunum === 'liste') {
    k.innerHTML = ust + `<div class="satir-liste">${liste.map((x) => `<div class="satir ${x.sabit ? 'sabit' : ''}" data-detay="${x.id}" role="button" tabindex="0">
      ${medyaKapak(x, 'kucuk-gorsel')}
      <div class="ic"><b>${yeniMi(x) ? '<span class="yeni-etiket">Yeni</span> ' : ''}${x.sabit ? '📌 ' : ''}${esc(x.baslik)}</b>
      <small><span class="etiket ${x.bostan}" style="display:none"></span>${esc(bostanAdi(x.bostan))} · ${tarihYaz(x.tarih)}${(x.ekler || []).length ? ' · 📎 ' + x.ekler.length : ''}${x.video ? ' · 🎬' : ''}</small>
      <small>${esc(duzMetin(x.metin).slice(0, 140))}</small></div><span style="color:var(--soluk)">›</span></div>`).join('')}</div>`;
  } else {
    k.innerHTML = ust + `<div class="izgara">${liste.map((x) => {
      const say = x.tepkiler || {};
      const tepkiOzet = EMOJILER.filter((em) => say[em] > 0).map((em) => `${em} ${say[em]}`).join('  ');
      return `<article class="kart tikla ${x.sabit ? 'sabit' : ''} ${yeniMi(x) ? 'yeni' : ''}" data-detay="${x.id}" role="button" tabindex="0">
        ${medyaKapak(x, 'kart-gorsel')}
        <div class="ustsatir">${yeniMi(x) ? '<span class="yeni-etiket">Yeni</span>' : ''}${x.sabit ? '<span>📌</span>' : ''}<span class="etiket ${x.bostan}">${esc(bostanAdi(x.bostan))}</span><span>${tarihYaz(x.tarih)}</span></div>
        <h3>${esc(x.baslik)}</h3>
        ${x.metin ? `<p class="ozet">${esc(duzMetin(x.metin).slice(0, 300))}</p>` : ''}
        <div class="ustsatir" style="margin:0;justify-content:space-between"><span>${tepkiOzet}${x.yorumAcik ? `  💬 ${Math.max(0, x.yorumSayisi || 0)}` : ''}${(x.ekler || []).length ? '  📎 ' + x.ekler.length : ''}</span><b style="color:var(--yesil-koyu)">Aç ›</b></div>
      </article>`;
    }).join('')}</div>`;
  }
  onizlemeleriYukle(k);
}

function detayCiz(d) {
  const k = bolumler.duyuru;
  const taslak = $(`#yt-${d.id}`) ? $(`#yt-${d.id}`).value : '';
  const benim = benimTepkim(d.id);
  const say = d.tepkiler || {};
  if (d.yorumAcik && !acikYorum.has(d.id)) { acikYorum.add(d.id); yorumlariDinle(d.id); }
  k.innerHTML = `<button class="linkbtn" data-geri>‹ ${ALT_AD[tipi(d)]}</button>
    <article class="kart ${d.sabit ? 'sabit' : ''}" style="max-width:820px">
      <div class="ustsatir">${d.sabit ? '<span>📌 Sabit</span>' : ''}<span class="etiket ${d.bostan}">${esc(bostanAdi(d.bostan))}</span><span>${tarihYaz(d.tarih)}</span></div>
      <h3 style="font-size:20px">${esc(d.baslik)}</h3>
      ${videoKapak(d.video)}
      ${eklerHtml(d.ekler)}
      ${d.metin ? `<div class="makale">${makaleHtml(d.metin)}</div>` : ''}
      ${d.metin ? `<div class="btnsatir"><button class="btn kucuk" data-dinle="${d.id}">🔊 Dinle</button></div>` : ''}
      <div class="tepkiler">${EMOJILER.map((em) => `<button class="tepki ${benim === em ? 'secili' : ''}" ${onizleme ? 'disabled' : ''} data-tepki="${em}" data-did="${d.id}" aria-label="${em} tepkisi">${em}${say[em] > 0 ? `<small>${say[em]}</small>` : ''}</button>`).join('')}</div>
      ${d.yorumAcik ? `<div class="yorumlar" id="y-${d.id}"><b style="font-size:14px">💬 Yorumlar (${Math.max(0, d.yorumSayisi || 0)})</b><div class="yliste"></div>
          ${onizleme ? '' : `<label for="yt-${d.id}">Yorumunuz <small style="font-weight:400;color:var(--soluk)">(${esc(uye.takmaAd)} olarak)</small></label>
          <textarea id="yt-${d.id}" data-yorum="${d.id}" maxlength="500" style="min-height:70px">${esc(taslak)}</textarea>
          <button class="btn ana kucuk" data-yorumgonder="${d.id}" style="margin-top:6px">Gönder</button>`}</div>` : ''}
    </article>`;
  yorumlariCiz(d.id);
  onizlemeleriYukle(k);
}

function duyuruAc(id) {
  const d = duyurular.find((x) => x.id === id);
  acikDuyuru = id;
  if (sekme !== 'duyuru') sekmeAc('duyuru', d ? tipi(d) : 'duyuru'); else { altBolum = d ? tipi(d) : 'duyuru'; duyurulariCiz(); }
  window.scrollTo(0, 0);
}

function yorumlariDinle(did) {
  if (yorumAbone[did]) return;
  const q = query(collection(db, 'duyurular', did, 'yorumlar'), orderBy('tarih', 'asc'), limit(200));
  yorumAbone[did] = { liste: [], kapat: onSnapshot(q, (s) => { yorumAbone[did].liste = s.docs.map((x) => ({ id: x.id, ...x.data() })); yorumlariCiz(did); }) };
  aboneler.push(() => { yorumAbone[did]?.kapat(); delete yorumAbone[did]; });
}

function yorumlariCiz(did) {
  const kutu = $(`#y-${did} .yliste`);
  if (!kutu) return;
  const liste = yorumAbone[did]?.liste || [];
  kutu.innerHTML = liste.length ? liste.map((y) => `<div class="yorum">
    ${y.uid === uid ? `<button class="btn kucuk tehlike sil" data-yorumsil="${y.id}" data-did="${did}">Sil</button>` : ''}
    <div class="kim">${esc(y.takmaAd)} <small>· ${esc(bostanAdi(y.bostan))} · ${tarihYaz(y.tarih)}</small></div>
    <div style="white-space:pre-wrap;word-break:break-word">${esc(y.metin)}</div></div>`).join('') : '<div class="bos">İlk yorumu siz yazın.</div>';
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button, [data-detay], [data-alt]');
  if (!b || !bolumler.duyuru || !bolumler.duyuru.contains(b)) return;
  const ds = b.dataset;
  if (ds.alt) { altBolum = ds.alt; duyurulariCiz(); history.replaceState(null, '', '#' + (ds.alt === 'belge' ? 'belge' : 'duyuru')); window.scrollTo(0, 0); }
  else if ('anageri' in ds) { altBolum = null; duyurulariCiz(); rozetleriGuncelle(); window.scrollTo(0, 0); }
  else if (ds.detay) { duyuruAc(ds.detay); }
  else if ('geri' in ds) { acikDuyuru = null; duyurulariCiz(); window.scrollTo(0, 0); }
  else if (ds.gorunum) { gorunum = ds.gorunum; try { localStorage.setItem('bp-gorunum', gorunum); } catch (er) {} duyurulariCiz(); }
  else if (ds.dinle) { const d = duyurular.find((x) => x.id === ds.dinle); sesliOku(d.baslik + '. ' + d.metin, b); }
  else if (ds.tepki) {
    const did = ds.did, em = ds.tepki, ref = doc(db, 'duyurular', did, 'tepkiler', uid);
    const eski = benimTepkim(did);
    try {
      if (eski === em) { await deleteDoc(ref); tepkiKaydet(did, ''); }
      else { await setDoc(ref, { emoji: em }); tepkiKaydet(did, em); }
      duyurulariCiz();
    } catch (er) { toast('Tepki kaydedilemedi.'); }
  } else if (ds.yorumac) {
    const did = ds.yorumac;
    if (acikYorum.has(did)) acikYorum.delete(did); else { acikYorum.add(did); yorumlariDinle(did); }
    $('#y-' + did).classList.toggle('gizli', !acikYorum.has(did));
    yorumlariCiz(did);
  } else if (ds.yorumgonder) {
    const did = ds.yorumgonder, t = $('#yt-' + did), metin = t.value.trim();
    if (!metin) return;
    b.disabled = true;
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'duyurular', did, 'yorumlar')), { uid, takmaAd: uye.takmaAd, bostan: uye.bostan, metin, tarih: serverTimestamp() });
      batch.update(doc(db, 'uyeler', uid), { sonYazma: serverTimestamp() });
      await batch.commit();
      t.value = '';
    } catch (er) { toast('Gönderilemedi. İki yazı arasında 20 saniye bekleyin.'); }
    b.disabled = false;
  } else if (ds.yorumsil) {
    if (!confirm('Yorumunuz silinsin mi?')) return;
    try { await deleteDoc(doc(db, 'duyurular', ds.did, 'yorumlar', ds.yorumsil)); } catch (er) { toast('Silinemedi.'); }
  }
});

// ---------- Arama (duyuru, makale, etkinlik, doküman) ----------
const sade = (t) => String(t || '').toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
  .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
function vurgula(metin, q) {
  const m = String(metin || ''), sm = sade(m), i = sm.indexOf(q);
  if (i < 0) return esc(m);
  return esc(m.slice(0, i)) + '<mark>' + esc(m.slice(i, i + q.length)) + '</mark>' + esc(m.slice(i + q.length));
}
function parca(metin, q, uz = 110) {
  const m = duzMetin(metin), i = sade(m).indexOf(q);
  if (i < 0) return '';
  const bas = Math.max(0, i - 40);
  return (bas > 0 ? '…' : '') + vurgula(m.slice(bas, bas + uz), q) + (bas + uz < m.length ? '…' : '');
}
let aramaZaman = null;
function aramaYap() {
  const ham = $('#ara').value.trim();
  $('#araTemizle').classList.toggle('gizli', !ham);
  const q = sade(ham);
  const k = $('#b-ara');
  if (q.length < 2) { if (!k.classList.contains('gizli')) { k.classList.add('gizli'); $('#b-' + sekme)?.classList.remove('gizli'); } return; }
  ['duyuru', 'takvim', 'belge', 'soru'].forEach((x) => $('#b-' + x)?.classList.add('gizli'));
  k.classList.remove('gizli');
  if (!belgeVeri) belgeleriYukle(false, true).then(() => { if (!k.classList.contains('gizli')) aramaYap(); });
  const s = [];
  duyurular.forEach((d) => { if (sade(d.baslik).includes(q) || sade(d.metin).includes(q)) s.push({ tip: tipi(d) === 'makale' ? 'Makale' : 'Duyuru', id: d.id, baslik: vurgula(d.baslik, q), alt: (parca(d.metin, q) || esc(duzMetin(d.metin).slice(0, 110))) + ` <span style="opacity:.7">· ${tarihYaz(d.tarih, false)}</span>` }); });
  etkinlikler.forEach((e) => { if ([e.baslik, e.aciklama, e.yer, e.tur].some((x) => sade(x).includes(q))) s.push({ tip: 'Etkinlik', id: e.id, gun: e.tarih, baslik: vurgula(e.baslik, q), alt: `${e.tarih.split('-').reverse().join('.')} ${esc(e.saat || '')} · ${esc(e.tur || '')}${e.yer ? ' · ' + esc(e.yer) : ''}` }); });
  (belgeVeri || []).forEach((b) => b.dosyalar.forEach((f) => { if (sade(f.ad).includes(q)) s.push({ tip: 'Doküman', id: f.id, baslik: vurgula(f.ad, q), alt: `${b.bolum === 'genel' ? 'Genel' : esc(bostanAdi(b.bolum))} · ${tarihYaz(f.tarih, false)}` }); }));
  k.innerHTML = `<div class="bolum-ust"><h2>Arama: “${esc(ham)}”</h2><span class="yardim" style="margin:0">${s.length} sonuç</span></div>` +
    (s.length ? `<div class="satir-liste">${s.map((r) => `<div class="sonuc" data-sonuc="${r.tip}" data-id="${r.id}" ${r.gun ? `data-gun="${r.gun}"` : ''} role="button" tabindex="0">
      <span class="tip">${r.tip}</span><div style="flex:1;min-width:0"><b>${r.baslik}</b><div class="yardim" style="margin:2px 0 0">${r.alt}</div></div></div>`).join('')}</div>`
      : `<div class="kart bos">Sonuç bulunamadı. Farklı bir kelime deneyin.${belgeVeri ? '' : ' (Dokümanlar yükleniyor…)'}</div>`);
}
function aramaTemizle() { $('#ara').value = ''; aramaYap(); }
$('#ara').addEventListener('input', () => { clearTimeout(aramaZaman); aramaZaman = setTimeout(aramaYap, 200); });
$('#araTemizle').onclick = aramaTemizle;
document.addEventListener('click', (e) => {
  const r = e.target.closest('[data-sonuc]');
  if (!r) return;
  const { sonuc, id, gun } = r.dataset;
  aramaTemizle();
  if (sonuc === 'Duyuru' || sonuc === 'Makale') duyuruAc(id);
  else if (sonuc === 'Etkinlik') { sekmeAc('takvim'); takvimNesne.git(gun, id); }
  else { vurguBelge = id; sekmeAc('belge'); }
});

// ---------- Takvim ----------
let etkinlikler = [], takvimNesne = null;
function takvimiBaslat() {
  takvimNesne = new Takvim($('#takvimKok'));
  takvimNesne.ciz();
  ikiliDinle('etkinlikler', [], (liste) => { etkinlikler = liste; takvimVer(); rozetleriGuncelle(); });
}
function takvimVer() {
  if (!takvimNesne) return;
  takvimNesne.ver(etkinlikler.map((e) => ({ ...e, yeni: msOf(e.eklenme) > onceki.takvim })));
}

// ---------- Dokümanlar ----------
let belgeYuklendi = 0, belgeVeri = null, vurguBelge = null;
const TUR = (m, ad) => {
  if (/pdf/.test(m)) return ['pdf', 'PDF'];
  if (/word|document/.test(m)) return ['doc', 'DOC'];
  if (/sheet|excel/.test(m)) return ['xls', 'XLS'];
  if (/presentation|powerpoint/.test(m)) return ['ppt', 'PPT'];
  if (/^image\//.test(m)) return ['img', 'GÖRSEL'];
  if (/^video\//.test(m)) return ['vid', 'VİDEO'];
  return ['', (ad.split('.').pop() || 'DOSYA').slice(0, 4).toUpperCase()];
};
const boyutYaz = (b) => (b == null ? '' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

async function belgeleriYukle(zorla, sessiz) {
  const kok = $('#belgeKok');
  if (!zorla && belgeVeri && Date.now() - belgeYuklendi < 120000) { if (!sessiz) belgeCiz(); return; }
  if (!sessiz && kok) kok.innerHTML = '<div class="bos">Dokümanlar yükleniyor…</div>';
  try {
    let { data } = await httpsCallable(fns, 'belgeler')();
    if (onizleme) data = data.filter((b) => b.bolum === 'genel' || b.bolum === uye.bostan);
    belgeYuklendi = Date.now(); belgeVeri = data;
    rozetleriGuncelle();
    if (sekme === 'duyuru' && !altBolum && !acikDuyuru) duyurulariCiz(); // ana balonu tazele
    belgeCiz();
  } catch (e) {
    if (!sessiz && $('#belgeKok')) $('#belgeKok').innerHTML = '<div class="kart">Dokümanlar şu an alınamadı. Biraz sonra tekrar deneyin.</div>';
  }
}
function belgeCiz() {
  const kok = $('#belgeKok'), data = belgeVeri;
  if (!kok || !data) return;
  {
    if (!data.length || data.every((b) => !b.dosyalar.length)) { kok.innerHTML = '<div class="kart bos">Henüz doküman eklenmemiş.</div>'; return; }
    kok.innerHTML = '<div class="izgara">' + data.filter((b) => b.dosyalar.length).map((b) => `<div class="kart"><h3 style="margin-top:0">${b.bolum === 'genel' ? 'Genel' : esc(bostanAdi(b.bolum))}</h3>
      ${b.dosyalar.map((f) => { const [s, y] = turBilgisi(f.tur, f.ad); return `<div class="belge ${f.id === vurguBelge ? 'vurgu' : ''}" data-bid="${f.id}"><button class="tur ${s}" data-ac="${f.id}" data-ad="${esc(f.ad)}" data-tur="${esc(f.tur)}" ${f.onizleme ? `data-onizleme="${f.id}" data-boyut="200"` : ''} aria-label="Aç">${y}</button>
        <div class="ic"><b>${msOf(f.tarih) > onceki.belge ? '<span class="yeni-etiket">Yeni</span> ' : ''}${esc(f.ad)}</b><small>${tarihYaz(f.tarih, false)}${f.boyut ? ' · ' + boyutYaz(f.boyut) : ''}</small></div>
        <button class="btn kucuk" data-ac="${f.id}" data-ad="${esc(f.ad)}" data-tur="${esc(f.tur)}">Aç</button></div>`; }).join('')}</div>`).join('') + '</div>' +
      '<button class="btn kucuk" id="belgeYenile">↻ Listeyi yenile</button>';
    $('#belgeYenile').onclick = () => belgeleriYukle(true);
    onizlemeleriYukle(kok);
    if (vurguBelge) setTimeout(() => kok.querySelector(`[data-bid="${vurguBelge}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-indir]');
  if (!b) return;
  b.disabled = true; const eski = b.textContent; b.textContent = 'İniyor…';
  try {
    const token = await auth.currentUser.getIdToken();
    const url = `https://${AYAR.bolge || 'europe-west1'}-${AYAR.firebase.projectId}.cloudfunctions.net/belgeIndir?id=${encodeURIComponent(b.dataset.indir)}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const ad = m ? decodeURIComponent(m[1]) : b.dataset.ad;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = ad;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  } catch (er) { toast('Dosya indirilemedi.'); }
  b.disabled = false; b.textContent = eski;
});

// ---------- Soru Sor ----------
let konu = null, mesajlar = [];
function soruyuBaslat() {
  const k = $('#b-soru');
  if (onizleme) {
    k.innerHTML = `<h2>Soru Sor</h2><div class="bilgi">Kursiyer bu bölümde ekibe birebir soru yazar ve cevapları burada görür. Diğer kursiyerler bu yazışmayı göremez. Gelen sorular yönetim panelindeki <b>Sorular</b> sekmesine düşer.</div>
      <div class="kart" style="margin-top:12px;opacity:.6"><label style="margin-top:0">Sorunuz</label><textarea disabled placeholder="Önizlemede soru gönderilemez"></textarea></div>`;
    return;
  }
  k.innerHTML = `<h2>Soru Sor</h2>
    <div class="bilgi" style="margin-bottom:12px">🔒 Yazdıklarınızı yalnızca Bostan Pano Ekibi görür. Diğer kursiyerler göremez.</div>
    <div class="sohbet" id="sohbet"></div>
    <div class="kart"><label for="soruMetin" style="margin-top:0">Sorunuz</label>
      <textarea id="soruMetin" maxlength="1000" placeholder="Bitkiniz, parseliniz ya da eğitimlerle ilgili sorunuzu yazın…"></textarea>
      <button class="btn ana tam" id="soruGonder" style="margin-top:8px">Gönder</button></div>`;
  aboneler.push(onSnapshot(doc(db, 'sorular', uid), (s) => {
    konu = s.exists() ? s.data() : null;
    rozetGuncelle();
    if (sekme === 'soru') okunduIsaretle();
  }, () => {}));
  aboneler.push(onSnapshot(query(collection(db, 'sorular', uid, 'mesajlar'), orderBy('tarih', 'asc'), limit(300)), (s) => {
    mesajlar = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    sohbetCiz();
  }, () => {}));
  $('#soruGonder').onclick = soruGonder;
}

function sohbetCiz() {
  const k = $('#sohbet');
  if (!mesajlar.length) { k.innerHTML = '<div class="bos">Henüz bir soru sormadınız.</div>'; return; }
  k.innerHTML = mesajlar.map((m) => `<div class="balon ${m.kimden === 'kursiyer' ? 'ben' : ''}">${esc(m.metin)}
    <div class="alt"><span>${m.kimden === 'kursiyer' ? 'Siz' : 'Bostan Pano Ekibi'} · ${tarihYaz(m.tarih)}</span>
    ${m.kimden === 'kursiyer' ? `<button data-mesajsil="${m.id}">Sil</button>` : ''}</div></div>`).join('');
}

$('#ana').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mesajsil]');
  if (!b) return;
  if (!confirm('Mesajınız silinsin mi?')) return;
  try { await deleteDoc(doc(db, 'sorular', uid, 'mesajlar', b.dataset.mesajsil)); } catch (er) { toast('Silinemedi.'); }
});

async function soruGonder() {
  const t = $('#soruMetin'), metin = t.value.trim();
  if (!metin) return;
  const b = $('#soruGonder'); b.disabled = true;
  try {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'sorular', uid, 'mesajlar')), { kimden: 'kursiyer', metin, tarih: serverTimestamp() });
    batch.set(doc(db, 'sorular', uid), { takmaAd: uye.takmaAd, bostan: uye.bostan, sonMesaj: metin.slice(0, 120), sonTarih: serverTimestamp(), ekipOkudu: false, kursiyerOkudu: true });
    batch.update(doc(db, 'uyeler', uid), { sonYazma: serverTimestamp() });
    await batch.commit();
    t.value = '';
    toast('Sorunuz ekibe iletildi.');
  } catch (er) { toast('Gönderilemedi. İki mesaj arasında 20 saniye bekleyin.'); }
  b.disabled = false;
}

function rozetGuncelle() {
  const btn = $('#menu [data-sekme="soru"]');
  const r = btn.querySelector('.rozet');
  const yeni = konu && konu.kursiyerOkudu === false;
  if (yeni && !r) btn.insertAdjacentHTML('beforeend', '<span class="rozet">1</span>');
  if (!yeni && r) r.remove();
}

async function okunduIsaretle() {
  if (konu && konu.kursiyerOkudu === false) {
    try { await setDoc(doc(db, 'sorular', uid), { kursiyerOkudu: true }, { merge: true }); } catch (e) {}
  }
}

// ---------- Bildirimler ve yükleme ----------
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const yuklu = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let yuklemeIstegi = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); yuklemeIstegi = e; seritCiz(); });
window.addEventListener('appinstalled', () => { yuklemeIstegi = null; seritCiz(); });

function ertelendi(ad) { try { return Date.now() < Number(localStorage.getItem('bp-ertele-' + ad) || 0); } catch (e) { return false; } }
function ertele(ad, gun) { try { localStorage.setItem('bp-ertele-' + ad, String(Date.now() + gun * 86400000)); } catch (e) {} seritCiz(); }

// Duyurular sayfasının üstündeki yönlendirme şeridi
function seritCiz() {
  const kok = $('#seritKok');
  if (!kok) return;
  if (onizleme) { kok.innerHTML = ''; return; }
  let html = '';
  const bildirimVar = !!AYAR.vapidKey;
  if (iOS && !yuklu && !ertelendi('ios')) {
    html = `<div class="bildirim-seridi"><div style="font-size:22px">📲</div><div class="ic"><b>Telefonunuza ekleyin</b>
      Yeniliklerden bildirimle haberdar olmak için Safari'de alttaki <b style="display:inline">Paylaş ⬆︎</b> düğmesine, sonra <b style="display:inline">Ana Ekrana Ekle</b>'ye dokunun. Bostan Pano'yu bundan sonra ana ekrandaki simgeden açın.
      <div class="btnsatir" style="margin-top:8px"><button class="btn kucuk" data-ertele="ios">Daha sonra</button></div></div></div>`;
  } else if (yuklemeIstegi && !ertelendi('yukle')) {
    html = `<div class="bildirim-seridi"><div style="font-size:22px">📲</div><div class="ic"><b>Telefonunuza yükleyin</b>
      Bostan Pano ana ekranınızda bir uygulama gibi dursun, tek dokunuşla açılsın.
      <div class="btnsatir" style="margin-top:8px"><button class="btn ana kucuk" id="yukleBtn">Yükle</button><button class="btn kucuk" data-ertele="yukle">Daha sonra</button></div></div></div>`;
  } else if (bildirimVar && 'Notification' in window && Notification.permission === 'default' && !ertelendi('bildirim')) {
    html = `<div class="bildirim-seridi"><div style="font-size:22px">🔔</div><div class="ic"><b>Bildirimleri açın</b>
      Yeni duyuru, takvim etkinliği, doküman ve sorularınıza gelen cevaplar telefonunuza bildirim olarak gelsin.
      <div class="btnsatir" style="margin-top:8px"><button class="btn ana kucuk" id="bildirimSerit">Bildirimleri aç</button><button class="btn kucuk" data-ertele="bildirim">Daha sonra</button></div></div></div>`;
  }
  kok.innerHTML = html;
  $('#yukleBtn') && ($('#yukleBtn').onclick = async () => { yuklemeIstegi.prompt(); await yuklemeIstegi.userChoice; yuklemeIstegi = null; seritCiz(); });
  $('#bildirimSerit') && ($('#bildirimSerit').onclick = async () => { await bildirimAc(); seritCiz(); });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ertele]');
  if (b) ertele(b.dataset.ertele, 7);
});

async function tokenAl() {
  const { getMessaging, getToken, isSupported } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
  if (!(await isSupported())) return null;
  const reg = await swKayit;
  if (!reg) return null;
  const token = await getToken(getMessaging(), { vapidKey: AYAR.vapidKey, serviceWorkerRegistration: reg });
  await setDoc(doc(db, 'bildirimTokenlari', uid), { token, bostan: uye.bostan, tarih: serverTimestamp() });
  return token;
}

async function bildirimAc() {
  if (!AYAR.vapidKey) return toast('Bildirimler henüz etkin değil.');
  if (iOS && !yuklu) return toast('iPhone’da bildirim için önce Paylaş > Ana Ekrana Ekle ile uygulamayı ekleyin, sonra ana ekrandaki simgeden açın.', 6000);
  if (!('Notification' in window)) return toast('Bu tarayıcı bildirimleri desteklemiyor.');
  try {
    const izin = await Notification.requestPermission();
    if (izin !== 'granted') return toast('Bildirim izni verilmedi. Telefon ayarlarından açabilirsiniz.');
    if (await tokenAl()) toast('Bildirimler açıldı.'); else toast('Bu tarayıcı bildirimleri desteklemiyor.');
  } catch (e) { console.warn(e); toast('Bildirimler açılamadı.'); }
}

// İzin daha önce verildiyse jetonu her açılışta tazele (jetonlar zamanla değişebilir)
async function sessizTokenYenile() {
  if (!AYAR.vapidKey || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { await tokenAl(); } catch (e) {}
}
