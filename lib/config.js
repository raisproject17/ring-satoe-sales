/* RING SATOE SALES — config (port dari 00_config.gs) */
export const DB_ID = '1YNNIenONWOcWq11be86xYWYbPoSfPnphfOUrJAL6PTE';

export const TAB = {
  S1: 'SHIFT1#',
  S2: 'SHIFT2#',
  S3: 'SHIFT3#',
  DAKAR: 'DAKAR',
  TARGET_KHUSUS: 'TARGET_KHUSUS'
};

export const BLOCK_SIZE = 25;   // tiap blok tanggal = 25 baris
export const N_STORES = 20;     // jumlah toko

/* Toko yang punya SHIFT 3 (keputusan user 2026-10-02); 15 toko lain hanya S1+S2 */
export const SHIFT3_STORES = ['2G20', 'T043', 'T819', 'T880', 'TB43'];

// deadline lapor per shift (S2 lewat tengah malam)
export const DEADLINE_LABEL = { 1: '17.00', 2: '00.30', 3: '09.00' };

/* Jendela periode laporan per shift (WIB). Notif "belum lapor" hanya aktif
   bila waktu sekarang masuk jendela ini. S2 21.00-03.00 lewat tengah malam. */
export const LAPOR_WINDOW_ = {
  3: { s: 5 * 60, e: 9 * 60, label: '05.00–09.00' },
  1: { s: 13 * 60, e: 18 * 60, label: '13.00–18.00' },
  2: { s: 21 * 60, e: 3 * 60, label: '21.00–03.00' }
};

/* SHIFT1#/SHIFT3#: kolom kasir (0-based) */
export const MKT_WIDTH = 49;        // A..AW
export const MKT_KASIR_NIK = 47;    // AV
export const MKT_KASIR_NAMA = 48;   // AW

/* Layout tetap SHIFT2# — index kolom 0-based dari kolom A.
   t=TARGET, a=ACTUAL (oneshoot: SALES), p=ACV%, ttl=TTL 3 shift,
   sisa=SISA STOCK (oneshoot), fee=FEEBASE hasil qty*2000 (feebase) */
export const S2_WIDTH = 84;         // A..CF
export const S2_NIK_KASIR = 82;     // CE
export const S2_KASIR = 83;         // CF
export const S2_COLS = {
  nett:    { t: 5,  a: 6,  p: 7,  gap: 8 },
  std:     { t: 9,  a: 10, p: 11 },
  psm:     { t: 12, a: 13, ttl: 14, p: 15 },
  pwp:     { t: 16, a: 17, ttl: 18, p: 19 },
  sertis:  { t: 20, a: 21, ttl: 22, p: 23 },
  ploss:   { t: 24, a: 25, p: 26 },
  pbr:     { t: 27, a: 28, p: 29 },
  telur:   { t: 30, a: 31, ttl: 32, p: 33 },
  toys:    { t: 34, a: 35, ttl: 36, p: 37 },
  hotweel: { t: 38, a: 39, ttl: 40, p: 41 },
  djoy:    { t: 42, a: 43, ttl: 44, p: 45 },
  unipin:  { t: 46, a: 47, ttl: 48, p: 49 },
  oneshoot:{ t: 50, a: 51, sisa: 52, ttl: 53, p: 54 },
  suegerr: { t: 55, a: 56, ttl: 57, p: 58 },
  ceban:   { t: 59, a: 60, ttl: 61, p: 62 },
  jsm:     { t: 63, a: 64, ttl: 65, p: 66 },
  rtd:     { t: 67, a: 68, ttl: 69, p: 70 },
  onigiri: { t: 71, a: 72, ttl: 73, p: 74 },
  evoucher:{ t: 75, a: 76, p: 77 },
  feebase: { t: 78, a: 79, fee: 80, p: 81 },
  gm:      { t: 82, a: 83 }
};

