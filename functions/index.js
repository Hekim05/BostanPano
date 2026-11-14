// Bostan Pano — sunucu fonksiyonları
// 1) belgeler      : Drive klasöründeki eğitim dokümanlarını listeler (yalnızca onaylı kursiyer / yönetici)
// 2) belgeIndir    : Dosyayı Drive'dan çekip kullanıcıya aktarır (klasör herkese açık olmak zorunda değil)
// 3) duyuruBildir  : Yeni duyuruda ilgili bostanın kursiyerlerine anlık bildirim
// 4) mesajBildir   : Soru Sor yazışmalarında karşı tarafa bildirim

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');
const { Readable } = require('stream');

admin.initializeApp();
const db = admin.firestore();

// Maliyet güvenliği: aynı anda en fazla 3 kopya çalışır
setGlobalOptions({ region: 'europe-west1', maxInstances: 3, memory: '256MiB' });

const DRIVE_KOK_KLASOR = defineString('DRIVE_KOK_KLASOR');
const UYGULAMA_ADRESI = defineString('UYGULAMA_ADRESI', { default: 'https://hekim05.github.io/BostanPano/' });

const BOSTANLAR = ['mutlukent', 'atabostan', 'cigdem', 'alacaatli'];

// Drive alt klasör adı → bölüm anahtarı
function klasorAnahtari(ad) {
  const s = ad.toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z]/g, '');
  if (s.startsWith('genel')) return 'genel';
  if (s.startsWith('mutlukent')) return 'mutlukent';
  if (s.startsWith('atabostan')) return 'atabostan';
  if (s.startsWith('cigdem')) return 'cigdem';
  if (s.startsWith('alacaatli')) return 'alacaatli';
  return null;
}

// ---------- Yetki ----------
async function yoneticiMi(token) {
  if (!token || !token.email || token.email_verified !== true) return false;
  const snap = await db.doc('ayarlar/yoneticiler').get();
  const liste = (snap.exists && snap.data().emailler) || [];
  return liste.includes(token.email);
}

// Kullanıcının görebileceği bölümler
async function izinliBolumler(token) {
  if (await yoneticiMi(token)) return ['genel', ...BOSTANLAR];
  const uye = await db.doc(`uyeler/${token.uid}`).get();
  if (!uye.exists || uye.data().durum !== 'onayli') {
    throw new HttpsError('permission-denied', 'Erişim izni yok.');
  }
  return ['genel', uye.data().bostan];
}

// ---------- Drive ----------
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });

async function driveFetch(yol, params = {}) {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const url = new URL('https://www.googleapis.com/drive/v3/' + yol);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('supportsAllDrives', 'true');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function driveJson(yol, params) {
  const r = await driveFetch(yol, params);
  if (!r.ok) throw new Error(`Drive hatası ${r.status}: ${await r.text()}`);
  return r.json();
}

async function cocuklar(klasorId, sadeceKlasor) {
  const q = `'${klasorId}' in parents and trashed = false` +
    (sadeceKlasor ? ` and mimeType = 'application/vnd.google-apps.folder'`
                  : ` and mimeType != 'application/vnd.google-apps.folder'`);
  const sonuc = [];
  let pageToken;
  do {
    const p = {
      q, pageSize: '200', orderBy: 'modifiedTime desc',
      includeItemsFromAllDrives: 'true',
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, hasThumbnail)',
    };
    if (pageToken) p.pageToken = pageToken;
    const j = await driveJson('files', p);
    sonuc.push(...j.files);
    pageToken = j.nextPageToken;
  } while (pageToken);
  return sonuc;
}

// Kısa süreli önbellek (Drive çağrılarını azaltır)
let onbellek = { zaman: 0, veri: null };
async function klasorYapisi() {
  if (onbellek.veri && Date.now() - onbellek.zaman < 60_000) return onbellek.veri;
  const kok = DRIVE_KOK_KLASOR.value();
  if (!kok) throw new HttpsError('failed-precondition', 'Drive klasörü tanımlı değil.');
  const altKlasorler = await cocuklar(kok, true);
  const veri = {};
  for (const k of altKlasorler) {
    const anahtar = klasorAnahtari(k.name);
    if (!anahtar) continue;
    veri[anahtar] = { klasorId: k.id, ad: k.name, dosyalar: await cocuklar(k.id, false) };
  }
  onbellek = { zaman: Date.now(), veri };
  return veri;
}

exports.belgeler = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Giriş gerekli.');
  const bolumler = await izinliBolumler(req.auth.token);
  const yapi = await klasorYapisi();
  return bolumler
    .filter((b) => yapi[b])
    .map((b) => ({
      bolum: b,
      ad: yapi[b].ad,
      dosyalar: yapi[b].dosyalar.map((f) => ({
        id: f.id, ad: f.name, tur: f.mimeType,
        boyut: f.size ? Number(f.size) : null, tarih: f.modifiedTime, onizleme: !!f.hasThumbnail,
      })),
    }));
});

