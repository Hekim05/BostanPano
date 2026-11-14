// Bostan Pano — kursiyer uygulaması ve yönetim panelinin ortak kodu
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

export const APP_VERSION = '2026.11.14-18';
export const AYAR = self.BP_AYAR || {};
export const ayarEksik = !AYAR.firebase || !AYAR.firebase.apiKey || !AYAR.firebase.projectId;

export let app, auth, db, fns;
if (!ayarEksik) {
  app = initializeApp(AYAR.firebase);
  auth = getAuth(app);
  db = getFirestore(app);
  fns = getFunctions(app, AYAR.bolge || 'europe-west1');
}

export const BOSTANLAR = {
  mutlukent: 'Mutlukent',
  atabostan: 'Ata Bostan',
  cigdem: 'Çiğdem Emekli Kampüsü',
  alacaatli: 'Alacaatlı',
};
// Ekip / resmi kimlik taklidine izin verilmeyen takma adlar (kurallarda da aynı denetim var)
const YASAK_DESEN = /(ek.{1,2}p|y[oö]net|adm|pano|moderat|resm|beled|g[oö]revl|personel|m[uü]hend)/;
export const yasakAd = (ad) => YASAK_DESEN.test(String(ad).toLocaleLowerCase('tr-TR'));
export const bostanAdi = (b) => (b === 'hepsi' ? 'Tüm bostanlar' : BOSTANLAR[b] || b);

// ---------- Yardımcılar ----------
export const $ = (s, k = document) => k.querySelector(s);
export const $$ = (s, k = document) => [...k.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(mesaj, sure = 3000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = mesaj;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), sure);
}

export function tarihNesne(t) {
  if (!t) return null;
  if (t.toDate) return t.toDate();
  if (t instanceof Date) return t;
  return new Date(t);
}

export function tarihYaz(t, saatli = true) {
  const d = tarihNesne(t);
  if (!d) return '';
  const o = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' };
  if (saatli) Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('tr-TR', o);
}

export function gunAnahtari(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Üst bilgideki canlı tarih / saat
export function saatBaslat(kok) {
  const yaz = () => {
    const d = new Date();
    kok.innerHTML = `<b>${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })}</b>` +
      d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' });
  };
  yaz();
  setInterval(yaz, 15000);
}

// ---------- Makale biçimlendirme ----------
// Yapıştırılan düz metin: boş satır = paragraf, "## " = ara başlık, "- " = madde, **kalın**, bağlantılar tıklanır
export function makaleHtml(metin) {
  const satirIci = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const bloklar = String(metin || '').replace(/\r/g, '').split(/\n\s*\n/);
  return bloklar.map((b) => {
    const satirlar = b.split('\n').filter((x) => x.trim());
    if (!satirlar.length) return '';
    if (satirlar.length === 1 && /^#{1,3}\s/.test(satirlar[0])) return `<h4>${satirIci(satirlar[0].replace(/^#{1,3}\s/, ''))}</h4>`;
    if (satirlar.every((x) => /^\s*[-•*]\s/.test(x))) return '<ul>' + satirlar.map((x) => `<li>${satirIci(x.replace(/^\s*[-•*]\s/, ''))}</li>`).join('') + '</ul>';
    return `<p>${satirlar.map(satirIci).join('<br>')}</p>`;
  }).join('');
}

// ---------- Video ----------
export function videoGomme(url) {
  if (!url) return '';
  let m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{6,})/);
  if (m) return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="Video" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]{10,})/);
  if (m) return `<div class="video"><iframe src="https://drive.google.com/file/d/${m[1]}/preview" title="Video" loading="lazy" allow="autoplay; fullscreen" allowfullscreen></iframe></div>`;
  if (/^https?:\/\//.test(url)) return `<p><a href="${esc(url)}" target="_blank" rel="noopener">▶ Videoyu aç</a></p>`;
  return '';
}

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
// Video: önce hafif kapak resmi, dokununca oynatıcı yüklenir
export function videoKapak(url) {
  const yt = youtubeId(url);
  if (yt) return `<button class="video-kapak" data-video="${esc(url)}" style="background-image:url('https://i.ytimg.com/vi/${yt}/hqdefault.jpg')" aria-label="Videoyu oynat"></button>`;
  return videoGomme(url);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.video-kapak');
  if (!b) return;
  const d = document.createElement('div');
  d.innerHTML = videoGomme(b.dataset.video).replace('youtube-nocookie.com/embed/' + youtubeId(b.dataset.video), 'youtube-nocookie.com/embed/' + youtubeId(b.dataset.video) + '?autoplay=1');
  b.replaceWith(d.firstElementChild);
});

