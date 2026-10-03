/* Dashboard — port dari 10_api.gs:
 * apiStatus, apiRanking, apiRekap, apiTokoDash, apiTren */
import { TAB, N_STORES, DEADLINE_LABEL, LAPOR_WINDOW_, S2_FIELDS, hasS3_ } from '../lib/config.js';
import {
  tabOf_, findBlockRow_, getAllBlocks_, readBlockMkt_, readBlockS2_,
  parts_, fmtTglID_, todayID_,
  fmtPct_, deadlineLate_, NAMA_BULAN_ABBR_,
  apiGetStores,
} from '../lib/utils.js';
import * as cache from '../lib/cache.js';

/** Status laporan harian: per shift daftar toko + DONE/BELUM + telat (S3 hanya 5 toko) */
export async function apiStatus(iso) {
  if (!iso) iso = todayID_();
  const hit = cache.get('status_' + iso);
  if (hit) return JSON.parse(hit);
  const isToday = (iso === todayID_());
  const shifts = {};
  for (const shift of [1, 2, 3]) {
    const tab = tabOf_(shift);
    const dr = await findBlockRow_(tab, iso);
    let list = [];
    if (dr) {
      const blk = (shift === 2) ? await readBlockS2_(dr) : await readBlockMkt_(tab, dr);
      blk.stores.forEach((s) => {
        const done = s.report.toUpperCase().indexOf('DONE') >= 0;
        list.push({ kode: s.kode, toko: s.toko, done });
      });
    } else {
      (await apiGetStores()).forEach((t) => { list.push({ kode: t.kode, toko: t.nama, done: false }); });
    }
    if (shift === 3) list = list.filter((x) => hasS3_(x.kode));
    const late = isToday && deadlineLate_(shift, iso);
    shifts[shift] = { list, deadline: DEADLINE_LABEL[shift], late };
  }
  const res = { iso, tgl: fmtTglID_(iso), shifts };
  cache.put('status_' + iso, JSON.stringify(res), 120);
  return res;
}

/** Ranking toko acuan NETT SALES (closing S2): urut ACV% tertinggi */
export async function apiRanking(iso, mode) {
  const mtd = String(mode || '').toLowerCase() === 'mtd';
  const blocks = await getAllBlocks_(TAB.S2);
  if (!blocks.length) return { iso: null, tgl: '', rows: [] };
  let pick = blocks[blocks.length - 1];
  if (iso) {
    for (const b of blocks) if (b.iso === iso) pick = b;
  }
  const isoEnd = pick.iso;
  const ckey = 'ranking_' + isoEnd + (mtd ? '_mtd' : '');
  const hit = cache.get(ckey);
  if (hit) return JSON.parse(hit);
  const rows = mtd ? blocks.filter((b) => b.iso.slice(0, 7) === isoEnd.slice(0, 7) && b.iso <= isoEnd) : [pick];
  const acc = {};
  // Target FLAT sebulan: ambil dari blok tgl 1 (bukan akumulasi)
  const firstBlk = mtd && rows.length ? await readBlockS2_(rows[0].row) : null;
  const flatT = {};
  if (firstBlk) firstBlk.stores.forEach((s) => {
    const k = String(s.kode).toUpperCase();
    flatT[k] = (s.vals.nett || {}).t || 0;
  });
  for (const b of rows) {
    const blk = await readBlockS2_(b.row);
    const isEnd = (b.iso === isoEnd);
    blk.stores.forEach((s) => {
      const k = String(s.kode).toUpperCase();
      if (!acc[k]) acc[k] = { kode: s.kode, nama: s.toko, nettT: 0, nettA: 0, stdA: null, done: false };
      const n = s.vals.nett || {};
      acc[k].nettT = mtd ? (flatT[k] || 0) : (acc[k].nettT + (n.t || 0));
      // NETT SALES actual: input terakhir saja (tidak akumulasi MTD)
      const na = (n.a === null || n.a === undefined) ? 0 : n.a;
      acc[k].nettA = mtd ? (isEnd ? na : acc[k].nettA) : (acc[k].nettA + na);
      if (isEnd) {
        acc[k].stdA = s.vals.std ? s.vals.std.a : null;
        acc[k].done = s.report.toUpperCase().indexOf('DONE') >= 0;
      }
    });
  }
  const list = Object.keys(acc).map((k) => {
    const r = acc[k];
    const acv = r.nettT ? (r.nettA / r.nettT * 100) : null;
    return { kode: r.kode, nama: r.nama, nettT: r.nettT, nettA: r.nettA,
             acv, acvStr: acv === null ? '' : fmtPct_(acv), stdA: r.stdA, done: r.done };
  });
  list.sort((a, b) => {
    const ka = a.acv === null ? -1 : a.acv, kb = b.acv === null ? -1 : b.acv;
    if (kb !== ka) return kb - ka;
    return (b.nettA || 0) - (a.nettA || 0);
  });
  list.forEach((r, idx) => { r.rank = idx + 1; });
  const pp = parts_(isoEnd);
  const tgl = mtd ? ('1\u2013' + pp.d + ' ' + NAMA_BULAN_ABBR_[pp.m] + ' ' + pp.y) : fmtTglID_(isoEnd);
  const res = { iso: isoEnd, tgl, mode: mtd ? 'mtd' : 'harian', rows: list };
  cache.put(ckey, JSON.stringify(res), 300);
  return res;
}

