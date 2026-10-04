/* API Performance / IKT (Indikator Kinerja Toko)
 * - Toko: IKT toko sendiri
 * - Admin/korwil: gabungan semua toko
 * Data: NETT SALES target (flat tgl 1), NETT SALES aktual (input terakhir),
 *        GM% target, GM% aktual, GM Rp auto, Time Factor, Best Estimate
 */
import { readBlockS2_, blockMap_, num0_, parts_, iso_ } from '../lib/utils.js';
import { TAB } from '../lib/config.js';

export default async function handler(req, res) {
  try {
    const { op, kode, iso } = req.query;
    if (op === 'ikt') return res.json(await apiIkt(kode, iso));
    return res.status(400).json({ ok: false, error: 'op?' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

/* Ambil data IKT: target nett (flat tgl 1), aktual nett (tgl terakhir),
 * target GM%, aktual GM%. Untuk gabungan: sum nett, rata-rata tertimbang GM%. */
async function apiIkt(kode, iso) {
  const p = parts_(iso);
  const dim = new Date(p.y, p.m, 0).getDate();
  const D = Math.min(p.d, dim);
  const maps = { s2: await blockMap_(TAB.S2) };

  // Blok tanggal 1 (untuk target flat)
  const firstIso = iso_([p.y, p.m, 1]);
  const dr1 = maps.s2[firstIso];
  const flatT = {};
  if (dr1) {
    const blk1 = await readBlockS2_(dr1);
    for (const s of blk1.stores) {
      const k = String(s.kode || '').trim().toUpperCase();
      if (!kode || k === String(kode).trim().toUpperCase()) {
        flatT[k] = {
          nett: num0_(s.vals.nett.t),
          gm: num0_(s.vals.gm.t),
        };
      }
    }
  }

  // Blok tanggal terakhir (untuk aktual)
  const lastIso = iso_([p.y, p.m, D]);
  const drL = maps.s2[lastIso];
  const akt = {};
  if (drL) {
    const blkL = await readBlockS2_(drL);
    for (const s of blkL.stores) {
      const k = String(s.kode || '').trim().toUpperCase();
      if (!kode || k === String(kode).trim().toUpperCase()) {
        akt[k] = {
          nett: num0_(s.vals.nett.a),
          gm: num0_(s.vals.gm.a),
        };
      }
    }
  }

  // Gabungkan: untuk tiap toko, atau sum untuk cabang
  const stores = [];
  let sumT = 0, sumA = 0, sumGmT = 0, sumGmA = 0, cntGmT = 0, cntGmA = 0;
  
  const allKodes = new Set([...Object.keys(flatT), ...Object.keys(akt)]);
  for (const k of allKodes) {
    const t = flatT[k] || { nett: 0, gm: 0 };
    const a = akt[k] || { nett: 0, gm: 0 };
    stores.push({ kode: k, targetNett: t.nett, aktualNett: a.nett, targetGm: t.gm, aktualGm: a.gm });
    sumT += t.nett; sumA += a.nett;
    // GM% rata-rata tertimbang by nett sales
    if (t.gm > 0 && t.nett > 0) { sumGmT += t.gm * t.nett; cntGmT += t.nett; }
    if (a.gm > 0 && a.nett > 0) { sumGmA += a.gm * a.nett; cntGmA += a.nett; }
  }

  const avgGmT = cntGmT > 0 ? sumGmT / cntGmT : 0;
  const avgGmA = cntGmA > 0 ? sumGmA / cntGmA : 0;

  // Time Factor: (tanggal-1) / jumlah hari
  const tf = D > 1 ? (D - 1) / dim : 0;

  return {
    ok: true,
    iso: lastIso,
    tanggal: D,
    dim,
    timeFactor: tf,
    // Untuk toko tunggal atau gabungan
    targetNett: kode ? (flatT[String(kode).toUpperCase()]?.nett || 0) : sumT,
    aktualNett: kode ? (akt[String(kode).toUpperCase()]?.nett || 0) : sumA,
    targetGm: kode ? (flatT[String(kode).toUpperCase()]?.gm || 0) : avgGmT,
    aktualGm: kode ? (akt[String(kode).toUpperCase()]?.gm || 0) : avgGmA,
    stores: kode ? undefined : stores.sort((a, b) => a.kode.localeCompare(b.kode)),
  };
}
