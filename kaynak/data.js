'use strict';
/* ===== Ortak veriler: renkler, standartlar, metinler ===== */
const D = {
  COLORS: [
    { id: 0, ad: 'Beyaz-Turuncu', kisa: 'B-Tur', base: '#f3f0e8', stripe: '#e8741a', pair: 0 },
    { id: 1, ad: 'Turuncu',       kisa: 'Tur',   base: '#e8741a', pair: 0 },
    { id: 2, ad: 'Beyaz-Yeşil',   kisa: 'B-Yeş', base: '#f3f0e8', stripe: '#2f9548', pair: 1 },
    { id: 3, ad: 'Yeşil',         kisa: 'Yeş',   base: '#2f9548', pair: 1 },
    { id: 4, ad: 'Beyaz-Mavi',    kisa: 'B-Mav', base: '#f3f0e8', stripe: '#2a5fc2', pair: 2 },
    { id: 5, ad: 'Mavi',          kisa: 'Mav',   base: '#2a5fc2', pair: 2 },
    { id: 6, ad: 'Beyaz-Kahve',   kisa: 'B-Kah', base: '#f3f0e8', stripe: '#7a4826', pair: 3 },
    { id: 7, ad: 'Kahverengi',    kisa: 'Kah',   base: '#7a4826', pair: 3 },
  ],
  STD: { B: [0, 1, 2, 5, 4, 3, 6, 7], A: [2, 3, 0, 5, 4, 1, 6, 7] },
  // pin eşleri (0 tabanlı): 1-2, 3-6, 4-5, 7-8
  PIN_MATES: [1, 0, 5, 4, 3, 2, 7, 6],
  PIN_PAIRS: [[0, 1], [2, 5], [3, 4], [6, 7]],
  CABLE_TYPES: {
    duz:    { ad: 'Düz kablo',    aciklama: 'Bilgisayar - switch/modem gibi farklı tür cihazlar arası. İki uç aynı standartta.' },
    capraz: { ad: 'Çapraz kablo', aciklama: 'Bilgisayar - bilgisayar gibi aynı tür cihazlar arası. Bir uç T568A, diğer uç T568B.' },
    konsol: { ad: 'Konsol (rollover) kablo', aciklama: 'Yönetilebilir switch/router konsol bağlantısı. İkinci uç birinci ucun tam tersi sırada.' },
  },
  FAULTS: {
    acik:     { ad: 'Açık devre (open)',        kisa: 'Açık devre' },
    kisa:     { ad: 'Kısa devre (short)',       kisa: 'Kısa devre' },
    ters:     { ad: 'Ters çift (reversed pair)', kisa: 'Ters çift' },
    capraz:   { ad: 'Çapraz çift (crossed pair)', kisa: 'Çapraz çift' },
    yanlis:   { ad: 'Yanlış bağlantı (miswire)', kisa: 'Yanlış bağlantı' },
    bolunmus: { ad: 'Bölünmüş çift (split pair)', kisa: 'Bölünmüş çift' },
  },
  CAUSES: {
    sira:      { ad: 'Renk sıralaması yanlış yapıldı', anahtar: ['sira', 'sirala', 'renk', 'dizil', 'dizme', 'yer degis', 'yerleri degis', 'karis', 'yanlis tel', 'standart', '568', 'tel yeri', 'yanlis yer', 'yanlis siraya'] },
    yon:       { ad: 'Konnektör ters tutularak takıldı', anahtar: ['ters tak', 'ters tut', 'konnektor ters', 'klips', 'yon', 'cevir', 'tersten', 'ters dur', 'ters yerles', 'ayna', 'alt ust'] },
    kisakesim: { ad: 'Teller çok kısa kesildi, pinlere ulaşmadı', anahtar: ['kisa kes', 'kisa kal', 'kisa', 'ulasma', 'ulasmi', 'yetisme', 'erisme', 'boy'] },
    itme:      { ad: 'Teller konnektörün sonuna kadar itilmedi', anahtar: ['itil', 'itme', 'sonuna', 'ucuna', 'dayan', 'ulasma', 'tam gir', 'tam yerles', 'ittir'] },
    pense:     { ad: 'Pense tam sıkılmadı, pinler tellere basmadı', anahtar: ['pense', 'sik', 'cak', 'bastir', 'tam kapan', 'pin', 'kontak', 'basma', 'kuvvet', 'guc'] },
    karisik:   { ad: 'İki uçta farklı standart kullanıldı', anahtar: ['568a', '568b', 'farkli standart', 'iki uc', 'uclar farkli', 'a ve b', 'a ile b', 'biri a', 'standart'] },
    hazir:     { ad: 'Hazır (atölyede verilen) kabloda üretim hatası', anahtar: [] },
  },
  FIX_WORDS: ['kes', 'yeniden', 'tekrar', 'yeni konnektor', 'bastan', 'duzelt', 'sirala', 'yeni bastan', 'degistir', 'yeniden cak', 'tekrar cak', 'sik', 'bastir', 'it'],
  DEFAULTS: {
    std: 'B', stdMode: 'sabit', cableType: 'duz', mode: 'alistirma', showCard: true,
    end2: 'ogrenci', loadBar: false, diag: false, timeLimit: 0, aiEval: true,
    gasUrl: '', pinHash: '', className: '',
  },
};
D.colorName = id => D.COLORS[id].ad;
D.stdName = s => 'T568' + s;

