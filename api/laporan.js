/* Laporan cabang format WhatsApp — port apiLaporGenerate dari 10_api.gs */
import {
  TAB, N_STORES, LAPOR_FLAT_, LAPOR_EVOUCHER_T_, LAPOR_FEEBASE_T_, hasS3_,
} from '../lib/config.js';
import {
  tabOf_, findBlockRow_, blockMap_, readBlockMkt_, readBlockS2_,
  parts_, iso_, fmtTglID_, num0_,
  laporInt_, laporPct_, laporAch_, laporSalam_,
  NAMA_BULAN_FULL_,
  apiGetStores, apiFindToko,
  collectDay_, beanspotSplit_, laporCfgGet_,
} from '../lib/utils.js';

/** Bangun teks laporan cabang format WhatsApp. */
export async function apiLaporGenerate(iso, rpo, soKas) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) throw new Error('Tanggal tidak valid');
  // Validasi: semua toko harus sudah lapor semua shift
  const missing = [];
  const stores = await apiGetStores();
  for (const shift of [1, 2, 3]) {
    const tab = tabOf_(shift);
    const row = await findBlockRow_(tab, iso);
    if (!row) {
      stores.forEach((t) => { missing.push({ kode: t.kode, shift }); });
      continue;
    }
    const blk = (shift === 2) ? await readBlockS2_(row) : await readBlockMkt_(tab, row);
    for (const t of stores) {
      // Skip S3 untuk toko non-3-shift
      if (shift === 3 && !hasS3_(t.kode)) continue;
      let found = null;
      for (const b of blk.stores) {
        if (String(b.kode || '').toUpperCase() === String(t.kode).toUpperCase()) { found = b; break; }
      }
      if (!found || String(found.report || '').toUpperCase().indexOf('DONE') < 0) {
        missing.push({ kode: t.kode, shift });
      }
    }
  }
  if (missing.length) {
    // Kembalikan list lengkap untuk popup card
    const out = [];
    for (const m of missing) {
      const tk = await apiFindToko(m.kode);
      out.push({ kode: m.kode, nama: tk ? tk.nama : '', tgl: fmtTglID_(iso), shift: m.shift });
    }
    return { ok: false, missing: out };
  }
  const cfg = laporCfgGet_();
  const p = parts_(iso);
  const dim = new Date(p.y, p.m, 0).getDate();
  const D = Math.min(p.d, dim);
  const maps = { s1: await blockMap_(TAB.S1), s2: await blockMap_(TAB.S2), s3: await blockMap_(TAB.S3) };
  const days = [];
  for (let d = 1; d <= D; d++) days.push(await collectDay_(iso_([p.y, p.m, d]), maps));
  const t = days[D - 1];

  function rangeTtl(key, s, e) {
    let x = 0;
    for (let d = s; d <= Math.min(e, D); d++) x += num0_(days[d - 1].ttl[key]);
    return x;
  }
  /* target flat fokus cabang: dari blok S1 hari itu, fallback konstanta */
  function flatT(comp) { return t.s1t[comp] || (LAPOR_FLAT_[comp] || 0) * N_STORES; }
  function flatN(comp) { return t.s1n[comp] || N_STORES; }

  const L = [];
  L.push(laporSalam_());
  L.push('*LAPORAN PERFORMANCE DAN FOKUS CABANG ' + String(cfg.cabang || 'RING SATOE').toUpperCase() + '*');
  L.push('');
  L.push('TANGGAL : ' + p.d + ' ' + NAMA_BULAN_FULL_[p.m] + ' ' + p.y);
  L.push('NAMA AC : ' + (cfg.ac || '-'));
  L.push('NAMA AM : ' + (cfg.am || '-'));
  L.push('JML TOKO : ' + cfg.jml);
  L.push('REGULER : ' + cfg.reg);
  L.push('FRENCHISE : ' + cfg.fr);
  L.push('TIME FACTOR : *' + laporPct_(D / dim, 2) + '*');
  L.push('');
  /* REVENUE */
  L.push('*REVENUE*');
  L.push('1. NET SALES');
  L.push('- TARGET : ' + laporInt_(t.nettT));
  L.push('- ACTUAL : ' + laporInt_(t.nettA));
  L.push('- ACHIVE (%) : *' + laporAch_(t.nettA, t.nettT, 1) + '*');
  L.push('- GAP TO TARGET : ' + laporInt_(t.nettT - t.nettA));
  L.push('');
  /* PSM mingguan — hanya week yang sudah mulai (tgl mulai <= D) */
  L.push('2. P S M');
  const WR = [[1, 7], [8, 15], [16, 23], [24, dim]];
  for (let w = 0; w < 4; w++) {
    if (WR[w][0] > D) break;
    const aw = rangeTtl('psm', WR[w][0], WR[w][1]);
    L.push('*WEEK ' + (w + 1) + '*');
    L.push('- TARGET : ' + laporInt_(cfg.psmW[w]));
    L.push('- ACTUAL : ' + laporInt_(aw));
    L.push('- ACHIVE : ' + laporAch_(aw, cfg.psmW[w], 1));
    L.push('- ');
  }
  L.push('');
  /* PWP & SERTIS per periode */
  const PR = [['3. PWP', 'pwp', cfg.pwpP], ['4. SERBA GRATIS', 'sertis', cfg.sgP]];
  for (const sec of PR) {
    L.push(sec[0]);
    for (const pr of [['*PERIODE 1*', 1, 15, sec[2][0]], ['*PERIODE 2*', 16, dim, sec[2][1]]]) {
      if (pr[1] > D) continue; /* belum masuk periode, jangan tampilkan */
      const a = rangeTtl(sec[1], pr[1], pr[2]);
      L.push(pr[0]);
      L.push('- TARGET : ' + laporInt_(pr[3]));
      L.push('- ACTUAL : ' + laporInt_(a));
      L.push('- ACHIVE : ' + laporAch_(a, pr[3], 1));
      L.push('- ');
    }
    L.push('');
  }
  /* INVENTORY (MTD) */
  let mNettT = 0, mPl = 0, mBr = 0;
  days.forEach((x) => { mNettT += x.nettT; mPl += x.plA; mBr += x.brA; });
  L.push('*INVENTORY*');
  L.push('5. PL (PRODUCT LOSS)');
  L.push('- Budget (0.14%) Rp : ' + laporInt_(-0.0014 * mNettT));
  L.push('- Total PL aktual : ' + laporInt_(mPl));
  L.push('6. BR (BARANG RUSAK) :');
  L.push('- Budget (0.02%) Rp : ' + laporInt_(0.0002 * mNettT));
  L.push('- Total BR dari tgl 1 : ' + laporInt_(mBr));
  L.push('');
  /* FOKUS CABANG (harian) */
  L.push('*FOKUS CABANG*');
  function fokus(num, label, key, comp, dec, mode) {
    const T = flatT(comp), J = flatN(comp), A = num0_(t.ttl[key]);
    if (num) L.push(num + '. ' + label);
    if (mode !== 'minimal') L.push('- JTA : ' + J);
    L.push('- Target' + (label === 'TELUR' ? ' (pack)' : '') + ' : ' + laporInt_(T));
    L.push('- ' + (label === 'ONESHOOT (SHAPED BOTTLE)' ? 'Penjualan' : 'ACTUAL') + ' : ' + laporInt_(A));
    if (mode === 'sisa') { L.push('- Stock OH : ' + laporInt_(t.sisaOS)); return; }
    L.push('- Achive qty (%) : ' + laporAch_(A, T, dec));
    if (mode !== 'minimal' && mode !== 'noAvg') L.push('- ' + (label === 'FOKUS JSM' ? 'Avg/toko' : 'avg/toko') + ' : ' + (J ? Math.round(A / J) : '-'));
  }
  fokus('7', 'TELUR', 'telur', 'TELUR (PACK)', 2);
  fokus('8', "TOY'S", 'toys', 'TOYS', 1); L.push('- ');
  L.push('*HOTWHEELLS BASIC*');
  fokus('', 'HOTWEEL', 'hotweel', 'HOTWEEL', 1);
  fokus('9', 'DJOY', 'djoy', 'DJOY', 1, 'minimal');
  fokus('10', 'UNIPIN', 'unipin', 'UNIPIN', 1);
  fokus('11', 'ONESHOOT (SHAPED BOTTLE)', 'oneshoot', 'ONESHOOT ( BOTTOL)', 1, 'sisa');
  const sT = Math.round(0.3 * t.stdT), sA = num0_(t.ttl.suegerr);
  L.push('12. SUEEGERR-');
  L.push('Target reedem : *30% x STD Toko*');
  L.push('- Target qty : ' + laporInt_(sT));
  L.push('- actual qty reedem : ' + laporInt_(sA));
  L.push('- Achive qty (%) : ' + laporAch_(sA, t.stdA, 1));
  fokus('13', 'FOKUS JSM', 'jsm', 'JSM (MINYAK)', 1);
  /* Beanspot */
  const bs = await beanspotSplit_(iso);
  const rA = num0_(t.ttl.rtd), oA = num0_(t.ttl.onigiri);
  L.push('14. BEANSPOT.');
  L.push('*R T D*');
  L.push('- JTA : ' + bs.rtd.jta);
  L.push('- Target : ' + laporInt_(bs.rtd.t));
  L.push('- ACTUAL : ' + laporInt_(rA));
  L.push('- Achive qty (%) : ' + laporAch_(rA, bs.rtd.t, 1));
  L.push('- avg/toko : ' + (bs.rtd.jta ? Math.round(rA / bs.rtd.jta) : '-'));
  L.push('*ONIGIRI*');
  L.push('- JTA : ' + bs.oni.jta);
  L.push('- Target : ' + laporInt_(bs.oni.t));
  L.push('- ACTUAL : ' + laporInt_(oA));
  L.push('- Achive qty (%) : ' + laporAch_(oA, bs.oni.t, 1));
  L.push('- avg/toko : ' + (bs.oni.jta ? Math.round(oA / bs.oni.jta) : '-'));
  L.push('');
  /* E-COMMERCE */
  L.push('*E-COMMERCE*');
  const evT = LAPOR_EVOUCHER_T_ * cfg.jml, evA = t.evA;
  L.push('15. E-VOUCHER.');
  L.push('- Target : ' + laporInt_(evT));
  L.push('- ACTUAL : ' + laporInt_(evA));
  L.push('- Achive (%) : ' + laporAch_(evA, evT, 1));
  L.push('- Avg pertoko : ' + (cfg.jml ? laporInt_(Math.round(evA / cfg.jml)) : '-'));
  const fbT = LAPOR_FEEBASE_T_ * cfg.jml, fbA = t.feeRp;
  L.push('16. FEE BASED');
  L.push('- Target : ' + laporInt_(fbT));
  L.push('- ACTUAL : ' + laporInt_(fbA));
  L.push('- Achive (%) : ' + laporAch_(fbA, fbT, 2));
  L.push('- Avg pertoko : ' + (cfg.jml ? laporInt_(Math.round(fbA / cfg.jml)) : '-'));
  L.push('');
  /* Aktivitas AC */
  L.push('*Daily aktifitas AC*');
  L.push('17. RPO (pertoko 2xsebulan)');
  L.push('- Realisasi (jumlah toko dikunjungi) : ' + String(rpo || '').trim());
  L.push('- SO KAS (sudah diserahkan ke finance) : ' + String(soKas || '').trim());
  L.push('');
  L.push('Terima kasih');
  return { text: L.join('\n') };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, iso, rpo, soKas } = req.body || {};
  try {
    if (action === 'generate') {
      return res.status(200).json(await apiLaporGenerate(iso, rpo, soKas));
    }
    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
