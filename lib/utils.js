/* RING SATOE SALES — utils (port dari 01_utils.gs)
 * Plus helper bersama yang dipakai lintas api/*.js (pindahan dari 10_api.gs):
 * tabOf_, getStoreList_, apiGetStores, apiFindToko, apiLookupNik,
 * isShiftDone_, validateShiftSequence_, dayActuals_, recomputeS2Derived_,
 * collectDay_, beanspotSplit_, laporCfgGet_/Set_, requireAdminNik_,
 * requireKorwilNik_, flush_
 */
import {
  DB_ID, TAB, BLOCK_SIZE, N_STORES,
  MKT_WIDTH, MKT_KASIR_NIK, MKT_KASIR_NAMA,
  S2_WIDTH, S2_NIK_KASIR, S2_KASIR, S2_COLS, S2_FIELDS,
  laporCfgDefault_, NIK_KORWIL_,
  compNameOf_, hasS3_,
} from './config.js';
import { getDb as _getDb, trackSpreadsheet, flushAll, getSheetsClient } from './sheets.js';
import * as cache from './cache.js';

/* Pengganti getDb_() ala Apps Script (sync; Sheet method-nya yang async). */
export function getDb_() {
  return trackSpreadsheet(_getDb());
}

/* Pengganti SpreadsheetApp.flush() */
export async function flush_() {
  await flushAll();
}

export const BULAN_FULL_ = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12 };
export const BULAN_ABBR_ = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6, jul: 7, agu: 8, sep: 9, okt: 10, nov: 11, des: 12 };
export const NAMA_BULAN_ABBR_ = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const NAMA_HARI_ = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Waktu sekarang dalam WIB (UTC+7, tanpa DST) sebagai Date yang dibaca via getUTC*. */
function wibNow_() {
  return new Date(Date.now() + 7 * 3600 * 1000);
}

/** Parse tanggal ala sheet -> 'YYYY-MM-DD' atau null.
 *  Format: "01/07/2026", "Senin, 06 Juli 2026", "Minggu, 16 Agu 2026", "2026-10-03" */
export function parseTglID_(s) {
  if (s instanceof Date && !isNaN(s.getTime())) {
    return iso_([s.getFullYear(), s.getMonth() + 1, s.getDate()]);
  }
  if (typeof s === 'number' && s > 20000 && s < 100000) {
    // serial tanggal Sheets (sel tanggal tanpa format tanggal)
    const dt = new Date(Math.round((s - 25569) * 86400 * 1000));
    return iso_([dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]);
  }
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso_([+m[1], +m[2], +m[3]]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso_([+m[3], +m[2], +m[1]]);
  m = s.match(/^[A-Za-z]+,\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const bl = m[2].toLowerCase();
    const b = BULAN_FULL_[bl] || BULAN_ABBR_[bl];
    if (!b) return null;
    return iso_([+m[3], b, +m[1]]);
  }
  return null;
}

export function iso_(ymd) {
  const y = ymd[0], mo = ymd[1], d = ymd[2];
  return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
}

export function parts_(iso) {
  const p = iso.split('-');
  return { y: +p[0], m: +p[1], d: +p[2] };
}

/** 'YYYY-MM-DD' -> 'Rabu, 30 Sep 2026' (format blok terbaru sheet) */
export function fmtTglID_(iso) {
  const p = parts_(iso);
  const dt = new Date(p.y, p.m - 1, p.d);
  return NAMA_HARI_[dt.getDay()] + ', ' + p.d + ' ' + NAMA_BULAN_ABBR_[p.m] + ' ' + p.y;
}

/** Time factor: tgl/bln, format '96,77%' */
export function timeFactor_(iso) {
  const p = parts_(iso);
  const dim = new Date(p.y, p.m, 0).getDate();
  return fmtPct_(p.d / dim * 100);
}

/** Hari ini (Asia/Jakarta) -> 'YYYY-MM-DD' */
export function todayID_() {
  const d = wibNow_();
  return iso_([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]);
}

/** Sekarang menit sejak 00:00 WIB */
export function nowMinutes_() {
  const d = wibNow_();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Parse angka format Indonesia: "1.500.000" | "96,77%" | "2,064" | 123 -> number|null */
export function parseNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return null;
  const isPct = /%$/.test(s);
  s = s.replace(/%/g, '').trim();
  // "1.234,56" -> 1234.56 ; "1.500.000" -> 1500000 ; "96,77" -> 96.77 ; "2064" -> 2064
  if (/,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/\./g, '').replace(',', '');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return isPct ? n : n;
}

/** number -> 'Rp' ribuan ID: 1500000 -> '1.500.000' */
export function fmtRibuan_(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  const neg = n < 0;
  let s = String(Math.round(Math.abs(n)));
  s = s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + s;
}

/** number -> '96,8%' (1 desimal, koma) */
export function fmtPct_(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  return (Math.round(n * 10) / 10).toString().replace('.', ',') + '%';
}

/** sel % sheet -> string tampil: angka 0.9623 -> '96,2%'; teks dibiarkan */
export function pctStr_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return fmtPct_(v * 100);
  return String(v).trim();
}

