/* DEBUG sementara: baca struktur header SHIFT2#. HAPUS setelah dipakai. */
import { getDb_ } from '../lib/utils.js';
import { TAB, S2_WIDTH } from '../lib/config.js';

function colName(i) {
  let n = '', x = i;
  do { n = String.fromCharCode(65 + (x % 26)) + n; x = Math.floor(x / 26) - 1; } while (x >= 0);
  return n;
}

export default async function handler(req, res) {
  try {
    const { iso } = req.body || req.query || {};
    if (!iso) return res.status(400).json({ error: 'iso required' });
    const sh = getDb_().getSheetByName(TAB.S2);
    const colA = await sh.getValues(1, 1, 600, 1);
    let dateRow = -1;
    for (let r = 0; r < colA.length; r++) {
      const v = String(colA[r][0] || '').trim();
      if (v.includes(iso.slice(8, 10)) && v.includes(iso.slice(0, 4))) { dateRow = r + 1; break; }
    }
    if (dateRow < 0) return res.json({ error: 'blok tidak ketemu', iso });
    const head = await sh.getValues(dateRow, 1, 3, S2_WIDTH);
    const out = { iso, dateRow, header: [] };
    head.forEach((hr, hi) => {
      hr.forEach((v, ci) => {
        if (v !== '' && v !== undefined && v !== null)
          out.header.push({ row: hi, col: colName(ci), idx: ci, val: String(v).slice(0, 50) });
      });
    });
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