/* Field form SHIFT2 (closing). comp = nama komponen di SHIFT1#/SHIFT3# (utk TTL). */
export const S2_FIELDS = [
  { key: 'nett',    label: 'NETT SALES',           section: 'REVENUE',      kind: 'rp' },
  { key: 'std',     label: 'STD',                  section: 'REVENUE' },
  { key: 'gm',      label: 'GM%',                  section: 'REVENUE', kind: 'pct', hint: 'input GM% rata-rata' },
  { key: 'psm',     label: 'PSM',                  section: 'MARKETING',    ttl: true },
  { key: 'pwp',     label: 'PWP',                  section: 'MARKETING',    ttl: true },
  { key: 'sertis',  label: 'SERTIS',               section: 'MARKETING',    ttl: true },
  { key: 'ploss',   label: 'PRODUCT LOSS',         section: 'INVENTORY' },
  { key: 'pbr',     label: 'PRODUCT BR',           section: 'INVENTORY' },
  { key: 'telur',   label: 'TELUR (PACK)',         section: 'FOKUS CABANG', ttl: true, comp: 'TELUR (PACK)' },
  { key: 'toys',    label: 'TOYS (QTY)',           section: 'FOKUS CABANG', ttl: true, comp: 'TOYS' },
  { key: 'hotweel', label: 'HOTWEEL BASIC (QTY)',  section: 'FOKUS CABANG', ttl: true, comp: 'HOTWEEL' },
  { key: 'djoy',    label: 'DJOY',                 section: 'FOKUS CABANG', ttl: true },
  { key: 'unipin',  label: 'UNIPIN',               section: 'FOKUS CABANG', ttl: true },
  { key: 'oneshoot',label: 'ONESHOOT (SHAPED BOTTLE)', section: 'FOKUS CABANG', ttl: true, kind: 'oneshoot', comp: 'ONESHOOT ( BOTTOL)' },
  { key: 'suegerr', label: 'SUEGERR',              section: 'FOKUS CABANG', ttl: true, comp: 'SUEGER' },
  { key: 'ceban',   label: 'CEBAN',                section: 'FOKUS CABANG', ttl: true },
  { key: 'jsm',     label: 'FOKUS JSM (MINYAK)',   section: 'FOKUS CABANG', ttl: true, comp: 'JSM (MINYAK)' },
  { key: 'rtd',     label: 'RTD',                  section: 'BEANSPOT',     ttl: true },
  { key: 'onigiri', label: 'ONIGIRI',              section: 'BEANSPOT',     ttl: true },
  { key: 'evoucher',label: 'EVOUCHER',             section: 'E-COMMERCE' },
  { key: 'feebase', label: 'FEE BASE (QTY X 2000)',  section: 'E-COMMERCE',   kind: 'feebase' }
];

/* nama komponen S1/S3 untuk field S2 (TTL) */
export function compNameOf_(f) { return (f.comp || f.label).toUpperCase().trim(); }
export function hasS3_(kode) { return SHIFT3_STORES.indexOf(String(kode).toUpperCase()) >= 0; }

/* ================= LAPORAN CABANG (format WhatsApp) ================= */
/* Target flat harian per toko (fallback bila blok S1 tgl tsb belum ada) */
export const LAPOR_FLAT_ = {
  'TELUR (PACK)': 5, 'TOYS': 2, 'HOTWEEL': 2, 'DJOY': 2, 'UNIPIN': 2,
  'ONESHOOT ( BOTTOL)': 2, 'SUEGER': 25, 'JSM (MINYAK)': 6
};
export const LAPOR_EVOUCHER_T_ = 500000;   /* target E-VOUCHER per toko per hari (fixed) */
export const LAPOR_FEEBASE_T_  = 1000000;  /* target FEE BASE per toko per hari (fixed) */
export const LAPOR_CFG_KEY_ = 'LAPOR_CFG'; /* setting laporan: di Vercel via env LAPOR_CFG (JSON) */
export function laporCfgDefault_() {
  return { cabang: 'RING SATOE', ac: '', am: '', jml: 20, reg: 20, fr: 0,
           psmW: [0, 0, 0, 0], pwpP: [0, 0], sgP: [0, 0],
           bjR: 17, bjO: 7 }; /* JTA Beanspot: RTD 17 toko, ONIGIRI 7 toko */
}

/* NIK khusus: admin (Rais, bisa lapor utk 2GAH Kepandean) & korwil (Abud Ubaidillah) */
export const NIK_ADMIN_ = '17114447';
export const NIK_KORWIL_ = '04060226';
