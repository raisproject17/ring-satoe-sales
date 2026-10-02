/* Target & Beanspot — port dari 10_api.gs:
 * apiTargetGet, apiTargetSet, apiBeanspot */
import { TAB, S2_COLS, hasS3_ } from '../lib/config.js';
import {
  getDb_, findBlockRow_, findStoreRow_, readBlockMkt_, readBlockS2_,
  tabOf_, ensureBlock_, parseNum_, fmtPct_, fmtTglID_, parts_, todayID_,
  apiGetStores, apiFindToko,
  requireAdminNik_, laporCfgGet_, laporCfgSet_, flush_,
} from '../lib/utils.js';

/** Ambil target NETT SALES & STD per toko untuk blok S2 tanggal iso + target cabang. */
export async function apiTargetGet(nik, iso) {
  requireAdminNik_(nik);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) throw new Error('Tanggal tidak valid');
  const cfg = laporCfgGet_();
  const dr = await findBlockRow_(TAB.S2, iso);
  const sh = getDb_().getSheetByName(TAB.S2);
  const stores = (await apiGetStores()).map((t) => ({ kode: t.kode, nama: t.nama, nett: null, std: null }));
  if (dr) {
    for (const s of stores) {
      const r = await findStoreRow_(TAB.S2, dr, s.kode);
      if (!r) continue;
      const nt = parseNum_(await sh.getValue(r, S2_COLS.nett.t + 1));
      const st = parseNum_(await sh.getValue(r, S2_COLS.std.t + 1));
      if (nt !== null) s.nett = nt;
      if (st !== null) s.std = st;
    }
  }
  return { ok: true, iso, stores, psmW: cfg.psmW, pwpP: cfg.pwpP, sgP: cfg.sgP };
}

/** Simpan target: NETT SALES & STD per toko ke blok S2 tanggal iso + target cabang. */
export async function apiTargetSet(nik, iso, data) {
  requireAdminNik_(nik);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) throw new Error('Tanggal tidak valid');
  data = data || {};
  const sh = getDb_().getSheetByName(TAB.S2);
  const dateRow = await ensureBlock_(TAB.S2, iso);
  for (const s of (data.stores || [])) {
    const kode = String(s.kode || '').trim().toUpperCase();
    if (!(await apiFindToko(kode))) continue;
    const r = await findStoreRow_(TAB.S2, dateRow, kode);
    if (!r) continue;
    const nt = parseNum_(s.nett), st = parseNum_(s.std);
    if (nt !== null) sh.setValue(r, S2_COLS.nett.t + 1, nt); else sh.clearCell(r, S2_COLS.nett.t + 1);
    if (st !== null) sh.setValue(r, S2_COLS.std.t + 1, st); else sh.clearCell(r, S2_COLS.std.t + 1);
  }
  const cfg = laporCfgGet_();
  /* REPLACE bersih: data upload/manual menimpa total. Hanya kolom yang ada
     di input yang ditimpa; kolom yang tidak ada dipertahankan. */
  function hasData(v) {
    v = v || [];
    for (let i = 0; i < v.length; i++) { if (parseNum_(v[i]) !== null) return true; }
    return false;
  }
  function arrNew(v, n) {
    v = v || [];
    const o = [];
    for (let i = 0; i < n; i++) { const x = parseNum_(v[i]); o.push(x === null ? 0 : Math.max(0, x)); }
    return o;
  }
  if (hasData(data.psmW)) cfg.psmW = arrNew(data.psmW, 4);
  if (hasData(data.pwpP)) cfg.pwpP = arrNew(data.pwpP, 2);
  if (hasData(data.sgP)) cfg.sgP = arrNew(data.sgP, 2);
  laporCfgSet_(cfg);
  await flush_();
  return { ok: true };
}

/** Laporan khusus Beanspot (target real qty dari TARGET_KHUSUS).
 *  Actual per shift = RTD + ONIGIRI. Ngopi Day = Senin/Rabu/Jumat. */
export async function apiBeanspot(nik, iso) {
  requireAdminNik_(nik);
  if (!iso) iso = todayID_();
  const sh = getDb_().getSheetByName(TAB.TARGET_KHUSUS);
  const v = await sh.getValues(4, 1, 60, 6);
  const p = parts_(iso);
  const dow = new Date(p.y, p.m - 1, p.d).getDay(); // 0=Minggu
  const ngopi = (dow === 1 || dow === 3 || dow === 5);

  const acts = {}; // kode -> {1,2,3}
  function addAct(kode, shift, val) {
    if (!acts[kode]) acts[kode] = { 1: null, 2: null, 3: null };
    if (val !== null && val !== undefined) {
      acts[kode][shift] = (acts[kode][shift] === null ? 0 : acts[kode][shift]) + val;
    }
  }
  for (const shift of [1, 3]) {
    const tab = tabOf_(shift);
    const dr = await findBlockRow_(tab, iso);
    if (!dr) continue;
    const b = await readBlockMkt_(tab, dr);
    const names = {};
    b.comps.forEach((c) => { names[c.name.toUpperCase().trim()] = c.name; });
    b.stores.forEach((s) => {
      let tot = null;
      ['RTD', 'ONIGIRI'].forEach((cn) => {
        const real = names[cn];
        if (real) {
          const a = s.vals[real].a;
          if (a !== null) tot = (tot === null ? 0 : tot) + a;
        }
      });
      addAct(s.kode, shift, tot);
    });
  }
  const dr2 = await findBlockRow_(TAB.S2, iso);
  if (dr2) {
    (await readBlockS2_(dr2)).stores.forEach((s) => {
      let tot = null;
      ['rtd', 'onigiri'].forEach((k) => {
        const a = s.vals[k].a;
        if (a !== null) tot = (tot === null ? 0 : tot) + a;
      });
      addAct(s.kode, 2, tot);
    });
  }

  const rows = [];
  for (let i = 0; i < v.length; i++) {
    const kode = String(v[i][0] || '').trim().toUpperCase();
    if (!kode) continue;
    const reg = parseNum_(v[i][2]) || 0, ngo = parseNum_(v[i][3]) || 0;
    const t1 = parseNum_(v[i][4]) || 0, t3 = parseNum_(v[i][5]) || 0;
    if (!(reg + ngo + t1 + t3 > 0)) continue;
    const tHarian = ngopi ? ngo : reg;
    const a = acts[kode] || { 1: null, 2: null, 3: null };
    let total = null;
    [1, 2, 3].forEach((sx) => {
      if (a[sx] !== null) total = (total === null ? 0 : total) + a[sx];
    });
    rows.push({
      kode, nama: String(v[i][1] || '').trim(),
      tHarian, t1, t2: Math.max(tHarian - t1 - t3, 0), t3,
      a1: a[1], a2: a[2], a3: hasS3_(kode) ? a[3] : null, hasS3: hasS3_(kode),
      total, acv: (tHarian && total !== null) ? fmtPct_(total / tHarian * 100) : '',
    });
  }
  return { iso, tgl: fmtTglID_(iso), ngopi, rows };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, nik, iso, data } = req.body || {};
  try {
    switch (action) {
      case 'targetget': return res.status(200).json(await apiTargetGet(nik, iso));
      case 'targetset': return res.status(200).json(await apiTargetSet(nik, iso, data));
      case 'beanspot':  return res.status(200).json(await apiBeanspot(nik, iso));
      default:          return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
