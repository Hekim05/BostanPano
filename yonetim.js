import {
  APP_VERSION, AYAR, ayarEksik, auth, db, fns, BOSTANLAR, bostanAdi,
  youtubeId, videoKapak, eklerHtml, onizlemeleriYukle, turBilgisi, isikKutusu,
  $, $$, esc, toast, tarihYaz, tarihNesne, saatBaslat, makaleHtml, videoGomme, Takvim, swKaydet, ayarEksikEkrani, gunAnahtari,
} from './ortak.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, writeBatch, serverTimestamp,
  getDocs, getCountFromServer, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const ana = $('#ana');
saatBaslat($('#saat'));
const swKayit = swKaydet();
let ben = null, yoneticiAyar = null, aboneler = [];
const kapat = () => { aboneler.forEach((f) => f()); aboneler = []; };
const bostanSecenek = (secili, hepsi = true) =>
  (hepsi ? `<option value="hepsi" ${secili === 'hepsi' ? 'selected' : ''}>Tüm bostanlar</option>` : '') +
  Object.entries(BOSTANLAR).map(([k, v]) => `<option value="${k}" ${secili === k ? 'selected' : ''}>${v}</option>`).join('');

if (ayarEksik) ayarEksikEkrani(ana);
else onAuthStateChanged(auth, async (k) => {
  kapat();
  if (!k || k.isAnonymous) return girisEkrani();
  ben = k;
  try {
    const s = await getDoc(doc(db, 'ayarlar', 'yoneticiler'));
    yoneticiAyar = s.data();
    panelAc();
  } catch (e) {
    ana.innerHTML = `<div class="ortala kart" style="text-align:center"><img class="logo" src="logo.png" alt="">
      <h2>Yetki yok</h2><p><b>${esc(k.email)}</b> hesabı yönetici listesinde değil.</p>
      <button class="btn" id="cikis">Başka hesapla giriş yap</button></div>`;
    $('#cikis').onclick = () => signOut(auth);
  }
});

function girisEkrani() {
  $('#menu').classList.add('gizli');
  ana.innerHTML = `<div class="ortala kart" style="text-align:center"><img class="logo" src="logo.png" alt="">
    <h2>Ekip girişi</h2><p>Yönetici listesindeki Google hesabınızla giriş yapın.</p>
    <button class="btn ana tam" id="giris">Google ile giriş yap</button><p class="hata" id="gHata"></p></div>`;
  $('#giris').onclick = async () => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(auth, p); }
    catch (e) {
      if (/popup/.test(e.code)) await signInWithRedirect(auth, p);
      else $('#gHata').textContent = 'Giriş yapılamadı: ' + (e.code || e.message);
    }
  };
}

// ---------- Panel ----------
let sekme = 'kursiyer';
function panelAc() {
  $("#altBaslik").textContent = "Yönetim · " + ben.email;
  $('#menu').classList.remove('gizli');
  ana.innerHTML = `
    <div class="btnsatir" style="justify-content:flex-end;margin-bottom:8px"><a class="btn kucuk" href="./#duyuru">👁 Kursiyer görünümü</a></div>
    <section id="b-kursiyer"><div id="kursiyerKok"></div></section>
    <section id="b-duyuru" class="gizli"></section>
    <section id="b-sorular" class="gizli"></section>
    <section id="b-takvim" class="gizli"></section>
    <section id="b-ayar" class="gizli"></section>
    <p class="alt-bilgi">Bostan Pano Yönetim · Sürüm ${APP_VERSION}</p>`;
  kursiyerBaslat(); duyuruBaslat(); soruBaslat(); takvimBaslat(); ayarBaslat();
  const h = location.hash.replace('#', '');
  sekmeAc(['kursiyer', 'duyuru', 'sorular', 'takvim', 'ayar'].includes(h) ? h : 'kursiyer');
}
$$('#menu button').forEach((b) => (b.onclick = () => sekmeAc(b.dataset.sekme)));
function sekmeAc(s) {
  sekme = s;
  $$('#menu button').forEach((b) => b.classList.toggle('aktif', b.dataset.sekme === s));
  ['kursiyer', 'duyuru', 'sorular', 'takvim', 'ayar'].forEach((x) => $('#b-' + x)?.classList.toggle('gizli', x !== s));
  history.replaceState(null, '', '#' + s);
  if (s === 'ayar') kullanimCiz();
  window.scrollTo(0, 0);
}
function rozet(sekmeAdi, sayi) {
  const btn = $(`#menu [data-sekme="${sekmeAdi}"]`);
  btn.querySelector('.rozet')?.remove();
  if (sayi > 0) btn.insertAdjacentHTML('beforeend', `<span class="rozet">${sayi}</span>`);
}

