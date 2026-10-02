/* Input — port dari 10_api.gs: apiGetBlock, apiNotif, apiNotifToko */
import { TAB, DEADLINE_LABEL, LAPOR_WINDOW_, S2_FIELDS, hasS3_ } from '../lib/config.js';
import {
  tabOf_, findBlockRow_, getAllBlocks_, readBlockMkt_, readBlockS2_,
  fmtTglID_, timeFactor_, todayID_, nowMinutes_, addDaysISO_,
  requireKorwilNik_, validateShiftSequence_,
} from '../lib/utils.js';
import { apiStatus } from './dashboard.js';

/** Data blok untuk form input: komponen/field + target + nilai toko ini (bila sudah lapor) */
export async function apiGetBlock(shift, iso, kode) {
  shift = +shift;
  const tab = tabOf_(shift);
  kode = String(kode || '').trim().toUpperCase();
  if (shift === 3 && !hasS3_(kode)) throw new Error('Toko ' + kode + ' tidak punya Shift 3');
  await validateShiftSequence_(shift, iso, kode);
  const row = await findBlockRow_(tab, iso);

  if (shift === 2) {
    const fields = S2_FIELDS.map((f) => ({
      key: f.key, label: f.label, section: f.section, kind: f.kind || '', ttl: !!f.ttl, hint: f.hint || '',
    }));
    const blocks = await getAllBlocks_(tab);
    // blok sumber target: blok tanggal ini bila ada, else blok terakhir
    const srcRow = row || (blocks.length ? blocks[blocks.length - 1].row : 0);
    if (!srcRow) throw new Error('Belum ada data di ' + tab);
    const blk = await readBlockS2_(srcRow);
    let mine = null;
    const tg = {};
    for (const st of blk.stores) {
      if (st.kode.toUpperCase() !== kode) continue;
      S2_FIELDS.forEach((f) => { tg[f.key] = st.vals[f.key].t; });
      if (row) mine = { report: st.report, nik: st.nik, nama: st.nama, nikKasir: st.nikKasir, vals: st.vals };
      break;
    }
    return { exists: !!row, mode: 's2', fields, targets: tg, mine, tf: row ? blk.tf : timeFactor_(iso) };
  }

  // S1 / S3 — komponen dinamis dari baris kategori
  const blocks2 = await getAllBlocks_(tab);
  const blkRow = row || (blocks2.length ? blocks2[blocks2.length - 1].row : 0);
  if (!blkRow) throw new Error('Belum ada data di ' + tab);
  const blk2 = await readBlockMkt_(tab, blkRow);
  const comps = blk2.comps.map((c) => ({ name: c.name, hasPct: c.p >= 0 }));
  const tg3 = {};
  let mine3 = null;
  for (const st3 of blk2.stores) {
    if (st3.kode.toUpperCase() !== kode) continue;
    blk2.comps.forEach((c) => { tg3[c.name] = st3.vals[c.name].t; });
    if (row) mine3 = { report: st3.report, nik: st3.nik, nama: st3.nama, nikKasir: st3.nikKasir, vals: st3.vals };
    break;
  }
  return { exists: !!row, mode: 'mkt', comps, targets: tg3, mine: mine3, tf: row ? blk2.tf : timeFactor_(iso) };
}

/** true bila menit-sejak-00:00 (WIB) masuk jendela periode laporan shift tsb. */
export function inLaporWindow_(shift, nowMin) {
  const w = LAPOR_WINDOW_[shift];
  if (w.s <= w.e) return nowMin >= w.s && nowMin < w.e;
  return nowMin >= w.s || nowMin < w.e; /* lewat tengah malam (S2 21.00-03.00) */
}

/** Tanggal laporan shift tsb: S2 jam 00.00-03.00 masih milik laporan kemarin. */
export function laporIso_(shift, nowMin, isoToday) {
  if (+shift === 2 && nowMin < 3 * 60) {
    return addDaysISO_(isoToday, -1);
  }
  return isoToday;
}

/** Notif toko belum lapor — khusus korwil/admin. Daftar "belum" hanya relevan
    bila waktu sekarang (WIB) masuk jendela periode laporan shift tsb. */
export async function apiNotif(nik) {
  requireKorwilNik_(nik);
  const isoToday = todayID_();
  const nowMin = nowMinutes_();
  const hh = ('0' + Math.floor(nowMin / 60)).slice(-2) + '.' + ('0' + (nowMin % 60)).slice(-2);
  const shifts = {};
  for (const shift of [3, 1, 2]) {
    const iso = laporIso_(shift, nowMin, isoToday);
    const st = await apiStatus(iso);
    const list = st.shifts[shift].list;
    const miss = [];
    list.forEach((x) => { if (!x.done) miss.push({ kode: x.kode, toko: x.toko }); });
    shifts[shift] = {
      iso,
      inWindow: inLaporWindow_(shift, nowMin),
      winLabel: LAPOR_WINDOW_[shift].label,
      deadline: DEADLINE_LABEL[shift],
      nDone: list.length - miss.length,
      nTotal: list.length,
      miss,
    };
  }
  return { ok: true, tgl: fmtTglID_(isoToday), nowWIB: hh, shifts };
}

/** Notif belum-lapor untuk 1 toko (tanpa auth): hanya shift dalam jendela waktu. */
export async function apiNotifToko(kode) {
  kode = String(kode || '').trim().toUpperCase();
  if (!kode) throw new Error('Kode toko kosong');
  const isoToday = todayID_();
  const nowMin = nowMinutes_();
  const hh = ('0' + Math.floor(nowMin / 60)).slice(-2) + '.' + ('0' + (nowMin % 60)).slice(-2);
  const miss = [];
  for (const shift of [3, 1, 2]) {
    if (!inLaporWindow_(shift, nowMin)) continue;
    const iso = laporIso_(shift, nowMin, isoToday);
    const st = await apiStatus(iso);
    const list = st.shifts[String(shift)].list;
    for (const x of list) {
      if (String(x.kode || '').toUpperCase() === kode && !x.done) {
        miss.push({ shift, label: 'SHIFT ' + shift, deadline: st.shifts[String(shift)].deadline });
        break;
      }
    }
  }
  return { ok: true, kode, tgl: fmtTglID_(isoToday), nowWIB: hh, miss };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, shift, iso, kode, nik } = req.body || {};
  try {
    switch (action) {
      case 'getblock':  return res.status(200).json(await apiGetBlock(shift, iso, kode));
      case 'notif':     return res.status(200).json(await apiNotif(nik));
      case 'notiftoko': return res.status(200).json(await apiNotifToko(kode));
      default:          return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
