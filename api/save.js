/* Save — port apiSave dari 10_api.gs.
 * Catatan: write di-buffer; bila validasi melempar error SEBELUM flush,
 * tidak ada sel yang tertulis (lebih aman dari versi GAS yang bisa
 * meninggalkan row parsial). */
import {
  TAB, S2_COLS, S2_FIELDS, S2_NIK_KASIR, S2_KASIR,
  MKT_KASIR_NIK, MKT_KASIR_NAMA, hasS3_,
} from '../lib/config.js';
import {
  tabOf_, getDb_, findBlockRow_, findStoreRow_, readBlockMkt_,
  ensureBlock_, parseNum_, fmtRibuan_, fmtPct_, addDaysISO_,
  apiFindToko, apiLookupNik, validateShiftSequence_,
  recomputeS2Derived_, flush_,
} from '../lib/utils.js';
import * as cache from '../lib/cache.js';

/** Simpan laporan. actuals: {namaKomponen|fieldKey: number}; oneshoot: + '_sisa' */
export async function apiSave(shift, iso, kode, nik, nama, nikKasir, actuals) {
  shift = +shift;
  const tab = tabOf_(shift);
  kode = String(kode || '').trim().toUpperCase();
  const toko = await apiFindToko(kode);
  if (!toko) throw new Error('Kode toko tidak dikenal: ' + kode);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Tanggal tidak valid');
  if (shift === 3 && !hasS3_(kode)) throw new Error('Toko ' + kode + ' tidak punya Shift 3');
  await validateShiftSequence_(shift, iso, kode);
  nikKasir = String(nikKasir || '').trim();

  const dateRow = await ensureBlock_(tab, iso);
  const srow = await findStoreRow_(tab, dateRow, kode);
  if (!srow) throw new Error('Baris toko tidak ketemu di blok ' + tab);
  const sh = getDb_().getSheetByName(tab);
  const kLookup = nikKasir ? await apiLookupNik(nikKasir) : null;
  const kasirNama = kLookup ? kLookup.nama : (nikKasir ? 'INPUT NIK' : '');

  let rep = 'LAPORAN DONE';
  if (String(nik || '').trim()) rep += ' — ' + String(nik).trim() + '/' + String(nama || '').trim();
  sh.setValue(srow, 3, rep);
  sh.setValue(srow, 4, String(nik || '').trim());
  sh.setValue(srow, 5, String(nama || '').trim());

  if (shift === 2) {
    sh.setValue(srow, S2_NIK_KASIR + 1, nikKasir);
    sh.setValue(srow, S2_KASIR + 1, kasirNama);
    // Validasi: field wajib S2 tidak boleh 0 (NETT, STD, GM% divalidasi khusus; PSM/PWP/SERTIS di sini)
    for (const k of ['psm', 'pwp', 'sertis']) {
      const f = S2_FIELDS.find(x => x.key === k);
      const v = parseNum_(actuals[k]);
      if (v === null || v <= 0)
        throw new Error((f ? f.label : k.toUpperCase()) + ' wajib diisi dan tidak boleh 0.');
    }
    // Validasi: NETT SALES wajib terisi dan tidak boleh 0
    const nettCheck = parseNum_(actuals['nett']);
    if (nettCheck === null || nettCheck <= 0)
      throw new Error('NETT SALES wajib diisi dan tidak boleh 0.');
    // Validasi: STD wajib terisi, tidak boleh 0, max 999
    const stdNew = parseNum_(actuals['std']);
    if (stdNew === null || stdNew <= 0)
      throw new Error('STD wajib diisi dan tidak boleh 0.');
    if (stdNew >= 1000)
      throw new Error('STD tidak boleh lebih dari 3 digit (maks 999).');
    // Validasi: GM% wajib pakai koma (,), format xx,xx, max 25,00
    if (!gmRaw) throw new Error('GM% wajib diisi (format: xx,xx contoh: 22,50).');
    if (gmRaw.indexOf(',') < 0)
      throw new Error('GM% wajib pakai koma (,) contoh: 22,50.');
    if (!/,\d{1,2}$/.test(gmRaw))
      throw new Error('GM% wajib format xx,xx (contoh: 22,50 bukan 22).');
    const gmVal = parseNum_(gmRaw);
    if (gmVal === null || gmVal <= 0)
      throw new Error('GM% wajib diisi dan tidak boleh 0.');
    if (gmVal > 25)
      throw new Error('GM% maksimal 25,00 (input: ' + gmRaw + '). Data invalid.');
    // Validasi: NETT SALES tidak boleh kurang dari kemarin DAN tidak boleh > 2x kemarin
    const nettNew = parseNum_(actuals['nett']);
    if (nettNew !== null) {
      const prevRow = await findBlockRow_(TAB.S2, addDaysISO_(iso, -1));
      if (prevRow) {
        const psrow = await findStoreRow_(TAB.S2, prevRow, kode);
        if (psrow) {
          const prevNett = parseNum_(await sh.getValue(psrow, S2_COLS.nett.a + 1));
          if (prevNett !== null && prevNett > 0) {
            if (nettNew < prevNett)
              throw new Error('NETT SALES Rp ' + fmtRibuan_(nettNew) +
                ' tidak boleh kurang dari kemarin Rp ' + fmtRibuan_(prevNett) + '. Periksa kembali input.');
            if (nettNew > prevNett * 2)
              throw new Error('NETT SALES Rp ' + fmtRibuan_(nettNew) +
                ' tidak boleh lebih dari 2x kemarin (maks Rp ' + fmtRibuan_(prevNett * 2) + '). Periksa kembali input.');
          }
        }
      }
    }
    S2_FIELDS.forEach((f) => {
      const cols = S2_COLS[f.key];
      const a = parseNum_(actuals[f.key]);
      if (a === null) sh.clearCell(srow, cols.a + 1); else sh.setValue(srow, cols.a + 1, a);
      // Target NETT SALES & STD sudah ditentukan (diatur via menu Setting Target admin)
      if (f.kind === 'oneshoot') {
        const sisa = parseNum_(actuals[f.key + '_sisa']);
        if (sisa === null) sh.clearCell(srow, cols.sisa + 1); else sh.setValue(srow, cols.sisa + 1, sisa);
      }
    });
    await flush_();
    await recomputeS2Derived_(iso, srow, kode);
  } else {
    sh.setValue(srow, MKT_KASIR_NIK + 1, nikKasir);
    sh.setValue(srow, MKT_KASIR_NAMA + 1, kasirNama);
    const blk = await readBlockMkt_(tab, dateRow);
    // Validasi: PSM, PWP, SERTIS, SUEGER tidak boleh 0 (Shift 1 & 3); lainnya optional
    const mustNZ = ['PSM', 'PWP', 'SERTIS', 'SUEGER'];
    for (const c of blk.comps) {
      const cn = String(c.name || '').toUpperCase().trim();
      if (mustNZ.includes(cn)) {
        const v = parseNum_(actuals[c.name]);
        if (v === null || v <= 0)
          throw new Error(c.name + ' wajib diisi dan tidak boleh 0 (Shift ' + shift + ').');
      }
    }
    for (const c of blk.comps) {
      const a = parseNum_(actuals[c.name]);
      if (a === null) sh.clearCell(srow, c.a + 1); else sh.setValue(srow, c.a + 1, a);
      // ACV% : biarkan formula bila ada; bila tidak, tulis manual
      if (c.p >= 0) {
        if (!(await sh.hasFormula(srow, c.p + 1))) {
          const t = parseNum_(await sh.getValue(srow, c.t + 1));
          sh.setValue(srow, c.p + 1, a !== null && t ? fmtPct_(a / t * 100) : '');
        }
      }
    }
    await flush_();
    // TTL S2 ikut dihitung ulang bila blok S2 tgl ini sudah ada
    const s2row = await findBlockRow_(TAB.S2, iso);
    if (s2row) {
      const s2srow = await findStoreRow_(TAB.S2, s2row, kode);
      if (s2srow) await recomputeS2Derived_(iso, s2srow, kode);
    }
  }
  cache.remove('status_' + iso);
  return { ok: true, msg: 'Laporan tersimpan' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, shift, iso, kode, nik, nama, nikKasir, actuals } = req.body || {};
  try {
    if (action === 'save') {
      return res.status(200).json(await apiSave(shift, iso, kode, nik, nama, nikKasir, actuals));
    }
    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
