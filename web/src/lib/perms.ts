/** Permissions the administrator assigns per role (Tetapan → Akses pengguna, migration 010). */
export type Perm =
  | 'rekod_urus' | 'kutipan_yuran' | 'semak_bayaran' | 'semak_sumbangan' | 'kempen' | 'sahkan_murid'
  | 'import' | 'tetapan' | 'kewangan' | 'agm' | 'memo_semua' | 'laporan'

export const PERMS: { key: Perm; label: string; hint: string; group: string }[] = [
  { key: 'rekod_urus', label: 'Urus rekod murid & keluarga', hint: 'Tambah / ubah murid dan ibu bapa, gabung atau asingkan keluarga', group: 'Murid & keluarga' },
  { key: 'sahkan_murid', label: 'Pengesahan murid (semua kelas)', hint: 'Guru kelas sentiasa boleh mengesahkan murid kelas sendiri', group: 'Murid & keluarga' },
  { key: 'import', label: 'Import data', hint: 'Muat naik senarai murid dan ibu bapa dari Excel', group: 'Murid & keluarga' },
  { key: 'kutipan_yuran', label: 'Kutipan yuran', hint: 'Senarai yuran keluarga dan rekod bayaran tunai', group: 'Kewangan' },
  { key: 'semak_bayaran', label: 'Semak bukti bayaran yuran', hint: 'Lulus / tolak bukti dan keluarkan resit', group: 'Kewangan' },
  { key: 'semak_sumbangan', label: 'Semak sumbangan', hint: 'Lulus / tolak sumbangan kutipan dana dan rekod sumbangan tunai', group: 'Kewangan' },
  { key: 'kewangan', label: 'Urus transaksi & program', hint: 'Tambah pendapatan, perbelanjaan dan program di Dana & Program', group: 'Kewangan' },
  { key: 'kempen', label: 'Urus kutipan dana', hint: 'Cipta, ubah, buka dan tutup kempen kutipan dana', group: 'PIBG' },
  { key: 'agm', label: 'Urus mesyuarat agung', hint: 'Cipta mesyuarat dan usul, buka undian', group: 'PIBG' },
  { key: 'memo_semua', label: 'Hantar memo kepada semua', hint: 'Guru kelas sentiasa boleh menghantar memo kepada kelas sendiri', group: 'PIBG' },
  { key: 'laporan', label: 'Lihat laporan', hint: 'Laporan kutipan yuran, sumbangan dan kewangan (jumlah sahaja)', group: 'PIBG' },
  { key: 'tetapan', label: 'Tetapan sekolah', hint: 'Yuran, tahun semasa, akaun bank dan format resit', group: 'Pentadbiran' },
]

/** Roles whose access the administrator can change (Pentadbir always has everything). */
export const EDITABLE_ROLES = ['pengerusi', 'bendahari', 'pibg', 'panitia', 'guru'] as const
