/* Auth — port apiLogin dari 10_api.gs */
import { NIK_KORWIL_ } from '../lib/config.js';
import { hasS3_ } from '../lib/config.js';
import { apiFindToko } from '../lib/utils.js';

/** Login pakai KODE TOKO (tanpa DAKAR). Admin/korwil tetap pakai ID khusus.
 *  Return {role:'toko'|'admin'|'korwil', ...} */
export async function apiLogin(id) {
  id = String(id || '').trim();
  if (!id) throw new Error('Isi kode toko dulu');
  const up = id.toUpperCase();
  if (id === NIK_KORWIL_) return { ok: true, role: 'korwil', nik: id, nama: 'Abud Ubaidillah' };
  if (up === 'ADMINR') {
    const t = await apiFindToko('2GAH');
    return { ok: true, role: 'admin', nik: id, nama: 'adminR', kode: '2GAH', namaToko: t ? t.nama : 'KEPANDEAN', s3: hasS3_('2GAH') };
  }
  const tk = await apiFindToko(up);
  if (!tk) throw new Error('Kode toko tidak terdaftar');
  return { ok: true, role: 'toko', nik: '', nama: '', kode: tk.kode, namaToko: tk.nama, s3: !!tk.s3 };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, id } = req.body || {};
  try {
    if (action === 'login') return res.status(200).json(await apiLogin(id));
    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