const fnAdres = (ad) => `https://${AYAR.bolge || 'europe-west1'}-${AYAR.firebase.projectId}.cloudfunctions.net/${ad}`;
const resimOnbellek = new Map();
// Drive dosyasının küçük önizleme resmi (yetkili istek → blob adresi)
export async function kucukResim(id, boyut = 400) {
  const k = id + ':' + boyut;
  if (resimOnbellek.has(k)) return resimOnbellek.get(k);
  const p = (async () => {
    const t = await auth.currentUser.getIdToken();
    const r = await fetch(fnAdres('belgeOnizleme') + `?id=${encodeURIComponent(id)}&boyut=${boyut}`, { headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) throw new Error(r.status);
    return URL.createObjectURL(await r.blob());
  })();
  resimOnbellek.set(k, p);
  p.catch(() => resimOnbellek.delete(k));
  return p;
}
// Sayfadaki [data-onizleme] öğelerine arka plan olarak küçük resim yerleştir
export function onizlemeleriYukle(kok = document) {
  kok.querySelectorAll('[data-onizleme]:not([data-yuklendi])').forEach(async (el) => {
    el.dataset.yuklendi = '1';
    try { const u = await kucukResim(el.dataset.onizleme, Number(el.dataset.boyut) || 400); el.style.backgroundImage = `url('${u}')`; el.classList.add('resimli'); } catch (e) {}
  });
}
export function isikKutusu(src, ad, indir) {
  const d = document.createElement('div');
  d.className = 'isik';
  d.innerHTML = `<button class="kapat" aria-label="Kapat">✕</button><img alt="${esc(ad || '')}"><div class="alt"><button class="btn kucuk">İndir</button></div>`;
  d.querySelector('img').src = src;
  d.onclick = (e) => { if (e.target === d || e.target.closest('.kapat')) d.remove(); };
  d.querySelector('.alt button').onclick = indir;
  document.body.appendChild(d);
}
// Dosyayı aç: resimler ışık kutusunda, PDF yeni sekmede, diğerleri indirilir
export async function belgeAc(id, ad, tur) {
  const indir = async (ac) => {
    const t = await auth.currentUser.getIdToken();
    const r = await fetch(fnAdres('belgeIndir') + `?id=${encodeURIComponent(id)}`, { headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const dosyaAdi = m ? decodeURIComponent(m[1]) : ad;
    const url = URL.createObjectURL(blob);
    if (ac && /pdf/.test(blob.type)) { const w = window.open(url, '_blank'); if (w) return; }
    const a = document.createElement('a'); a.href = url; a.download = dosyaAdi;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  try {
    if (/^image\//.test(tur || '')) { const u = await kucukResim(id, 1600); isikKutusu(u, ad, () => indir(false).catch(() => toast('İndirilemedi.'))); return; }
    await indir(true);
  } catch (e) { toast('Dosya açılamadı.'); }
}
export function turBilgisi(m, ad) {
  m = m || '';
  if (/pdf/.test(m)) return ['pdf', 'PDF'];
  if (/word|document/.test(m)) return ['doc', 'DOC'];
  if (/sheet|excel/.test(m)) return ['xls', 'XLS'];
  if (/presentation|powerpoint/.test(m)) return ['ppt', 'SUNUM'];
  if (/^image\//.test(m)) return ['img', 'FOTO'];
  if (/^video\//.test(m)) return ['vid', 'VİDEO'];
  return ['', (String(ad).split('.').pop() || 'DOSYA').slice(0, 4).toUpperCase()];
}
// Duyuru eklerinin önizleme ızgarası
export function eklerHtml(ekler) {
  if (!ekler || !ekler.length) return '';
  return `<div class="ekler">${ekler.map((f) => { const [, y] = turBilgisi(f.tur, f.ad); return `<button class="ek" data-ac="${esc(f.id)}" data-ad="${esc(f.ad)}" data-tur="${esc(f.tur || '')}" data-onizleme="${esc(f.id)}" data-boyut="320" title="${esc(f.ad)}"><span class="tur-rozet">${y}</span><span>${esc(f.ad)}</span></button>`; }).join('')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ac]');
  if (b) { e.preventDefault(); belgeAc(b.dataset.ac, b.dataset.ad, b.dataset.tur); }
});

// ---------- Sesli okuma ----------
let okunan = null;
export function sesliOku(metin, dugme) {
  const ss = window.speechSynthesis;
  if (!ss) { toast('Bu cihaz sesli okumayı desteklemiyor.'); return; }
  if (okunan === dugme) { ss.cancel(); return; }
  ss.cancel();
  const temiz = String(metin).replace(/[#*•]/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  const parcalar = temiz.match(/[^.!?…]+[.!?…]*/g) || [temiz];
  // Uzun cümleleri böl (bazı tarayıcılar uzun metinde kesiliyor)
  const kuyruk = [];
  parcalar.forEach((p) => {
    p = p.trim();
    while (p.length > 220) { const i = p.lastIndexOf(' ', 220); kuyruk.push(p.slice(0, i > 0 ? i : 220)); p = p.slice(i > 0 ? i : 220); }
    if (p) kuyruk.push(p);
  });
  const ses = ss.getVoices().find((v) => /^tr/i.test(v.lang));
  const eskiYazi = dugme.innerHTML;
  const bitir = () => { if (okunan === dugme) { okunan = null; dugme.innerHTML = eskiYazi; } };
  okunan = dugme;
  dugme.innerHTML = '⏹ Durdur';
  kuyruk.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = 'tr-TR'; u.rate = 0.95;
    if (ses) u.voice = ses;
    if (i === kuyruk.length - 1) u.onend = bitir;
    u.onerror = bitir;
    ss.speak(u);
  });
}
if (window.speechSynthesis) window.speechSynthesis.getVoices();

// ---------- Takvim ----------
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const GUN_TAM = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export class Takvim {
  constructor(kok, { yonetici = false, onDuzenle, onSil } = {}) {
    this.kok = kok; this.yonetici = yonetici; this.onDuzenle = onDuzenle; this.onSil = onSil;
    const b = new Date();
    this.ay = new Date(b.getFullYear(), b.getMonth(), 1);
    this.secili = gunAnahtari(b);
    this.mod = 'ay';
    this.etkinlikler = [];
    kok.addEventListener('click', (e) => this.tikla(e));
  }
  ver(liste) { this.etkinlikler = liste; this.ciz(); }
  git(gun, id) {
    this.secili = gun; this.vurgu = id; this.mod = 'ay';
    const d = new Date(gun + 'T12:00:00'); this.ay = new Date(d.getFullYear(), d.getMonth(), 1);
    this.ciz();
    setTimeout(() => this.kok.querySelector(`[data-eid="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
  gununkiler(g) {
    return this.etkinlikler.filter((e) => e.tarih === g).sort((a, b) => (a.saat || '99').localeCompare(b.saat || '99'));
  }
  haftaBasi(g) {
    const d = new Date(g + 'T12:00:00');
    const fark = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - fark);
    return d;
  }
  ciz() {
    const bugun = gunAnahtari(new Date());
    let baslik, govde;
    if (this.mod === 'ay') {
      baslik = `${AYLAR[this.ay.getMonth()]} ${this.ay.getFullYear()}`;
      const ilk = new Date(this.ay);
      ilk.setDate(1 - ((ilk.getDay() + 6) % 7));
      let hucre = GUNLER.map((g) => `<div class="gunadi">${g}</div>`).join('');
      for (let i = 0; i < 42; i++) {
        const d = new Date(ilk); d.setDate(ilk.getDate() + i);
        const g = gunAnahtari(d);
        const ev = this.gununkiler(g);
        const sinif = ['gun', d.getMonth() !== this.ay.getMonth() ? 'baska' : '', g === bugun ? 'bugun' : '', g === this.secili ? 'secili' : ''].join(' ');
        hucre += `<button class="${sinif}" data-gun="${g}" aria-label="${d.getDate()} ${AYLAR[d.getMonth()]}${ev.length ? ', ' + ev.length + ' etkinlik' : ''}">
          <span class="no">${d.getDate()}</span>
          <span class="noktalar">${ev.slice(0, 3).map((e) => `<i class="nokta ${e.bostan}"></i>`).join('')}</span></button>`;
        if (i >= 34 && d.getMonth() !== this.ay.getMonth() && d.getDay() === 0) break;
      }
      const sd = new Date(this.secili + 'T12:00:00');
      // Seçili günün haftası (Pzt–Paz) gün gün sıralanır
      const hb = this.haftaBasi(this.secili);
      const hs = new Date(hb); hs.setDate(hb.getDate() + 6);
      const buHafta = gunAnahtari(this.haftaBasi(bugun)) === gunAnahtari(hb);
      let hafta = '';
      for (let i = 0; i < 7; i++) {
        const d = new Date(hb); d.setDate(hb.getDate() + i);
        const ev = this.gununkiler(gunAnahtari(d));
        if (ev.length) hafta += `<h4>${GUN_TAM[i]}, ${d.getDate()} ${AYLAR[d.getMonth()]}${gunAnahtari(d) === bugun ? ' · Bugün' : ''}</h4>${this.listeHtml(ev)}`;
      }
      govde = `<div class="ayizgara">${hucre}</div>
        <div class="gunliste"><h4>${sd.getDate()} ${AYLAR[sd.getMonth()]} ${GUN_TAM[(sd.getDay() + 6) % 7]}</h4>${this.listeHtml(this.gununkiler(this.secili))}</div>
        <div class="kart" style="margin-top:16px"><h2 style="margin:0 0 4px">${buHafta ? 'Bu hafta' : 'O hafta'}</h2>
          <div class="yardim" style="margin:0">${hb.getDate()} ${AYLAR[hb.getMonth()]} – ${hs.getDate()} ${AYLAR[hs.getMonth()]}</div>
          <div class="gunliste">${hafta || '<div class="bos">Bu hafta etkinlik yok.</div>'}</div></div>`;
    } else {
      const bas = this.haftaBasi(this.secili);
      const son = new Date(bas); son.setDate(bas.getDate() + 6);
      baslik = `${bas.getDate()} ${AYLAR[bas.getMonth()]} – ${son.getDate()} ${AYLAR[son.getMonth()]}`;
      govde = '<div class="gunliste">';
      for (let i = 0; i < 7; i++) {
        const d = new Date(bas); d.setDate(bas.getDate() + i);
        const g = gunAnahtari(d);
        govde += `<h4>${GUN_TAM[i]}, ${d.getDate()} ${AYLAR[d.getMonth()]}${g === bugun ? ' · Bugün' : ''}</h4>${this.listeHtml(this.gununkiler(g))}`;
      }
      govde += '</div>';
    }
    this.kok.innerHTML = `<div class="takvim-ust">
        <button class="btn kucuk" data-git="-1" aria-label="Önceki">‹</button>
        <div class="baslik">${baslik}</div>
        <button class="btn kucuk" data-git="1" aria-label="Sonraki">›</button>
      </div>
      <div class="btnsatir" style="margin-bottom:10px">
        <div class="sekmeler"><button data-mod="ay" class="${this.mod === 'ay' ? 'aktif' : ''}">Aylık</button><button data-mod="hafta" class="${this.mod === 'hafta' ? 'aktif' : ''}">Haftalık</button></div>
        <button class="btn kucuk" data-bugun>Bugün</button>
      </div>${govde}`;
  }
  listeHtml(liste) {
    if (!liste.length) return '<div class="bos">Etkinlik yok.</div>';
    return liste.map((e) => `<div class="etkinlik ${e.bostan} ${e.id === this.vurgu ? 'vurgu' : ''}" data-eid="${e.id}">
      <div class="zaman">${esc(e.saat || 'Gün boyu')}${e.bitis ? '<br><small>' + esc(e.bitis) + '</small>' : ''}</div>
      <div class="ic">${e.yeni ? '<span class="yeni-etiket">Yeni</span> ' : ''}<b>${esc(e.baslik)}</b>
        <small>${esc(e.tur || '')}${e.tur ? ' · ' : ''}${esc(e.bostanEtiket || bostanAdi(e.bostan))}${e.yer ? ' · ' + esc(e.yer) : ''}</small>
        ${e.aciklama ? `<div style="font-size:14px;margin-top:4px">${esc(e.aciklama)}</div>` : ''}
        ${this.yonetici ? `<div class="btnsatir" style="margin-top:6px"><button class="btn kucuk" data-duzenle="${e.id}">Düzenle</button><button class="btn kucuk tehlike" data-sil="${e.id}">Sil</button></div>` : ''}
      </div></div>`).join('');
  }
  tikla(e) {
    const h = e.target.closest('button');
    if (!h) return;
    if (h.dataset.gun) { this.secili = h.dataset.gun; this.ciz(); }
    else if (h.dataset.git) {
      const y = Number(h.dataset.git);
      if (this.mod === 'ay') {
        this.ay = new Date(this.ay.getFullYear(), this.ay.getMonth() + y, 1);
        this.secili = gunAnahtari(this.ay);
      } else {
        const d = new Date(this.secili + 'T12:00:00'); d.setDate(d.getDate() + 7 * y);
        this.secili = gunAnahtari(d); this.ay = new Date(d.getFullYear(), d.getMonth(), 1);
      }
      this.ciz();
    } else if (h.dataset.mod) { this.mod = h.dataset.mod; this.ciz(); }
    else if ('bugun' in h.dataset) {
      const b = new Date(); this.secili = gunAnahtari(b); this.ay = new Date(b.getFullYear(), b.getMonth(), 1); this.ciz();
    } else if (h.dataset.duzenle && this.onDuzenle) this.onDuzenle(h.dataset.duzenle);
    else if (h.dataset.sil && this.onSil) this.onSil(h.dataset.sil);
  }
}

// ---------- Service worker ----------
export async function swKaydet() {
  if (!('serviceWorker' in navigator)) return null;
  let yenilendi = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (yenilendi) return;
    yenilendi = true;
    try { sessionStorage.setItem('bp-yeni', '1'); } catch (e) {}
    location.reload();
  });
  try { if (sessionStorage.getItem('bp-yeni')) { sessionStorage.removeItem('bp-yeni'); toast('Yeni sürüm yüklendi'); } } catch (e) {}
  try { return await navigator.serviceWorker.register('./sw.js'); } catch (e) { return null; }
}

export function ayarEksikEkrani(kok) {
  kok.innerHTML = `<div class="ortala kart"><img class="logo" src="logo.png" alt=""><h2>Kurulum tamamlanmadı</h2>
    <p>config.js dosyasına Firebase proje bilgileri henüz girilmemiş. Kurulum rehberindeki adımları izleyin.</p></div>`;
}

// Uygulama açıkken gelen anlık bildirimi sistem bildirimi olarak gösterir
export function acikkenGoster(reg, p) {
  try {
    const n = (p && p.notification) || {};
    const link = (p && p.fcmOptions && p.fcmOptions.link) || './';
    if (reg && n.title) reg.showNotification(n.title, { body: n.body || '', icon: './icon-192.png', data: { bpLink: link } });
  } catch (e) {}
}