const DISA_AKTAR = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.drawing': 'application/pdf',
};

exports.belgeIndir = onRequest(
  { cors: ['https://hekim05.github.io', /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/] },
  async (req, res) => {
    try {
      const m = (req.get('Authorization') || '').match(/^Bearer (.+)$/);
      if (!m) return res.status(401).send('Giriş gerekli');
      const token = await admin.auth().verifyIdToken(m[1]);
      const bolumler = await izinliBolumler(token);

      const id = String(req.query.id || '');
      if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return res.status(400).send('Geçersiz dosya');

      // Dosya yalnızca kullanıcının izinli olduğu klasörlerden birinde ise verilir
      const yapi = await klasorYapisi();
      const bulundu = bolumler.some((b) => yapi[b] && yapi[b].dosyalar.some((f) => f.id === id));
      if (!bulundu) return res.status(403).send('Bu dosyaya erişim izni yok');

      const meta = await driveJson(`files/${id}`, { fields: 'name, mimeType, size' });
      let r, tur = meta.mimeType, ad = meta.name;
      if (DISA_AKTAR[meta.mimeType]) {
        tur = DISA_AKTAR[meta.mimeType];
        ad = ad.replace(/\.[^.]+$/, '') + '.pdf';
        r = await driveFetch(`files/${id}/export`, { mimeType: tur });
      } else {
        r = await driveFetch(`files/${id}`, { alt: 'media' });
      }
      if (!r.ok) return res.status(502).send('Dosya alınamadı');

      res.set('Content-Type', tur);
      res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(ad)}`);
      res.set('Cache-Control', 'private, no-store');
      Readable.fromWeb(r.body).pipe(res);
    } catch (e) {
      const kod = e instanceof HttpsError ? 403 : 500;
      console.error(e);
      res.status(kod).send(kod === 403 ? 'Erişim izni yok' : 'Sunucu hatası');
    }
  }
);

// Küçük önizleme resmi (doküman, fotoğraf, sunum kapağı). Yalnızca izinli klasörlerdeki dosyalar.
exports.belgeOnizleme = onRequest(
  { cors: ['https://hekim05.github.io', /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/] },
  async (req, res) => {
    try {
      const m = (req.get('Authorization') || '').match(/^Bearer (.+)$/);
      if (!m) return res.status(401).send('Giriş gerekli');
      const token = await admin.auth().verifyIdToken(m[1]);
      const bolumler = await izinliBolumler(token);
      const id = String(req.query.id || '');
      if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return res.status(400).send('Geçersiz dosya');
      const yapi = await klasorYapisi();
      if (!bolumler.some((b) => yapi[b] && yapi[b].dosyalar.some((f) => f.id === id))) return res.status(403).send('İzin yok');
      const boyut = Math.min(800, Math.max(120, Number(req.query.boyut) || 400));
      const meta = await driveJson(`files/${id}`, { fields: 'thumbnailLink, mimeType, size' });
      let r;
      if (meta.thumbnailLink) {
        const client = await auth.getClient();
        const { token: t } = await client.getAccessToken();
        r = await fetch(meta.thumbnailLink.replace(/=s\d+$/, '=s' + boyut), { headers: { Authorization: `Bearer ${t}` } });
      } else if (/^image\//.test(meta.mimeType) && Number(meta.size || 0) < 5e6) {
        r = await driveFetch(`files/${id}`, { alt: 'media' });
      }
      if (!r || !r.ok) return res.status(404).send('Önizleme yok');
      res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
      res.set('Cache-Control', 'private, max-age=3600');
      Readable.fromWeb(r.body).pipe(res);
    } catch (e) {
      console.error(e);
      res.status(e instanceof HttpsError ? 403 : 500).send('Hata');
    }
  }
);

// ---------- Sayaçlar (okuma maliyetini düşürür: herkes tüm tepkileri tek tek okumaz) ----------
const { onDocumentWritten, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { FieldValue } = require('firebase-admin/firestore');

exports.tepkiSay = onDocumentWritten('duyurular/{did}/tepkiler/{uid}', async (event) => {
  const once = event.data.before.exists ? event.data.before.data().emoji : null;
  const sonra = event.data.after.exists ? event.data.after.data().emoji : null;
  if (once === sonra) return;
  const ref = db.doc(`duyurular/${event.params.did}`);
  const guncel = {};
  if (once) guncel[`tepkiler.${once}`] = FieldValue.increment(-1);
  if (sonra) guncel[`tepkiler.${sonra}`] = FieldValue.increment(1);
  await ref.update(guncel).catch(() => {}); // duyuru silinmişse yok say
});

exports.yorumSay = onDocumentWritten('duyurular/{did}/yorumlar/{yid}', async (event) => {
  const fark = (event.data.after.exists ? 1 : 0) - (event.data.before.exists ? 1 : 0);
  if (!fark) return;
  await db.doc(`duyurular/${event.params.did}`)
    .update({ yorumSayisi: FieldValue.increment(fark) }).catch(() => {});
});

// Duyuru silinince yorum ve tepkileri de sil
exports.duyuruTemizle = onDocumentDeleted('duyurular/{did}', async (event) => {
  await db.recursiveDelete(db.doc(`duyurular/${event.params.did}`));
});

// ---------- Bildirimler ----------
async function gonder(tokenBelgeleri, baslik, govde, yol = '') {
  const liste = tokenBelgeleri.filter((d) => d.data().token);
  const adres = UYGULAMA_ADRESI.value() + yol;
  for (let i = 0; i < liste.length; i += 500) {
    const parca = liste.slice(i, i + 500);
    const cevap = await admin.messaging().sendEachForMulticast({
      tokens: parca.map((d) => d.data().token),
      webpush: {
        notification: { title: baslik, body: govde, icon: UYGULAMA_ADRESI.value() + 'icon-192.png' },
        fcmOptions: { link: adres },
      },
    });
    // Geçersiz jetonları temizle
    const silinecek = [];
    cevap.responses.forEach((r, j) => {
      const kod = r.error && r.error.code;
      if (kod === 'messaging/registration-token-not-registered' || kod === 'messaging/invalid-registration-token') {
        silinecek.push(parca[j].ref.delete());
      }
    });
    await Promise.all(silinecek);
  }
}

// Bir bostanın (ya da 'hepsi' için tüm) kursiyerlerine bildirim
async function bostanaGonder(bostan, baslik, govde, sekme) {
  let q = db.collection('bildirimTokenlari');
  if (bostan !== 'hepsi') q = q.where('bostan', '==', bostan);
  const snap = await q.get();
  await gonder(snap.docs, baslik, govde, '#' + sekme);
}

exports.duyuruBildir = onDocumentCreated('duyurular/{id}', async (event) => {
  const d = event.data && event.data.data();
  if (!d) return;
  const ozet = (d.ozet || d.metin || '').replace(/\s+/g, ' ').slice(0, 120);
  await bostanaGonder(d.bostan, (d.tip === 'makale' ? 'Yeni makale: ' : 'Yeni duyuru: ') + d.baslik, ozet, 'duyuru');
});

// Yönetici panelinden gelen bildirim istekleri (takvim eklemeleri vb.)
exports.bildirimIstegi = onDocumentCreated('bildirimIstekleri/{id}', async (event) => {
  const d = event.data && event.data.data();
  if (!d) return;
  try { await bostanaGonder(d.bostan, d.baslik, d.govde || '', d.sekme || 'duyuru'); }
  finally { await event.data.ref.delete(); }
});

// Drive'a yeni doküman eklendiğinde ilgili bostana bildirim (07:00–22:00 arası saatte bir)
exports.belgeKontrol = onSchedule({ schedule: '5 7-22 * * *', timeZone: 'Europe/Istanbul' }, async () => {
  onbellek = { zaman: 0, veri: null };
  const yapi = await klasorYapisi();
  const ref = db.doc('ayarlar/drive');
  const kayit = await ref.get();
  const ilkCalisma = !kayit.exists;
  const bilinen = new Set(ilkCalisma ? [] : kayit.data().bilinenler || []);
  const tumu = [];
  for (const [bolum, k] of Object.entries(yapi)) {
    const yeniler = k.dosyalar.filter((f) => !bilinen.has(f.id));
    k.dosyalar.forEach((f) => tumu.push(f.id));
    if (ilkCalisma || !yeniler.length) continue;
    const bostan = bolum === 'genel' ? 'hepsi' : bolum;
    const baslik = yeniler.length === 1 ? 'Yeni doküman: ' + yeniler[0].name : `${yeniler.length} yeni doküman eklendi`;
    await bostanaGonder(bostan, baslik, 'Dokümanlar bölümünden indirebilirsiniz.', 'belge');
  }
  await ref.set({ bilinenler: tumu, sonKontrol: FieldValue.serverTimestamp() });
});

exports.mesajBildir = onDocumentCreated('sorular/{kid}/mesajlar/{mid}', async (event) => {
  const m = event.data && event.data.data();
  if (!m) return;
  if (m.kimden === 'ekip') {
    const t = await db.doc(`bildirimTokenlari/${event.params.kid}`).get();
    if (t.exists) await gonder([t], 'Sorunuz cevaplandı', 'Bostan Pano Ekibi yanıt verdi.', '#soru');
  } else {
    const snap = await db.collection('yoneticiTokenlari').get();
    await gonder(snap.docs, 'Yeni soru', String(m.metin || '').slice(0, 120), 'yonetim.html#sorular');
  }
});
