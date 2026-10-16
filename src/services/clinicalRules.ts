import { ClinicalRecommendation, PatientRecord, WeekScheduleItem, HDFrequency, isSelectiveHbCandidate, HDDaySchedule, SingleHDDay } from '../types/dialysis';

/**
 * Menghitung dosis & rekomendasi klinis berdasarkan nilai Hb awal bulan:
 * 1. Hb < 5.9 g/dL: Transfusi 2 kantong via rawat inap
 * 2. Hb 6.0 - 6.9 g/dL: Transfusi 1 kantong
 * 3. Hb 7.0 - 8.9 g/dL: Terapi EPO 4 x 2000 IU (atau 2 x 2000 IU untuk pasien HD 1x/2 minggu)
 * 4. Hb 9.0 - 12.0 g/dL: Terapi EPO 1 x 2000 IU dalam 1 bulan
 * 5. HB diatas 12.00 mg/dl: Tidak mendapatkan terapi EPO
 * Catatan Klinis: Untuk pasien HD 1x/minggu dan 1x/2 minggu, pemberian EPO dimulai dari SESI AWAL HD.
 * Sedangkan untuk pasien HD 2x/minggu alokasi EPO dimulai pada pertemuan HD kedua.
 */
export function calculateClinicalRecommendation(hbValue: number, hdFrequency?: HDFrequency): ClinicalRecommendation {
  const hb = Number(hbValue);

  // 0. Jika belum mengetahui hasil HB (HB belum diinputkan / tidak ada data pada Google Sheet) maka nilai HB: 0
  if (isNaN(hb) || hb === 0 || hb <= 0) {
    return {
      category: 'MENUNGGU_HASIL_LAB',
      title: 'Menunggu Hasil Lab Hb (Hb: 0)',
      badgeColor: 'text-amber-900 dark:text-amber-300',
      badgeBg: 'bg-amber-100 border-amber-300 dark:bg-amber-950/50 dark:border-amber-700',
      borderColor: 'border-amber-400',
      doseDescription: 'Hasil lab Hb awal bulan belum keluar / diinputkan (Hb: 0). Menunggu penetapan DPJP.',
      totalEpoIu: 0,
      totalEpoVials: 0,
      transfusionBags: 0,
      isInpatientNeeded: false,
      notes: 'Hasil pemeriksaan Hb awal bulan belum diinputkan (terdeteksi Hb: 0). Pemberian terapi EPO atau transfusi menunggu konfirmasi hasil lab.',
      protocolBadge: 'Menunggu Lab (Hb: 0)',
    };
  }

  // 1. HB dibawah 5.9 g/dL
  if (hb < 5.95) {
    return {
      category: 'TRANSFUSI_2_RAWAT_INAP',
      title: 'Transfusi 2 Kantong (Rawat Inap)',
      badgeColor: 'text-rose-700 dark:text-rose-400',
      badgeBg: 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800',
      borderColor: 'border-rose-400',
      doseDescription: 'Transfusi PRC 2 Kantong via Rawat Inap Segera',
      totalEpoIu: 0,
      totalEpoVials: 0,
      transfusionBags: 2,
      isInpatientNeeded: true,
      notes: 'Anemia berat (Hb < 6.0). Indikasi mutlak transfusi 2 bag PRC dengan pemantauan ketat via Rawat Inap.',
      protocolBadge: 'Kritis: Rawat Inap + 2 Bag PRC',
    };
  }

  // 2. HB 6.0 g/dL sampai 6.9 g/dL
  if (hb >= 5.95 && hb < 6.95) {
    return {
      category: 'TRANSFUSI_1_KANTONG',
      title: 'Transfusi 1 Kantong',
      badgeColor: 'text-amber-800 dark:text-amber-300',
      badgeBg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800',
      borderColor: 'border-amber-400',
      doseDescription: 'Transfusi PRC 1 Kantong',
      totalEpoIu: 0,
      totalEpoVials: 0,
      transfusionBags: 1,
      isInpatientNeeded: false,
      notes: 'Hb 6.0 - 6.9 g/dL. Rencana transfusi 1 bag PRC saat sesi HD / observasi sebelum inisiasi dosis EPO reguler.',
      protocolBadge: 'Transfusi 1 Bag PRC',
    };
  }

  // 3. HB 7.0 g/dL sampai 8.9 g/dL
  if (hb >= 6.95 && hb < 8.95) {
    if (hdFrequency === '1 kali / 2 minggu') {
      return {
        category: 'EPO_4X_2000',
        title: 'Terapi EPO 2 x 2000 IU (HD 1x/2 Minggu)',
        badgeColor: 'text-blue-800 dark:text-blue-300',
        badgeBg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800',
        borderColor: 'border-blue-400',
        doseDescription: 'Eritropoietin 2x 2000 IU (total 4.000 IU / 2 ampul, pemberian dimulai dari sesi awal HD)',
        totalEpoIu: 4000,
        totalEpoVials: 2,
        transfusionBags: 0,
        isInpatientNeeded: false,
        notes: 'Hb 7.0 - 8.9 g/dL (Frekuensi HD 1 kali / 2 minggu). Pemberian EPO dimulai dari SESI AWAL HD (Sesi 1: 2000 IU) dan dilanjutkan pada Sesi 2 (14 hari kemudian: 2000 IU). Kuota bulanan terpenuhi tepat 2 ampul (4.000 IU/bulan).',
        protocolBadge: 'EPO: 2x 2000 IU (1x/2 Minggu)',
      };
    }
    if (hdFrequency === '1 kali dalam satu minggu') {
      return {
        category: 'EPO_4X_2000',
        title: 'Terapi EPO 4 x 2000 IU (1x/Minggu)',
        badgeColor: 'text-blue-800 dark:text-blue-300',
        badgeBg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800',
        borderColor: 'border-blue-400',
        doseDescription: 'Eritropoietin 4x 2000 IU (total 8.000 IU/bulan, pemberian dimulai dari sesi awal HD)',
        totalEpoIu: 8000,
        totalEpoVials: 4,
        transfusionBags: 0,
        isInpatientNeeded: false,
        notes: 'Hb 7.0 - 8.9 g/dL (Frekuensi HD 1 kali dalam satu minggu). Diberikan 1 ampul (2000 IU) setiap sesi mingguan dimulai langsung dari SESI AWAL HD (Minggu 1 s/d Minggu 4).',
        protocolBadge: 'EPO Dosis Penuh: 4x 2000 IU',
      };
    }
    return {
      category: 'EPO_4X_2000',
      title: 'Terapi EPO 4 x 2000 IU (2x/Minggu)',
      badgeColor: 'text-blue-800 dark:text-blue-300',
      badgeBg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800',
      borderColor: 'border-blue-400',
      doseDescription: 'Eritropoietin 4x 2000 IU (total 8.000 IU/bulan, dosis pertama dijadwalkan pada pertemuan HD kedua)',
      totalEpoIu: 8000,
      totalEpoVials: 4,
      transfusionBags: 0,
      isInpatientNeeded: false,
      notes: 'Hb 7.0 - 8.9 g/dL. Diberikan 1 ampul (2000 IU) per minggu selama 4 minggu pasca dialisis. Pemberian EPO pertama otomatis dijadwalkan pada pertemuan HD kedua pada bulan terkait setelah konfirmasi Cek Hb di pertemuan pertama.',
      protocolBadge: 'EPO Dosis Penuh: 4x 2000 IU',
    };
  }

  // 4. HB 9.0 g/dL sampai 12.00 g/dL
  if (hb >= 8.95 && hb <= 12.00) {
    const isSingleSess = hdFrequency === '1 kali dalam satu minggu' || hdFrequency === '1 kali / 2 minggu';
    return {
      category: 'EPO_1X_2000',
      title: 'Terapi EPO 1 x 2000 IU (Maintenance)',
      badgeColor: 'text-emerald-800 dark:text-emerald-300',
      badgeBg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800',
      borderColor: 'border-emerald-400',
      doseDescription: isSingleSess
        ? 'Eritropoietin 1x 2000 IU (dosis pemeliharaan 1 ampul/bulan dimulai dari sesi awal HD)'
        : 'Eritropoietin 1x 2000 IU (dosis pemeliharaan 1 ampul/bulan dijadwalkan pada pertemuan HD kedua)',
      totalEpoIu: 2000,
      totalEpoVials: 1,
      transfusionBags: 0,
      isInpatientNeeded: false,
      notes: isSingleSess
        ? 'Hb 9.0 - 12.00 g/dL (Target tercapai). Diberikan dosis pemeliharaan 1 ampul (1x 2000 IU) yang dimulai langsung dari SESI AWAL HD di bulan terkait.'
        : 'Hb 9.0 - 12.00 g/dL dalam rentang target klinis hemodialisa. Diberikan dosis pemeliharaan (maintenance) 1 ampul (1x 2000 IU) yang otomatis dijadwalkan pada pertemuan HD kedua pada bulan terkait sesuai protokol klinis.',
      protocolBadge: 'EPO Maintenance: 1x 2000 IU',
    };
  }

  // 5. Protokol Klinis ke-5: HB diatas 12.00 mg/dl tidak mendapatkan terapi EPO
  return {
    category: 'HOLD_EVALUASI',
    title: 'Protokol 5: HB > 12.00 mg/dl — Tidak Mendapatkan Terapi EPO',
    badgeColor: 'text-purple-800 dark:text-purple-300',
    badgeBg: 'bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:border-purple-800',
    borderColor: 'border-purple-400',
    doseDescription: 'Kadar HB > 12.00 mg/dl (g/dL). Sesuai Protokol Klinis ke-5: Tidak mendapatkan terapi EPO (Hold / Evaluasi Klinis DPJP).',
    totalEpoIu: 0,
    totalEpoVials: 0,
    transfusionBags: 0,
    isInpatientNeeded: false,
    notes: 'Protokol Klinis ke-5: Pasien dengan kadar HB diatas 12.00 mg/dl tidak mendapatkan terapi EPO guna mencegah risiko kardiovaskular, hiperviskositas darah, hipertensi intradialisis, dan trombosis akses vaskular.',
    protocolBadge: 'Protokol 5: Tanpa Terapi EPO (Hb > 12.00)',
  };
}