/** Rekap gabungan semua toko (admin/korwil): dari blok S2 tanggal iso (atau terakhir).
 *  mode='mtd': agregat blok tgl 1 s/d iso dalam bulan yang sama (MTD berjalan).
 *  Per toko: nett/std target+actual+done. Total gabungan + total per komponen. */
export async function apiRekap(iso, mode) {
  const mtd = String(mode || '').toLowerCase() === 'mtd';
  const blocks = await getAllBlocks_(TAB.S2);
  if (!blocks.length) return { iso: null, tgl: '', stores: [], total: null, byComp: {} };
  let pick = blocks[blocks.length - 1];
  if (iso) {
    for (const b of blocks) if (b.iso === iso) pick = b;
  }
  const isoEnd = pick.iso;
  const ckey = 'rekap2_' + isoEnd + (mtd ? '_mtd' : '');
  const hit = cache.get(ckey);
  if (hit) return JSON.parse(hit);
  const compKeys = ['psm','pwp','sertis','telur','toys','hotweel','djoy','unipin','oneshoot','suegerr','ceban','jsm','rtd','onigiri'];
  const compLabels = {};
  S2_FIELDS.forEach((f) => { compLabels[f.key] = f.label; });
  const byComp = {};
  compKeys.forEach((k) => { byComp[k] = { label: compLabels[k] || k, t: 0, a: 0 }; });
  const rows = mtd ? blocks.filter((b) => b.iso.slice(0, 7) === isoEnd.slice(0, 7) && b.iso <= isoEnd) : [pick];
  const acc = {};
  // Target FLAT sebulan: ambil dari blok tgl 1 (bukan akumulasi)
  const firstBlk = mtd && rows.length ? await readBlockS2_(rows[0].row) : null;
  const flatT = {};
  if (firstBlk) firstBlk.stores.forEach((s) => {
    const k = String(s.kode).toUpperCase();
    flatT[k] = { nett: (s.vals.nett || {}).t || 0, std: (s.vals.std || {}).t || 0 };
    compKeys.forEach((ck) => { if (!flatT[k][ck]) flatT[k][ck] = (s.vals[ck] || {}).t || 0; });
  });
  if (mtd) compKeys.forEach((ck) => { byComp[ck].t = 0; });
  for (const b of rows) {
    const blk = await readBlockS2_(b.row);
    const isEnd = (b.iso === isoEnd);
    blk.stores.forEach((s) => {
      const k = String(s.kode).toUpperCase();
      if (!acc[k]) acc[k] = { kode: s.kode, toko: s.toko, done: false, nettT: 0, nettA: 0, stdT: 0, stdA: 0 };
      const n = s.vals.nett || {}, std = s.vals.std || {};
      acc[k].nettT = mtd ? ((flatT[k] || {}).nett || 0) : (acc[k].nettT + (n.t || 0));
      // NETT SALES actual: input terakhir saja (tidak akumulasi MTD)
      const na = (n.a === null || n.a === undefined) ? 0 : n.a;
      acc[k].nettA = mtd ? (isEnd ? na : acc[k].nettA) : (acc[k].nettA + na);
      acc[k].stdT = mtd ? ((flatT[k] || {}).std || 0) : (acc[k].stdT + (std.t || 0));
      acc[k].stdA += (std.a === null || std.a === undefined) ? 0 : std.a;
      compKeys.forEach((ck) => {
        const v = s.vals[ck] || {};
        const val = (v.ttl !== undefined && v.ttl !== null) ? v.ttl : v.a;
        byComp[ck].a += val || 0;
        if (!mtd) byComp[ck].t += v.t || 0;
      });
      if (isEnd) acc[k].done = s.report.toUpperCase().indexOf('DONE') >= 0;
    });
  }
  if (mtd && firstBlk) {
    // byComp target = total flat dari tgl 1
    compKeys.forEach((ck) => {
      let t = 0;
      firstBlk.stores.forEach((s) => { t += ((s.vals[ck] || {}).t || 0); });
      byComp[ck].t = t;
    });
  }
  const stores = Object.keys(acc).map((k) => acc[k]);
  const total = { nettT: 0, nettA: 0, stdT: 0, stdA: 0, nDone: 0, nStores: N_STORES };
  stores.forEach((s) => {
    total.nettT += s.nettT; total.nettA += s.nettA;
    total.stdT += s.stdT; total.stdA += s.stdA;
    if (s.done) total.nDone++;
  });
  total.acv = total.nettT ? (total.nettA / total.nettT * 100) : null;
  total.gap = total.nettA - total.nettT;
  const pp = parts_(isoEnd);
  const tgl = mtd ? ('1\u2013' + pp.d + ' ' + NAMA_BULAN_ABBR_[pp.m] + ' ' + pp.y) : fmtTglID_(isoEnd);
  const res = { iso: isoEnd, tgl, mode: mtd ? 'mtd' : 'harian', stores, total, byComp };
  cache.put(ckey, JSON.stringify(res), 300);
  return res;
}

