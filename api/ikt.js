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
    const b = req.body || {};
    const q = req.query || {};
    const action = b.action || q.op;
    const kode = b.kode || q.kode || '';
    const iso = b.iso || q.iso;
    if (action === 'ikt') return res.json(await apiIkt(kode, iso));
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

  // Target dari tanggal terbaru yang ada (bukan selalu tgl 1)
  const flatT = {};
  for (let fd = D; fd >= 1; fd--) {
    const fIso = iso_([p.y, p.m, fd]);
    const dr = maps.s2[fIso];
    if (!dr) continue;
    const blk = await readBlockS2_(dr);
    let found = false;
    for (const s of blk.stores) {
      const k = String(s.kode || '').trim().toUpperCase();
      if ((!kode || k === String(kode).trim().toUpperCase()) && !(k in flatT)) {
        const nt = num0_(s.vals.nett.t);
        if (nt > 0) {
          flatT[k] = { nett: nt, gm: num0_(s.vals.gm.t) };
          found = true;
        }
      }
    }
    if (found) break;
  }

  // Cari tanggal terakhir yang ada datanya (untuk aktual & Time Factor)
  // Misal: tgl 4 belum ada data → pakai tgl 3 (TF = 3/31)
  let lastD = D, lastIso = iso_([p.y, p.m, D]), drL = maps.s2[lastIso];
  while (lastD > 1 && !drL) {
    lastD--;
    lastIso = iso_([p.y, p.m, lastD]);
    drL = maps.s2[lastIso];
  }
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

  // Sanitasi GM%: nilai > 100 dianggap data korup → 0
  const saneGm = (v) => (v > 0 && v <= 100) ? v : 0;
  // Gabungkan: untuk tiap toko, atau sum untuk cabang
  const stores = [];
  let sumT = 0, sumA = 0, sumGmT = 0, sumGmA = 0, cntGmT = 0, cntGmA = 0;
  
  const allKodes = new Set([...Object.keys(flatT), ...Object.keys(akt)]);
  for (const k of allKodes) {
    const t = flatT[k] || { nett: 0, gm: 0 };
    const a = akt[k] || { nett: 0, gm: 0 };
    const tg = saneGm(t.gm), ag = saneGm(a.gm);
    stores.push({ kode: k, targetNett: t.nett, aktualNett: a.nett, targetGm: tg, aktualGm: ag });
    sumT += t.nett; sumA += a.nett;
    // GM% rata-rata tertimbang by nett sales
    if (tg > 0 && t.nett > 0) { sumGmT += tg * t.nett; cntGmT += t.nett; }
    if (ag > 0 && a.nett > 0) { sumGmA += ag * a.nett; cntGmA += a.nett; }
  }

  const avgGmT = cntGmT > 0 ? sumGmT / cntGmT : 0;
  const avgGmA = cntGmA > 0 ? sumGmA / cntGmA : 0;

  // Time Factor: tanggal terakhir ada data / jumlah hari (misal: 3/31)
  const tf = lastD / dim;

  return {
    ok: true,
    iso: lastIso,
    tanggal: lastD,
    dim,
    timeFactor: tf,
    // Untuk toko tunggal atau gabungan
    targetNett: kode ? (flatT[String(kode).toUpperCase()]?.nett || 0) : sumT,
    aktualNett: kode ? (akt[String(kode).toUpperCase()]?.nett || 0) : sumA,
    targetGm: kode ? saneGm(flatT[String(kode).toUpperCase()]?.gm || 0) : avgGmT,
    aktualGm: kode ? saneGm(akt[String(kode).toUpperCase()]?.gm || 0) : avgGmA,
    stores: kode ? undefined : stores.sort((a, b) => a.kode.localeCompare(b.kode)),
  };
}