/**
 * Menghitung nilai Hb acuan efektif untuk pasien:
 * 1. Sesi CEK HB SELURUH PASIEN:
 *    Seluruh pasien (Tn A, Tn B, Tn C, Tn D) yang belum diinputkan nilai hasil lab terbarunya
 *    berstatus 0 (menunggu hasil lab).
 * 2. Sesi CEK HB PILIHAN:
 *    Pasien yang tidak terjadwal (Hb bulan sebelumnya >= 9.0, seperti Tn A: 12.0) otomatis terisi
 *    nilai Hb nya sesuai dengan nilai bulan sebelumnya karena tidak melakukan Cek Hb.
 *    Sedangkan pasien yang terjadwal (Hb acuan < 9.0, seperti Tn B, Tn C, Tn D) berstatus 0 (menunggu hasil lab).
 */
export function getEffectivePatientHb(
  patient: PatientRecord, 
  targetMonth?: string,
  scopeOverride?: 'PILIHAN' | 'SELURUH'
): number {
  const currentMonth = targetMonth || patient.monthPeriod || '';

  // Dapatkan mode sesi pemeriksaan untuk bulan terkait
  let effectiveScope: 'PILIHAN' | 'SELURUH' = scopeOverride || 'PILIHAN';
  if (!scopeOverride && typeof window !== 'undefined') {
    try {
      const stored = currentMonth 
        ? (localStorage.getItem(`epocare_lab_schedule_mode_${currentMonth}`) || localStorage.getItem('epocare_lab_schedule_mode')) 
        : localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH' || stored === 'PILIHAN') {
        effectiveScope = stored;
      }
    } catch (e) {
      // ignore
    }
  }

  // 1. Jika pasien memiliki nilai hbValue riil yang valid (> 0), prioritaskan nilai Hb aktif terbaru pasien
  if (typeof patient.hbValue === 'number' && patient.hbValue > 0) {
    return patient.hbValue;
  }

  // 2. Cek apakah ada nilai hasil lab yang SUDAH selesai / diinputkan untuk bulan target
  const hasFinishedLab = Boolean(
    patient.labSchedule &&
    patient.labSchedule.status === 'Selesai' &&
    typeof patient.labSchedule.resultHb === 'number' &&
    patient.labSchedule.resultHb > 0
  );
  if (hasFinishedLab && patient.labSchedule?.resultHb) {
    return patient.labSchedule.resultHb;
  }

  // Sesuai Permintaan Pengguna:
  // "Data pada sheet REKAP HB TAHUNAN pada bulan Januari sampai bulan Agustus Nilainya 0.
  // Jika 0 atau tidak ada datanya maka diaplikasi juga 0."
  return 0;
}