/** Dashboard 1 toko: rekap harian (status shift), breakdown target NETT SALES, komponen. */
export async function apiTokoDash(kode, iso, mode) {
  kode = String(kode || '').trim().toUpperCase();
  if (!iso) iso = todayID_();
  const mtd = String(mode || '').toLowerCase() === 'mtd';
  let tgl = fmtTglID_(iso);
  let s2vals = null, s2done = false;
  // Kumpulkan vals per hari (harian: 1 hari, MTD: tgl 1 s/d iso)
  const days = [];
  if (mtd) {
    const blocks = await getAllBlocks_(TAB.S2);
    const m = iso.slice(0, 7);
    blocks.forEach((b) => {
      if (b.iso.slice(0, 7) === m && b.iso <= iso) days.push(b);
    });
    if (days.length) tgl = '1\u2013' + iso.slice(8, 10) + ' ' + fmtTglID_(iso).split(' ').slice(1).join(' ');
  } else {
    const b2 = await findBlockRow_(TAB.S2, iso);
    if (b2) days.push({ row: b2, iso });
  }
  // Agregat vals — target FLAT dari tgl 1 (bukan akumulasi) untuk MTD
  const agg = {};
  let gmCount = 0, gmSum = 0;
  // Ambil target flat dari blok tgl 1
  const flatVals = {};
  if (mtd && days.length) {
    const b1 = await readBlockS2_(days[0].row);
    b1.stores.forEach((s) => {
      if (s.kode.toUpperCase() !== kode) return;
      Object.keys(s.vals || {}).forEach((k) => { flatVals[k] = (s.vals[k] || {}).t || 0; });
    });
  }
  for (const d of days) {
    const blk2 = await readBlockS2_(d.row);
    if (!mtd) tgl = fmtTglID_(blk2.iso);
    blk2.stores.forEach((s) => {
      if (s.kode.toUpperCase() !== kode) return;
      if (s.report.toUpperCase().indexOf('DONE') >= 0) s2done = true;
      Object.keys(s.vals || {}).forEach((k) => {
        const v = s.vals[k] || {};
        if (k === 'gm') {
          // GM%: rata-rata (bukan jumlah)
          const gv = (v.a !== undefined && v.a !== null) ? v.a : 0;
          if (gv > 0 || !mtd) { gmSum += gv; gmCount++; }
          if (!agg[k]) agg[k] = { t: 0, a: 0 };
          return;
        }
        if (!agg[k]) agg[k] = { t: 0, a: 0 };
        agg[k].t = mtd ? (flatVals[k] || 0) : (agg[k].t + (v.t || 0));
        // Untuk MTD: pakai ttl kalau ada, else a
        const av = (v.ttl !== undefined && v.ttl !== null) ? v.ttl : (v.a || 0);
        // NETT SALES actual: input terakhir saja (tidak akumulasi MTD)
        if (mtd && k === 'nett') { agg[k].a = av; }
        else { agg[k].a += av; }
      });
    });
  }
  if (gmCount > 0) agg['gm'] = { t: 0, a: gmSum / gmCount };
  if (Object.keys(agg).length) s2vals = agg;
  let s1done = false, s3done = false;
  const s3exist = hasS3_(kode);
  const b1 = await findBlockRow_(TAB.S1, iso);
  if (b1) {
    (await readBlockMkt_(TAB.S1, b1)).stores.forEach((s) => {
      if (s.kode.toUpperCase() === kode && s.report.toUpperCase().indexOf('DONE') >= 0) s1done = true;
    });
  }
  if (s3exist) {
    const b3 = await findBlockRow_(TAB.S3, iso);
    if (b3) {
      (await readBlockMkt_(TAB.S3, b3)).stores.forEach((s) => {
        if (s.kode.toUpperCase() === kode && s.report.toUpperCase().indexOf('DONE') >= 0) s3done = true;
      });
    }
  }
  const comps = [];
  if (s2vals) {
    S2_FIELDS.forEach((f) => {
      if (f.key === 'nett' || f.key === 'std' || f.key === 'gm' || f.key === 'ploss' || f.key === 'pbr' || f.key === 'evoucher' || f.key === 'feebase') return;
      const v = s2vals[f.key] || {};
      const a = (v.ttl !== undefined && v.ttl !== null) ? v.ttl : (v.a || 0);
      comps.push({ key: f.key, label: f.label, t: v.t || 0, a });
    });
  }
  const nett = s2vals ? (s2vals.nett || {}) : {};
  const std = s2vals ? (s2vals.std || {}) : {};
  const gm = s2vals ? (s2vals.gm || {}) : {};
  const nettA = nett.a || 0, nettT = nett.t || 0;
  return {
    kode, iso, tgl, hasS3: s3exist,
    shifts: { s1: s1done, s2: s2done, s3: s3done },
    nett: { t: nettT, a: nettA, acv: nettT ? (nettA / nettT * 100) : null, gap: nettA - nettT },
    std: { t: std.t || 0, a: std.a || 0 },
    gm: { t: gm.t || 0, a: gm.a || 0 },
    comps,
  };
}

