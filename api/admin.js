/* Admin — port dari 10_api.gs: apiLaporCfgGet, apiLaporCfgSet.
 * Plus passthrough apiGetStores & apiLookupNik untuk kebutuhan client. */
import { laporCfgDefault_ } from '../lib/config.js';
import {
  parseNum_,
  apiGetStores, apiLookupNik,
  requireAdminNik_, laporCfgGetAsync_, laporCfgSet_,
  approvalList_, approvalAdd_, approvalDel_, clearReport_,
} from '../lib/utils.js';

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
  // Catatan Vercel: ScriptProperties tidak ada di serverless. Nilai disimpan
  // in-memory per instance + sebaiknya di-persist via env LAPOR_CFG (JSON).
  await laporCfgSet_(d);
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, nik, cfg, kode, iso, shift, alasan, id } = req.body || {};
  try {
    switch (action) {
      case 'cfgget':    return res.status(200).json(await apiLaporCfgGet(nik));
      case 'cfgset':    return res.status(200).json(await apiLaporCfgSet(nik, cfg));
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