/**
 * Menghitung rekomendasi klinis efektif pasien:
 * Sesuai mode sesi:
 * - Pada CEK HB SELURUH PASIEN: Semua pasien tanpa hasil lab berstatus Menunggu Hasil Lab (Hb: 0).
 * - Pada CEK HB PILIHAN: Pasien tidak terjadwal (Hb >= 9.0) otomatis alokasi dosis pemeliharaan (maintenance)
 *   sesuai nilai stabil bulan sebelumnya, sedangkan pasien terjadwal atau Hb 0 berstatus Menunggu Hasil Lab.
 */
export function getEffectivePatientRecommendation(
  patient: PatientRecord, 
  targetMonth?: string,
  scopeOverride?: 'PILIHAN' | 'SELURUH'
): ClinicalRecommendation {
  const effHb = getEffectivePatientHb(patient, targetMonth, scopeOverride);
  if (effHb > 0) {
    return calculateClinicalRecommendation(effHb, patient.hdFrequency);
  }

  const currentMonth = targetMonth || patient.monthPeriod || '';
  let effectiveScope: 'PILIHAN' | 'SELURUH' = scopeOverride || 'PILIHAN';
  if (!scopeOverride && currentMonth) {
    try {
      const stored = localStorage.getItem(`epocare_lab_schedule_mode_${currentMonth}`) || localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH' || stored === 'PILIHAN') {
        effectiveScope = stored;
      }
    } catch (e) {
      // ignore
    }
  }

  // Pada Sesi Cek Hb Pilihan:
  // Pasien tidak terjadwal (karena Hb bulan sebelumnya >= 9.0) otomatis mendapatkan terapi maintenance
  if (effectiveScope === 'PILIHAN') {
    const prevHb = typeof patient.prevHbValue === 'number' && patient.prevHbValue > 0 ? patient.prevHbValue : 0;
    if (prevHb >= 9.0 && !isSelectiveHbCandidate(patient)) {
      const maintenanceReco = calculateClinicalRecommendation(prevHb, patient.hdFrequency);
      return {
        ...maintenanceReco,
        doseDescription: `${maintenanceReco.doseDescription} (Acuan Hb Stabil: ${prevHb.toFixed(1)} g/dL)`,
        notes: `Nilai Hb bulan lalu stabil (${prevHb.toFixed(1)} g/dL ≥ 9.0). Pasien tidak melakukan Cek Hb dan otomatis menggunakan alokasi pemeliharaan EPO.`,
      };
    }
  }

  return calculateClinicalRecommendation(0, patient.hdFrequency);
}