/** true bila sekarang sudah lewat deadline lapor shift tsb (WIB). S2 = 00:30 keesokan harinya. */
export function deadlineLate_(shift, iso) {
  const p = parts_(iso);
  let dlMs;
  if (+shift === 2) dlMs = Date.UTC(p.y, p.m - 1, p.d + 1, 0, 30) - 7 * 3600 * 1000;
  else dlMs = Date.UTC(p.y, p.m - 1, p.d, +shift === 1 ? 17 : 9, 0) - 7 * 3600 * 1000;
  return Date.now() > dlMs;
}

/** Cari baris (1-based) blok tanggal di tab; 0 bila tidak ada */
export async function findBlockRow_(tab, iso) {
  const sh = getDb_().getSheetByName(tab);
  const col = await sh.getColumnValues(1);
  for (let i = 0; i < col.length; i++) {
    if (parseTglID_(col[i]) === iso) return i + 1;
  }
  return 0;
}

/** Semua blok {row, iso} di tab, urut tanggal menaik */
export async function getAllBlocks_(tab) {
  const sh = getDb_().getSheetByName(tab);
  const col = await sh.getColumnValues(1);
  const out = [];
  for (let i = 0; i < col.length; i++) {
    const iso = parseTglID_(col[i]);
    if (iso) out.push({ row: i + 1, iso });
  }
  out.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  return out;
}

/** Baca blok S1/S3 (komponen dinamis dari baris kategori).
 *  Return {iso, tf, comps:[{name,t,a,p}], stores:[{kode,toko,report,nik,nama,vals:{comp:{t,a}}}]} */
export async function readBlockMkt_(tab, dateRow) {
  const sh = getDb_().getSheetByName(tab);
  const nCols = MKT_WIDTH;
  const v = await sh.getValues(dateRow, 1, BLOCK_SIZE - 1, nCols); // tanpa baris kosong terakhir
  const iso = parseTglID_(v[0][0]);
  const tf = String(v[0][2] || '');
  // komponen dari baris kategori (row idx 1), mulai kolom F (idx 5), step 3; berhenti sebelum kolom kasir (idx 47)
  const hdr = v[2]; // baris CODE header
  const comps = [];
  for (let c = 5; c + 1 < MKT_KASIR_NIK; c += 3) {
    const name = String(v[1][c] || '').trim();
    if (!name || /KASIR/i.test(name)) break;
    const hasPct = String(hdr[c + 2] || '').toUpperCase().indexOf('ACV') >= 0;
    comps.push({ name, t: c, a: c + 1, p: hasPct ? c + 2 : -1 });
    if (!hasPct) break; // komponen terakhir tanpa ACV%
  }
  const stores = [];
  for (let r = 3; r < 3 + N_STORES; r++) {
    const row = v[r];
    if (!row || !String(row[0] || '').trim()) continue;
    const vals = {};
    for (let k = 0; k < comps.length; k++) {
      const cp = comps[k];
      vals[cp.name] = { t: parseNum_(row[cp.t]), a: parseNum_(row[cp.a]) };
    }
    stores.push({
      kode: String(row[0]).trim(), toko: String(row[1] || '').trim(),
      report: String(row[2] || '').trim(), nik: String(row[3] || '').trim(), nama: String(row[4] || '').trim(),
      nikKasir: String(row[MKT_KASIR_NIK] || '').trim(), kasir: String(row[MKT_KASIR_NAMA] || '').trim(),
      vals,
    });
  }
  return { iso, tf, comps, stores };
}

