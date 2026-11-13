// Bostan Pano — kursiyer uygulaması ve yönetim panelinin ortak kodu
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

export const APP_VERSION = '2026.11.13-1';
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
      govde = `<div class="ayizgara">${hucre}</div>
        <div class="gunliste"><h4>${sd.getDate()} ${AYLAR[sd.getMonth()]} ${GUN_TAM[(sd.getDay() + 6) % 7]}</h4>${this.listeHtml(this.gununkiler(this.secili))}</div>`;
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
    return liste.map((e) => `<div class="etkinlik ${e.bostan}">
      <div class="zaman">${esc(e.saat || 'Gün boyu')}${e.bitis ? '<br><small>' + esc(e.bitis) + '</small>' : ''}</div>
      <div class="ic"><b>${esc(e.baslik)}</b>
        <small>${esc(e.tur || '')}${e.tur ? ' · ' : ''}${esc(bostanAdi(e.bostan))}${e.yer ? ' · ' + esc(e.yer) : ''}</small>
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