/**
 * Memberikan styling warna teks dan keterangan protokol klinis hemodialisa berdasarkan nilai Hb:
 * 1. Hb < 5.9: Merah pekat (Transfusi 2 Kantong via Rawat Inap)
 * 2. Hb 6.0 - 6.9: Oranye / Amber (Transfusi 1 Kantong)
 * 3. Hb 7.0 - 8.9: Biru (Terapi EPO 4x 2000 IU)
 * 4. Hb 9.0 - 12.0: Hijau / Emerald (Terapi EPO 1x 2000 IU - Maintenance)
 * 5. Hb > 12.00: Ungu (Tanpa Terapi EPO)
 * 6. Hb <= 0 / belum input: Abu-abu (Menunggu Lab)
 */
export function getHbProtocolStyle(hbValue: number): {
  colorClass: string;
  bgClass: string;
  cellClass: string;
  protocolName: string;
} {
  const hb = Number(hbValue);
  if (isNaN(hb) || hb <= 0) {
    return {
      colorClass: 'text-slate-500 dark:text-slate-400 font-semibold',
      bgClass: 'bg-slate-100/70 dark:bg-slate-800/40',
      cellClass: 'bg-slate-100/70 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400',
      protocolName: 'Hasil Lab Hb Belum Diinputkan (Hb: 0)',
    };
  }
  if (hb < 5.95) {
    return {
      colorClass: 'text-rose-700 dark:text-rose-300 font-black',
      bgClass: 'bg-rose-100/80 dark:bg-rose-950/60',
      cellClass: 'bg-rose-100/80 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300',
      protocolName: 'Protokol 1: Hb < 5.9 — Transfusi 2 Bag Rawat Inap',
    };
  }
  if (hb < 6.95) {
    return {
      colorClass: 'text-amber-800 dark:text-amber-300 font-black',
      bgClass: 'bg-amber-100/80 dark:bg-amber-950/60',
      cellClass: 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
      protocolName: 'Protokol 2: Hb 6.0 – 6.9 — Transfusi 1 Bag PRC',
    };
  }
  if (hb < 8.95) {
    return {
      colorClass: 'text-blue-800 dark:text-blue-300 font-black',
      bgClass: 'bg-blue-100/80 dark:bg-blue-950/60',
      cellClass: 'bg-blue-100/80 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300',
      protocolName: 'Protokol 3: Hb 7.0 – 8.9 — Terapi EPO 4x 2000 IU',
    };
  }
  if (hb <= 12.00) {
    return {
      colorClass: 'text-emerald-800 dark:text-emerald-300 font-black',
      bgClass: 'bg-emerald-100/80 dark:bg-emerald-950/60',
      cellClass: 'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300',
      protocolName: 'Protokol 4: Hb 9.0 – 12.0 — Terapi EPO 1x 2000 IU (Maintenance)',
    };
  }
  return {
    colorClass: 'text-purple-800 dark:text-purple-300 font-black',
    bgClass: 'bg-purple-100/80 dark:bg-purple-950/60',
    cellClass: 'bg-purple-100/80 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300',
    protocolName: 'Protokol 5: Hb > 12.00 — Tanpa Terapi EPO',
  };
}