/* Türkçe metni karşılaştırma için sadeleştir */
function trNorm(s) {
  return (' ' + String(s || '') + ' ').toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a').replace(/î/g, 'i')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
}

/* Basit karma (öğretmen PIN'i için) */
function pinHash(pin) {
  let h = 2166136261 >>> 0;
  const s = 'rj45-atolye:' + pin;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

/* ===== Wiremap: bağlantı haritası ve hata sınıflama ===== */
const Wire = {
  // Bir ucun pin->renk dizisi (sıra + konnektör yönü)
  pinColors(order, flipped) {
    const out = [];
    for (let p = 0; p < 8; p++) out.push(order[flipped ? 7 - p : p]);
    return out;
  },
  expectedOrders(task) {
    const s1 = D.STD[task.std];
    if (task.type === 'capraz') return [s1.slice(), D.STD[task.std === 'B' ? 'A' : 'B'].slice()];
    if (task.type === 'konsol') return [s1.slice(), s1.slice().reverse()];
    return [s1.slice(), s1.slice()];
  },
  // end: {pinColor[8], ok[8]}
  map(e1, e2) {
    const m = [];
    for (let p = 0; p < 8; p++) {
      const qs = [];
      if (e1.ok[p]) {
        const c = e1.pinColor[p];
        for (let q = 0; q < 8; q++) if (e2.pinColor[q] === c && e2.ok[q]) qs.push(q);
      }
      m.push(qs);
    }
    return m;
  },
  expectedMap(task) {
    const [o1, o2] = Wire.expectedOrders(task);
    const ok = [1, 1, 1, 1, 1, 1, 1, 1];
    return Wire.map({ pinColor: o1, ok }, { pinColor: o2, ok });
  },
  // Gerçek haritayı beklenenle karşılaştır
  classify(map, exp) {
    const faults = new Set();
    const pins = { acik: [], kisa: [], ters: [], capraz: [], yanlis: [] };
    const wrong = [];
    for (let p = 0; p < 8; p++) {
      if (map[p].length === 0) { faults.add('acik'); pins.acik.push(p + 1); }
      else if (map[p].length > 1) { faults.add('kisa'); pins.kisa.push(p + 1); }
      else if (map[p][0] !== exp[p][0]) wrong.push(p);
    }
    const handled = new Set();
    // Ters çift
    for (const p of wrong) {
      if (handled.has(p)) continue;
      const m = D.PIN_MATES[p];
      if (wrong.includes(m) && map[p][0] === exp[m][0] && map[m][0] === exp[p][0]) {
        faults.add('ters'); pins.ters.push(Math.min(p, m) + 1 + '-' + (Math.max(p, m) + 1));
        handled.add(p); handled.add(m);
      }
    }
    // Çapraz çift (bir çift başka bir çiftin yerine)
    const pairOf = p => D.PIN_PAIRS.findIndex(pp => pp.includes(p));
    for (const p of wrong) {
      if (handled.has(p)) continue;
      const pa = D.PIN_PAIRS[pairOf(p)];
      const tgt = map[p][0];
      const pb = D.PIN_PAIRS.find(pp => pp.some(x => exp[x][0] === tgt));
      if (!pb || pb === pa) continue;
      const mate = pa[0] === p ? pa[1] : pa[0];
      const okA = pa.every(x => map[x].length === 1 && pb.some(y => exp[y][0] === map[x][0]));
      const okB = pb.every(x => map[x].length === 1 && pa.some(y => exp[y][0] === map[x][0]));
      if (okA && okB) {
        faults.add('capraz');
        pins.capraz.push(pa.map(x => x + 1).join(',') + ' ↔ ' + pb.map(x => x + 1).join(','));
        [...pa, ...pb].forEach(x => handled.add(x));
        void mate;
      }
    }
    for (const p of wrong) if (!handled.has(p)) { faults.add('yanlis'); pins.yanlis.push(p + 1); }
    return { faults: [...faults], pins, pass: faults.size === 0 };
  },
  // Bir uçta çift bölünmesi var mı? (pin eşleri aynı bükümlü çiftten mi)
  splitPairs(pinColor) {
    const out = [];
    for (const [a, b] of D.PIN_PAIRS) {
      if (D.COLORS[pinColor[a]].pair !== D.COLORS[pinColor[b]].pair) out.push((a + 1) + '-' + (b + 1));
    }
    return out;
  },
};