/** Baca blok S2 (layout tetap, kolom di S2_COLS) */
export async function readBlockS2_(dateRow) {
  const sh = getDb_().getSheetByName(TAB.S2);
  const v = await sh.getValues(dateRow, 1, BLOCK_SIZE - 1, S2_WIDTH);
  const iso = parseTglID_(v[0][0]);
  const tf = String(v[0][2] || '');
  const stores = [];
  for (let r = 3; r < 3 + N_STORES; r++) {
    const row = v[r];
    if (!row || !String(row[0] || '').trim()) continue;
    const vals = {};
    for (let fi = 0; fi < S2_FIELDS.length; fi++) {
      const cols = S2_COLS[S2_FIELDS[fi].key];
      const o = { t: parseNum_(row[cols.t]), a: parseNum_(row[cols.a]) };
      if (cols.ttl !== undefined) o.ttl = parseNum_(row[cols.ttl]);
      if (cols.sisa !== undefined) o.sisa = parseNum_(row[cols.sisa]);
      if (cols.fee !== undefined) o.fee = parseNum_(row[cols.fee]);
      vals[S2_FIELDS[fi].key] = o;
    }
    stores.push({
      kode: String(row[0]).trim(), toko: String(row[1] || '').trim(),
      report: String(row[2] || '').trim(), nik: String(row[3] || '').trim(), nama: String(row[4] || '').trim(),
      nikKasir: String(row[S2_NIK_KASIR] || '').trim(), kasir: String(row[S2_KASIR] || '').trim(),
      vals,
    });
  }
  return { iso, tf, stores };
}

/** Bikin blok tanggal baru: copy blok bertanggal TERBESAR (format+formula ikut), isi tanggal & TF baru,
 *  kosongkan REPORT/NIK/NAMA/ACTUAL tiap toko. Return baris tanggal baru. */
export async function createBlock_(tab, iso) {
  const ss = getDb_();
  const sh = ss.getSheetByName(tab);
  const blocks = await getAllBlocks_(tab);
  if (!blocks.length) throw new Error('Belum ada blok contoh di ' + tab);
  const src = blocks[blocks.length - 1].row;
  // posisi baru: setelah blok fisik terakhir
  const lastRow = await sh.getLastRow();
  let newRow = lastRow + 1;
  // grid template kecil (30 baris) — tambah baris bila blok baru melebihi grid
  const maxR = await sh.getMaxRows();
  if (newRow + BLOCK_SIZE - 1 > maxR) await sh.insertRowsAfter(maxR, newRow + BLOCK_SIZE - 1 - maxR);
  // pastikan 25 baris kosong tersedia (defensif)
  const colA = await sh.getValues(newRow, 1, BLOCK_SIZE, 1);
  let need = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) if (String(colA[i][0] || '').trim()) need = i + 1;
  if (need) newRow += need;
  const isS2 = (tab === TAB.S2);
  const nCols = isS2 ? S2_WIDTH : MKT_WIDTH;
  await sh.copyBlock(src, BLOCK_SIZE, nCols, newRow);
  // tanggal + TF (ditulis ISO via USER_ENTERED agar dikenali sebagai tanggal;
  // format tampilan mengikuti sel template yang di-copy)
  const dp = parts_(iso);
  sh.setValue(newRow, 1, new Date(dp.y, dp.m - 1, dp.d));
  sh.setValue(newRow, 3, timeFactor_(iso));
  // kosongkan sel input tiap toko (REPORT, NIK, NAMA, ACTUAL…)
  let actualCols = null;
  if (isS2) {
    actualCols = [2, 3, 4, S2_NIK_KASIR];
    S2_FIELDS.forEach((f) => {
      const cc = S2_COLS[f.key];
      actualCols.push(cc.a);
      if (cc.sisa !== undefined) actualCols.push(cc.sisa);
    });
  }
  for (let r = 0; r < N_STORES; r++) {
    const rr = newRow + 3 + r;
    if (!isS2 && !actualCols) {
      // baca komponen dari blok baru (hasil copy)
      const blk = await readBlockMkt_(tab, newRow);
      actualCols = [2, 3, 4, MKT_KASIR_NIK];
      for (const c of blk.comps) actualCols.push(c.a);
    }
    for (const c of actualCols) sh.clearCell(rr, c + 1);
  }
  // TTL & turunan S2 dikosongkan (dihitung saat save)
  if (isS2) {
    for (let r2 = 0; r2 < N_STORES; r2++) {
      const rr2 = newRow + 3 + r2;
      S2_FIELDS.forEach((f) => {
        const cc = S2_COLS[f.key];
        if (cc.p !== undefined) sh.clearCell(rr2, cc.p + 1);
        if (cc.ttl !== undefined) sh.clearCell(rr2, cc.ttl + 1);
        if (cc.fee !== undefined) sh.clearCell(rr2, cc.fee + 1);
      });
      sh.clearCell(rr2, S2_COLS.nett.gap + 1);
    }
  }
  await sh.flush();
  return newRow;
}