/**
 * Mendapatkan SingleHDDay ('Senin' s/d 'Sabtu') dari string tanggal (YYYY-MM-DD)
 */
function getSingleDayFromDateInternal(dateStr?: string): SingleHDDay {
  if (!dateStr) return 'Senin';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return 'Senin';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!y || !m || !d) return 'Senin';
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  switch (day) {
    case 1: return 'Senin';
    case 2: return 'Selasa';
    case 3: return 'Rabu';
    case 4: return 'Kamis';
    case 5: return 'Jumat';
    case 6: return 'Sabtu';
    default: return 'Senin';
  }
}

/**
 * Menghitung tanggal pertemuan HD ke-1 dan ke-2 di bulan terkait untuk pasien
 */
export function computeSecondHDDateOfMonth(
  yearMonth: string,
  scheduleDay: HDDaySchedule = 'Senin - Kamis',
  singleDay?: SingleHDDay,
  hdFrequency?: HDFrequency,
  lastHdDate?: string
): { firstDate: { dateNumber: number; dateString: string }; secondDate: { dateNumber: number; dateString: string } } {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  const sessions: { dateNumber: number; dateString: string }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dayOfWeek = dt.getDay(); // 0 = Minggu, 1 = Senin, ... 6 = Sabtu
    const dateString = `${yearMonth}-${String(d).padStart(2, '0')}`;

    let isHD = false;
    if (hdFrequency === '1 kali / 2 minggu') {
      const effectiveSingleDay = singleDay || (lastHdDate ? getSingleDayFromDateInternal(lastHdDate) : undefined);
      const targetDay = effectiveSingleDay 
        ? (effectiveSingleDay === 'Senin' ? 1 : effectiveSingleDay === 'Selasa' ? 2 : effectiveSingleDay === 'Rabu' ? 3 : effectiveSingleDay === 'Kamis' ? 4 : effectiveSingleDay === 'Jumat' ? 5 : 6) 
        : (scheduleDay === 'Senin - Kamis' ? 1 : scheduleDay === 'Selasa - Jumat' ? 2 : 3);
      if (dayOfWeek === targetDay) {
        if (lastHdDate) {
          const [lY, lM, lD] = lastHdDate.split('-').map(Number);
          const lastUtc = Date.UTC(lY, lM - 1, lD);
          const currUtc = Date.UTC(year, month - 1, d);
          const diffDays = Math.round((currUtc - lastUtc) / (1000 * 60 * 60 * 24));
          isHD = Math.abs(diffDays) % 14 === 0;
        } else {
          // Cari hari target pertama di bulan ini sebagai acuan kelipatan 14 hari
          let firstTargetDay = 1;
          for (let f = 1; f <= 7; f++) {
            if (new Date(year, month - 1, f).getDay() === targetDay) {
              firstTargetDay = f;
              break;
            }
          }
          isHD = (d - firstTargetDay) % 14 === 0;
        }
      }
    } else if (hdFrequency === '1 kali dalam satu minggu' && singleDay) {
      const targetDay = singleDay === 'Senin' ? 1 : singleDay === 'Selasa' ? 2 : singleDay === 'Rabu' ? 3 : singleDay === 'Kamis' ? 4 : singleDay === 'Jumat' ? 5 : 6;
      isHD = dayOfWeek === targetDay;
    } else if (scheduleDay === 'Senin - Kamis') {
      isHD = dayOfWeek === 1 || dayOfWeek === 4;
    } else if (scheduleDay === 'Selasa - Jumat') {
      isHD = dayOfWeek === 2 || dayOfWeek === 5;
    } else if (scheduleDay === 'Rabu - Sabtu') {
      isHD = dayOfWeek === 3 || dayOfWeek === 6;
    }

    if (isHD) {
      sessions.push({ dateNumber: d, dateString });
    }
  }

  const defaultFirst = { dateNumber: 1, dateString: `${yearMonth}-01` };
  const first = sessions[0] || defaultFirst;
  const second = sessions[1] || first;

  return { firstDate: first, secondDate: second };
}

