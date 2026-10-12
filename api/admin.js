/* Admin — port dari 10_api.gs: apiLaporCfgGet, apiLaporCfgSet.
 * Plus passthrough apiGetStores & apiLookupNik untuk kebutuhan client. */
import { laporCfgDefault_ } from '../lib/config.js';
import {
  parseNum_,
  apiGetStores, apiLookupNik,
  requireAdminNik_, laporCfgGetAsync_, laporCfgSet_,
  approvalList_, approvalAdd_, approvalDel_, clearReport_,
  ppsCompare_,
} from '../lib/utils.js';

const PPS_KOMP_ = ['psm', 'pwp', 'sertis'];
function ppsValidBersih_(list) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => a && PPS_KOMP_.includes(a.komp) && /^\d{4}-\d{2}-\d{2}$/.test(a.iso || ''))
    .map((a) => ({ komp: a.komp, iso: a.iso, nilai: Math.max(0, parseNum_(a.nilai) || 0) }))
    .sort((x, y) => (x.iso < y.iso ? -1 : x.iso > y.iso ? 1 : 0));
}

/** Setting laporan (admin only untuk tulis) */
export async function apiLaporCfgGet(nik) { requireAdminNik_(nik); return await laporCfgGetAsync_(); }

export async function apiLaporCfgSet(nik, cfg) {
  requireAdminNik_(nik);
  const cur = await laporCfgGetAsync_();
  const d = laporCfgDefault_();
  cfg = cfg || {};
  ['cabang', 'ac', 'am'].forEach((k) => { d[k] = String(cfg[k] || '').trim(); });
  ['jml', 'reg', 'fr'].forEach((k) => { d[k] = Math.max(0, parseInt(cfg[k], 10) || 0); });
  ['bjR', 'bjO'].forEach((k) => {
    const x = parseInt(cfg[k], 10);
    d[k] = (isNaN(x) || x < 0) ? (cur[k] || d[k]) : x;
  });
  function arr(v, n) {
    v = v || [];
    const o = [];
    for (let i = 0; i < n; i++) o.push(Math.max(0, parseNum_(v[i]) || 0));
    return o;
  }
  d.psmW = arr(cfg.psmW, 4); d.pwpP = arr(cfg.pwpP, 2); d.sgP = arr(cfg.sgP, 2);
  // Data valid marketing PPS dipertahankan (dikelola via endpoint khusus).
  d.ppsValid = ppsValidBersih_(cur.ppsValid);
  // Catatan Vercel: ScriptProperties tidak ada di serverless. Nilai disimpan
  // in-memory per instance + sebaiknya di-persist via env LAPOR_CFG (JSON).
  await laporCfgSet_(d);
  return { ok: true };
}

/** Tambah satu data valid marketing PPS (admin only). */
export async function apiPpsValidAdd(nik, komp, iso, nilai) {
  requireAdminNik_(nik);
  komp = String(komp || '').toLowerCase();
  if (!PPS_KOMP_.includes(komp)) throw new Error('Komponen harus psm/pwp/sertis');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) throw new Error('Tanggal tidak valid');
  const cfg = await laporCfgGetAsync_();
  const list = ppsValidBersih_(cfg.ppsValid);
  // Satu komponen + satu tanggal = satu jangkar (timpa bila sudah ada).
  const ada = list.findIndex((a) => a.komp === komp && a.iso === iso);
  const entri = { komp, iso, nilai: Math.max(0, parseNum_(nilai) || 0) };
  if (ada >= 0) list[ada] = entri; else list.push(entri);
  cfg.ppsValid = list.sort((x, y) => (x.iso < y.iso ? -1 : x.iso > y.iso ? 1 : 0));
  await laporCfgSet_(cfg);
  return { ok: true, ppsValid: cfg.ppsValid };
}

/** Hapus satu data valid marketing PPS by index (admin only). */
export async function apiPpsValidDel(nik, idx) {
  requireAdminNik_(nik);
  const cfg = await laporCfgGetAsync_();
  const list = ppsValidBersih_(cfg.ppsValid);
  idx = parseInt(idx, 10);
  if (isNaN(idx) || idx < 0 || idx >= list.length) throw new Error('Data tidak ditemukan');
  list.splice(idx, 1);
  cfg.ppsValid = list;
  await laporCfgSet_(cfg);
  return { ok: true, ppsValid: cfg.ppsValid };
}

/** Komparasi PPS: target vs input toko vs data valid (admin only). */
export async function apiPpsCompare(nik, iso) {
  requireAdminNik_(nik);
  return await ppsCompare_(iso);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, nik, cfg, kode, iso, shift, alasan, id, komp, nilai, idx } = req.body || {};
  try {
    switch (action) {
      case 'cfgget':    return res.status(200).json(await apiLaporCfgGet(nik));
      case 'cfgset':    return res.status(200).json(await apiLaporCfgSet(nik, cfg));
      case 'ppsvalidadd': return res.status(200).json(await apiPpsValidAdd(nik, komp, iso, nilai));
      case 'ppsvaliddel': return res.status(200).json(await apiPpsValidDel(nik, idx));
      case 'ppscompare':  return res.status(200).json(await apiPpsCompare(nik, iso));
      case 'stores':    return res.status(200).json(await apiGetStores());
      case 'lookupnik': return res.status(200).json(await apiLookupNik(nik));
      case 'approval_list': return res.status(200).json(await approvalList_(nik));
      case 'approval_add':  return res.status(200).json(await approvalAdd_(nik, kode, iso, shift, alasan));
      case 'approval_del':  return res.status(200).json(await approvalDel_(nik, id));
      case 'clear_report':  return res.status(200).json(await clearReport_(nik, kode, iso, shift));
      default:          return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
