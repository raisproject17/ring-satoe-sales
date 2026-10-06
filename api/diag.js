/* TEMPORARY READ-ONLY: Dump raw sheet row untuk diagnosis.
 * TIDAK MENGHAPUS / MENGUBAH APA PUN. HAPUS SETELAH DIPAKAI.
 */
import { TAB, S2_COLS, S2_NIK_KASIR, S2_KASIR, S2_WIDTH } from '../lib/config.js';
import { getDb_, findBlockRow_, findStoreRow_ } from '../lib/utils.js';

export default async function handler(req, res) {
  try {
    const { kode, iso } = req.query;
    if (!kode || !iso) return res.status(400).json({ error: 'kode & iso required' });

    const dateRow = await findBlockRow_(TAB.S2, iso);
    if (!dateRow) return res.status(404).json({ error: 'Blok tidak ketemu' });

    const srow = await findStoreRow_(TAB.S2, dateRow, String(kode).toUpperCase());
    if (!srow) return res.status(404).json({ error: 'Toko tidak ketemu' });

    const sh = getDb_().getSheetByName(TAB.S2);
    const vals = await sh.getValues(srow, 1, 1, S2_WIDTH);
    const row = vals[0];

    // Dump kolom 1-90 dengan label
    const dump = [];
    const colName = (i) => {
      let n = i + 1, s = '';
      while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); }
      return s;
    };
    for (let i = 0; i < S2_WIDTH; i++) {
      const v = row[i];
      if (v !== '' && v !== null && v !== undefined) {
        dump.push(`${colName(i)}(${i+1}): ${v}`);
      }
    }

    return res.status(200).json({ ok: true, kode, iso, srow, dump });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