/**
 * Menghasilkan jadwal 4 minggu default untuk pasien baru sesuai rekomendasi dosis:
 * Sesuai Protokol Klinis Hemodialisa: Penjadwalan pemberian EPO otomatis dijadwalkan
 * pada pertemuan HD kedua di bulan terkait sesuai jadwal masing-masing pasien,
 * dan untuk pasien 1x/2 minggu dijadwalkan pada Sesi 1 dan Sesi 2.
 */
export function generateDefaultWeeks(
  category: string, 
  yearMonth: string, 
  hdFrequency?: HDFrequency,
  scheduleDay?: HDDaySchedule,
  singleDay?: SingleHDDay,
  lastHdDate?: string
): PatientRecord['weeks'] {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

  const { firstDate, secondDate } = computeSecondHDDateOfMonth(yearMonth, scheduleDay, singleDay, hdFrequency, lastHdDate);

  // Estimasi tanggal untuk minggu-minggu berikutnya jika diperlukan
  const formatDay = (day: number) => {
    const d = new Date(year, month - 1, Math.min(day, 28));
    return d.toISOString().split('T')[0];
  };

  const isBiweekly = hdFrequency === '1 kali / 2 minggu';
  const isOnceWeekly = hdFrequency === '1 kali dalam satu minggu';
  const isEpo4x = category === 'EPO_4X_2000';
  const isEpo1x = category === 'EPO_1X_2000';

  if (isBiweekly) {
    if (isEpo4x) {
      // Pasien HD 1x/2 minggu (2x 2000 IU / 2 ampul):
      // Sesuai aturan: Pemberian EPO dimulai dari SESI AWAL HD (Sesi 1), dan sesi berikutnya di Sesi 2 (14 hari kemudian).
      const firstWeekNum = firstDate.dateNumber <= 7 ? 1 : 2;
      const secondWeekNum = secondDate.dateNumber <= 21 ? 3 : 4;

      const weeksRes: PatientRecord['weeks'] = {
        week1: { weekNumber: 1, status: 'Tidak Ada Jadwal', doseIU: 0 },
        week2: { weekNumber: 2, status: 'Tidak Ada Jadwal', doseIU: 0 },
        week3: { weekNumber: 3, status: 'Tidak Ada Jadwal', doseIU: 0 },
        week4: { weekNumber: 4, status: 'Tidak Ada Jadwal', doseIU: 0 },
      };

      weeksRes[`week${firstWeekNum}` as 'week1' | 'week2'] = {
        weekNumber: firstWeekNum as 1 | 2,
        plannedDate: firstDate.dateString,
        status: 'Belum',
        doseIU: 2000,
        notes: 'Pemberian EPO Sesi Awal HD (1x/2 Minggu)',
      };

      if (secondDate.dateNumber !== firstDate.dateNumber) {
        weeksRes[`week${secondWeekNum}` as 'week3' | 'week4'] = {
          weekNumber: secondWeekNum as 3 | 4,
          plannedDate: secondDate.dateString,
          status: 'Belum',
          doseIU: 2000,
          notes: 'Pemberian EPO Sesi HD Kedua (1x/2 Minggu)',
        };
      }

      return weeksRes;
    }

    if (isEpo1x) {
      // Pasien HD 1x/2 minggu dosis pemeliharaan 1x 2000 IU:
      // Pemberian EPO dimulai dari SESI AWAL HD (Sesi 1)
      const firstWeekNum = firstDate.dateNumber <= 7 ? 1 : 2;

      const weeksRes: PatientRecord['weeks'] = {
        week1: { weekNumber: 1, status: 'Tidak Ada Jadwal', doseIU: 0 },
        week2: { weekNumber: 2, status: 'Tidak Ada Jadwal', doseIU: 0 },
        week3: { weekNumber: 3, status: 'Tidak Ada Jadwal', doseIU: 0 },
        week4: { weekNumber: 4, status: 'Tidak Ada Jadwal', doseIU: 0 },
      };

      weeksRes[`week${firstWeekNum}` as 'week1' | 'week2'] = {
        weekNumber: firstWeekNum as 1 | 2,
        plannedDate: firstDate.dateString,
        status: 'Belum',
        doseIU: 2000,
        notes: 'Terjadwal EPO 1x 2000 IU Sesi Awal HD (1x/2 Minggu)',
      };

      return weeksRes;
    }

    return {
      week1: { weekNumber: 1, status: 'Tidak Ada Jadwal', doseIU: 0 },
      week2: { weekNumber: 2, status: 'Tidak Ada Jadwal', doseIU: 0 },
      week3: { weekNumber: 3, status: 'Tidak Ada Jadwal', doseIU: 0 },
      week4: { weekNumber: 4, status: 'Tidak Ada Jadwal', doseIU: 0 },
    };
  }

  if (isOnceWeekly) {
    if (isEpo4x) {
      // Pasien HD 1x/minggu: Pemberian EPO dimulai dari SESI AWAL HD (Minggu 1 / Sesi 1)
      return {
        week1: {
          weekNumber: 1,
          plannedDate: firstDate.dateString,
          status: 'Belum',
          doseIU: 2000,
          notes: 'Pemberian EPO Sesi Awal HD (HD 1x/Minggu)',
        },
        week2: {
          weekNumber: 2,
          plannedDate: formatDay(firstDate.dateNumber + 7),
          status: 'Belum',
          doseIU: 2000,
        },
        week3: {
          weekNumber: 3,
          plannedDate: formatDay(firstDate.dateNumber + 14),
          status: 'Belum',
          doseIU: 2000,
        },
        week4: {
          weekNumber: 4,
          plannedDate: formatDay(firstDate.dateNumber + 21),
          status: 'Belum',
          doseIU: 2000,
        },
      };
    }

    if (isEpo1x) {
      // Pasien HD 1x/minggu (Maintenance): Dimulai dari SESI AWAL HD
      return {
        week1: {
          weekNumber: 1,
          plannedDate: firstDate.dateString,
          status: 'Belum',
          doseIU: 2000,
          notes: 'Terjadwal EPO 1x 2000 IU Sesi Awal HD (HD 1x/Minggu)',
        },
        week2: { weekNumber: 2, status: 'Tidak Ada Jadwal', doseIU: 0 },
        week3: { weekNumber: 3, status: 'Tidak Ada Jadwal', doseIU: 0 },
        week4: { weekNumber: 4, status: 'Tidak Ada Jadwal', doseIU: 0 },
      };
    }

    return {
      week1: { weekNumber: 1, status: 'Tidak Ada Jadwal', doseIU: 0 },
      week2: { weekNumber: 2, status: 'Tidak Ada Jadwal', doseIU: 0 },
      week3: { weekNumber: 3, status: 'Tidak Ada Jadwal', doseIU: 0 },
      week4: { weekNumber: 4, status: 'Tidak Ada Jadwal', doseIU: 0 },
    };
  }

  // Pasien 2x/minggu: Alokasi dimulai pada pertemuan HD kedua di bulan terkait
  return {
    week1: {
      weekNumber: 1,
      plannedDate: secondDate.dateString,
      status: (isEpo4x || isEpo1x) ? 'Belum' : 'Tidak Ada Jadwal',
      doseIU: (isEpo4x || isEpo1x) ? 2000 : 0,
      notes: (isEpo4x || isEpo1x) ? 'Otomatis dijadwalkan pada pertemuan HD kedua di bulan terkait' : undefined,
    },
    week2: {
      weekNumber: 2,
      plannedDate: formatDay(secondDate.dateNumber + 7),
      status: isEpo4x ? 'Belum' : 'Tidak Ada Jadwal',
      doseIU: isEpo4x ? 2000 : 0,
    },
    week3: {
      weekNumber: 3,
      plannedDate: formatDay(secondDate.dateNumber + 14),
      status: isEpo4x ? 'Belum' : 'Tidak Ada Jadwal',
      doseIU: isEpo4x ? 2000 : 0,
    },
    week4: {
      weekNumber: 4,
      plannedDate: formatDay(secondDate.dateNumber + 21),
      status: isEpo4x ? 'Belum' : 'Tidak Ada Jadwal',
      doseIU: isEpo4x ? 2000 : 0,
    },
  };
}