/** Ambil/siapkan baris blok untuk tanggal (bikin bila belum ada) */
export async function ensureBlock_(tab, iso) {
  const row = await findBlockRow_(tab, iso);
  if (row) return row;
  return createBlock_(tab, iso);
}

/** Cari baris toko dalam blok (1-based) */
export async function findStoreRow_(tab, dateRow, kode) {
  const sh = getDb_().getSheetByName(tab);
  const col = await sh.getValues(dateRow + 3, 1, N_STORES, 1);
  for (let i = 0; i < col.length; i++) {
    if (String(col[i][0] || '').trim().toUpperCase() === String(kode).toUpperCase()) return dateRow + 3 + i;
  }
  return 0;
}

/* ================= LAPORAN CABANG: helper ================= */
export const NAMA_BULAN_FULL_ = ['', 'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];

/** 'YYYY-MM-DD' +/- n hari */
export function addDaysISO_(iso, n) {
  const p = parts_(iso);
  const d = new Date(p.y, p.m - 1, p.d + n);
  return iso_([d.getFullYear(), d.getMonth() + 1, d.getDate()]);
}

/** peta iso -> baris blok tanggal per tab */
export async function blockMap_(tab) {
  const m = {};
  (await getAllBlocks_(tab)).forEach((b) => { m[b.iso] = b.row; });
  return m;
}

export function num0_(v) { return (v === null || v === undefined || isNaN(+v)) ? 0 : +v; }

/** 6474865447 -> "6.474.865.447" */
export function laporInt_(n) {
  n = Math.round(num0_(n));
  const neg = n < 0, s = String(Math.abs(n));
  return (neg ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 0.984,1 -> "98,4%" ; null -> "-" */
export function laporPct_(frac, dec) {
  if (frac === null || frac === undefined || !isFinite(frac)) return '-';
  return (frac * 100).toFixed(dec === undefined ? 1 : dec).replace('.', ',') + '%';
}

/** actual/target -> "98,4%" ; target 0 -> "-" */
export function laporAch_(a, t, dec) { return (t && t > 0) ? laporPct_(a / t, dec) : '-'; }

/** Sapaan WA menurut jam WIB */
export function laporSalam_() {
  const h = Math.floor(nowMinutes_() / 60);
  if (h < 11) return 'Selamat pagi pak,';
  if (h < 15) return 'Selamat siang pak,';
  if (h < 18) return 'Selamat sore pak,';
  return 'Selamat malam pak,';
}

/* ================= Helper bersama (pindahan dari 10_api.gs) ================= */

export function tabOf_(shift) {
  shift = +shift;
  if (shift === 2) return TAB.S2;
  if (shift === 3) return TAB.S3;
  return TAB.S1;
}

/** 20 toko dari blok terakhir SHIFT1# */
export async function getStoreList_() {
  const blocks = await getAllBlocks_(TAB.S1);
  if (!blocks.length) throw new Error('Belum ada blok di ' + TAB.S1);
  const blk = await readBlockMkt_(TAB.S1, blocks[blocks.length - 1].row);
  return blk.stores.map((s) => ({ kode: s.kode, nama: s.toko, s3: hasS3_(s.kode) }));
}

export async function apiGetStores() {
  const hit = cache.get('stores_v1');
  if (hit) return JSON.parse(hit);
  const out = await getStoreList_();
  cache.put('stores_v1', JSON.stringify(out), 600);
  return out;
}

export async function apiFindToko(kode) {
  kode = String(kode || '').trim().toUpperCase();
  const all = await apiGetStores();
  for (const t of all) {
    if (t.kode.toUpperCase() === kode) return t;
  }
  return null;
}

/** Cari nama dari NIK (tab DAKAR: B=Nik, C=Nama, D=POSITION, E=Toko) */
export async function apiLookupNik(nik) {
  nik = String(nik || '').trim();
  if (!nik) return null;
  const sh = getDb_().getSheetByName(TAB.DAKAR);
  const last = await sh.getLastRow();
  if (last < 2) return null;
  const v = await sh.getValues(2, 2, last - 1, 4); // B:E
  for (let i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() === nik) {
      return { nik, nama: String(v[i][1] || '').trim(), posisi: String(v[i][2] || '').trim(), toko: String(v[i][3] || '').trim() };
    }
  }
  return null;
}

export function requireAdminNik_(nik) {
  if (String(nik || '').trim().toUpperCase() !== 'ADMINR') throw new Error('Khusus admin');
}
export function requireKorwilNik_(nik) {
  nik = String(nik || '').trim().toUpperCase();
  if (nik !== 'ADMINR' && nik !== NIK_KORWIL_) throw new Error('Khusus korwil/admin');
}

/** Cek apakah shift sudah DONE untuk toko+tanggal. null = blok belum ada. */
export async function isShiftDone_(shift, iso, kode) {
  const tab = tabOf_(+shift);
  const row = await findBlockRow_(tab, iso);
  if (!row) return null; // blok tidak ada = belum ada kewajiban
  const blk = (+shift === 2) ? await readBlockS2_(row) : await readBlockMkt_(tab, row);
  for (const s of blk.stores) {
    if (String(s.kode || '').toUpperCase() === String(kode).toUpperCase()) {
      return String(s.report || '').toUpperCase().indexOf('DONE') >= 0;
    }
  }
  return false;
}


/* ============ APPROVAL BYPASS (admin) ============
 * Sheet APPROVAL: ID | Tanggal | Kode | Shift | Alasan | Oleh | Waktu
 * Jika ada approval aktif untuk (kode, iso, shift), validasi urutan shift di-skip.
 */
const APPROVAL_SHEET = 'APPROVAL';

async function ensureApprovalSheet_() {
  const client = getSheetsClient();
  const meta = await client.spreadsheets.get({
    spreadsheetId: DB_ID,
    fields: 'sheets.properties(title)',
  });
  const exists = (meta.data.sheets || []).some(s => s.properties.title === APPROVAL_SHEET);
  if (!exists) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId: DB_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: APPROVAL_SHEET } } }] },
    });
    // header
    const ss = _getDb();
    const sh = ss.getSheetByName(APPROVAL_SHEET);
    ['ID', 'Tanggal', 'Kode Toko', 'Shift', 'Alasan', 'Approved By', 'Waktu'].forEach((v, i) => sh.setValue(1, i + 1, v));
    await sh.flush();
  }
}