// ---------- Kursiyerler ----------
let uyeler = [], uyeFiltre = { bostan: '', durum: 'onayli', ara: '' };
// ---------- Kullanım istatistiği ----------
const gunTR = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const KISA_GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
let kullanimAcik = false;
async function kullanimCiz() {
  const kok = $('#kullanimKok');
  if (!kok) return;
  try {
    const simdi = Date.now();
    // Şu an açık: son 5 dakikada uygulamayı açık tutanlar
    const aktif = await getDocs(query(collection(db, 'aktiflik'), where('son', '>=', Timestamp.fromMillis(simdi - 5 * 60000))));
    const bugun = gunTR(new Date());
    const bugunDocs = await getDocs(collection(db, 'ziyaretler', bugun, 'kisiler'));
    const grupla = (docs) => { const g = {}; docs.forEach((d) => (g[d.data().bostan] = (g[d.data().bostan] || 0) + 1)); return g; };
    const ga = grupla(aktif.docs), gb = grupla(bugunDocs.docs);
    // Son 7 gün (yalnızca sayım sorgusu, belge okunmaz)
    const gunler = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(simdi - i * 86400000);
      const g = gunTR(d);
      const n = g === bugun ? bugunDocs.size : (await getCountFromServer(collection(db, 'ziyaretler', g, 'kisiler'))).data().count;
      gunler.push({ etiket: i === 0 ? 'Bugün' : KISA_GUN[new Date(g + 'T12:00:00').getDay()] + ' ' + Number(g.slice(8)), n });
    }
    const enCok = Math.max(1, ...gunler.map((x) => x.n));
    const onayli = uyeler.filter((u) => u.durum === 'onayli').length;
    const dagilim = (g) => Object.entries(BOSTANLAR).filter(([k]) => g[k]).map(([k, v]) => `${v} ${g[k]}`).join(' · ') || '—';
    kok.innerHTML = `<div class="kart tikla" id="kullanimKart" role="button" tabindex="0" aria-expanded="${kullanimAcik}">
      <div class="bolum-ust" style="margin:0 0 8px"><h3 style="margin:0">📊 Kullanım</h3><span class="yardim" style="margin:0">${kullanimAcik ? 'Küçült ▴' : 'Ayrıntı ▾'}</span></div>
      <div class="mini-istat">
        <div><small>Şu an açık</small><b>${aktif.size}</b></div>
        <div><small>Bugün</small><b>${bugunDocs.size}</b>${onayli ? `<small>%${Math.round((bugunDocs.size / onayli) * 100)} kursiyer</small>` : ''}</div>
        <div><small>7 gün ort.</small><b>${Math.round(gunler.reduce((t, x) => t + x.n, 0) / 7)}</b></div>
      </div>
      ${kullanimAcik ? `<div style="margin-top:12px">
        <div class="yardim" style="margin:0 0 4px">Şu an: ${esc(dagilim(ga))}</div>
        <div class="yardim" style="margin:0 0 10px">Bugün: ${esc(dagilim(gb))}</div>
        <div class="yardim" style="margin:0 0 6px">Son 7 gün · günlük farklı kullanıcı</div>
        ${gunler.map((x) => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:13px">
          <span style="width:56px;color:var(--soluk)">${x.etiket}</span>
          <span style="flex:1;background:var(--yesil-acik);border-radius:4px;height:14px;overflow:hidden"><span style="display:block;height:100%;width:${(x.n / enCok) * 100}%;background:var(--yesil)"></span></span>
          <b style="width:28px;text-align:right">${x.n}</b></div>`).join('')}
        <p class="yardim" style="margin-top:8px">"Şu an açık": son 5 dakikada uygulama ekranı açık olanlar. Ekip kimin kullandığını göremez, yalnızca sayıları görür. Yönetici önizlemesi sayılmaz.</p></div>` : ''}
    </div>`;
    $('#kullanimKart').onclick = () => { kullanimAcik = !kullanimAcik; kullanimCiz(); };
  } catch (e) {
    kok.innerHTML = '<div class="kart bos">Kullanım bilgisi alınamadı.</div>';
  }
}

function kursiyerBaslat() {
  const t = setInterval(() => { if (!document.hidden && sekme === 'ayar') kullanimCiz(); }, 60000);
  aboneler.push(() => clearInterval(t));
  aboneler.push(onSnapshot(collection(db, 'uyeler'), (s) => {
    const ilk = !uyeler.length;
    uyeler = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    kursiyerCiz();
    if (ilk && sekme === 'ayar') kullanimCiz();
  }));
}
const adAnahtar = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
function ayniAd(u) {
  const es = uyeler.filter((x) => x.id !== u.id && x.durum !== 'engelli' && adAnahtar(x.takmaAd) === adAnahtar(u.takmaAd));
  return es.length ? es.map((x) => bostanAdi(x.bostan) + ' · ' + (x.durum === 'onayli' ? 'onaylı' : 'bekliyor')).join(', ') : '';
}
const DURUM_AD = { onayli: 'Onaylı', bekliyor: 'Bekliyor', engelli: 'Engelli' };
function filtreliUyeler() {
  const ara = uyeFiltre.ara.toLocaleLowerCase('tr-TR');
  return uyeler.filter((u) => u.durum !== 'bekliyor'
      && (!uyeFiltre.bostan || u.bostan === uyeFiltre.bostan)
      && (!uyeFiltre.durum || u.durum === uyeFiltre.durum)
      && (!ara || u.takmaAd.toLocaleLowerCase('tr-TR').includes(ara)))
    .sort((a, b) => a.takmaAd.localeCompare(b.takmaAd, 'tr'));
}
function kursiyerCiz() {
  const odak = document.activeElement && document.activeElement.id === 'fAra';
  const bekleyen = uyeler.filter((u) => u.durum === 'bekliyor').sort((a, b) => (a.tarih?.seconds || 0) - (b.tarih?.seconds || 0));
  rozet('kursiyer', bekleyen.length);
  const sayi = (b, d) => uyeler.filter((u) => (!b || u.bostan === b) && u.durum === d).length;
  const liste = filtreliUyeler();
  // Bostana göre grupla
  const gruplar = {};
  liste.forEach((u) => (gruplar[u.bostan] = gruplar[u.bostan] || []).push(u));
  $('#kursiyerKok').innerHTML = `
    <div class="izgara-2">
      <div class="kart">
        <h2 style="margin-top:0">Onay bekleyenler (${bekleyen.length})</h2>
        ${bekleyen.length ? bekleyen.map((u) => `<div class="belge">
          <div class="ic"><b>${esc(u.takmaAd)}</b><small>${esc(bostanAdi(u.bostan))} · ${tarihYaz(u.tarih)}</small>
            ${ayniAd(u) ? `<small style="color:var(--kirmizi);font-weight:600">⚠ Bu takma ad başka bir kursiyerde de var (${ayniAd(u)}). Reddedip farklı bir adla yeniden istek göndermesini isteyin.</small>` : ''}</div>
          <div class="btnsatir"><button class="btn ana kucuk" data-durum="onayli" data-uid="${u.id}">Onayla</button>
          <button class="btn kucuk tehlike" data-durum="engelli" data-uid="${u.id}">Reddet</button></div></div>`).join('')
          : '<div class="bos">Bekleyen istek yok.</div>'}
        <div class="uyari" style="margin-top:10px">Onaylamadan önce takma adı ve bostanı kayıt listenizle karşılaştırın.</div>
      </div>
      <div class="kart">
        <h2 style="margin-top:0">Kayıtlı kursiyerler</h2>
        <div class="tablo-sar"><table>
          <tr><th>Bostan</th><th>Onaylı</th><th>Bekleyen</th><th>Engelli</th></tr>
          ${Object.entries(BOSTANLAR).map(([k, v]) => `<tr><td>${v}</td><td><b>${sayi(k, 'onayli')}</b></td><td>${sayi(k, 'bekliyor')}</td><td>${sayi(k, 'engelli')}</td></tr>`).join('')}
          <tr class="toplam"><td>Toplam</td><td>${sayi('', 'onayli')}</td><td>${sayi('', 'bekliyor')}</td><td>${sayi('', 'engelli')}</td></tr>
        </table></div>
      </div>
    </div>
    <div class="kart">
      <div class="btnsatir">
        <select id="fBostan" style="flex:1;min-width:140px"><option value="">Tüm bostanlar</option>${bostanSecenek(uyeFiltre.bostan, false)}</select>
        <select id="fDurum" style="flex:1;min-width:110px"><option value="onayli" ${uyeFiltre.durum === 'onayli' ? 'selected' : ''}>Onaylı</option><option value="engelli" ${uyeFiltre.durum === 'engelli' ? 'selected' : ''}>Engelli</option><option value="" ${!uyeFiltre.durum ? 'selected' : ''}>Hepsi</option></select>
        <input id="fAra" type="search" placeholder="Takma adla ara…" value="${esc(uyeFiltre.ara)}" style="flex:2;min-width:160px">
        <button class="btn kucuk" id="uyeIndir" ${liste.length ? '' : 'disabled'}>Excel'e indir</button>
      </div>
      <p class="yardim">${liste.length} kişi listeleniyor</p>
    </div>
    ${liste.length ? `<div class="izgara">${Object.keys(BOSTANLAR).filter((b) => gruplar[b]).map((b) => `<div class="kart"><h3 style="margin-top:0"><span class="etiket ${b}">${esc(bostanAdi(b))}</span> <small style="font-weight:400;color:var(--soluk)">${gruplar[b].length} kişi</small></h3>
      ${gruplar[b].map((u) => `<div class="belge"><div class="ic"><b>${esc(u.takmaAd)}</b>
        <small>${DURUM_AD[u.durum]} · Kayıt: ${tarihYaz(u.tarih, false) || '—'}${u.onayTarihi ? ' · Onay: ' + tarihYaz(u.onayTarihi, false) : ''}</small></div>
        ${u.durum === 'onayli' ? `<button class="btn kucuk tehlike" data-durum="engelli" data-uid="${u.id}">Engelle</button>`
          : `<div class="btnsatir"><button class="btn kucuk" data-durum="onayli" data-uid="${u.id}">Engeli kaldır</button><button class="btn kucuk tehlike" data-uyesil="${u.id}">Sil</button></div>`}</div>`).join('')}</div>`).join('')}</div>`
      : '<div class="kart bos">Kayıt yok.</div>'}`;
  $('#fBostan').onchange = (e) => { uyeFiltre.bostan = e.target.value; kursiyerCiz(); };
  $('#fDurum').onchange = (e) => { uyeFiltre.durum = e.target.value; kursiyerCiz(); };
  $('#fAra').oninput = (e) => { uyeFiltre.ara = e.target.value; kursiyerCiz(); };
  if (odak) { const a = $('#fAra'); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }
  $('#uyeIndir').onclick = uyeListesiIndir;
}
async function uyeListesiIndir() {
  await betikYukle(XLSX_URL);
  const X = window.XLSX;
  const satirlar = [['Bostan', 'Takma ad', 'Durum', 'Kayıt tarihi', 'Onay tarihi']].concat(
    filtreliUyeler().sort((a, b) => a.bostan.localeCompare(b.bostan) || a.takmaAd.localeCompare(b.takmaAd, 'tr'))
      .map((u) => [bostanAdi(u.bostan), u.takmaAd, DURUM_AD[u.durum], tarihYaz(u.tarih, false), tarihYaz(u.onayTarihi, false)]));
  const ws = X.utils.aoa_to_sheet(satirlar);
  ws['!cols'] = [{ wch: 24 }, { wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Kursiyerler');
  X.writeFile(wb, `Bostan_Pano_Kursiyerler_${gunAnahtari(new Date())}.xlsx`);
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-durum],[data-uyesil]');
  if (!b) return;
  try {
    if (b.dataset.uyesil) { if (confirm('Kayıt tamamen silinsin mi? Kişi kodu girerek yeniden istek gönderebilir.')) await deleteDoc(doc(db, 'uyeler', b.dataset.uyesil)); }
    else {
      if (b.dataset.durum === 'engelli' && !confirm('Bu kişinin erişimi kapatılsın mı?')) return;
      const veri = { durum: b.dataset.durum };
      if (b.dataset.durum === 'onayli') veri.onayTarihi = serverTimestamp();
      await updateDoc(doc(db, 'uyeler', b.dataset.uid), veri);
    }
  } catch (er) { toast('İşlem yapılamadı.'); }
});

// ---------- Duyurular ----------
let duyurular = [], duzenlenen = null, adGorunum = 'kart';
const seciliEkler = new Map();
let driveListe = null;
try { adGorunum = localStorage.getItem('bp-ad-gorunum') || 'kart'; } catch (e) {}
function duyuruBaslat() {
  const k = $('#b-duyuru');
  k.innerHTML = `<div class="bolum-ust"><h2>Paylaşımlar</h2>
      <div class="btnsatir"><div class="sekmeler"><button data-adgor="kart">▦ Kart</button><button data-adgor="liste">☰ Liste</button></div>
      <button class="btn ana kucuk" id="dYeni">＋ Yeni paylaşım</button></div></div>
    <div class="kart gizli" id="dForm" style="max-width:860px">
      <div class="bolum-ust" style="margin:0"><h3 style="margin:0" id="dFormBaslik">Yeni paylaşım</h3><button class="btn kucuk" id="dKapat">✕ Kapat</button></div>
      <label>Tür</label>
      <div class="cipler" id="dTip"><label class="cip"><input type="radio" name="dTip" value="duyuru" checked> 📣 Duyuru</label><label class="cip"><input type="radio" name="dTip" value="makale"> 📖 Makale</label></div>
      <label for="dBaslik">Başlık</label><input id="dBaslik" type="text" maxlength="150">
      <label for="dBostan">Kimler görsün?</label><select id="dBostan">${bostanSecenek('hepsi')}</select>
      <label for="dVideo">Video bağlantısı (isteğe bağlı)</label><input id="dVideo" type="text" placeholder="YouTube veya Google Drive video bağlantısı">
      <p class="yardim">YouTube'da "Liste dışı" yüklenen videolar yalnızca bağlantıyı bilenlere açıktır.</p>
      <label>Fotoğraf ve dokümanlar (Drive klasöründen)</label>
      <div id="dEkSecili" class="ekler"></div>
      <button class="btn kucuk" id="dEkAc">📎 Drive'dan seç</button>
      <div id="dEkListe" class="gizli" style="margin-top:8px"></div>
      <p class="yardim">Önce dosyayı Drive'daki "Bostan Pano Dokümanları" klasörüne koyun. "Tüm bostanlar" duyurusunda yalnızca <b>Genel</b> klasörü, bostana özel duyuruda Genel ve o bostanın klasörü listelenir.</p>
      <label for="dMetin">Duyuru / makale metni</label>
      <textarea id="dMetin" style="min-height:200px" placeholder="Metni buraya yapıştırın. Boş satır = yeni paragraf, ## ile ara başlık, - ile madde, **kalın**"></textarea>
      <label class="secim"><input type="checkbox" id="dYorum" checked> Yorumlara açık</label>
      <label class="secim"><input type="checkbox" id="dSabit"> Üste sabitle</label>
      <div class="btnsatir" style="margin-top:12px"><button class="btn" id="dOnizle">Önizle</button><button class="btn ana" id="dKaydet">Yayınla</button><button class="btn gizli" id="dVazgec">Vazgeç</button></div>
      <div id="dOnizleme"></div>
    </div>
    <div id="dListe"></div>`;
  $('#dYeni').onclick = () => { formuTemizle(); formAc(); };
  $('#dKapat').onclick = () => { formuTemizle(); $('#dForm').classList.add('gizli'); };
  $('#dOnizle').onclick = () => {
    const b = $('#dBostan').value;
    $('#dOnizleme').innerHTML = `<div class="kart" style="margin-top:12px"><div class="ustsatir"><span class="etiket ${b}">${esc(bostanAdi(b))}</span></div>
      <h3>${esc($('#dBaslik').value)}</h3>${videoKapak($('#dVideo').value.trim())}${eklerHtml([...seciliEkler.values()])}<div class="makale">${makaleHtml($('#dMetin').value)}</div></div>`;
    onizlemeleriYukle($('#dOnizleme'));
  };
  $('#dVazgec').onclick = () => { formuTemizle(); $('#dForm').classList.add('gizli'); };
  $('#dKaydet').onclick = duyuruKaydet;
  $('#dEkAc').onclick = ekListesiAc;
  $('#dBostan').onchange = () => { if (!$('#dEkListe').classList.contains('gizli')) ekListesiAc(true); };
  k.querySelectorAll('[data-adgor]').forEach((b) => (b.onclick = () => { adGorunum = b.dataset.adgor; try { localStorage.setItem('bp-ad-gorunum', adGorunum); } catch (e) {} duyuruListeCiz(); }));
  aboneler.push(onSnapshot(query(collection(db, 'duyurular'), orderBy('tarih', 'desc'), limit(100)), (s) => {
    duyurular = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    duyuruListeCiz();
  }));
}
function formAc() { $('#dForm').classList.remove('gizli'); $('#dForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function seciliEkCiz() {
  const k = $('#dEkSecili');
  k.innerHTML = [...seciliEkler.values()].map((f) => { const [, y] = turBilgisi(f.tur, f.ad); return `<button class="ek" data-ekcikar="${esc(f.id)}" data-onizleme="${esc(f.id)}" data-boyut="240" title="Çıkarmak için dokunun"><span class="tur-rozet">${y} ✕</span><span>${esc(f.ad)}</span></button>`; }).join('');
  onizlemeleriYukle(k);
}
async function ekListesiAc(yenile) {
  const k = $('#dEkListe');
  k.classList.remove('gizli');
  if (!driveListe || yenile === true) {
    k.innerHTML = '<div class="bos">Drive klasörü okunuyor…</div>';
    try { driveListe = (await httpsCallable(fns, 'belgeler')()).data; }
    catch (e) { k.innerHTML = '<div class="hata">Drive listesi alınamadı.</div>'; return; }
  }
  const hedef = $('#dBostan').value;
  const izinli = driveListe.filter((b) => b.bolum === 'genel' || (hedef !== 'hepsi' && b.bolum === hedef));
  k.innerHTML = izinli.map((b) => `<div class="yardim" style="margin:8px 0 4px;font-weight:700">${b.bolum === 'genel' ? 'Genel' : esc(bostanAdi(b.bolum))}</div>
    <div class="ekler">${b.dosyalar.map((f) => { const [, y] = turBilgisi(f.tur, f.ad); return `<button class="ek" data-eksec="${esc(f.id)}" ${f.onizleme ? `data-onizleme="${esc(f.id)}" data-boyut="240"` : ''} style="${seciliEkler.has(f.id) ? 'outline:3px solid var(--yesil)' : ''}"><span class="tur-rozet">${y}${seciliEkler.has(f.id) ? ' ✓' : ''}</span><span>${esc(f.ad)}</span></button>`; }).join('') || '<div class="bos">Bu klasör boş.</div>'}</div>`).join('');
  onizlemeleriYukle(k);
}
document.addEventListener('click', (e) => {
  const s1 = e.target.closest('[data-eksec]');
  if (s1) {
    const id = s1.dataset.eksec;
    if (seciliEkler.has(id)) seciliEkler.delete(id);
    else {
      if (seciliEkler.size >= 12) return toast('En fazla 12 ek eklenebilir.');
      const f = driveListe.flatMap((b) => b.dosyalar).find((x) => x.id === id);
      seciliEkler.set(id, { id: f.id, ad: f.ad, tur: f.tur, onizleme: !!f.onizleme });
    }
    seciliEkCiz(); ekListesiAc();
    return;
  }
  const s2 = e.target.closest('[data-ekcikar]');
  if (s2) { e.stopPropagation(); seciliEkler.delete(s2.dataset.ekcikar); seciliEkCiz(); if (!$('#dEkListe').classList.contains('gizli')) ekListesiAc(); }
}, true);
function formuTemizle() {
  duzenlenen = null;
  ['dBaslik', 'dVideo', 'dMetin'].forEach((i) => ($('#' + i).value = ''));
  $('#dBostan').value = 'hepsi'; $('#dYorum').checked = true; $('#dSabit').checked = false;
  $$('#dTip input')[0].checked = true;
  seciliEkler.clear(); seciliEkCiz(); $('#dEkListe').classList.add('gizli');
  $('#dFormBaslik').textContent = 'Yeni paylaşım';
  $('#dKaydet').textContent = 'Yayınla'; $('#dVazgec').classList.add('gizli'); $('#dOnizleme').innerHTML = '';
}
async function duyuruKaydet() {
  const baslik = $('#dBaslik').value.trim(), metin = $('#dMetin').value.trim();
  if (baslik.length < 2) return toast('Başlık yazın.');
  const hedef = $('#dBostan').value;
  // Hedef kitlenin açamayacağı klasörden ek seçildiyse uyar
  const disari = [...seciliEkler.values()].filter((f) => { const b = (driveListe || []).find((x) => x.dosyalar.some((d) => d.id === f.id)); return b && b.bolum !== 'genel' && b.bolum !== hedef; });
  if (disari.length && !confirm(`${disari.length} ek, bu duyuruyu görecek bazı kursiyerlerin erişemeyeceği bir bostan klasöründe. Yine de yayınlansın mı?`)) return;
  const veri = {
    baslik, metin, video: $('#dVideo').value.trim(), bostan: hedef,
    yorumAcik: $('#dYorum').checked, sabit: $('#dSabit').checked,
    ozet: metin.replace(/\s+/g, ' ').slice(0, 140),
  };
  // Ek yoksa alan hiç gönderilmez (düzenlemede eski ekleri kaldırmak için boş liste gönderilir)
  const eskiEkVar = duzenlenen && (duyurular.find((x) => x.id === duzenlenen)?.ekler || []).length;
  if (seciliEkler.size || eskiEkVar) veri.ekler = [...seciliEkler.values()];
  const tip = $$('#dTip input').find((x) => x.checked).value;
  const eskiTip = duzenlenen && duyurular.find((x) => x.id === duzenlenen)?.tip;
  if (tip === 'makale' || eskiTip) veri.tip = tip;
  $('#dKaydet').disabled = true;
  try {
    if (duzenlenen) { await updateDoc(doc(db, 'duyurular', duzenlenen), veri); toast('Duyuru güncellendi.'); }
    else { await addDoc(collection(db, 'duyurular'), { ...veri, tarih: serverTimestamp() }); toast('Duyuru yayınlandı.'); }
    formuTemizle(); $('#dForm').classList.add('gizli');
  } catch (e) { toast('Kaydedilemedi: ' + (e.code || '')); }
  $('#dKaydet').disabled = false;
}
const acikYorumlar = {};
function adKapak(d, sinif) {
  const yt = youtubeId(d.video);
  if (yt) return `<div class="${sinif}" style="background-image:url('https://i.ytimg.com/vi/${yt}/mqdefault.jpg')"></div>`;
  const ilk = (d.ekler || []).find((f) => f.onizleme !== false);
  if (ilk) return `<div class="${sinif}" data-onizleme="${esc(ilk.id)}" data-boyut="480"></div>`;
  return sinif === 'kucuk-gorsel' ? `<div class="${sinif}" style="display:flex;align-items:center;justify-content:center;font-size:20px">📣</div>` : '';
}
function duyuruListeCiz() {
  const k = $('#dListe');
  $$('[data-adgor]').forEach((b) => b.classList.toggle('aktif', b.dataset.adgor === adGorunum));
  if (!duyurular.length) { k.innerHTML = '<div class="kart bos">Henüz duyuru yok. Yukarıdaki "Yeni duyuru" ile başlayın.</div>'; return; }
  const istat = (d) => {
    const t = d.tepkiler || {};
    const ty = Object.entries(t).filter(([, n]) => n > 0).map(([em, n]) => `${em} ${n}`).join('  ');
    return `${ty || 'Tepki yok'} · 💬 ${Math.max(0, d.yorumSayisi || 0)}${(d.ekler || []).length ? ' · 📎 ' + d.ekler.length : ''}${d.video ? ' · 🎬' : ''}${d.yorumAcik ? '' : ' · yorumlar kapalı'}`;
  };
  const dugmeler = (d) => `<div class="btnsatir" style="margin-top:8px"><button class="btn kucuk" data-dduzenle="${d.id}">Düzenle</button>
        <button class="btn kucuk" data-dyorum="${d.id}">Yorumlar</button>
        <button class="btn kucuk tehlike" data-dsil="${d.id}">Sil</button></div>
      <div id="dy-${d.id}" class="yorumlar ${acikYorumlar[d.id] ? '' : 'gizli'}"></div>`;
  if (adGorunum === 'liste') {
    k.innerHTML = `<div class="satir-liste">${duyurular.map((d) => `<div class="satir ${d.sabit ? 'sabit' : ''}" style="cursor:default;flex-wrap:wrap">
      ${adKapak(d, 'kucuk-gorsel')}
      <div class="ic"><b>${d.sabit ? '📌 ' : ''}${d.tip === 'makale' ? '📖 ' : ''}${esc(d.baslik)}</b><small><span class="etiket ${d.bostan}" style="font-size:10.5px;padding:1px 7px">${esc(bostanAdi(d.bostan))}</span> ${tarihYaz(d.tarih)} · ${istat(d)}</small></div>
      <div style="flex-basis:100%">${dugmeler(d)}</div></div>`).join('')}</div>`;
  } else {
    k.innerHTML = `<div class="izgara">${duyurular.map((d) => `<div class="kart ${d.sabit ? 'sabit' : ''}">
      ${adKapak(d, 'kart-gorsel')}
      <div class="ustsatir">${d.sabit ? '📌' : ''}<span>${d.tip === 'makale' ? '📖 Makale' : '📣 Duyuru'}</span><span class="etiket ${d.bostan}">${esc(bostanAdi(d.bostan))}</span><span>${tarihYaz(d.tarih)}</span></div>
      <h3>${esc(d.baslik)}</h3>
      <div class="yardim">${istat(d)}</div>
      ${dugmeler(d)}</div>`).join('')}</div>`;
  }
  onizlemeleriYukle(k);
  Object.keys(acikYorumlar).forEach(yorumCiz);
}
function yorumCiz(did) {
  const kutu = $('#dy-' + did); if (!kutu) return;
  const l = acikYorumlar[did]?.liste || [];
  kutu.innerHTML = l.length ? l.map((y) => `<div class="yorum"><button class="btn kucuk tehlike sil" data-ysil="${y.id}" data-did="${did}">Sil</button>
    <div class="kim">${esc(y.takmaAd)} <small>· ${esc(bostanAdi(y.bostan))} · ${tarihYaz(y.tarih)}</small></div>
    <div style="white-space:pre-wrap">${esc(y.metin)}</div>
    <button class="linkbtn" style="min-height:32px;padding:0;color:var(--kirmizi);font-size:13px" data-yazarengel="${y.uid}">Yazarı engelle</button></div>`).join('') : '<div class="bos">Yorum yok.</div>';
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-dduzenle],[data-dsil],[data-dyorum],[data-ysil],[data-yazarengel]');
  if (!b) return;
  const ds = b.dataset;
  try {
    if (ds.dduzenle) {
      const d = duyurular.find((x) => x.id === ds.dduzenle); duzenlenen = d.id;
      $('#dBaslik').value = d.baslik; $('#dVideo').value = d.video || ''; $('#dMetin').value = d.metin || '';
      $('#dBostan').value = d.bostan; $('#dYorum').checked = !!d.yorumAcik; $('#dSabit').checked = !!d.sabit;
      seciliEkler.clear(); (d.ekler || []).forEach((f) => seciliEkler.set(f.id, f)); seciliEkCiz();
      $$('#dTip input').forEach((x) => (x.checked = x.value === (d.tip === 'makale' ? 'makale' : 'duyuru')));
      $('#dFormBaslik').textContent = 'Paylaşımı düzenle';
      $('#dKaydet').textContent = 'Güncelle'; $('#dVazgec').classList.remove('gizli');
      formAc();
    } else if (ds.dsil) {
      if (confirm('Duyuru, yorumları ve tepkileriyle birlikte silinsin mi?')) await deleteDoc(doc(db, 'duyurular', ds.dsil));
    } else if (ds.dyorum) {
      const did = ds.dyorum;
      if (acikYorumlar[did]) { acikYorumlar[did].kapat(); delete acikYorumlar[did]; $('#dy-' + did).classList.add('gizli'); return; }
      acikYorumlar[did] = { liste: [] };
      acikYorumlar[did].kapat = onSnapshot(query(collection(db, 'duyurular', did, 'yorumlar'), orderBy('tarih', 'asc')), (s) => {
        acikYorumlar[did].liste = s.docs.map((x) => ({ id: x.id, ...x.data() })); yorumCiz(did);
      });
      $('#dy-' + did).classList.remove('gizli');
    } else if (ds.ysil) {
      if (confirm('Yorum silinsin mi?')) await deleteDoc(doc(db, 'duyurular', ds.did, 'yorumlar', ds.ysil));
    } else if (ds.yazarengel) {
      if (confirm('Bu yorumun yazarının erişimi kapatılsın mı?')) { await updateDoc(doc(db, 'uyeler', ds.yazarengel), { durum: 'engelli' }); toast('Erişim kapatıldı.'); }
    }
  } catch (er) { toast('İşlem yapılamadı.'); }
});

// ---------- Sorular ----------
let konular = [], acikKonu = null, konuMesajlar = [], mesajAbone = null;
function soruBaslat() {
  aboneler.push(onSnapshot(query(collection(db, 'sorular'), orderBy('sonTarih', 'desc'), limit(200)), (s) => {
    konular = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    rozet('sorular', konular.filter((k) => k.ekipOkudu === false).length);
    soruCiz();
  }));
  aboneler.push(() => mesajAbone && mesajAbone());
}
function soruCiz() {
  const k = $('#b-sorular');
  if (acikKonu) {
    const kn = konular.find((x) => x.id === acikKonu) || {};
    k.innerHTML = `<button class="linkbtn" id="geri">‹ Tüm sorular</button>
      <h2>${esc(kn.takmaAd || '')} <small style="font-weight:400;font-size:14px;color:var(--soluk)">· ${esc(bostanAdi(kn.bostan))}</small></h2>
      <div class="sohbet">${konuMesajlar.map((m) => `<div class="balon ${m.kimden === 'ekip' ? 'ben' : ''}">${esc(m.metin)}
        <div class="alt"><span>${m.kimden === 'ekip' ? 'Ekip' : esc(kn.takmaAd)} · ${tarihYaz(m.tarih)}</span><button data-msil="${m.id}">Sil</button></div></div>`).join('') || '<div class="bos">Mesaj yok.</div>'}</div>
      <div class="kart"><label for="cevap" style="margin-top:0">Cevabınız <small style="font-weight:400;color:var(--soluk)">(“Bostan Pano Ekibi” adıyla gider)</small></label>
        <textarea id="cevap" maxlength="4000"></textarea>
        <div class="btnsatir" style="margin-top:8px"><button class="btn ana" id="cevapGonder">Gönder</button>
        <button class="btn tehlike" id="konuEngel">Kişiyi engelle</button></div></div>`;
    $('#geri').onclick = () => { acikKonu = null; mesajAbone && mesajAbone(); mesajAbone = null; soruCiz(); };
    $('#cevapGonder').onclick = cevapGonder;
    $('#konuEngel').onclick = async () => { if (confirm('Bu kişinin erişimi kapatılsın mı?')) { try { await updateDoc(doc(db, 'uyeler', acikKonu), { durum: 'engelli' }); toast('Erişim kapatıldı.'); } catch (e) { toast('Yapılamadı.'); } } };
    return;
  }
  k.innerHTML = '<h2>Sorular</h2>' + (konular.length ? `<div class="kart" style="padding:4px 12px;max-width:860px">${konular.map((kn) => `<div class="belge" style="cursor:pointer" data-konu="${kn.id}">
      <div class="ic"><b style="${kn.ekipOkudu === false ? '' : 'font-weight:400'}">${kn.ekipOkudu === false ? '● ' : ''}${esc(kn.takmaAd)} · ${esc(bostanAdi(kn.bostan))}</b>
      <small>${esc(kn.sonMesaj || '')}</small><small>${tarihYaz(kn.sonTarih)}</small></div><span>›</span></div>`).join('')}</div>` : '<div class="kart bos">Henüz soru yok.</div>');
}
document.addEventListener('click', async (e) => {
  const kb = e.target.closest('[data-konu]');
  if (kb) {
    acikKonu = kb.dataset.konu; konuMesajlar = [];
    mesajAbone && mesajAbone();
    mesajAbone = onSnapshot(query(collection(db, 'sorular', acikKonu, 'mesajlar'), orderBy('tarih', 'asc')), (s) => {
      konuMesajlar = s.docs.map((d) => ({ id: d.id, ...d.data() })); soruCiz();
    });
    const kn = konular.find((x) => x.id === acikKonu);
    if (kn && kn.ekipOkudu === false) updateDoc(doc(db, 'sorular', acikKonu), { ekipOkudu: true }).catch(() => {});
    soruCiz(); return;
  }
  const ms = e.target.closest('[data-msil]');
  if (ms && confirm('Mesaj silinsin mi?')) { try { await deleteDoc(doc(db, 'sorular', acikKonu, 'mesajlar', ms.dataset.msil)); } catch (er) { toast('Silinemedi.'); } }
});
async function cevapGonder() {
  const metin = $('#cevap').value.trim(); if (!metin) return;
  $('#cevapGonder').disabled = true;
  try {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'sorular', acikKonu, 'mesajlar')), { kimden: 'ekip', metin, tarih: serverTimestamp() });
    batch.update(doc(db, 'sorular', acikKonu), { sonMesaj: ('Ekip: ' + metin).slice(0, 120), sonTarih: serverTimestamp(), ekipOkudu: true, kursiyerOkudu: false });
    await batch.commit();
  } catch (e) { toast('Gönderilemedi.'); $('#cevapGonder').disabled = false; }
}

// ---------- Takvim ----------
let etkinlikler = [], takvim, etDuzenlenen = null, aktarilacak = [];
const TURLER = ['Eğitim', 'Etkinlik', 'Hasat', 'Toplantı', 'Saha çalışması', 'Diğer'];
function takvimBaslat() {
  const k = $('#b-takvim');
  k.innerHTML = `<div class="bolum-ust"><h2>Takvim</h2>
    <div class="btnsatir"><button class="btn ana kucuk" id="etYeni">＋ Etkinlik ekle</button><button class="btn kucuk" id="etAktarAc">Excel / Word'den aktar</button></div></div>
    <div class="kart gizli" id="etForm" style="max-width:860px">
      <h3 style="margin-top:0" id="etFormBaslik">Yeni etkinlik</h3>
      <label for="etBaslik">Başlık</label><input id="etBaslik" type="text" maxlength="150">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div><label for="etTarih">Tarih</label><input id="etTarih" type="date"></div>
        <div><label for="etSaat">Başlangıç</label><input id="etSaat" type="time"></div>
        <div><label for="etBitis">Bitiş</label><input id="etBitis" type="time"></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label for="etTur">Tür</label><select id="etTur">${TURLER.map((t) => `<option>${t}</option>`).join('')}</select></div>
        <div></div></div>
      <label>Hangi bostanlarda görünsün?</label>
      <div class="cipler" id="etBostanlar">
        <label class="cip"><input type="checkbox" value="hepsi" checked> 🌐 Genel (tüm bostanlar)</label>
        ${Object.entries(BOSTANLAR).map(([k, v]) => `<label class="cip"><input type="checkbox" value="${k}"> ${v}</label>`).join('')}
      </div>
      <p class="yardim">Genel seçilirse herkes görür. Bir ya da birkaç bostan seçerseniz yalnızca o bostanların kursiyerleri görür.</p>
      <label for="etYer">Yer (isteğe bağlı)</label><input id="etYer" type="text" maxlength="100">
      <label for="etAciklama">Açıklama (isteğe bağlı)</label><textarea id="etAciklama" maxlength="1000" style="min-height:70px"></textarea>
      <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="etBildir" style="width:22px;height:22px"> Kursiyerlere bildirim gönder</label>
      <div class="btnsatir" style="margin-top:12px"><button class="btn ana" id="etKaydet">Kaydet</button><button class="btn" id="etVazgec">Vazgeç</button></div>
    </div>
    <div class="kart gizli" id="etAktar" style="max-width:860px">
      <h3 style="margin-top:0">Excel / Word'den aktar</h3>
      <p class="yardim">Sütunlar: <b>Tarih, Saat, Bitiş, Başlık, Bostan, Tür, Yer, Açıklama</b>. Word dosyasında bu sütunlara sahip bir <b>tablo</b> olmalı. Bostan boş ya da "Tümü" ise herkese görünür. Birden çok bostan için virgülle ayırın (Mutlukent, Ata Bostan).</p>
      <div class="btnsatir" style="margin:8px 0"><button class="btn kucuk" id="sablonIndir">Excel şablonunu indir</button></div>
      <input type="file" id="etDosya" accept=".xlsx,.xls,.csv,.docx" style="width:100%">
      <div id="etOnizleme"></div>
    </div>
    <div id="takvimKok"></div>`;
  takvim = new Takvim($('#takvimKok'), { yonetici: true, onDuzenle: etDuzenle, onSil: etSil });
  takvim.ciz();
  aboneler.push(onSnapshot(collection(db, 'etkinlikler'), (s) => {
    etkinlikler = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    takvim.ver(gruplanmisEtkinlikler());
  }));
  // Genel seçilince diğerleri kalkar; bostan seçilince Genel kalkar
  $('#etBostanlar').addEventListener('change', (e) => {
    const kutular = $$('#etBostanlar input');
    if (e.target.value === 'hepsi' && e.target.checked) kutular.forEach((k) => k !== e.target && (k.checked = false));
    else if (e.target.checked) kutular[0].checked = false;
    if (!kutular.some((k) => k.checked)) kutular[0].checked = true;
  });
  $('#etYeni').onclick = () => { etFormAc(); $('#etTarih').value = takvim.secili; };
  $('#etVazgec').onclick = () => $('#etForm').classList.add('gizli');
  $('#etKaydet').onclick = etKaydet;
  $('#etAktarAc').onclick = () => $('#etAktar').classList.toggle('gizli');
  $('#etDosya').onchange = dosyaOku;
  $('#sablonIndir').onclick = sablonIndir;
}
// Birden çok bostana eklenen etkinlik, her bostan için ayrı kayıt olarak saklanır (ortak "grup" kimliğiyle).
// Yönetici takviminde tek etkinlik olarak gösterilir.
function grupUyeleri(e) { return e.grup ? etkinlikler.filter((x) => x.grup === e.grup) : [e]; }
function gruplanmisEtkinlikler() {
  const goruldu = new Set(), sonuc = [];
  etkinlikler.forEach((e) => {
    if (e.grup) { if (goruldu.has(e.grup)) return; goruldu.add(e.grup); }
    const uyeleri = grupUyeleri(e);
    sonuc.push({ ...e, bostanlar: uyeleri.map((x) => x.bostan), bostanEtiket: uyeleri.map((x) => bostanAdi(x.bostan)).join(', ') });
  });
  return sonuc;
}
function seciliBostanlar() { return $$('#etBostanlar input').filter((k) => k.checked).map((k) => k.value); }
function etFormAc(e) {
  etDuzenlenen = e ? e.id : null;
  $('#etFormBaslik').textContent = e ? 'Etkinliği düzenle' : 'Yeni etkinlik';
  $('#etBaslik').value = e?.baslik || ''; $('#etTarih').value = e?.tarih || '';
  $('#etSaat').value = e?.saat || ''; $('#etBitis').value = e?.bitis || '';
  const secili = e ? grupUyeleri(e).map((x) => x.bostan) : ['hepsi'];
  $$('#etBostanlar input').forEach((k) => (k.checked = secili.includes(k.value)));
  $('#etTur').value = e?.tur || 'Eğitim';
  $('#etYer').value = e?.yer || ''; $('#etAciklama').value = e?.aciklama || '';
  $('#etBildir').checked = !e;
  $('#etForm').classList.remove('gizli'); $('#etForm').scrollIntoView({ behavior: 'smooth' });
}
function etDuzenle(id) { etFormAc(etkinlikler.find((x) => x.id === id)); }
async function etSil(id) {
  const e = etkinlikler.find((x) => x.id === id); if (!e) return;
  const uyeleri = grupUyeleri(e);
  if (!confirm(uyeleri.length > 1 ? `Etkinlik ${uyeleri.length} bostanın takviminden silinsin mi?` : 'Etkinlik silinsin mi?')) return;
  try { const b = writeBatch(db); uyeleri.forEach((x) => b.delete(doc(db, 'etkinlikler', x.id))); await b.commit(); } catch (er) { toast('Silinemedi.'); }
}
// Bostan listesine göre kayıtları yaz (düzenlemede eski grup silinip yeniden yazılır)
async function etkinlikYaz(v, bostanlar, eskiler = [], eklenme = null) {
  const b = writeBatch(db);
  eskiler.forEach((x) => b.delete(doc(db, 'etkinlikler', x.id)));
  const grup = bostanlar.length > 1 ? (eskiler[0]?.grup || 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)) : null;
  bostanlar.forEach((bs) => {
    const kayit = { ...v, bostan: bs, eklenme: eklenme || serverTimestamp() };
    if (grup) kayit.grup = grup;
    b.set(doc(collection(db, 'etkinlikler')), kayit);
  });
  await b.commit();
}
async function etKaydet() {
  const v = {
    baslik: $('#etBaslik').value.trim(), tarih: $('#etTarih').value, saat: $('#etSaat').value, bitis: $('#etBitis').value,
    tur: $('#etTur').value, yer: $('#etYer').value.trim(), aciklama: $('#etAciklama').value.trim(),
  };
  const bostanlar = seciliBostanlar();
  if (v.baslik.length < 2 || !v.tarih) return toast('Başlık ve tarih gerekli.');
  try {
    if (etDuzenlenen) {
      const eski = etkinlikler.find((x) => x.id === etDuzenlenen);
      await etkinlikYaz(v, bostanlar, grupUyeleri(eski), eski.eklenme || null);
    } else await etkinlikYaz(v, bostanlar);
    if ($('#etBildir').checked) for (const bs of bostanlar) await bildirimIste(bs, (etDuzenlenen ? 'Takvim güncellendi: ' : 'Takvime eklendi: ') + v.baslik, etkinlikOzet(v), 'takvim');
    $('#etForm').classList.add('gizli'); toast('Kaydedildi.');
  } catch (e) { toast('Kaydedilemedi.'); }
}

function etkinlikOzet(v) {
  const d = new Date(v.tarih + 'T12:00:00');
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) + (v.saat ? ' ' + v.saat : '') + (v.yer ? ' · ' + v.yer : '');
}
async function bildirimIste(bostan, baslik, govde, sekme) {
  try { await addDoc(collection(db, 'bildirimIstekleri'), { baslik: baslik.slice(0, 120), govde: (govde || '').slice(0, 200), bostan, sekme, tarih: serverTimestamp() }); }
  catch (e) { toast('Bildirim gönderilemedi.'); }
}

// --- İçe aktarma ---
function betikYukle(src) {
  return new Promise((ok, hata) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = hata; document.head.appendChild(s);
  });
}
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

function sadeles(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]/g, '');
}
const SUTUN = { tarih: 'tarih', saat: 'saat', baslangic: 'saat', bitis: 'bitis', baslik: 'baslik', konu: 'baslik', etkinlik: 'baslik', egitim: 'baslik',
  bostan: 'bostan', lokasyon: 'bostan', tur: 'tur', yer: 'yer', aciklama: 'aciklama', not: 'aciklama', notlar: 'aciklama' };
function bostanBul(s) {
  const x = sadeles(s);
  if (!x || /^(tum|tumu|hepsi|genel|herkes)/.test(x)) return 'hepsi';
  if (x.includes('mutlu')) return 'mutlukent';
  if (x.includes('ata')) return 'atabostan';
  if (x.includes('cigdem') || x.includes('emekli')) return 'cigdem';
  if (x.includes('alaca')) return 'alacaatli';
  return null;
}
// Birden çok bostan: "Mutlukent, Ata Bostan" / "Mutlukent ve Alacaatlı"
function bostanlarBul(s) {
  const parcalar = String(s ?? '').split(/[,;\/+]|\s+ve\s+/i).map((x) => x.trim()).filter(Boolean);
  if (!parcalar.length) return ['hepsi'];
  const l = parcalar.map(bostanBul);
  if (l.includes(null)) return null;
  return l.includes('hepsi') ? ['hepsi'] : [...new Set(l)];
}
const AY_ADLARI = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
function tarihBul(v) {
  if (v instanceof Date && !isNaN(v)) return gunAnahtari(v);
  if (typeof v === 'number' && v > 30000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return gunAnahtari(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  const s = String(v || '').trim(); let m;
  const p = (n) => String(n).padStart(2, '0');
  const gecerli = (y, a, g) => { const d = new Date(y, a - 1, g); return d.getFullYear() === y && d.getMonth() === a - 1 && d.getDate() === g ? `${y}-${p(a)}-${p(g)}` : null; };
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return gecerli(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/))) return gecerli(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/))) { const a = AY_ADLARI.indexOf(sadeles(m[2])); if (a >= 0) return gecerli(+m[3], a + 1, +m[1]); }
  return null;
}
function saatBul(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date && !isNaN(v)) return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
  if (typeof v === 'number' && v >= 0 && v < 1) { const dk = Math.round(v * 1440); return `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`; }
  const m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (m && +m[1] < 24 && +m[2] < 60) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return null;
}
function satirlariCevir(satirlar) {
  // İlk satır başlık
  const bas = satirlar[0].map((h) => SUTUN[sadeles(h)] || null);
  if (!bas.includes('tarih') || !bas.includes('baslik')) throw new Error('Tabloda en az "Tarih" ve "Başlık" sütunları olmalı.');
  return satirlar.slice(1).filter((r) => r.some((c) => String(c ?? '').trim())).map((r) => {
    const ham = {}; bas.forEach((k, i) => k && (ham[k] = r[i]));
    const e = {
      baslik: String(ham.baslik ?? '').trim().slice(0, 150), tarih: tarihBul(ham.tarih), saat: saatBul(ham.saat), bitis: saatBul(ham.bitis),
      bostanlar: bostanlarBul(ham.bostan), tur: String(ham.tur ?? '').trim() || 'Eğitim', yer: String(ham.yer ?? '').trim().slice(0, 100), aciklama: String(ham.aciklama ?? '').trim().slice(0, 1000),
    };
    const hatalar = [];
    if (e.baslik.length < 2) hatalar.push('başlık yok');
    if (!e.tarih) hatalar.push('tarih okunamadı: ' + (ham.tarih ?? ''));
    if (e.saat === null) hatalar.push('saat okunamadı'); if (e.bitis === null) hatalar.push('bitiş okunamadı');
    if (!e.bostanlar) hatalar.push('bostan tanınmadı: ' + ham.bostan);
    e.saat = e.saat || ''; e.bitis = e.bitis || '';
    return { e, hatalar };
  });
}
async function dosyaOku(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const kutu = $('#etOnizleme'); kutu.innerHTML = '<div class="bos">Okunuyor…</div>';
  try {
    let satirlar;
    if (/\.docx$/i.test(f.name)) {
      await betikYukle(MAMMOTH_URL);
      const { value } = await window.mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
      const tablo = new DOMParser().parseFromString(value, 'text/html').querySelector('table');
      if (!tablo) throw new Error('Word dosyasında tablo bulunamadı.');
      satirlar = [...tablo.rows].map((r) => [...r.cells].map((c) => c.textContent.trim()));
    } else {
      await betikYukle(XLSX_URL);
      const wb = window.XLSX.read(await f.arrayBuffer(), { cellDates: false });
      satirlar = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    }
    aktarilacak = satirlariCevir(satirlar);
    const iyi = aktarilacak.filter((x) => !x.hatalar.length).length;
    kutu.innerHTML = `<p><b>${aktarilacak.length}</b> satır okundu, <b>${iyi}</b> tanesi eklenmeye hazır${iyi < aktarilacak.length ? `, <b style="color:var(--kirmizi)">${aktarilacak.length - iyi}</b> satırda sorun var (kırmızı, eklenmeyecek)` : ''}.</p>
      <div class="tablo-sar"><table><tr><th>Tarih</th><th>Saat</th><th>Başlık</th><th>Bostan</th><th>Tür</th><th>Durum</th></tr>
      ${aktarilacak.map(({ e, hatalar }) => `<tr class="${hatalar.length ? 'gecersiz' : ''}"><td>${e.tarih ? e.tarih.split('-').reverse().join('.') : '—'}</td><td>${esc(e.saat)}${e.bitis ? '–' + esc(e.bitis) : ''}</td><td>${esc(e.baslik)}</td><td>${e.bostanlar ? esc(e.bostanlar.map(bostanAdi).join(', ')) : '—'}</td><td>${esc(e.tur)}</td><td>${hatalar.length ? esc(hatalar.join(', ')) : '✓'}</td></tr>`).join('')}</table></div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="aktarBildir" checked style="width:22px;height:22px"> Kursiyerlere tek bir bildirim gönder</label>
      <div class="btnsatir" style="margin-top:10px"><button class="btn ana" id="aktarOnay" ${iyi ? '' : 'disabled'}>${iyi} etkinliği takvime ekle</button></div>`;
    $('#aktarOnay').onclick = aktar;
  } catch (e) { kutu.innerHTML = `<p class="hata">${esc(e.message || 'Dosya okunamadı.')}</p>`; }
}
async function aktar() {
  const iyi = aktarilacak.filter((x) => !x.hatalar.length).map((x) => x.e);
  $('#aktarOnay').disabled = true;
  try {
    // Her satır, seçilen her bostan için ayrı kayıt; birden çok bostan varsa ortak grup kimliği
    const kayitlar = [];
    iyi.forEach((e, n) => {
      const { bostanlar, ...v } = e;
      const grup = bostanlar.length > 1 ? 'g' + Date.now().toString(36) + n + Math.random().toString(36).slice(2, 5) : null;
      bostanlar.forEach((bs) => kayitlar.push(grup ? { ...v, bostan: bs, grup } : { ...v, bostan: bs }));
    });
    for (let i = 0; i < kayitlar.length; i += 400) {
      const b = writeBatch(db);
      kayitlar.slice(i, i + 400).forEach((e) => b.set(doc(collection(db, 'etkinlikler')), { ...e, eklenme: serverTimestamp() }));
      await b.commit();
    }
    if ($('#aktarBildir').checked) {
      // Her bostana yalnızca kendisini ilgilendiren sayıyla tek bildirim
      const sayac = {};
      kayitlar.forEach((e) => (sayac[e.bostan] = (sayac[e.bostan] || 0) + 1));
      for (const [bostan, n] of Object.entries(sayac)) {
        await bildirimIste(bostan, n === 1 ? 'Takvime eklendi: ' + kayitlar.find((e) => e.bostan === bostan).baslik : `Takvime ${n} yeni etkinlik eklendi`, 'Takvim bölümünden ayrıntılara bakabilirsiniz.', 'takvim');
      }
    }
    toast(`${iyi.length} etkinlik eklendi.`);
    $('#etOnizleme').innerHTML = ''; $('#etDosya').value = ''; aktarilacak = [];
  } catch (e) { toast('Aktarılamadı.'); $('#aktarOnay').disabled = false; }
}
async function sablonIndir() {
  await betikYukle(XLSX_URL);
  const X = window.XLSX;
  const ws = X.utils.aoa_to_sheet([
    ['Tarih', 'Saat', 'Bitiş', 'Başlık', 'Bostan', 'Tür', 'Yer', 'Açıklama'],
    ['20.11.2026', '10:00', '12:00', 'Kışlık sebzelerde bakım', 'Mutlukent', 'Eğitim', 'Eğitim çadırı', ''],
    ['22.11.2026', '14:00', '', 'Kompost günü', 'Tümü', 'Etkinlik', '', 'Eldiven getirin'],
  ]);
  ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 34 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 30 }];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Takvim');
  X.writeFile(wb, 'Bostan_Pano_Takvim_Sablonu.xlsx');
}

// ---------- Ayarlar ----------
function ayarBaslat() {
  const k = $('#b-ayar');
  const sahipMi = yoneticiAyar.sahip === ben.email;
  k.innerHTML = `<h2>Ayarlar</h2>
    <div class="izgara">
      <div id="kullanimKok"><div class="kart bos">Kullanım yükleniyor…</div></div>
      <div class="kart"><h3 style="margin-top:0">🔑 Bostan kodları</h3><p class="yardim" style="margin-top:0">Kursiyer bu kodu girerek katılma isteği gönderir. Kod sızarsa ya da yeni sezonda değiştirin; mevcut üyeler etkilenmez.</p>
        ${Object.entries(BOSTANLAR).map(([b, ad]) => `<label for="kod-${b}">${ad}</label>
          <div class="btnsatir"><input id="kod-${b}" type="text" style="flex:1" autocomplete="off"><button class="btn kucuk" data-kodureti="${b}">Üret</button></div>`).join('')}
        <button class="btn ana" id="kodKaydet" style="margin-top:12px">Kodları kaydet</button></div>
      <div class="kart"><h3 style="margin-top:0">👥 Yöneticiler (${yoneticiAyar.emailler.length}/6)</h3>
        ${yoneticiAyar.emailler.map((m) => `<div class="belge"><div class="ic"><b>${esc(m)}</b>${m === yoneticiAyar.sahip ? '<small>Sahip</small>' : ''}</div>
          ${sahipMi && m !== yoneticiAyar.sahip ? `<button class="btn kucuk tehlike" data-ycikar="${esc(m)}">Çıkar</button>` : ''}</div>`).join('')}
        ${sahipMi ? (yoneticiAyar.emailler.length < 6 ? `<label for="yEkle">Yönetici ekle (Google hesabı)</label><div class="btnsatir"><input id="yEkle" type="email" style="flex:1" placeholder="ornek@gmail.com"><button class="btn ana kucuk" id="yEkleBtn">Ekle</button></div>` : '<p class="yardim">6 kişilik kontenjan dolu.</p>')
          : '<p class="yardim">Yönetici listesini yalnızca sahip değiştirebilir.</p>'}</div>
      <div class="kart"><h3 style="margin-top:0">🔳 Kursiyer kare kodu</h3>
        <button id="qrAc" style="border:0;background:none;padding:0;cursor:pointer;display:block;margin:0 auto" aria-label="Kare kodu büyüt"><img src="qr.png" alt="Bostan Pano kare kodu" style="width:160px;border-radius:8px;border:1px solid var(--cizgi);display:block"></button>
        <p class="yardim" style="text-align:center">Büyütmek için dokunun. Kursiyer telefonunun kamerasıyla okutunca uygulama açılır; ardından bostan kodunu girer.</p>
        <div class="btnsatir" style="justify-content:center;margin-top:8px"><a class="btn kucuk" href="qr.png" download="Bostan_Pano_Kare_Kod.png">Resmi indir</a></div></div>
            <div class="kart"><h3 style="margin-top:0">📱 Bu cihaz</h3><div class="btnsatir"><button class="btn" id="yBildirim">🔔 Yeni soru bildirimlerini aç</button><button class="btn" id="cikisYap">Çıkış yap</button></div></div>
    </div>`;
  $('#qrAc').onclick = () => isikKutusu('qr.png', 'Bostan Pano kare kodu', () => { const l = document.createElement('a'); l.href = 'qr.png'; l.download = 'Bostan_Pano_Kare_Kod.png'; l.click(); });
  kullanimCiz();
  Object.keys(BOSTANLAR).forEach(async (b) => { try { const s = await getDoc(doc(db, 'bostanKodlari', b)); $('#kod-' + b).value = s.exists() ? s.data().kod : ''; } catch (e) {} });
  k.onclick = async (e) => {
    const u = e.target.closest('[data-kodureti]');
    if (u) { const harf = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; const r = [...crypto.getRandomValues(new Uint8Array(6))].map((x) => harf[x % harf.length]).join(''); $('#kod-' + u.dataset.kodureti).value = `${u.dataset.kodureti.slice(0, 4).toUpperCase()}-${r}`; }
    const c = e.target.closest('[data-ycikar]');
    if (c && confirm(c.dataset.ycikar + ' yöneticilikten çıkarılsın mı?')) yoneticiGuncelle(yoneticiAyar.emailler.filter((x) => x !== c.dataset.ycikar));
  };
  $('#kodKaydet').onclick = async () => {
    try {
      for (const b of Object.keys(BOSTANLAR)) {
        const kod = $('#kod-' + b).value.trim().toUpperCase();
        if (kod.length < 5) throw new Error(`${BOSTANLAR[b]} kodu en az 5 karakter olmalı.`);
        await setDoc(doc(db, 'bostanKodlari', b), { kod });
        $('#kod-' + b).value = kod;
      }
      toast('Kodlar kaydedildi.');
    } catch (e) { toast(e.message || 'Kaydedilemedi.'); }
  };
  $('#yEkleBtn') && ($('#yEkleBtn').onclick = () => {
    const m = $('#yEkle').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) return toast('Geçerli bir e-posta yazın.');
    if (yoneticiAyar.emailler.includes(m)) return toast('Zaten listede.');
    yoneticiGuncelle([...yoneticiAyar.emailler, m]);
  });
  $('#cikisYap').onclick = () => signOut(auth);
  $('#yBildirim').onclick = yoneticiBildirim;
}
async function yoneticiGuncelle(liste) {
  try {
    await updateDoc(doc(db, 'ayarlar', 'yoneticiler'), { emailler: liste });
    yoneticiAyar.emailler = liste; ayarBaslat(); toast('Yönetici listesi güncellendi.');
  } catch (e) { toast('Güncellenemedi.'); }
}
async function yoneticiBildirim() {
  if (!AYAR.vapidKey) return toast('Bildirim anahtarı (vapidKey) config.js içinde tanımlı değil.');
  try {
    const { getMessaging, getToken, isSupported } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
    if (!(await isSupported())) return toast('Bu tarayıcı bildirimleri desteklemiyor.');
    if ((await Notification.requestPermission()) !== 'granted') return toast('İzin verilmedi.');
    const token = await getToken(getMessaging(), { vapidKey: AYAR.vapidKey, serviceWorkerRegistration: await swKayit });
    await setDoc(doc(db, 'yoneticiTokenlari', ben.uid), { token, email: ben.email, tarih: serverTimestamp() });
    toast('Yeni soru bildirimleri açıldı.');
  } catch (e) { toast('Bildirim açılamadı.'); }
}