/**
 * Daftar No. RM demo bawaan sistem yang dihapus
 */
export const DEMO_NO_RMS = new Set([
  'RM-01007',
  'RM-04821',
  'RM-08542',
  'RM-05112',
  'RM-09120',
  'RM-03991',
  'RM-06204',
  'RM-01002',
  'RM-02450',
  'RM-07133'
]);

/**
 * Memeriksa apakah data pasien merupakan pasien demo bawaan sistem
 */
export function isDemoPatient(patient?: { noRm?: string; name?: string }): boolean {
  if (!patient) return false;
  if (patient.noRm && DEMO_NO_RMS.has(patient.noRm.trim())) return true;
  const name = (patient.name || '').toLowerCase();
  return (
    name.includes('ahmad subarkah') ||
    name.includes('hendra wijaya') ||
    name.includes('mulyadi saputra') ||
    name.includes('siti aminah') ||
    name.includes('endang susilowati') ||
    name.includes('bambang sutrisno') ||
    name.includes('ratna dewi') ||
    name.includes('rahmat hidayat') ||
    name.includes('agus gunawan') ||
    name.includes('kartini rahayu')
  );
}

/**
 * Data awal pasien sistem (dikosongkan sesuai permintaan pengguna)
 */
export function getInitialDemoPatients(): PatientRecord[] {
  return [];
}