async function readApprovals_() {
  await ensureApprovalSheet_();
  const ss = _getDb();
  const sh = ss.getSheetByName(APPROVAL_SHEET);
  const rows = await sh.getValues(2, 1, 500, 7);
  const out = [];
  rows.forEach((r, i) => {
    if (!r[0] && !r[1] && !r[2]) return;
    out.push({ row: i + 2, id: String(r[0] || ''), iso: String(r[1] || ''), kode: String(r[2] || '').toUpperCase(), shift: +r[3] || 0, alasan: String(r[4] || ''), oleh: String(r[5] || ''), waktu: String(r[6] || '') });
  });
  return out;
}

/** Cek apakah ada approval untuk (kode, iso, shift). */
export async function hasApproval_(kode, iso, shift) {
  kode = String(kode || '').toUpperCase();
  shift = +shift;
  try {
    const list = await readApprovals_();
    return list.some(a => a.kode === kode && a.iso === iso && a.shift === shift);
  } catch (e) { return false; }
}

export async function approvalList_(nik) {
  requireAdminNik_(nik);
  return await readApprovals_();
}

export async function approvalAdd_(nik, kode, iso, shift, alasan) {
  requireAdminNik_(nik);
  kode = String(kode || '').toUpperCase().trim();
  iso = String(iso || '').trim();
  shift = +shift;
  alasan = String(alasan || '').trim();
  if (!kode) throw new Error('Pilih toko dulu');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Tanggal tidak valid');
  if (![1, 2, 3].includes(shift)) throw new Error('Shift tidak valid');
  if (!alasan) throw new Error('Isi alasan dulu');
  // cegah duplikat
  if (await hasApproval_(kode, iso, shift)) throw new Error('Approval sudah ada untuk ' + kode + ' ' + iso + ' SHIFT ' + shift);
  await ensureApprovalSheet_();
  const ss = _getDb();
  const sh = ss.getSheetByName(APPROVAL_SHEET);
  const id = 'AP' + Date.now().toString(36).toUpperCase();
  const now = new Date();
  const waktu = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const lastRow = await sh.getLastRow();
  const r = Math.max(lastRow + 1, 2);
  [id, iso, kode, shift, alasan, String(nik || '').toUpperCase(), waktu].forEach((v, i) => sh.setValue(r, i + 1, v));
  await sh.flush();
  return { ok: true, id };
}

