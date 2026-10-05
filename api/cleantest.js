/* TEMPORARY: Hapus selektif data test Shift 2 tgl 2026-10-05.
 * HANYA hapus actual/ttl/p/gap/sisa/fee/nik_kasir/kasir. TARGET AMAN.
 * HAPUS FILE INI SETELAH DIPAKAI.
 */
import { S2_COLS, S2_NIK_KASIR, S2_KASIR, TAB } from '../lib/config.js';
import { getDb_, findBlockRow_, findStoreRow_, flush_ } from '../lib/utils.js';

const ISO = '2026-10-05';
const STORES = ['2G97','2GAO','2GCA','2GU7','T043','T938','T880','2G07','T018','T492',
                '2GBO','2GT7','2GAH','T016','2G20','T045','T819','TB43','2G12','KG31'];

export default async function handler(req, res) {
  try {
    const clearCols = new Set();
    for (const c of Object.values(S2_COLS)) {
      if (c.a !== undefined) clearCols.add(c.a + 1);
      if (c.ttl !== undefined) clearCols.add(c.ttl + 1);
      if (c.p !== undefined) clearCols.add(c.p + 1);
      if (c.gap !== undefined) clearCols.add(c.gap + 1);
      if (c.sisa !== undefined) clearCols.add(c.sisa + 1);
      if (c.fee !== undefined) clearCols.add(c.fee + 1);
    }
    clearCols.add(S2_NIK_KASIR + 1);
    clearCols.add(S2_KASIR + 1);
    clearCols.add(3); clearCols.add(4); clearCols.add(5);

    const dateRow = await findBlockRow_(TAB.S2, ISO);
    if (!dateRow) return res.status(404).json({ error: 'Blok tidak ketemu' });

    const sh = getDb_().getSheetByName(TAB.S2);
    const hasil = [];
    for (const kode of STORES) {
      const srow = await findStoreRow_(TAB.S2, dateRow, kode);
      if (!srow) { hasil.push(kode + ': skip'); continue; }
      for (const col of clearCols) sh.setValue(srow, col, '');
      hasil.push(kode + ': OK');
      await new Promise(r => setTimeout(r, 1500));
    }
    await flush_();
    return res.status(200).json({ ok: true, hasil });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