/**
 * Membersihkan sebutan/honorifik medis umum di Indonesia (Tn, Ny, Nn, An, By, Sdr, Sdri, Mr, Mrs, Ms, dr, Ust, H, Hj, dll.)
 * agar pengurutan abjad nama pasien berfokus pada nama asli pasien.
 */
export function getCleanPatientNameForSort(name: string): string {
  if (!name) return '';
  let clean = name.trim();
  // Hapus tanda kutip atau kurung pembuka jika ada
  clean = clean.replace(/^["'([{]+/, '');
  // Hapus sebutan kehormatan / sapaan umum rekam medis Indonesia di awal nama
  clean = clean.replace(/^(tn|ny|nn|an|by|sdr|sdri|mr|mrs|ms|dr|ust|h|hj)\.?\s+/i, '');
  return clean.trim();
}

/**
 * Mengurutkan array pasien secara otomatis berdasarkan nama sesuai abjad (A - Z)
 * Menggunakan pembersihan honorifik medis dan perbandingan locale Indonesia case-insensitive & numeric collation
 */
export function sortPatientsAlphabetically<T extends { name: string }>(patientList: T[], order: 'ASC' | 'DESC' = 'ASC'): T[] {
  return [...patientList].sort((a, b) => {
    const rawA = (a.name || '').trim();
    const rawB = (b.name || '').trim();
    const cleanA = getCleanPatientNameForSort(rawA);
    const cleanB = getCleanPatientNameForSort(rawB);

    // Bandingkan berdasarkan nama bersih terlebih dahulu
    const comparison = cleanA.localeCompare(cleanB, 'id', { sensitivity: 'base', numeric: true });
    if (comparison !== 0) {
      return order === 'ASC' ? comparison : -comparison;
    }

    // Jika nama bersih sama persis, gunakan perbandingan nama asli sebagai penentu cadangan
    const rawComparison = rawA.localeCompare(rawB, 'id', { sensitivity: 'base', numeric: true });
    return order === 'ASC' ? rawComparison : -rawComparison;
  });
}