export async function approvalDel_(nik, id) {
  requireAdminNik_(nik);
  id = String(id || '').trim();
  const list = await readApprovals_();
  const found = list.find(a => a.id === id);
  if (!found) throw new Error('Approval tidak ketemu');
  const ss = _getDb();
  const sh = ss.getSheetByName(APPROVAL_SHEET);
  // hapus baris: kosongkan
  for (let i = 1; i <= 7; i++) sh.setValue(found.row, i, '');
  await sh.flush();
  return { ok: true };
}

/** Validasi urutan laporan: S3>S1>S2 (tgl sama) + tgl sebelumnya sudah lapor. */
export async function validateShiftSequence_(shift, iso, kode) {
  shift = +shift;
  kode = String(kode || '').toUpperCase();
  // Bypass: jika ada approval admin untuk (kode, iso, shift), skip validasi urutan
  if (await hasApproval_(kode, iso, shift)) return;
  // 1. Urutan shift dalam tanggal yang sama
  if (shift === 1) {
    const s3done = await isShiftDone_(3, iso, kode);
    // Toko 3-shift: S1 hanya boleh jika S3 sudah DONE (blok belum ada = belum lapor)
    if (hasS3_(kode) && s3done !== true) {
      throw new Error('Shift 3 tanggal ' + fmtTglID_(iso) + ' belum laporan. Selesaikan Shift 3 dulu.');
    }
  } else if (shift === 2) {
    const s1done = await isShiftDone_(1, iso, kode);
    // S2 hanya boleh jika S1 sudah DONE (blok belum ada = belum lapor)
    if (s1done !== true) {
      throw new Error('Shift 1 tanggal ' + fmtTglID_(iso) + ' belum laporan. Selesaikan Shift 1 dulu.');
    }
  }
  // 2. Tanggal sebelumnya (shift yang sama) harus sudah lapor (jika bloknya ada)
  const prevIso = addDaysISO_(iso, -1);
  const prevDone = await isShiftDone_(shift, prevIso, kode);
  if (prevDone === false) {
    const d = prevIso.split('-');
    throw new Error('tgl ' + d[2] + '-' + d[1] + '-' + d[0].slice(2) + ' belum melakukan laporan');
  }
  // 3. Tidak boleh laporan untuk tanggal di masa depan
  const today = todayID_();
  if (iso > today) {
    throw new Error('Belum bisa laporan untuk tanggal ' + fmtTglID_(iso));
  }
}