/** Tren 1 toko: n blok terakhir per shift, bentuk seragam {comps, vals{nama:{t,a}}} */
export async function apiTren(kode, n) {
  kode = String(kode || '').trim().toUpperCase();
  n = Math.min(Math.max(+n || 14, 1), 60);
  const res = { kode };
  for (const shift of [1, 2, 3]) {
    const tab = tabOf_(shift);
    const blocks = (await getAllBlocks_(tab)).slice(-n);
    const arr = [];
    for (const b of blocks) {
      if (shift === 2) {
        const blk = await readBlockS2_(b.row);
        blk.stores.forEach((s) => {
          if (s.kode.toUpperCase() !== kode) return;
          const vv = {}, names = [];
          S2_FIELDS.forEach((f) => {
            names.push(f.label);
            vv[f.label] = { t: s.vals[f.key].t, a: s.vals[f.key].a };
          });
          arr.push({ iso: b.iso, tgl: fmtTglID_(b.iso), comps: names, vals: vv });
        });
      } else {
        const blk2 = await readBlockMkt_(tab, b.row);
        blk2.stores.forEach((s) => {
          if (s.kode.toUpperCase() !== kode) return;
          const vv2 = {};
          blk2.comps.forEach((c) => { vv2[c.name] = s.vals[c.name]; });
          arr.push({ iso: b.iso, tgl: fmtTglID_(b.iso), comps: blk2.comps.map((c) => c.name), vals: vv2 });
        });
      }
    }
    res['s' + shift] = arr;
  }
  return res;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, iso, mode, kode, n } = req.body || {};
  try {
    switch (action) {
      case 'status':   return res.status(200).json(await apiStatus(iso));
      case 'ranking':   return res.status(200).json(await apiRanking(iso, mode));
      case 'rekap':     return res.status(200).json(await apiRekap(iso, mode));
      case 'tokodash':  return res.status(200).json(await apiTokoDash(kode, iso, mode));
      case 'tren':      return res.status(200).json(await apiTren(kode, n));
      default:          return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
