/* Hapus data test 2GAH tgl 2026-10-05 */
import { getDb_ } from '../lib/utils.js';
import { TAB, S2_WIDTH } from '../lib/config.js';

export default async function handler(req, res) {
  try {
    const sh = getDb_().getSheetByName(TAB.S2);
    const colA = await sh.getValues(1, 1, 600, 1);
    let dateRow = -1;
    for (let r = 0; r < colA.length; r++) {
      const v = String(colA[r][0] || '').trim();
      if (v.includes('05') && v.includes('2026') && v.includes('Okt')) { dateRow = r + 1; break; }
    }
    if (dateRow < 0) return res.json({ error: 'not found' });
    // Cari baris 2GAH
    const stores = await sh.getValues(dateRow + 3, 1, 25, 1);
    let tr = -1;
    stores.forEach((r, i) => {
      if (String(r[0] || '').trim().toUpperCase() === '2GAH') tr = dateRow + 3 + i;
    });
    if (tr < 0) return res.json({ error: '2GAH not found' });
    for (let c = 2; c < S2_WIDTH; c++) await sh.clearCell(tr, c + 1);
    await sh.flush();
    return res.json({ ok: true, clearedRow: tr });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