/** Jumlah actual komponen TTL 1 toko dalam 1 tanggal lintas 3 shift -> {fieldKey: total|null} */
export async function dayActuals_(iso, kode) {
  const out = {};
  S2_FIELDS.forEach((f) => { if (f.ttl) out[f.key] = null; });
  function add_(key, a) {
    if (a !== null && a !== undefined) out[key] = (out[key] === null ? 0 : out[key]) + a;
  }
  for (const tab of [TAB.S1, TAB.S3]) {
    const dr = await findBlockRow_(tab, iso);
    if (!dr) continue;
    const b = await readBlockMkt_(tab, dr);
    const byName = {};
    b.comps.forEach((c) => { byName[c.name.toUpperCase().trim()] = c.name; });
    for (const s of b.stores) {
      if (s.kode.toUpperCase() !== kode) continue;
      S2_FIELDS.forEach((f) => {
        if (!f.ttl) return;
        const cn = byName[compNameOf_(f)];
        if (cn) add_(f.key, s.vals[cn].a);
      });
    }
  }
  const dr2 = await findBlockRow_(TAB.S2, iso);
  if (dr2) {
    const blk = await readBlockS2_(dr2);
    for (const s of blk.stores) {
      if (s.kode.toUpperCase() !== kode) continue;
      S2_FIELDS.forEach((f) => { if (f.ttl) add_(f.key, s.vals[f.key].a); });
    }
  }
  return out;
}

/** Hitung ulang turunan S2 untuk 1 toko: GAP & ACV% NETT SALES, ACV% lain, FEEBASE, TTL+ACV% komponen */
export async function recomputeS2Derived_(iso, s2srow, kode) {
  const sh = getDb_().getSheetByName(TAB.S2);
  const rowV = await sh.getValues(s2srow, 1, 1, S2_WIDTH);
  const row = rowV[0];
  const formulaRow = await sh.getFormulaFlags(s2srow, 1, 1, S2_WIDTH);
  const hasF = (c) => formulaRow[0][c];
  const get = (c) => parseNum_(row[c]);
  const set = (c, v) => { if (!hasF(c)) sh.setValue(s2srow, c + 1, v); };
  const C = S2_COLS;
  const nt = get(C.nett.t), na = get(C.nett.a);
  if (nt && na !== null) set(C.nett.p, fmtPct_(na / nt * 100));
  if (nt !== null && na !== null) set(C.nett.gap, nt - na);
  const ttlMap = await dayActuals_(iso, kode); // {fieldKey: total actual 3 shift}
  S2_FIELDS.forEach((f) => {
    if (f.key === 'nett') return;
    const cols = C[f.key];
    const t = get(cols.t), a = get(cols.a);
    if (f.kind === 'feebase') {
      if (a !== null) {
        const fee = a * 2000;
        set(cols.fee, fee);
        if (t) set(cols.p, fmtPct_(fee / t * 100));
      }
      return;
    }
    if (f.ttl) {
      const ttl = ttlMap[f.key];
      if (ttl !== null && ttl !== undefined) {
        set(cols.ttl, ttl);
        if (t) set(cols.p, fmtPct_(ttl / t * 100));
      } else if (t && a !== null) {
        set(cols.p, fmtPct_(a / t * 100));
      }
      return;
    }
    if (cols.p !== undefined && t && a !== null) set(cols.p, fmtPct_(a / t * 100));
  });
  await sh.flush();
}

/** Agregat 1 hari: Σ seluruh toko. ttl = Σ aktual S1+S2+S3 per komponen. */
export async function collectDay_(iso, maps) {
  const o = { nettT: 0, nettA: 0, stdT: 0, stdA: 0, plA: 0, brA: 0, evA: 0, feeRp: 0, sisaOS: 0, ttl: {}, s1t: {}, s1n: {} };
  const dr2 = maps.s2[iso];
  if (dr2) {
    const blk = await readBlockS2_(dr2);
    for (const s of blk.stores) {
      const v = s.vals;
      o.nettT += num0_(v.nett.t); o.nettA += num0_(v.nett.a);
      o.stdT += num0_(v.std.t);   o.stdA += num0_(v.std.a);
      o.plA += num0_(v.ploss.a);  o.brA += num0_(v.pbr.a);
      o.evA += num0_(v.evoucher.a); o.feeRp += num0_(v.feebase.fee);
      o.sisaOS += num0_(v.oneshoot.sisa);
      S2_FIELDS.forEach((f) => { if (f.ttl) o.ttl[f.key] = (o.ttl[f.key] || 0) + num0_(v[f.key].a); });
    }
  }
  for (const tab of [TAB.S1, TAB.S3]) {
    const dr = (tab === TAB.S1 ? maps.s1 : maps.s3)[iso];
    if (!dr) continue;
    const b = await readBlockMkt_(tab, dr);
    const byName = {};
    b.comps.forEach((c) => { byName[c.name.toUpperCase().trim()] = c; });
    for (const s of b.stores) {
      S2_FIELDS.forEach((f) => {
        if (!f.ttl) return;
        const c = byName[compNameOf_(f)];
        if (c) o.ttl[f.key] = (o.ttl[f.key] || 0) + num0_(s.vals[c.name].a);
      });
      if (tab === TAB.S1) b.comps.forEach((c) => {
        const tg = num0_(s.vals[c.name].t);
        o.s1t[c.name] = (o.s1t[c.name] || 0) + tg;
        if (tg > 0) o.s1n[c.name] = (o.s1n[c.name] || 0) + 1;
      });
    }
  }
  return o;
}

/** Target Beanspot harian dari TARGET_KHUSUS, dipecah RTD:ONIGIRI = 5:1 (flat S1 10:2).
 *  Return {rtd:{t,jta}, oni:{t,jta}} */
export async function beanspotSplit_(iso) {
  const sh = getDb_().getSheetByName(TAB.TARGET_KHUSUS);
  const v = await sh.getValues(4, 1, 60, 6);
  const p = parts_(iso), dow = new Date(p.y, p.m - 1, p.d).getDay();
  const ngopi = (dow === 1 || dow === 3 || dow === 5);
  const cfg = laporCfgGet_();
  const r = { rtd: { t: 0, jta: cfg.bjR || 17 }, oni: { t: 0, jta: cfg.bjO || 7 } };
  for (let i = 0; i < v.length; i++) {
    if (!String(v[i][0] || '').trim()) continue;
    const c = num0_(parseNum_(v[i][ngopi ? 3 : 2]));
    if (c > 0) {
      const rt = Math.round(c * 5 / 6);
      r.rtd.t += rt; r.oni.t += (c - rt);
    }
  }
  return r;
}

/* ---- Setting laporan: di Apps Script via ScriptProperties,
 * di Vercel via env LAPOR_CFG (JSON) + override in-memory per instance. ---- */
let cfgOverride_ = null;
export function laporCfgGet_() {
  const d = laporCfgDefault_();
  let raw = cfgOverride_ || process.env.LAPOR_CFG || null;
  if (raw) {
    try {
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      for (const k in d) if (o[k] !== undefined) d[k] = o[k];
    } catch (e) { /* abaikan */ }
  }
  return d;
}
export function laporCfgSet_(cfg) {
  cfgOverride_ = cfg;
}
