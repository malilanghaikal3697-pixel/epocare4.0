import { PatientRecord, HDDaySchedule, HDShift, HDFrequency, SingleHDDay, DoseStatus, DailyActionRecord, isSelectiveHbCandidate } from '../types/dialysis';
import { calculateClinicalRecommendation, generateDefaultWeeks, getEffectivePatientRecommendation, getEffectivePatientHb } from './clinicalRules';

export const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxn0Iym9cWYr6fENri-ZMJx_oo5vS5LvN6UD5pU_mOiOrhjS8wXDn2hy6_51mjA4Ic7kg/exec';

export const OFFICIAL_SPREADSHEET_ID = '1O7mUzJoS19u4v4BYD5wI4xe2mjfBYn3wzNLmi11KlY8';
export const OFFICIAL_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1O7mUzJoS19u4v4BYD5wI4xe2mjfBYn3wzNLmi11KlY8/edit';

export const SCHEDULE_SHEETS: { title: HDDaySchedule; tabName: string }[] = [
  { title: 'Senin - Kamis', tabName: 'Senin-Kamis' },
  { title: 'Selasa - Jumat', tabName: 'Selasa-Jumat' },
  { title: 'Rabu - Sabtu', tabName: 'Rabu-Sabtu' },
];

/**
 * Mendapatkan indeks hari (1=Senin s/d 6=Sabtu) dari pilihan hari tunggal
 */
export function getDayOfWeekFromSingleDay(day: SingleHDDay): number {
  switch (day) {
    case 'Senin': return 1;
    case 'Selasa': return 2;
    case 'Rabu': return 3;
    case 'Kamis': return 4;
    case 'Jumat': return 5;
    case 'Sabtu': return 6;
    default: return 1;
  }
}

/**
 * Menentukan grup sheet HD ('Senin - Kamis', 'Selasa - Jumat', 'Rabu - Sabtu')
 * berdasarkan pilihan hari tunggal
 */
export function getScheduleDayFromSingleDay(day: SingleHDDay): HDDaySchedule {
  if (day === 'Senin' || day === 'Kamis') return 'Senin - Kamis';
  if (day === 'Selasa' || day === 'Jumat') return 'Selasa - Jumat';
  return 'Rabu - Sabtu';
}

/**
 * Mendapatkan SingleHDDay ('Senin' s/d 'Sabtu') dari string tanggal (YYYY-MM-DD)
 */
export function getSingleDayFromDate(dateStr: string): SingleHDDay {
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
 * Mendapatkan tanggal dan waktu real-time dengan zona waktu Indonesia (WIB / Asia/Jakarta: UTC+7).
 * Hal ini memastikan bahwa jika aplikasi berjalan di browser atau lingkungan dengan zona waktu UTC/US,
 * tanggal aktif yang dideteksi sistem selalu tepat dengan kalender di Indonesia (WIB).
 */
export function getNowInIndonesianTime(dateInput?: Date): {
  date: Date;
  year: number;
  month: number; // 1-12
  dateNumber: number; // 1-31
  dayOfWeek: number; // 0 = Minggu, 1 = Senin, ... 6 = Sabtu
  dayName: string; // 'Minggu', 'Senin', ...
  yearMonth: string; // 'YYYY-MM'
  dateString: string; // 'YYYY-MM-DD'
  formattedFull: string;
} {
  const now = dateInput || new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let dateNumber = now.getDate();
  let weekdayStr = '';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
    const parts = formatter.formatToParts(now);
    for (const part of parts) {
      if (part.type === 'year') year = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10);
      if (part.type === 'day') dateNumber = parseInt(part.value, 10);
      if (part.type === 'weekday') weekdayStr = part.value;
    }
  } catch {
    // fallback
  }

  // Jika perangkat lokal browser sudah berada di tanggal yang lebih baru (misal WITA UTC+8 atau WIT UTC+9)
  const localDate = now.getDate();
  const localMonth = now.getMonth() + 1;
  const localYear = now.getFullYear();

  if (
    localYear > year ||
    (localYear === year && localMonth > month) ||
    (localYear === year && localMonth === month && localDate > dateNumber)
  ) {
    year = localYear;
    month = localMonth;
    dateNumber = localDate;
  }

  const calibratedDateObj = new Date(year, month - 1, dateNumber);
  const dayOfWeek = calibratedDateObj.getDay();
  const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = daysIndo[dayOfWeek];

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(dateNumber).padStart(2, '0')}`;

  const monthNamesIndo = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  return {
    date: now,
    year,
    month,
    dateNumber,
    dayOfWeek,
    dayName,
    yearMonth,
    dateString,
    formattedFull: `${dayName}, ${dateNumber} ${monthNamesIndo[month - 1]} ${year}`,
  };
}

/**
 * Menentukan jadwal HD aktif ('Senin - Kamis', 'Selasa - Jumat', 'Rabu - Sabtu')
 * berdasarkan hari kalender real-time saat ini (WIB / Indonesia).
 */
export function getActiveHDDaySchedule(date?: Date): HDDaySchedule {
  const day = date ? date.getDay() : getNowInIndonesianTime().dayOfWeek;
  switch (day) {
    case 1: // Senin
    case 4: // Kamis
      return 'Senin - Kamis';
    case 2: // Selasa
    case 5: // Jumat
      return 'Selasa - Jumat';
    case 3: // Rabu
    case 6: // Sabtu
      return 'Rabu - Sabtu';
    case 0: // Minggu (Hari libur HD, default mengacu ke sesi terdekat Senin - Kamis)
    default:
      return 'Senin - Kamis';
  }
}

/**
 * Mendapatkan nama hari real-time bahasa Indonesia (Senin s/d Minggu)
 */
export function getTodayDayName(date?: Date): string {
  if (date) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[date.getDay()];
  }
  return getNowInIndonesianTime().dayName;
}

/**
 * Mendapatkan jumlah hari dalam bulan tertentu dan daftar hari per tanggal
 */
export function getMonthDaysInfo(yearMonth: string) {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days: { dateNumber: number; dayOfWeek: number; dateString: string }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    days.push({
      dateNumber: d,
      dayOfWeek: dateObj.getDay(), // 0 = Minggu, 1 = Senin, ... 6 = Sabtu
      dateString: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  return { year, month, daysInMonth, days };
}

/**
 * Mengecek apakah tanggal tertentu merupakan hari jadwal sesi HD pasien.
 * Mendukung:
 * - Pasien 2x/minggu (Senin-Kamis, Selasa-Jumat, Rabu-Sabtu)
 * - Pasien 1x/minggu (Senin s/d Sabtu)
 * - Pasien 1x / 2 minggu (2 minggu sekali berjarak 14 hari dari Jadwal HD Terakhir pasien)
 */
export function isDateInHDDay(
  dayOfWeek: number, 
  scheduleDay: HDDaySchedule,
  singleDay?: SingleHDDay,
  hdFrequency?: HDFrequency,
  dateString?: string,
  lastHdDate?: string
): boolean {
  if (hdFrequency === '1 kali / 2 minggu') {
    const effectiveSingleDay = singleDay || (lastHdDate ? getSingleDayFromDate(lastHdDate) : undefined);
    if (effectiveSingleDay) {
      if (dayOfWeek !== getDayOfWeekFromSingleDay(effectiveSingleDay)) {
        return false;
      }
    } else {
      const primaryDay = scheduleDay === 'Senin - Kamis' ? 1 : scheduleDay === 'Selasa - Jumat' ? 2 : 3;
      if (dayOfWeek !== primaryDay) return false;
    }

    // Jika ada tanggal acuan HD Terakhir (lastHdDate) dan dateString:
    if (lastHdDate && dateString) {
      const [lY, lM, lD] = lastHdDate.split('-').map(Number);
      const [cY, cM, cD] = dateString.split('-').map(Number);
      if (lY && lM && lD && cY && cM && cD) {
        const lastUtc = Date.UTC(lY, lM - 1, lD);
        const currUtc = Date.UTC(cY, cM - 1, cD);
        const diffDays = Math.round((currUtc - lastUtc) / (1000 * 60 * 60 * 24));
        return Math.abs(diffDays) % 14 === 0;
      }
    }

    // Fallback jika belum mengisi lastHdDate: dua sesi berjarak 14 hari
    if (dateString) {
      const parts = dateString.split('-').map(Number);
      const y = parts[0];
      const m = parts[1];
      const d = parts[2];
      const targetDay = effectiveSingleDay 
        ? getDayOfWeekFromSingleDay(effectiveSingleDay)
        : (scheduleDay === 'Senin - Kamis' ? 1 : scheduleDay === 'Selasa - Jumat' ? 2 : 3);
      let firstTarget = 1;
      for (let f = 1; f <= 7; f++) {
        if (new Date(y, m - 1, f).getDay() === targetDay) {
          firstTarget = f;
          break;
        }
      }
      return (d - firstTarget) % 14 === 0;
    }
    return true;
  }

  if (hdFrequency === '1 kali dalam satu minggu' && singleDay) {
    return dayOfWeek === getDayOfWeekFromSingleDay(singleDay);
  }
  if (scheduleDay === 'Senin - Kamis') {
    return dayOfWeek === 1 || dayOfWeek === 4; // Senin (1), Kamis (4)
  }
  if (scheduleDay === 'Selasa - Jumat') {
    return dayOfWeek === 2 || dayOfWeek === 5; // Selasa (2), Jumat (5)
  }
  if (scheduleDay === 'Rabu - Sabtu') {
    return dayOfWeek === 3 || dayOfWeek === 6; // Rabu (3), Sabtu (6)
  }
  return false;
}

/**
 * Menemukan tanggal sesi HD pertama pasien di bulan berjalan (Awal Pertemuan saat jadwal HD dilaksanakan).
 * Digunakan sebagai acuan klinis utama tanggal pemeriksaan Hb lab awal bulan.
 */
export function getFirstHDDateOfMonth(
  yearMonth: string,
  scheduleDay: HDDaySchedule,
  singleDay?: SingleHDDay,
  hdFrequency?: HDFrequency,
  lastHdDate?: string
): { dateNumber: number; dateString: string } {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const dateString = `${yearMonth}-${String(d).padStart(2, '0')}`;
    if (isDateInHDDay(dayOfWeek, scheduleDay, singleDay, hdFrequency, dateString, lastHdDate)) {
      return { dateNumber: d, dateString };
    }
  }

  return { dateNumber: 1, dateString: `${yearMonth}-01` };
}

/**
 * Menemukan tanggal sesi HD kedua pasien di bulan berjalan (Pertemuan HD Kedua).
 * Sesuai protokol klinis hemodialisa: Inisiasi/penjadwalan pemberian EPO otomatis dijadwalkan pada pertemuan HD kedua.
 */
export function getSecondHDDateOfMonth(
  yearMonth: string,
  scheduleDay: HDDaySchedule,
  singleDay?: SingleHDDay,
  hdFrequency?: HDFrequency,
  lastHdDate?: string
): { dateNumber: number; dateString: string } {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  let count = 0;
  let firstDate = { dateNumber: 1, dateString: `${yearMonth}-01` };

  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const dateString = `${yearMonth}-${String(d).padStart(2, '0')}`;
    if (isDateInHDDay(dayOfWeek, scheduleDay, singleDay, hdFrequency, dateString, lastHdDate)) {
      count++;
      if (count === 1) {
        firstDate = { dateNumber: d, dateString };
      }
      if (count === 2) {
        return { dateNumber: d, dateString };
      }
    }
  }

  return firstDate;
}

/**
 * Mendapatkan seluruh daftar sesi HD pasien di bulan berjalan dalam urutan kronologis.
 * Menghasilkan indeks sesi 1, 2, 3, ... untuk menentukan Pertemuan Pertama, Pertemuan Kedua, dst.
 */
export function getPatientMonthHDSessions(
  patient: PatientRecord,
  monthInfo: { daysInMonth: number; days: { dateNumber: number; dayOfWeek: number; dateString: string }[] }
): { dateNumber: number; dayOfWeek: number; dateString: string; sessionIndex: number }[] {
  const sessions: { dateNumber: number; dayOfWeek: number; dateString: string; sessionIndex: number }[] = [];
  let index = 1;
  for (let d = 1; d <= monthInfo.daysInMonth; d++) {
    const day = monthInfo.days[d - 1];
    if (day && isDateInHDDay(day.dayOfWeek, patient.scheduleDay, patient.singleDay, patient.hdFrequency, day.dateString, patient.lastHdDate)) {
      sessions.push({
        dateNumber: d,
        dayOfWeek: day.dayOfWeek,
        dateString: day.dateString,
        sessionIndex: index++,
      });
    }
  }
  return sessions;
}

/**
 * Mengecek apakah hari/tanggal ini merupakan Hari Awal dari pasangan jadwal HD pasien:
 * - Senin - Kamis => Hari Awal = Senin (dayOfWeek === 1)
 * - Selasa - Jumat => Hari Awal = Selasa (dayOfWeek === 2)
 * - Rabu - Sabtu => Hari Awal = Rabu (dayOfWeek === 3)
 * Untuk pasien 1x/minggu dan 1x/2 minggu, setiap sesinya merupakan Sesi Utama.
 */
export function isPrimaryHDDay(
  dayOfWeek: number, 
  scheduleDay: HDDaySchedule,
  singleDay?: SingleHDDay,
  hdFrequency?: HDFrequency
): boolean {
  if (hdFrequency === '1 kali dalam satu minggu' || hdFrequency === '1 kali / 2 minggu') {
    return true;
  }
  if (scheduleDay === 'Senin - Kamis') return dayOfWeek === 1;
  if (scheduleDay === 'Selasa - Jumat') return dayOfWeek === 2;
  if (scheduleDay === 'Rabu - Sabtu') return dayOfWeek === 3;
  return false;
}

/**
 * Apakah tanggal tertentu merupakan sesi pengecekan Hb awal bulan bagi pasien ini?
 * Acuan klinis: Cek HB tetap dilaksanakan diawal pertemuan pada saat jadwal HD dilaksanakan,
 * baik untuk pasien 2x/minggu, 1x/minggu, maupun 1x/2 minggu.
 */
export function isPatientHbCheckDay(
  dateNumber: number,
  days: { dateNumber: number; dayOfWeek: number; dateString: string }[],
  patient: PatientRecord
): boolean {
  const currentDay = days[dateNumber - 1];
  if (!currentDay || !isDateInHDDay(currentDay.dayOfWeek, patient.scheduleDay, patient.singleDay, patient.hdFrequency, currentDay.dateString, patient.lastHdDate)) {
    return false;
  }

  // Cari tanggal sesi HD pertama pasien di bulan berjalan (diawal pertemuan saat jadwal HD dilaksanakan)
  let firstHDDateNumber: number | null = null;
  for (let d = 1; d <= days.length; d++) {
    if (isDateInHDDay(days[d - 1].dayOfWeek, patient.scheduleDay, patient.singleDay, patient.hdFrequency, days[d - 1].dateString, patient.lastHdDate)) {
      firstHDDateNumber = d;
      break;
    }
  }

  // Jika pasien berstatus 'Tidak Ada Jadwal' Cek Lab:
  if (patient.labSchedule?.status === 'Tidak Ada Jadwal') {
    return false;
  }

  // Jika pasien memiliki nilai Hb bulan lalu stabil >= 9.0 dan BUKAN kandidat Cek Hb Pilihan:
  // Pasien ini tidak menjalani cek lab awal bulan, melainkan langsung otomatis mendapatkan alokasi EPO pemeliharaan!
  const prevHb = typeof patient.prevHbValue === 'number' ? patient.prevHbValue : 0;
  if (prevHb >= 9.0 && !isSelectiveHbCandidate(patient) && !patient.labSchedule?.scheduledDate) {
    return false;
  }

  // Prioritas 1: Jika pasien memiliki jadwal cek lab manual yang ditentukan pengguna
  if (patient.labSchedule?.scheduledDate) {
    const targetLabDay = days.find((d) => d.dateString === patient.labSchedule?.scheduledDate);
    if (targetLabDay) {
      return dateNumber === targetLabDay.dateNumber;
    }
  }

  // Prioritas 2: Jika pasien memiliki hbDate spesifik yang valid pada salah satu hari jadwal HD pasien di bulan ini
  if (patient.hbDate) {
    const targetDay = days.find((d) => d.dateString === patient.hbDate);
    if (targetDay && isDateInHDDay(targetDay.dayOfWeek, patient.scheduleDay, patient.singleDay, patient.hdFrequency, targetDay.dateString, patient.lastHdDate)) {
      return dateNumber === targetDay.dateNumber;
    }
  }

  // Default: Cek HB tetap dilaksanakan diawal pertemuan pada saat jadwal HD dilaksanakan
  return dateNumber === firstHDDateNumber;
}

/**
 * Menghitung sesi HD pasangan atau sesi HD berikutnya saat penundaan:
 * - Pasien 1x/2 minggu: Sesi berikutnya adalah 14 hari kemudian (+14 hari)
 * - Pasien 1x/minggu: Sesi berikutnya adalah 7 hari kemudian (+7 hari)
 * - Pasien 2x/minggu:
 *   Hari Awal (Senin/Selasa/Rabu) berpasangan dengan Hari Kedua (+3 hari, misal 7 Sept -> 10 Sept)
 *   Hari Kedua (Kamis/Jumat/Sabtu) merujuk ke Hari Awal (-3 hari)
 */
export function getPairedHDDate(
  dateNumber: number,
  dayOfWeek: number,
  scheduleDay: HDDaySchedule,
  daysInMonth: number,
  hdFrequency?: HDFrequency,
  singleDay?: SingleHDDay
): { isPrimary: boolean; pairedDate: number | null; nextHDDate?: number | null } {
  if (hdFrequency === '1 kali / 2 minggu') {
    const paired = dateNumber + 14;
    return {
      isPrimary: true,
      pairedDate: paired <= daysInMonth ? paired : null,
      nextHDDate: paired <= daysInMonth ? paired : null,
    };
  }

  if (hdFrequency === '1 kali dalam satu minggu') {
    // Untuk pasien 1x/minggu: penundaan sesi dialihkan ke sesi HD berikutnya pada hari rutin yang sama (+7 hari)
    const paired = dateNumber + 7;
    return { 
      isPrimary: true, 
      pairedDate: paired <= daysInMonth ? paired : null,
      nextHDDate: paired <= daysInMonth ? paired : null,
    };
  }

  const isPrimary = isPrimaryHDDay(dayOfWeek, scheduleDay);
  if (isPrimary) {
    const paired = dateNumber + 3;
    return { 
      isPrimary: true, 
      pairedDate: paired <= daysInMonth ? paired : null,
      nextHDDate: paired <= daysInMonth ? paired : null,
    };
  } else {
    // Hari Kedua (Kamis/Jumat/Sabtu):
    // Pasangan mingguan di masa lalu (Hari Awal): dateNumber - 3
    // Sesi HD berikutnya untuk penundaan: dateNumber + 4 (Senin/Selasa/Rabu minggu berikutnya)
    const paired = dateNumber - 3;
    const nextHD = dateNumber + 4;
    return { 
      isPrimary: false, 
      pairedDate: paired >= 1 ? paired : null,
      nextHDDate: nextHD <= daysInMonth ? nextHD : null,
    };
  }
}

/**
 * Menentukan alokasi tanggal spesifik pemberian Terapi EPO 1x 2000 IU (Maintenance):
 * Aturan Klinis:
 * 1. Kuota bulanan tepat 1x 2000 IU (1 vial/bulan).
 * 2. Jika dosis sudah berstatus 'Diberikan' (✅) pada suatu tanggal di bulan ini,
 *    seluruh tanggal HD lainnya menjadi sesi rutin biasa ('HD').
 * 3. Jika dosis ditunda ('Tunda' / ❌), tanggal tujuan pengalihan (postponedToDate) menjadi aktif (2000),
 *    sedangkan tanggal lainnya tetap 'HD'.
 * 4. Sesuai Protokol Klinis Hemodialisa: Penjadwalan pemberian EPO untuk masing-masing pasien
 *    otomatis dijadwalkan pada pertemuan HD KEDUA pada bulan terkait sesuai jadwal masing-masing pasien.
 */
export function getScheduledDateForEpo1x(
  patient: PatientRecord,
  monthInfo: { daysInMonth: number; days: { dateNumber: number; dayOfWeek: number; dateString: string }[] }
): {
  scheduledDate: number | null;
  givenDate: number | null;
  postponedDate: number | null;
  postponedToDate: number | null;
} {
  const records = patient.dailyRecords || {};

  // 1. Cek apakah sudah pernah Diberikan (✅) di tanggal berapapun
  for (const [dateStr, rec] of Object.entries(records)) {
    if (rec.status === 'Diberikan') {
      const gDate = parseInt(dateStr, 10);
      return {
        scheduledDate: null,
        givenDate: gDate,
        postponedDate: null,
        postponedToDate: null,
      };
    }
  }

  // 2. Cek apakah ada penundaan aktif (Tunda / ❌)
  const postponedEntries = Object.entries(records)
    .filter(([_, r]) => r.status === 'Tunda')
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));

  if (postponedEntries.length > 0) {
    const sessions = getPatientMonthHDSessions(patient, monthInfo);
    // Telusuri penundaan dan rantai tujuan penundaan aktif
    let activeSrcDate = parseInt(postponedEntries[0][0], 10);
    let activeDestDate = postponedEntries[0][1].postponedToDate;
    if (!activeDestDate) {
      const s = sessions.find((x) => x.dateNumber === activeSrcDate);
      const ns = s ? sessions.find((x) => x.sessionIndex === s.sessionIndex + 1) : null;
      activeDestDate = ns?.dateNumber;
    }

    // Telusuri rantai jika tujuan penundaan juga berstatus Tunda
    while (activeDestDate && records[activeDestDate]?.status === 'Tunda') {
      activeSrcDate = activeDestDate;
      const nextDest = records[activeDestDate].postponedToDate;
      if (nextDest) {
        activeDestDate = nextDest;
      } else {
        const s = sessions.find((x) => x.dateNumber === activeDestDate);
        const ns = s ? sessions.find((x) => x.sessionIndex === s.sessionIndex + 1) : null;
        activeDestDate = ns?.dateNumber;
      }
    }

    return {
      scheduledDate: (activeDestDate && activeDestDate <= monthInfo.daysInMonth) ? activeDestDate : null,
      givenDate: null,
      postponedDate: activeSrcDate,
      postponedToDate: activeDestDate || null,
    };
  }

  // 3. Cek apakah ada tanggal yang menerima pengalihan penundaan (status Belum dengan postponedFromDate)
  for (const [dateStr, rec] of Object.entries(records)) {
    if (rec.status === 'Belum' && rec.postponedFromDate) {
      const sDate = parseInt(dateStr, 10);
      return {
        scheduledDate: sDate,
        givenDate: null,
        postponedDate: rec.postponedFromDate,
        postponedToDate: sDate,
      };
    }
  }

  // 4. Cek apakah ada tanggal yang di-set manual Belum di dailyRecords
  for (const [dateStr, rec] of Object.entries(records)) {
    if (rec.status === 'Belum') {
      const sDate = parseInt(dateStr, 10);
      return {
        scheduledDate: sDate,
        givenDate: null,
        postponedDate: null,
        postponedToDate: null,
      };
    }
  }

  // 5. Default Alokasi:
  // - Untuk pasien HD 1x/minggu dan 1x/2 minggu: dimulai dari SESI AWAL HD (Sesi Pertama)
  // - Untuk pasien HD 2x/minggu: otomatis pada PERTEMUAN HD KEDUA pada bulan terkait
  const sessions = getPatientMonthHDSessions(patient, monthInfo);
  if (patient.hdFrequency === '1 kali dalam satu minggu' || patient.hdFrequency === '1 kali / 2 minggu') {
    if (sessions.length >= 1) {
      return {
        scheduledDate: sessions[0].dateNumber,
        givenDate: null,
        postponedDate: null,
        postponedToDate: null,
      };
    }
  }

  if (sessions.length >= 2) {
    return {
      scheduledDate: sessions[1].dateNumber,
      givenDate: null,
      postponedDate: null,
      postponedToDate: null,
    };
  } else if (sessions.length === 1) {
    return {
      scheduledDate: sessions[0].dateNumber,
      givenDate: null,
      postponedDate: null,
      postponedToDate: null,
    };
  }

  return {
    scheduledDate: null,
    givenDate: null,
    postponedDate: null,
    postponedToDate: null,
  };
}

export interface DateDoseInfo {
  isHD: boolean;
  isHbCheck: boolean;
  isPrimary: boolean;
  pairedDate: number | null;
  cellCode: 'PRC 2' | 'PRC 1' | 'Cek' | '✅' | '❌' | '2000' | '4000' | 'HD' | 'Hold' | 'Batal' | '-' | string;
  title: string;
  isCatchUp: boolean;
  canTakeAction: boolean;
  currentStatus?: DoseStatus;
  postponedToDate?: number;
  postponedFromDate?: number;
  rescheduledToDate?: number;
  rescheduledFromDate?: number;
  doseIU?: number;
  customCellText?: string;
  isHbUpdateDate?: boolean;
  updatedHbValue?: number;
  labCheckInfo?: {
    testType: string;
    status: string;
    notes?: string;
  };
}

/**
 * Mengecek apakah pasien berstatus non-aktif (Meninggal Dunia, Pindah RS, Berhenti HD) pada tanggal tertentu.
 * Jika statusDate terisi, tindakan sebelum tanggal tersebut tetap aktif sebagai riwayat medis,
 * sedangkan sesi sesudah statusDate dinonaktifkan secara otomatis.
 */
export function isPatientInactiveOnDate(patient: PatientRecord, dateString?: string): boolean {
  if (!patient.patientStatus || patient.patientStatus === 'Aktif') return false;
  if (patient.patientStatus === 'Meninggal Dunia' || patient.patientStatus === 'Pindah RS' || patient.patientStatus === 'Berhenti HD') {
    if (!patient.statusDate) return true;
    if (dateString && dateString > patient.statusDate) return true;
  }
  return false;
}

function getRawDateDoseDisplayInfo(
  patient: PatientRecord,
  dateNumber: number,
  monthInfo: { daysInMonth: number; days: { dateNumber: number; dayOfWeek: number; dateString: string }[] }
): DateDoseInfo {
  const dayInfo = monthInfo.days[dateNumber - 1];
  if (!dayInfo) {
    return {
      isHD: false,
      isHbCheck: false,
      isPrimary: false,
      pairedDate: null,
      cellCode: '-',
      title: 'Bukan Hari Hemodialisa',
      isCatchUp: false,
      canTakeAction: false,
    };
  }

  const existingRecord = patient.dailyRecords?.[dateNumber];
  const isRoutineHD = isDateInHDDay(dayInfo.dayOfWeek, patient.scheduleDay, patient.singleDay, patient.hdFrequency, dayInfo.dateString, patient.lastHdDate);

  // KONDISI KHUSUS: Tanggal ini BUKAN hari HD rutin, namun memiliki catatan tindakan atau menerima tukar hari bebas (reschedule)
  if (!isRoutineHD) {
    if (existingRecord) {
      if (existingRecord.rescheduledToDate) {
        return {
          isHD: true,
          isHbCheck: false,
          isPrimary: false,
          pairedDate: null,
          cellCode: existingRecord.customCellText || `→${existingRecord.rescheduledToDate}`,
          title: `Sesi HD Dipindah (Reschedule) ke Tanggal ${existingRecord.rescheduledToDate}${existingRecord.notes ? ` (${existingRecord.notes})` : ''}`,
          isCatchUp: false,
          canTakeAction: true,
          currentStatus: 'Tunda',
          rescheduledToDate: existingRecord.rescheduledToDate,
          customCellText: existingRecord.customCellText,
          doseIU: existingRecord.doseIU,
        };
      }
      if (existingRecord.rescheduledFromDate) {
        const isGiven = existingRecord.status === 'Diberikan';
        const isTunda = existingRecord.status === 'Tunda';
        const doseIU = existingRecord.doseIU;
        const cellCode = isGiven ? '✅' : isTunda ? '❌' : (existingRecord.customCellText || (doseIU ? `${doseIU}` : 'HD'));
        return {
          isHD: true,
          isHbCheck: false,
          isPrimary: false,
          pairedDate: null,
          cellCode,
          title: isGiven
            ? `✅ = Selesai Diberikan${doseIU ? ` (${doseIU} IU)` : ''} • Sesi Tukar Hari Bebas dari tgl ${existingRecord.rescheduledFromDate}`
            : `Sesi HD Pengganti${doseIU ? ` (${doseIU} IU)` : ' Rutin'} • Tukar Hari Bebas dari tgl ${existingRecord.rescheduledFromDate}${existingRecord.notes ? ` • ${existingRecord.notes}` : ''}`,
          isCatchUp: true,
          canTakeAction: true,
          currentStatus: existingRecord.status,
          rescheduledFromDate: existingRecord.rescheduledFromDate,
          customCellText: existingRecord.customCellText,
          doseIU,
        };
      }
      if (existingRecord.customCellText) {
        const code = existingRecord.customCellText;
        return {
          isHD: true,
          isHbCheck: false,
          isPrimary: false,
          pairedDate: null,
          cellCode: code,
          title: `${code}${existingRecord.doseIU ? ` (${existingRecord.doseIU} IU)` : ''}${existingRecord.notes ? ` • ${existingRecord.notes}` : ''}`,
          isCatchUp: false,
          canTakeAction: true,
          currentStatus: existingRecord.status,
          customCellText: code,
          doseIU: existingRecord.doseIU,
        };
      }
      if (existingRecord.status === 'Diberikan') {
        return {
          isHD: true,
          isHbCheck: false,
          isPrimary: false,
          pairedDate: null,
          cellCode: '✅',
          title: `✅ = EPO Diberikan (${existingRecord.doseIU || 2000} IU) • Sesi Tambahan`,
          isCatchUp: false,
          canTakeAction: true,
          currentStatus: 'Diberikan',
          doseIU: existingRecord.doseIU || 2000,
        };
      }
    }
    return {
      isHD: false,
      isHbCheck: false,
      isPrimary: false,
      pairedDate: null,
      cellCode: '-',
      title: 'Hari Bebas (Bukan Jadwal HD Rutin) — Klik untuk jadwalkan sesi',
      isCatchUp: false,
      canTakeAction: false,
    };
  }

  // Dapatkan seluruh sesi HD rutin pasien di bulan berjalan dalam urutan kronologis
  const sessions = getPatientMonthHDSessions(patient, monthInfo);
  const currentSession = sessions.find((s) => s.dateNumber === dateNumber);
  if (!currentSession) {
    return {
      isHD: false,
      isHbCheck: false,
      isPrimary: false,
      pairedDate: null,
      cellCode: '-',
      title: 'Bukan Hari Hemodialisa',
      isCatchUp: false,
      canTakeAction: false,
    };
  }

  const sessionIndex = currentSession.sessionIndex; // 1 = Pertemuan Pertama, 2 = Pertemuan Kedua, dst.
  const nextSession = sessions.find((s) => s.sessionIndex === sessionIndex + 1);
  const nextHDDate = nextSession ? nextSession.dateNumber : null;
  const pairedDate = nextHDDate;

  const reco = getEffectivePatientRecommendation(patient);
  const effectiveHb = getEffectivePatientHb(patient);
  const isPrimary = sessionIndex === 2; // Pertemuan HD kedua adalah sesi utama alokasi EPO

  // Cek apakah tanggal ini merupakan sesi evaluasi Cek Lab Hb awal bulan (pertemuan pertama atau tanggal manual)
  const isHbCheck = sessionIndex === 1 || isPatientHbCheckDay(dateNumber, monthInfo.days, patient);

  // 1. PRIORITAS UTAMA: Jika sudah ada tindakan yang dicatat oleh petugas pada tanggal ini
  if (existingRecord) {
    if (existingRecord.rescheduledToDate) {
      return {
        isHD: true,
        isHbCheck: false,
        isPrimary,
        pairedDate,
        cellCode: existingRecord.customCellText || `→${existingRecord.rescheduledToDate}`,
        title: `Sesi HD Dipindah ke Tanggal ${existingRecord.rescheduledToDate}${existingRecord.notes ? ` (${existingRecord.notes})` : ''}`,
        isCatchUp: false,
        canTakeAction: true,
        currentStatus: 'Tunda',
        rescheduledToDate: existingRecord.rescheduledToDate,
        customCellText: existingRecord.customCellText,
        doseIU: existingRecord.doseIU,
      };
    }
    if (existingRecord.rescheduledFromDate) {
      const isGiven = existingRecord.status === 'Diberikan';
      const isTunda = existingRecord.status === 'Tunda';
      const doseIU = existingRecord.doseIU;
      const cellCode = isGiven ? '✅' : isTunda ? '❌' : (existingRecord.customCellText || (doseIU ? `${doseIU}` : 'HD'));
      return {
        isHD: true,
        isHbCheck,
        isPrimary,
        pairedDate,
        cellCode,
        title: isGiven
          ? `✅ = Selesai Diberikan${doseIU ? ` (${doseIU} IU)` : ''} • Sesi Pindahan dari tgl ${existingRecord.rescheduledFromDate}`
          : `Sesi HD Pengganti${doseIU ? ` (${doseIU} IU)` : ' Rutin'} • Pindahan dari tgl ${existingRecord.rescheduledFromDate}${existingRecord.notes ? ` • ${existingRecord.notes}` : ''}`,
        isCatchUp: true,
        canTakeAction: true,
        currentStatus: existingRecord.status,
        rescheduledFromDate: existingRecord.rescheduledFromDate,
        customCellText: existingRecord.customCellText,
        doseIU,
      };
    }
    if (existingRecord.customCellText) {
      const code = existingRecord.customCellText;
      return {
        isHD: true,
        isHbCheck,
        isPrimary,
        pairedDate,
        cellCode: code,
        title: `${code}${existingRecord.doseIU ? ` (${existingRecord.doseIU} IU)` : ''}${existingRecord.notes ? ` • ${existingRecord.notes}` : ''}`,
        isCatchUp: Boolean(existingRecord.postponedFromDate),
        canTakeAction: true,
        currentStatus: existingRecord.status,
        postponedToDate: existingRecord.postponedToDate,
        postponedFromDate: existingRecord.postponedFromDate,
        customCellText: code,
        doseIU: existingRecord.doseIU,
      };
    }
    if (existingRecord.status === 'Diberikan') {
      const catchUpText = existingRecord.postponedFromDate
        ? ` (Pengalihan dari penundaan tgl ${existingRecord.postponedFromDate})`
        : '';
      const doseText = existingRecord.doseIU ? `${existingRecord.doseIU} IU` : '2000 IU';
      return {
        isHD: true,
        isHbCheck,
        isPrimary,
        pairedDate,
        cellCode: '✅',
        title: `✅ = EPO Diberikan (${doseText})${catchUpText}${existingRecord.administeredAt ? ' (' + existingRecord.administeredAt + ')' : ''}`,
        isCatchUp: Boolean(existingRecord.postponedFromDate),
        canTakeAction: true,
        currentStatus: 'Diberikan',
        postponedFromDate: existingRecord.postponedFromDate,
        doseIU: existingRecord.doseIU,
      };
    }
    if (existingRecord.status === 'Tunda') {
      const dest = existingRecord.postponedToDate || nextHDDate;
      return {
        isHD: true,
        isHbCheck,
        isPrimary,
        pairedDate,
        cellCode: '❌',
        title: `❌ = Ditunda (Dialihkan ke sesi HD berikutnya tgl ${dest || '-'})`,
        isCatchUp: false,
        canTakeAction: true,
        currentStatus: 'Tunda',
        postponedToDate: dest || undefined,
        doseIU: existingRecord.doseIU,
      };
    }
    if (existingRecord.status === 'Batal') {
      return {
        isHD: true,
        isHbCheck,
        isPrimary,
        pairedDate,
        cellCode: 'Batal',
        title: 'Pemberian EPO Dibatalkan',
        isCatchUp: false,
        canTakeAction: true,
        currentStatus: 'Batal',
        doseIU: existingRecord.doseIU,
      };
    }
  }

  // Jika pasien berstatus non-aktif (Meninggal Dunia / Pindah RS / Berhenti HD) setelah tanggal kejadian
  if (isPatientInactiveOnDate(patient, dayInfo.dateString)) {
    return {
      isHD: false,
      isHbCheck: false,
      isPrimary: false,
      pairedDate: null,
      cellCode: '-',
      title: `Pasien Berstatus: ${patient.patientStatus || 'Non-Aktif'}${patient.statusDate ? ` sejak ${patient.statusDate}` : ''}${patient.statusNotes ? ` (${patient.statusNotes})` : ''}`,
      isCatchUp: false,
      canTakeAction: false,
    };
  }

  // 2. Cek apakah tanggal ini menerima pengalihan dari penundaan sebelumnya
  const incomingSourceDate = existingRecord?.postponedFromDate || (
    Object.entries(patient.dailyRecords || {}).find(([d, r]) => {
      if (r.status !== 'Tunda') return false;
      const pDate = parseInt(d, 10);
      if (r.postponedToDate === dateNumber) return true;
      // Deteksi otomatis jika postponedToDate belum eksplisit:
      // Periksa apakah dateNumber adalah sesi HD berikutnya langsung setelah pDate
      const pSession = sessions.find((s) => s.dateNumber === pDate);
      const nextSess = pSession ? sessions.find((s) => s.sessionIndex === pSession.sessionIndex + 1) : null;
      return nextSess && nextSess.dateNumber === dateNumber;
    })?.[0]
  );
  if (incomingSourceDate !== undefined && incomingSourceDate !== null) {
    const srcDateNum = typeof incomingSourceDate === 'number' ? incomingSourceDate : parseInt(String(incomingSourceDate), 10);
    return {
      isHD: true,
      isHbCheck,
      isPrimary: true,
      pairedDate,
      cellCode: '2000',
      title: `2000 = Terjadwal EPO (Pengalihan dari penundaan tgl ${srcDateNum})`,
      isCatchUp: true,
      canTakeAction: true,
      currentStatus: 'Belum',
      postponedFromDate: srcDateNum,
      postponedToDate: nextHDDate || undefined,
    };
  }

  // 3. Sesi Pertemuan HD Pertama:
  // - Untuk pasien HD 1x/minggu dan 1x/2 minggu: pemberian EPO dimulai dari SESI AWAL HD (Sesi Pertama).
  // - Untuk pasien HD 2x/minggu: evaluasi lab Hb dilaksanakan di pertemuan pertama dan EPO dijadwalkan pada pertemuan kedua.
  if (sessionIndex === 1) {
    if (reco.category === 'TRANSFUSI_2_RAWAT_INAP') {
      return {
        isHD: true,
        isHbCheck: true,
        isPrimary: false,
        pairedDate,
        cellCode: 'PRC 2',
        title: `PRC 2 = Transfusi Protokol 1 (${patient.hbValue <= 0 ? 'Hb: 0' : patient.hbValue.toFixed(1) + ' g/dL'} — Transfusi 2 Bag Rawat Inap)`,
        isCatchUp: false,
        canTakeAction: true,
      };
    }
    if (reco.category === 'TRANSFUSI_1_KANTONG') {
      return {
        isHD: true,
        isHbCheck: true,
        isPrimary: false,
        pairedDate,
        cellCode: 'PRC 1',
        title: `PRC 1 = Transfusi Protokol 2 (${patient.hbValue.toFixed(1)} g/dL — Transfusi 1 Bag PRC)`,
        isCatchUp: false,
        canTakeAction: true,
      };
    }

    const hasHbResult = effectiveHb > 0;
    const labStatus = hasHbResult ? 'Selesai' : (patient.labSchedule?.status || 'Terjadwal');

    // Jika hasil lab belum ada / status Terjadwal
    if (labStatus !== 'Selesai' && !hasHbResult) {
      return {
        isHD: true,
        isHbCheck: true,
        isPrimary: false,
        pairedDate,
        cellCode: 'Cek',
        title: `Cek = Jadwal Cek HB Lab Awal Bulan [Status: Terjadwal] — Nilai Hb: Belum Diinput`,
        isCatchUp: false,
        canTakeAction: true,
        labCheckInfo: patient.labSchedule ? {
          testType: patient.labSchedule.testType,
          status: patient.labSchedule.status,
          notes: patient.labSchedule.notes,
        } : undefined,
      };
    }

    // Pasien dengan frekuensi HD 1x/minggu dan 1x/2 minggu: pemberian EPO dimulai dari SESI AWAL HD
    const isSingleSessPatient = patient.hdFrequency === '1 kali dalam satu minggu' || patient.hdFrequency === '1 kali / 2 minggu';
    const secondMeetingDate = sessions[1]?.dateNumber;

    if (reco.category === 'EPO_1X_2000') {
      if (isSingleSessPatient) {
        return {
          isHD: true,
          isHbCheck: true,
          isPrimary: true,
          pairedDate: nextHDDate,
          cellCode: '2000',
          title: `2000 = Terjadwal EPO 1x 2000 IU (Maintenance - Sesi Awal HD) • Cek Lab Selesai (${effectiveHb > 0 ? effectiveHb.toFixed(1) + ' g/dL' : 'Hb: 0'})`,
          isCatchUp: false,
          canTakeAction: true,
          currentStatus: 'Belum',
          postponedToDate: nextHDDate || undefined,
          labCheckInfo: patient.labSchedule ? {
            testType: patient.labSchedule.testType,
            status: 'Selesai',
            notes: patient.labSchedule.notes,
          } : undefined,
        };
      }
      return {
        isHD: true,
        isHbCheck: true,
        isPrimary: false,
        pairedDate,
        cellCode: 'HD',
        title: `HD = Sesi Rutin & Cek Lab Hb Selesai (${effectiveHb.toFixed(1)} g/dL • Terapi EPO 1x 2000 IU otomatis dijadwalkan pada pertemuan HD kedua tgl ${secondMeetingDate || '-'})`,
        isCatchUp: false,
        canTakeAction: true,
        labCheckInfo: patient.labSchedule ? {
          testType: patient.labSchedule.testType,
          status: 'Selesai',
          notes: patient.labSchedule.notes,
        } : undefined,
      };
    }

    if (reco.category === 'EPO_4X_2000') {
      if (patient.hdFrequency === '1 kali / 2 minggu') {
        return {
          isHD: true,
          isHbCheck: true,
          isPrimary: true,
          pairedDate: nextHDDate,
          cellCode: '2000',
          title: `2000 = Terjadwal EPO Sesi 1 (HD 1x/2 Minggu - Sesi Awal HD) • Cek Lab Selesai (${effectiveHb > 0 ? effectiveHb.toFixed(1) + ' g/dL' : 'Hb: 0'})`,
          isCatchUp: false,
          canTakeAction: true,
          currentStatus: 'Belum',
          postponedToDate: nextHDDate || undefined,
          labCheckInfo: patient.labSchedule ? {
            testType: patient.labSchedule.testType,
            status: 'Selesai',
            notes: patient.labSchedule.notes,
          } : undefined,
        };
      }
      if (patient.hdFrequency === '1 kali dalam satu minggu') {
        return {
          isHD: true,
          isHbCheck: true,
          isPrimary: true,
          pairedDate: nextHDDate,
          cellCode: '2000',
          title: `2000 = Terjadwal EPO Minggu 1 (HD 1x/Minggu - Sesi Awal HD) • Cek Lab Selesai (${effectiveHb > 0 ? effectiveHb.toFixed(1) + ' g/dL' : 'Hb: 0'})`,
          isCatchUp: false,
          canTakeAction: true,
          currentStatus: 'Belum',
          postponedToDate: nextHDDate || undefined,
          labCheckInfo: patient.labSchedule ? {
            testType: patient.labSchedule.testType,
            status: 'Selesai',
            notes: patient.labSchedule.notes,
          } : undefined,
        };
      }
      return {
        isHD: true,
        isHbCheck: true,
        isPrimary: false,
        pairedDate,
        cellCode: 'HD',
        title: `HD = Sesi Rutin & Cek Lab Hb Selesai (${effectiveHb.toFixed(1)} g/dL • Pemberian EPO Dosis 1 otomatis dijadwalkan pada pertemuan HD kedua tgl ${secondMeetingDate || '-'})`,
        isCatchUp: false,
        canTakeAction: true,
        labCheckInfo: patient.labSchedule ? {
          testType: patient.labSchedule.testType,
          status: 'Selesai',
          notes: patient.labSchedule.notes,
        } : undefined,
      };
    }

    if (reco.category === 'HOLD_EVALUASI') {
      return {
        isHD: true,
        isHbCheck: true,
        isPrimary: false,
        pairedDate,
        cellCode: 'Hold',
        title: 'Hold = Tunda Terapi EPO (Protokol Klinis ke-5: HB > 12.00 mg/dl tidak mendapatkan terapi EPO)',
        isCatchUp: false,
        canTakeAction: true,
      };
    }

    return {
      isHD: true,
      isHbCheck: true,
      isPrimary: false,
      pairedDate,
      cellCode: 'HD',
      title: `HD = Sesi Rutin (Nilai Hb: ${effectiveHb.toFixed(1)} g/dL)`,
      isCatchUp: false,
      canTakeAction: true,
    };
  }

  // 4. Kategori Non-EPO (Transfusi, Hold, Menunggu Lab) pada pertemuan kedua dan seterusnya
  if (reco.category === 'HOLD_EVALUASI') {
    return {
      isHD: true,
      isHbCheck: false,
      isPrimary: false,
      pairedDate,
      cellCode: 'Hold',
      title: 'Hold = Tunda Terapi EPO (Protokol Klinis ke-5: HB > 12.00 mg/dl tidak mendapatkan terapi EPO)',
      isCatchUp: false,
      canTakeAction: true,
    };
  }
  if (reco.category === 'MENUNGGU_HASIL_LAB') {
    return {
      isHD: true,
      isHbCheck: false,
      isPrimary: false,
      pairedDate,
      cellCode: 'HD',
      title: 'HD = Sesi Rutin (Menunggu hasil lab Hb awal bulan)',
      isCatchUp: false,
      canTakeAction: false,
    };
  }
  if (reco.category === 'TRANSFUSI_2_RAWAT_INAP' || reco.category === 'TRANSFUSI_1_KANTONG') {
    return {
      isHD: true,
      isHbCheck: false,
      isPrimary: false,
      pairedDate,
      cellCode: 'HD',
      title: 'HD = Sesi Rutin',
      isCatchUp: false,
      canTakeAction: false,
    };
  }

  // 5. KATEGORI KHUSUS: TERAPI EPO 1x 2000 IU (MAINTENANCE)
  // Alokasi kuota tepat 1x 2000 IU (1 vial) per bulan, otomatis dijadwalkan pada Pertemuan HD Kedua.
  if (reco.category === 'EPO_1X_2000') {
    const epo1x = getScheduledDateForEpo1x(patient, monthInfo);

    // Jika dosis 1x 2000 IU sudah diberikan pada tanggal lain di bulan ini
    if (epo1x.givenDate !== null && epo1x.givenDate !== dateNumber) {
      return {
        isHD: true,
        isHbCheck: false,
        isPrimary,
        pairedDate,
        cellCode: 'HD',
        title: `HD = Sesi Rutin (Maintenance: Dosis EPO 1x 2000 IU telah diberikan pada tgl ${epo1x.givenDate})`,
        isCatchUp: false,
        canTakeAction: true,
      };
    }

    // Jika tanggal ini adalah tanggal alokasi Terjadwal EPO 1x 2000 IU (Pertemuan HD Kedua atau pengalihan)
    if (epo1x.scheduledDate === dateNumber) {
      const isCarryover = Boolean(epo1x.postponedDate);
      const titleDesc = isCarryover
        ? `2000 = Terjadwal EPO 1x (Pengalihan dari penundaan tgl ${epo1x.postponedDate})`
        : `2000 = Terjadwal EPO 1x 2000 IU (Maintenance - Pertemuan HD Kedua)`;
      return {
        isHD: true,
        isHbCheck: false,
        isPrimary: true,
        pairedDate: nextHDDate,
        cellCode: '2000',
        title: titleDesc,
        isCatchUp: isCarryover,
        canTakeAction: true,
        currentStatus: 'Belum',
        postponedToDate: nextHDDate || undefined,
        postponedFromDate: epo1x.postponedDate || undefined,
      };
    }

    // Seluruh tanggal sesi HD lainnya adalah sesi rutin HD biasa tanpa EPO
    return {
      isHD: true,
      isHbCheck: false,
      isPrimary: false,
      pairedDate,
      cellCode: 'HD',
      title: `HD = Sesi Rutin (Maintenance: Alokasi EPO 1x 2000 IU terjadwal pada pertemuan HD kedua tgl ${epo1x.scheduledDate || '-'})`,
      isCatchUp: false,
      canTakeAction: true,
    };
  }

  // 6. KATEGORI TERAPI EPO 4x 2000 IU (DOSIS PENUH)
  // Sesuai Protokol Klinis Hemodialisa:
  // - Pertemuan HD Pertama: Sesi Cek Lab Hb Awal Bulan
  // - Pertemuan HD Kedua: Otomatis dijadwalkan Pemberian EPO Minggu 1 (Dosis 1)
  // - Pertemuan HD Minggu 2, 3, 4: Dijadwalkan 1x per minggu
  if (sessionIndex === 2) {
    if (patient.hdFrequency === '1 kali / 2 minggu') {
      return {
        isHD: true,
        isHbCheck: false,
        isPrimary: true,
        pairedDate: nextHDDate,
        cellCode: '2000',
        title: `2000 = Terjadwal EPO Sesi 2 (HD 1x/2 Minggu)`,
        isCatchUp: false,
        canTakeAction: true,
        currentStatus: 'Belum',
        postponedToDate: nextHDDate || undefined,
      };
    }
    return {
      isHD: true,
      isHbCheck: false,
      isPrimary: true,
      pairedDate: nextHDDate,
      cellCode: '2000',
      title: `2000 = Terjadwal EPO Minggu 1 (Pertemuan HD Kedua)`,
      isCatchUp: false,
      canTakeAction: true,
      currentStatus: 'Belum',
      postponedToDate: nextHDDate || undefined,
    };
  }

  // Untuk pasien 1x/2 minggu (Biweekly) pada sesi ke-3 jika ada (misal di bulan dengan 31 hari tgl 1, 15, 29)
  if (patient.hdFrequency === '1 kali / 2 minggu') {
    const givenCount = Object.values(patient.dailyRecords || {}).filter((r) => r.status === 'Diberikan').length;
    if (givenCount < 2) {
      return {
        isHD: true,
        isHbCheck: false,
        isPrimary: true,
        pairedDate: nextHDDate,
        cellCode: '2000',
        title: `2000 = Terjadwal EPO Sesi 3 (HD 1x/2 Minggu)`,
        isCatchUp: false,
        canTakeAction: true,
        currentStatus: 'Belum',
        postponedToDate: nextHDDate || undefined,
      };
    }
    return {
      isHD: true,
      isHbCheck: false,
      isPrimary: false,
      pairedDate: nextHDDate,
      cellCode: 'HD',
      title: 'HD = Sesi Rutin (Target 2x EPO bulan ini telah tercapai)',
      isCatchUp: false,
      canTakeAction: true,
    };
  }

  // Untuk pasien 1x dalam satu minggu
  if (patient.hdFrequency === '1 kali dalam satu minggu') {
    return {
      isHD: true,
      isHbCheck: false,
      isPrimary: true,
      pairedDate: nextHDDate,
      cellCode: '2000',
      title: `2000 = Terjadwal EPO Minggu ${sessionIndex}`,
      isCatchUp: false,
      canTakeAction: true,
      currentStatus: 'Belum',
      postponedToDate: nextHDDate || undefined,
    };
  }

  // Untuk pasien 2x dalam satu minggu (Senin-Kamis, Selasa-Jumat, Rabu-Sabtu) pada minggu ke-2, 3, 4:
  // Satu sesi per minggu terjadwal EPO 2000 IU (sesi Hari Awal), dan sesi lainnya sesi rutin HD
  const isPrimaryDay = isPrimaryHDDay(dayInfo.dayOfWeek, patient.scheduleDay);
  if (isPrimaryDay) {
    const weekNum = getHDSessionWeek(dateNumber, monthInfo.daysInMonth, patient.scheduleDay);
    return {
      isHD: true,
      isHbCheck: false,
      isPrimary: true,
      pairedDate: nextHDDate,
      cellCode: '2000',
      title: `2000 = Terjadwal EPO Minggu ${weekNum}`,
      isCatchUp: false,
      canTakeAction: true,
      currentStatus: 'Belum',
      postponedToDate: nextHDDate || undefined,
    };
  }

  // Sesi kedua dalam minggu yang sama merupakan sesi rutin HD
  return {
    isHD: true,
    isHbCheck: false,
    isPrimary: false,
    pairedDate: nextHDDate,
    cellCode: 'HD',
    title: 'HD = Sesi Rutin',
    isCatchUp: false,
    canTakeAction: true,
  };
}

/**
 * Mendapatkan informasi dosis, status, dan penanda klinis lengkap untuk suatu tanggal
 * Memastikan tanda visual khusus [🩸 UPDATE HB] disematkan jika terdapat tindakan update Hb pada tanggal ini.
 */
export function getDateDoseDisplayInfo(
  patient: PatientRecord,
  dateNumber: number,
  monthInfo: { daysInMonth: number; days: { dateNumber: number; dayOfWeek: number; dateString: string }[] }
): DateDoseInfo {
  const info = getRawDateDoseDisplayInfo(patient, dateNumber, monthInfo);
  const dayInfo = monthInfo.days[dateNumber - 1];
  const existingRecord = patient.dailyRecords?.[dateNumber];

  const isHbUpdateDate = Boolean(
    existingRecord?.isHbUpdateDate ||
    (typeof existingRecord?.updatedHbValue === 'number' && existingRecord.updatedHbValue > 0) ||
    (existingRecord?.notes && existingRecord.notes.includes('Update Hb')) ||
    (patient.hbDate && dayInfo && dayInfo.dateString === patient.hbDate && patient.hbValue > 0 && existingRecord?.notes?.toLowerCase().includes('hb'))
  );

  const updatedHbVal = existingRecord?.updatedHbValue || (
    existingRecord?.notes?.match(/Update Hb\s+([0-9.]+)/i)?.[1]
      ? parseFloat(existingRecord.notes.match(/Update Hb\s+([0-9.]+)/i)![1])
      : (isHbUpdateDate && patient.hbValue > 0 ? patient.hbValue : undefined)
  );

  if (isHbUpdateDate) {
    const valText = updatedHbVal !== undefined ? `${updatedHbVal.toFixed(1)} g/dL` : 'Tercatat';
    return {
      ...info,
      isHbUpdateDate: true,
      updatedHbValue: updatedHbVal,
      title: `[🩸 UPDATE HB: ${valText}] • ${info.title}`,
    };
  }

  return info;
}

/**
 * Menghitung sesi HD minggu ke berapa dalam bulan tersebut untuk pasien.
 * Menormalkan tanggal Hari Kedua (Kamis/Jumat/Sabtu) ke Hari Awal (Senin/Selasa/Rabu) pasangannya,
 * sehingga kedua sesi dalam satu minggu HD selalu berada di minggu yang sama!
 */
export function getHDSessionWeek(
  dateNumber: number,
  daysInMonth: number,
  scheduleDay?: HDDaySchedule,
  postponedFromDate?: number,
  singleDay?: SingleHDDay,
  hdFrequency?: HDFrequency
): 1 | 2 | 3 | 4 {
  // Jika ini adalah pengalihan dari penundaan hari lain, gunakan tanggal asal
  const targetDate = postponedFromDate || dateNumber;

  let normalizedDate = targetDate;
  if (hdFrequency !== '1 kali dalam satu minggu' && scheduleDay && normalizedDate > 3) {
    // Hari kedua (Kamis untuk Senin-Kamis, Jumat untuk Selasa-Jumat, Sabtu untuk Rabu-Sabtu)
    // berjarak 3 hari dari Hari Awalnya. Jika dinormalkan -3, selalu merujuk pada Hari Awal yang sama.
    const refDay = new Date(2026, 8, targetDate).getDay(); // Acuan Sept 2026
    if (!isPrimaryHDDay(refDay, scheduleDay) && normalizedDate - 3 >= 1) {
      normalizedDate = normalizedDate - 3;
    }
  }

  if (normalizedDate <= 7) return 1;
  if (normalizedDate <= 14) return 2;
  if (normalizedDate <= 21) return 3;
  return 4;
}

/**
 * Ekstraksi Spreadsheet ID dari input teks
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Mengambil detail spreadsheet
 */
export async function getSpreadsheetDetails(spreadsheetId: string, accessToken: string) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    let message = 'Gagal mengakses Google Spreadsheet.';
    if (res.status === 404) message = 'Spreadsheet tidak ditemukan.';
    if (res.status === 403) message = 'Akses ditolak. Pastikan akun Google memiliki hak akses edit.';
    throw new Error(`${message} (${res.status}): ${errorText}`);
  }

  return await res.json();
}

/**
 * Membangun array baris matriks untuk Sheet Jadwal tertentu
 * DENGAN PEMISAHAN JELAS ANTARA SHIFT PAGI DAN SHIFT SIANG PADA BARIS TERPISAH
 * SERTA KODE MINIMALIS (P, 2000, PRC, HD) AGAR MUDAH DIBACA DI KOLOM BERUKURAN KECIL
 */
export function buildScheduleMatrixTable(
  patients: PatientRecord[],
  scheduleDay: HDDaySchedule,
  yearMonth: string
): string[][] {
  const { daysInMonth, days } = getMonthDaysInfo(yearMonth);
  const filteredPatients = patients.filter((p) => p.scheduleDay === scheduleDay);

  // Pisahkan pasien berdasarkan shift: Pagi dan Siang (Shift Sore dihapus sesuai kebijakan operasional HD)
  const pagiPatients = filteredPatients.filter((p) => p.scheduleShift.includes('Pagi'));
  const siangPatients = filteredPatients.filter((p) => p.scheduleShift.includes('Siang'));

  // Baris Header Kolom (TANPA KOLOM NILAI HB)
  const header: string[] = [
    'No',
    'Nama Pasien',
    'No. RM',
    'Frekuensi HD',
    'Shift',
    'Alokasi Klinis / Dosis',
  ];

  // Kolom tanggal 1 s/d 30/31
  for (let d = 1; d <= daysInMonth; d++) {
    header.push(String(d));
  }

  // Kolom ringkasan di sebelah kanan
  header.push(
    'Target EPO',
    'Realisasi',
    'Rasio',
    'PRC',
    'Status',
    'Catatan Klinis'
  );

  const rows: string[][] = [header];

  // Inisialisasi akumulator rekap harian
  const dailyPagiCount = new Array(daysInMonth).fill(0);
  const dailySiangCount = new Array(daysInMonth).fill(0);
  const dailyEpoScheduledCount = new Array(daysInMonth).fill(0);
  const dailyEpoGivenCount = new Array(daysInMonth).fill(0);
  const dailyPrcCount = new Array(daysInMonth).fill(0);
  const dailyTotalPatients = new Array(daysInMonth).fill(0);

  let grandTargetEpo = 0;
  let grandRealisasiEpo = 0;
  let grandTotalPrc = 0;

  // Helper untuk membuat baris pasien (TANPA NILAI HB - NILAI HB HANYA PADA REKAP HB TAHUNAN)
  const renderPatientRow = (patient: PatientRecord, displayNo: number) => {
    const reco = getEffectivePatientRecommendation(patient, yearMonth);
    const freqDisplay = patient.hdFrequency === '1 kali / 2 minggu'
      ? (patient.singleDay ? `1x/2 mgg (${patient.singleDay})` : '1x/2 mgg')
      : patient.hdFrequency === '1 kali dalam satu minggu'
      ? (patient.singleDay ? `1x / mgg (${patient.singleDay})` : '1x / mgg')
      : '2x / mgg';
    const isMeninggal = patient.patientStatus === 'Meninggal Dunia';
    const isOtherNonActive = patient.patientStatus && patient.patientStatus !== 'Aktif';

    const recoDisplay = isMeninggal
      ? 'Non-Aktif (Meninggal Dunia)'
      : isOtherNonActive
      ? `Non-Aktif (${patient.patientStatus})`
      : reco.title;

    const row: string[] = [
      String(displayNo),
      patient.name,
      patient.noRm,
      freqDisplay,
      patient.scheduleShift.includes('Pagi') ? 'Pagi (P)' : 'Siang (S)',
      recoDisplay,
    ];

    let patientEpoGiven = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const info = getDateDoseDisplayInfo(patient, d, { daysInMonth, days });
      if (!info.isHD) {
        row.push('-');
      } else {
        if (!info.rescheduledToDate) {
          dailyTotalPatients[d - 1]++;
          if (patient.scheduleShift.includes('Pagi')) dailyPagiCount[d - 1]++;
          else dailySiangCount[d - 1]++;
        }

        if (info.cellCode === '2000') {
          dailyEpoScheduledCount[d - 1]++;
        } else if (info.cellCode === '✅' || (info.cellCode as any) === 'P') {
          patientEpoGiven++;
          dailyEpoGivenCount[d - 1]++;
        }

        if (info.cellCode === 'PRC 2' || (info.cellCode as any) === 'PRC') {
          dailyPrcCount[d - 1] += 2;
        } else if (info.cellCode === 'PRC 1') {
          dailyPrcCount[d - 1] += 1;
        }

        row.push(info.cellCode);
      }
    }

    const targetEpo = (isMeninggal || patient.patientStatus === 'Berhenti HD' || patient.patientStatus === 'Pindah RS')
      ? 0
      : reco.totalEpoVials;
    grandTargetEpo += targetEpo;
    grandRealisasiEpo += patientEpoGiven;
    grandTotalPrc += (isMeninggal ? 0 : reco.transfusionBags);

    const statusText = patient.patientStatus && patient.patientStatus !== 'Aktif'
      ? patient.patientStatus
      : patient.overallStatus;

    let finalNotes = patient.clinicalNotes || '';
    if (patient.patientStatus && patient.patientStatus !== 'Aktif') {
      const statusNoteText = patient.statusNotes ? ` (${patient.statusNotes})` : '';
      const dateText = patient.statusDate ? ` per ${patient.statusDate}` : '';
      if (!finalNotes.includes(patient.patientStatus)) {
        finalNotes = finalNotes 
          ? `[${patient.patientStatus}${dateText}${statusNoteText}] ${finalNotes}`
          : `[${patient.patientStatus}${dateText}${statusNoteText}]`;
      }
    }

    row.push(
      String(targetEpo),
      String(patientEpoGiven),
      `${patientEpoGiven} : ${targetEpo}`,
      String((isMeninggal || reco.transfusionBags <= 0) ? '-' : reco.transfusionBags),
      statusText,
      finalNotes
    );

    return row;
  };

  // Helper untuk membuat baris pemisah kelompok shift (bebas dari tanda '=' atau '==' agar tidak memicu #ERROR! formula parse)
  const makeShiftBannerRow = (label: string, shiftTag: string) => {
    const banner = ['•', label, '', shiftTag, '', ''];
    for (let d = 1; d <= daysInMonth; d++) {
      banner.push('');
    }
    banner.push('', '', '', '', '', 'Sub Bagian Shift');
    return banner;
  };

  // 1. BAGIAN SHIFT 1: PAGI (DIPISAHKAN PADA BARIS SENDIRI)
  if (pagiPatients.length > 0) {
    rows.push(makeShiftBannerRow('KELOMPOK SHIFT PAGI (07:00 WIB)', 'Shift 1 (Pagi)'));
    pagiPatients.forEach((patient, idx) => {
      rows.push(renderPatientRow(patient, idx + 1));
    });
  }

  // Baris Pemisah / Spasi Antara Shift
  rows.push(new Array(header.length).fill(''));

  // 2. BAGIAN SHIFT 2: SIANG (DIPISAHKAN PADA BARIS SENDIRI)
  if (siangPatients.length > 0) {
    rows.push(makeShiftBannerRow('KELOMPOK SHIFT SIANG (12:30 WIB)', 'Shift 2 (Siang)'));
    siangPatients.forEach((patient, idx) => {
      rows.push(renderPatientRow(patient, idx + 1));
    });
  }

  // Spasi sebelum baris total ringkasan
  rows.push(new Array(header.length).fill(''));

  // BARIS TOTAL RINGKASAN BAWAH (PERSIS SEPERTI BARIS 19-24 PADA GOOGLE SHEETS HEMOSHIF - 6 KOLOM AWAL)
  const prefixPagi = ['', 'Total Shift Pagi (P)', '-', '-', 'Sif Pagi', '-'];
  const prefixSiang = ['', 'Total Shift Siang (S)', '-', '-', 'Sif Siang', '-'];
  const prefixPrc = ['', 'Total Kebutuhan PRC (Kantong)', '-', '-', 'Bank Darah', '-'];
  const prefixEpoTerjadwal = ['', 'Kebutuhan Harian EPO (Ampul 2000 IU)', '-', '-', 'Terjadwal', '-'];
  const prefixEpoKeluar = ['', 'Epo Keluar', '-', '-', 'Diberikan', '-'];
  const prefixTotal = ['', 'Total Pasien HD Harian', '-', '-', 'Total Sesi', '-'];

  for (let d = 0; d < daysInMonth; d++) {
    prefixPagi.push(dailyPagiCount[d] > 0 ? String(dailyPagiCount[d]) : '-');
    prefixSiang.push(dailySiangCount[d] > 0 ? String(dailySiangCount[d]) : '-');
    prefixPrc.push(dailyPrcCount[d] > 0 ? String(dailyPrcCount[d]) : '-');
    prefixEpoTerjadwal.push(dailyEpoScheduledCount[d] > 0 ? String(dailyEpoScheduledCount[d]) : '-');
    prefixEpoKeluar.push(dailyEpoGivenCount[d] > 0 ? String(dailyEpoGivenCount[d]) : '-');
    prefixTotal.push(dailyTotalPatients[d] > 0 ? String(dailyTotalPatients[d]) : '-');
  }

  // Ringkasan Total Kanan
  prefixPagi.push('-', '-', '-', '-', '-', `${dailyPagiCount.reduce((a, b) => a + b, 0)} Sesi Pagi`);
  prefixSiang.push('-', '-', '-', '-', '-', `${dailySiangCount.reduce((a, b) => a + b, 0)} Sesi Siang`);
  prefixPrc.push('-', '-', '-', String(grandTotalPrc), '-', 'Total Kantong');
  prefixEpoTerjadwal.push(String(grandTargetEpo), '-', '-', '-', '-', `${dailyEpoScheduledCount.reduce((a, b) => a + b, 0)} Ampul Terjadwal`);
  prefixEpoKeluar.push('-', String(grandRealisasiEpo), `${grandRealisasiEpo} : ${grandTargetEpo}`, '-', '-', `${dailyEpoGivenCount.reduce((a, b) => a + b, 0)} Ampul Keluar`);
  prefixTotal.push('-', '-', '-', '-', `${filteredPatients.length} Pasien`, 'Grand Total');

  rows.push(prefixPagi);
  rows.push(prefixSiang);
  rows.push(prefixPrc);
  rows.push(prefixEpoTerjadwal);
  rows.push(prefixEpoKeluar);
  rows.push(prefixTotal);

  return rows;
}

/**
 * Membuat spreadsheet baru dengan 3 sheet jadwal:
 * 1. Senin-Kamis
 * 2. Selasa-Jumat
 * 3. Rabu-Sabtu
 */
export async function createNewSpreadsheet(title: string, accessToken: string) {
  const payload = {
    properties: {
      title: title || `Jadwal & Alokasi EPO HD - ${new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
    },
    sheets: SCHEDULE_SHEETS.map((item) => ({
      properties: {
        title: item.tabName,
        gridProperties: {
          frozenRowCount: 1,
          frozenColumnCount: 5,
          rowCount: 120,
          columnCount: 46,
        },
      },
    })),
  };

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gagal membuat spreadsheet baru: ${errorText}`);
  }

  return await res.json();
}

/**
 * Menyimpan seluruh data pasien ke 3 sheet Google Sheets:
 * - Tab 'Senin-Kamis'
 * - Tab 'Selasa-Jumat'
 * - Tab 'Rabu-Sabtu'
 * Serta menerapkan ukuran kolom minimalis dan pemisahan baris per shift
 */
export async function pushPatientsToSheet(
  spreadsheetId: string,
  patients: PatientRecord[],
  accessToken: string,
  yearMonth: string = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  targetSchedule?: HDDaySchedule,
  scheduleScope?: 'PILIHAN' | 'SELURUH'
) {
  const metadata = await getSpreadsheetDetails(spreadsheetId, accessToken);
  const existingSheets: string[] = (metadata.sheets || []).map((s: any) => s.properties?.title);

  let effectiveScope = scheduleScope;
  if (!effectiveScope) {
    try {
      const stored = localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH' || stored === 'PILIHAN') effectiveScope = stored;
    } catch (e) {}
  }

  const sheetsToUpdate = targetSchedule 
    ? SCHEDULE_SHEETS.filter((s) => s.title === targetSchedule)
    : SCHEDULE_SHEETS;

  // Buat tab jadwal yang belum ada
  for (const item of sheetsToUpdate) {
    if (!existingSheets.includes(item.tabName)) {
      await addSheetTab(spreadsheetId, item.tabName, accessToken);
    }
  }

  // Kirim data matriks ke masing-masing sheet jadwal secara paralel
  await Promise.all(
    sheetsToUpdate.map(async (item) => {
      const tableData = buildScheduleMatrixTable(patients, item.title, yearMonth);
      const range = `${item.tabName}!A1:${getColLetter(tableData[0]?.length || 40)}${tableData.length + 10}`;
      return updateSheetValues(spreadsheetId, range, tableData, accessToken);
    })
  );

  // Buat atau Update Tab REKAP_HB_TAHUNAN (Integrasi 1 Tahun)
  try {
    if (!existingSheets.includes('REKAP_HB_TAHUNAN')) {
      await addSheetTab(spreadsheetId, 'REKAP_HB_TAHUNAN', accessToken);
    }
    const yearlyTable = buildYearlySummaryTable(patients, yearMonth);
    const yearlyRange = `REKAP_HB_TAHUNAN!A1:${getColLetter(yearlyTable[0]?.length || 24)}${yearlyTable.length + 5}`;
    await updateSheetValues(spreadsheetId, yearlyRange, yearlyTable, accessToken);
  } catch (err) {
    console.warn('Gagal memperbarui REKAP_HB_TAHUNAN via direct API:', err);
  }

  // Buat atau Update Tab MATRIK CEK HB / MATRIKS_CEK_HB (Penjadwalan 6 Hari Sesi Pertama Tanpa Sheet JADWAL_CEK_HB)
  try {
    let matSheetName = 'MATRIK CEK HB';
    if (existingSheets.includes('MATRIK CEK HB')) {
      matSheetName = 'MATRIK CEK HB';
    } else if (existingSheets.includes('MATRIKS_CEK_HB')) {
      matSheetName = 'MATRIKS_CEK_HB';
    } else if (existingSheets.includes('Matrik_Cek_HB')) {
      matSheetName = 'Matrik_Cek_HB';
    } else if (existingSheets.includes('Matriks_Cek_HB')) {
      matSheetName = 'Matriks_Cek_HB';
    } else {
      await addSheetTab(spreadsheetId, 'MATRIK CEK HB', accessToken);
    }
    const matTable = buildNextMonthCalendarMatrix(patients, yearMonth, effectiveScope);
    const matRange = `${matSheetName}!A1:${getColLetter(matTable[0]?.length || 6)}${matTable.length + 5}`;
    await updateSheetValues(spreadsheetId, matRange, matTable, accessToken);
  } catch (err) {
    console.warn('Gagal memperbarui MATRIK CEK HB via direct API:', err);
  }

  // Buat atau Update Tab PASIEN MENINGGAL
  try {
    let decSheetName = 'PASIEN MENINGGAL';
    if (existingSheets.includes('PASIEN MENINGGAL')) {
      decSheetName = 'PASIEN MENINGGAL';
    } else if (existingSheets.includes('PASIEN_MENINGGAL')) {
      decSheetName = 'PASIEN_MENINGGAL';
    } else if (existingSheets.includes('DATA PASIEN MENINGGAL')) {
      decSheetName = 'DATA PASIEN MENINGGAL';
    } else {
      await addSheetTab(spreadsheetId, 'PASIEN MENINGGAL', accessToken);
    }
    const decTable = buildDeceasedPatientsTable(patients);
    const decRange = `${decSheetName}!A1:${getColLetter(decTable[0]?.length || 13)}${Math.max(decTable.length + 5, 10)}`;
    await updateSheetValues(spreadsheetId, decRange, decTable, accessToken);
  } catch (err) {
    console.warn('Gagal memperbarui PASIEN MENINGGAL via direct API:', err);
  }

  // Terapkan styling visual & UKURAN KOLOM MINIMALIS
  try {
    await applyHeaderAndColumnStyling(spreadsheetId, accessToken);
  } catch (err) {
    console.warn('Gagal menerapkan styling conditional (data tetap tersimpan):', err);
  }

  return { success: true };
}

/**
 * Membaca data pasien dari 3 sheet jadwal: 'Senin-Kamis', 'Selasa-Jumat', 'Rabu-Sabtu'
 * dan menyinkronkan acuan Hb sebelumnya dari 'REKAP_HB_TAHUNAN' jika ada
 */
export async function readPatientsFromSheet(
  spreadsheetId: string,
  accessToken: string,
  currentMonth: string
): Promise<PatientRecord[]> {
  if (!accessToken) {
    return pullViaAppsScript(DEFAULT_APPS_SCRIPT_URL, currentMonth, true, spreadsheetId);
  }

  try {
    const metadata = await getSpreadsheetDetails(spreadsheetId, accessToken);
    const existingSheets: string[] = (metadata.sheets || []).map((s: any) => s.properties?.title);

  // Baca REKAP_HB_TAHUNAN jika ada
  let yearlyMap = new Map<string, number>();
  let currentMap = new Map<string, number>();
  const isYearlyTab = existingSheets.find((s) => {
    const norm = s.toLowerCase().replace(/[\s_-]+/g, '');
    return norm.includes('rekaphb');
  });
  if (isYearlyTab) {
    try {
      const yRange = `${isYearlyTab}!A1:X150`;
      const yRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(yRange)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (yRes.ok) {
        const yJson = await yRes.json();
        const yRows: string[][] = yJson.values || [];
        const yearlyInfoMap = extractYearlyPatientInfoMap(yRows, currentMonth);
        yearlyInfoMap.forEach((info, key) => {
          if (info.prevHb !== undefined) yearlyMap.set(key, info.prevHb);
          currentMap.set(key, info.currentHb);
        });
      }
    } catch (e) {
      console.warn('Gagal membaca REKAP_HB_TAHUNAN:', e);
    }
  }

  const targetTabs = SCHEDULE_SHEETS.filter((s) => existingSheets.includes(s.tabName));

  if (targetTabs.length === 0 && existingSheets.length > 0) {
    const singleData = await readSingleSheetData(spreadsheetId, existingSheets[0], 'Senin - Kamis', accessToken, currentMonth);
    return singleData;
  }

  // Baca seluruh tab secara paralel untuk kecepatan maksimal
  const results = await Promise.all(
    targetTabs.map((item) =>
      readSingleSheetData(spreadsheetId, item.tabName, item.title, accessToken, currentMonth)
    )
  );

  const flatPatients = results.flat();

  // Baca tab PASIEN MENINGGAL jika tersedia untuk mengembalikan status wafat
  const deceasedMap = new Map<string, { statusDate?: string; statusNotes?: string; doctor?: string; notes?: string }>();
  const isDeceasedTab = existingSheets.find((s) => {
    const norm = s.toLowerCase().replace(/[\s_-]+/g, '');
    return norm.includes('pasienmeninggal') || norm.includes('meninggal');
  });

  if (isDeceasedTab) {
    try {
      const dRange = `${isDeceasedTab}!A1:M100`;
      const dRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dRange)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (dRes.ok) {
        const dJson = await dRes.json();
        const dRows: string[][] = dJson.values || [];
        if (dRows.length > 1) {
          dRows.slice(1).forEach((r) => {
            const rName = (r[1] || '').trim();
            const rRm = (r[2] || '').trim();
            if (!rName || isSummaryOrHeaderRow(rName, rRm)) return;
            const rDate = (r[4] || '').trim();
            const rNotes = (r[5] || '').trim();
            const rDoctor = (r[10] || '').trim();
            const rClinNotes = (r[11] || '').trim();
            const rKey = rRm.toLowerCase();
            const normKey = rKey.replace(/[^a-z0-9]/g, '');
            const normN = rName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const info = {
              statusDate: rDate !== '-' ? rDate : undefined,
              statusNotes: rNotes !== '-' ? rNotes : undefined,
              doctor: rDoctor !== '-' ? rDoctor : undefined,
              notes: rClinNotes !== '-' ? rClinNotes : undefined,
            };
            if (rKey) deceasedMap.set(rKey, info);
            if (normKey) deceasedMap.set(normKey, info);
            if (normN) deceasedMap.set(normN, info);
          });
        }
      }
    } catch (e) {
      console.warn('Gagal membaca tab PASIEN MENINGGAL via direct API:', e);
    }
  }

  // Lengkapi dengan acuan Hb dan nilai Hb bulan berjalan dari REKAP_HB_TAHUNAN
  return flatPatients.map((p) => {
    const rmKey = p.noRm.toLowerCase().trim();
    const normRmKey = rmKey.replace(/[^a-z0-9]/g, '');
    const normNameKey = p.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    const prevHb = yearlyMap.get(rmKey) ?? yearlyMap.get(normRmKey) ?? yearlyMap.get(normNameKey);
    const curHb = currentMap.get(rmKey) ?? currentMap.get(normRmKey) ?? currentMap.get(normNameKey);
    const decInfo = deceasedMap.get(rmKey) ?? deceasedMap.get(normRmKey) ?? deceasedMap.get(normNameKey);

    const isDeceased = Boolean(decInfo) || p.patientStatus === 'Meninggal Dunia';
    const patientStatus: PatientRecord['patientStatus'] = isDeceased ? 'Meninggal Dunia' : p.patientStatus;
    const statusDate = decInfo?.statusDate || p.statusDate;
    const statusNotes = decInfo?.statusNotes || p.statusNotes;

    // Jika tidak ada data Hb pada Google Sheet untuk bulan ini, maka nilainya 0
    const effectiveHb = (typeof curHb === 'number' && curHb > 0) ? curHb : 0;
    const isSelective = (typeof prevHb === 'number' && prevHb > 0 && Number(prevHb.toFixed(1)) <= 8.9) || 
      (effectiveHb > 0 && Number(effectiveHb.toFixed(1)) <= 8.9) || 
      ((!prevHb || prevHb === 0) && effectiveHb === 0);
    const reco = calculateClinicalRecommendation(effectiveHb, p.hdFrequency);

    return {
      ...p,
      patientStatus,
      statusDate,
      statusNotes,
      overallStatus: isDeceased ? 'Selesai' : p.overallStatus,
      hbValue: effectiveHb,
      recommendation: reco,
      prevHbValue: prevHb,
      isSelectiveHb: isSelective,
      monthPeriod: currentMonth,
      hbDate: `${currentMonth}-02`,
      doctorInCharge: decInfo?.doctor || p.doctorInCharge,
      clinicalNotes: decInfo?.notes || p.clinicalNotes,
      labSchedule: {
        scheduledDate: p.labSchedule?.scheduledDate || getFirstHDDateOfMonth(currentMonth, p.scheduleDay, p.singleDay, p.hdFrequency, p.lastHdDate).dateString,
        testType: isSelective ? 'Cek Hb Pilihan (Hb ≤ 8.9)' : 'Rutin Hb (Evaluasi EPO)',
        status: effectiveHb > 0 ? 'Selesai' : 'Terjadwal',
        resultHb: effectiveHb > 0 ? effectiveHb : undefined,
        isSelectiveHb: isSelective,
        selectiveReason: isSelective ? `Nilai Hb acuan ${prevHb ? prevHb.toFixed(1) : '< 9.0'} g/dL (< 9.0 g/dL)` : undefined,
      },
    };
  });
  } catch (apiErr) {
    console.warn('Direct Google Sheets API read failed, falling back to Apps Script/gviz pull:', apiErr);
    return pullViaAppsScript(DEFAULT_APPS_SCRIPT_URL, currentMonth, true, spreadsheetId);
  }
}

/**
 * Mengecek apakah baris merupakan header, banner shift, atau baris total ringkasan
 * (Total Shift Pagi, Total Shift Siang, Kebutuhan PRC, Kebutuhan EPO, Epo Keluar, Total Pasien)
 * agar tidak salah terimpor sebagai data pasien.
 */
export function isSummaryOrHeaderRow(name: string, noRm: string = '', fullLine: string = ''): boolean {
  const n = (name || '').toLowerCase().trim();
  const rm = (noRm || '').toLowerCase().trim();
  const line = (fullLine || '').toLowerCase().trim();

  if (!n && !rm) return true;
  if (n.startsWith('==') || n.startsWith('•') || n.startsWith('#')) return true;
  if (n.includes('#error') || rm.includes('#error') || line.includes('#error')) return true;

  const summaryKeywords = [
    'total shift',
    'shift pagi',
    'shift siang',
    'sif pagi',
    'sif siang',
    'kebutuhan transfusi',
    'transfusi prc',
    'kantong prc',
    'kebutuhan harian epo',
    'kebutuhan epo',
    'kebutuhan harian',
    'epo keluar',
    'total kebutuhan',
    'total pasien',
    'pasien hd per hari',
    'pasien hd harian',
    'kelompok shift',
    'grand total',
    'bank darah',
    'target epo',
    'ampul terjadwal',
    'ampul diberikan',
    'ampul keluar',
  ];

  if (summaryKeywords.some((kw) => n.includes(kw) || rm.includes(kw) || line.includes(kw))) {
    return true;
  }

  // Cek kata kunci awalan
  if (n.startsWith('total') || n === 'epo keluar' || n.includes('kebutuhan') || n.startsWith('kelompok')) {
    return true;
  }

  return false;
}

/**
 * Fungsi dekoder cerdas untuk membaca nilai Hb dari Google Sheets:
 * Mencegah & memperbaiki bug Google Sheets yang secara otomatis mengubah angka desimal
 * seperti 8.9, 10.8, 12.5 menjadi objek Tanggal/ISO (misal: "2026-08-08T17:00:00.000Z")
 * karena regional setting Indonesia (koma vs titik).
 */
export function decodeHbFromValue(rawVal: any, doseText?: string): number {
  if (rawVal === undefined || rawVal === null) return 0;
  if (typeof rawVal === 'number') {
    if (!isNaN(rawVal) && rawVal > 0 && rawVal <= 25) return Number(rawVal.toFixed(1));
    return 0;
  }
  let s = String(rawVal).replace(/\u00A0/g, ' ').replace(/['"]/g, '').trim();
  if (
    !s ||
    s === '0' ||
    s === '0.0' ||
    s === '0,0' ||
    s === '-' ||
    s === '–' ||
    s === '—' ||
    s.toLowerCase() === 'null' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'nan'
  ) return 0;

  // Bersihkan prefiks teks umum seperti "Hb:", "Hb ", "Hb."
  s = s.replace(/^hb\s*[:.-]?\s*/i, '').trim();

  // Jika teks mengandung kata bukan nilai Hb murni (misal: 'x', 'vial', 'ampul', 'bag', 'kantong', 'hd', 'prc', 'epo', 'shift', 'senin', dsb.)
  const lower = s.toLowerCase();
  if (
    lower.includes('x') ||
    lower.includes('vial') ||
    lower.includes('ampul') ||
    lower.includes('bag') ||
    lower.includes('kantong') ||
    lower.includes('hd') ||
    lower.includes('prc') ||
    lower.includes('epo') ||
    lower.includes('shift') ||
    lower.includes('senin') ||
    lower.includes('selasa') ||
    lower.includes('rabu') ||
    lower.includes('kamis') ||
    lower.includes('jumat') ||
    lower.includes('sabtu') ||
    lower.includes('mgg') ||
    lower.includes('minggu') ||
    lower.includes('rawat') ||
    lower.includes('protokol') ||
    lower.includes('maintenance') ||
    lower.includes('evaluasi') ||
    lower.includes('batal') ||
    lower.includes('tunda') ||
    lower.includes('cek')
  ) {
    return 0;
  }

  // 1. Jika terformat sebagai ISO Date String dari Google Sheets / Apps Script (misal: "2026-08-08T17:00:00.000Z")
  if ((s.includes('T') && s.endsWith('Z')) || s.match(/^\d{4}-\d{2}-\d{2}/)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const wib = new Date(d.getTime() + 7 * 3600 * 1000);
      const day = wib.getUTCDate();
      const month = wib.getUTCMonth() + 1; // 1 to 12

      if (day >= 4 && day <= 18 && month >= 1 && month <= 12) {
        return parseFloat(`${day}.${month}`);
      }
      if (month >= 4 && month <= 18 && day >= 1 && day <= 12) {
        return parseFloat(`${month}.${day}`);
      }
    }
    return 0;
  }

  // 2. Format tanggal umum (DD/MM/YYYY atau MM/DD/YYYY)
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    if (p1 >= 4 && p1 <= 18 && p2 >= 1 && p2 <= 12) return parseFloat(`${p1}.${p2}`);
    if (p2 >= 4 && p2 <= 18 && p1 >= 1 && p1 <= 12) return parseFloat(`${p2}.${p1}`);
    return 0;
  }

  // 3. Format angka murni dengan koma atau titik (misal: "8,9", "8.9", "10.2", "12", "7.5 g/dL", "8.5 gr%")
  const numOnlyMatch = s.match(/^(\d{1,2}(?:[.,]\d{1,2})?)(?:\s*(?:g\/dl|mg\/dl|gr%|g%|gr\/dl|g\/l))?$/i);
  if (numOnlyMatch) {
    const cleaned = numOnlyMatch[1].replace(',', '.');
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) return 0;
    if (num > 25 || num < 2.0) return 0; // Cegah nilai bukan Hb
    return Number(num.toFixed(1));
  }

  return 0;
}

/**
 * Merekonstruksi rekaman harian (dailyRecords) dan jadwal mingguan (weeks)
 * langsung dari baris matriks tanggal 1 s/d 31 di Google Sheets
 */
export function parseDailyRecordsFromRow(
  row: string[],
  daysInMonth: number,
  recommendationCategory: string,
  scheduleDay: HDDaySchedule,
  currentMonth: string,
  hdFrequency?: HDFrequency,
  singleDay?: SingleHDDay,
  lastHdDate?: string
): { dailyRecords: Record<number, DailyActionRecord>; weeks: PatientRecord['weeks'] } {
  const dailyRecords: Record<number, DailyActionRecord> = {};
  const weeks = generateDefaultWeeks(recommendationCategory as any, currentMonth, hdFrequency, scheduleDay, singleDay, lastHdDate);

  // Deteksi indeks awal kolom tanggal secara dinamis:
  // Format Baru (Tanpa Hb): Col 0 (No), 1 (Nama), 2 (RM), 3 (Freq), 4 (Shift), 5 (Dosis/Alokasi) -> Tanggal 1 berada di index 6 (Col G).
  // Format Lama (Dengan Hb): Col 0 (No), 1 (Nama), 2 (RM), 3 (Freq), 4 (Shift), 5 (Hb), 6 (Dosis) -> Tanggal 1 berada di index 7 (Col H).
  let dateStartIndex = 6;
  if (row.length > daysInMonth + 7) {
    const col6Val = (row[6] || '').toString().toLowerCase();
    const col5Val = (row[5] || '').toString().toLowerCase();
    if (col6Val.includes('epo') || col6Val.includes('protokol') || col6Val.includes('maintenance') || col6Val.includes('transfusi') || col6Val.includes('evaluasi') || col5Val.match(/^\d+(\.\d+)?$/)) {
      dateStartIndex = 7;
    }
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cellIdx = dateStartIndex - 1 + d;
    if (cellIdx >= row.length) break;
    const rawCell = (row[cellIdx] || '').toString().trim();
    if (!rawCell || rawCell === '-') continue;

    if (rawCell === '✅' || rawCell.toUpperCase() === 'P' || rawCell.includes('✅')) {
      dailyRecords[d] = {
        status: 'Diberikan',
        administeredAt: 'Tercatat di Google Sheets',
        administeredBy: 'Perawat HD',
      };
      const weekNum = getHDSessionWeek(d, daysInMonth, scheduleDay);
      const wKey = `week${weekNum}` as 'week1' | 'week2' | 'week3' | 'week4';
      if (weeks[wKey]) {
        weeks[wKey].status = 'Diberikan';
        weeks[wKey].administeredAt = 'Tercatat di Google Sheets';
        weeks[wKey].administeredBy = 'Perawat HD';
      }
    } else if (rawCell === '❌' || rawCell.includes('❌')) {
      dailyRecords[d] = {
        status: 'Tunda',
        notes: 'Ditunda di Google Sheets',
      };
      const weekNum = getHDSessionWeek(d, daysInMonth, scheduleDay);
      const wKey = `week${weekNum}` as 'week1' | 'week2' | 'week3' | 'week4';
      if (weeks[wKey] && weeks[wKey].status !== 'Diberikan') {
        weeks[wKey].status = 'Tunda';
        weeks[wKey].notes = 'Ditunda di Google Sheets';
      }
    } else if (rawCell.toLowerCase() === 'batal') {
      dailyRecords[d] = {
        status: 'Batal',
        notes: 'Dibatalkan di Google Sheets',
      };
    } else if (rawCell === '2000') {
      // Untuk EPO 1x 2000 IU, jika sudah ada tanggal terjadwal '2000' atau sudah diberikan, abaikan '2000' duplikat dari sheet lama
      const isEpo1x = recommendationCategory === 'EPO_1X_2000';
      const hasAlreadyScheduled = Object.values(dailyRecords).some((r) => r.status === 'Belum' || r.status === 'Diberikan');
      if (!isEpo1x || !hasAlreadyScheduled) {
        dailyRecords[d] = {
          status: 'Belum',
        };
      }
    }
  }

  // Hubungkan penundaan (Tunda / ❌) ke sesi HD berikutnya secara otomatis
  const monthInfo = getMonthDaysInfo(currentMonth);
  const patientSessions = getPatientMonthHDSessions({
    scheduleDay,
    singleDay,
    hdFrequency,
    lastHdDate,
  } as any, monthInfo);

  const dayKeys = Object.keys(dailyRecords).map(Number).sort((a, b) => a - b);
  for (const d of dayKeys) {
    if (dailyRecords[d]?.status === 'Tunda') {
      let nextHdDay: number | null = null;

      // Cari sesi HD berikutnya setelah tanggal d sesuai jadwal pasien
      const currIdx = patientSessions.findIndex((s) => s.dateNumber === d);
      if (currIdx >= 0 && currIdx < patientSessions.length - 1) {
        nextHdDay = patientSessions[currIdx + 1].dateNumber;
      } else {
        // Fallback jika tanggal d bukan di daftar sesi standar (misal tanggal pengganti)
        const laterSessions = patientSessions.filter((s) => s.dateNumber > d);
        if (laterSessions.length > 0) {
          nextHdDay = laterSessions[0].dateNumber;
        }
      }

      if (nextHdDay) {
        dailyRecords[d].postponedToDate = nextHdDay;
        if (!dailyRecords[nextHdDay]) {
          dailyRecords[nextHdDay] = {
            status: 'Belum',
            postponedFromDate: d,
            notes: `Jadwal Pengganti dari penundaan tgl ${d}`,
          };
        } else if (dailyRecords[nextHdDay].status === 'Belum') {
          dailyRecords[nextHdDay].postponedFromDate = d;
          dailyRecords[nextHdDay].notes = `Jadwal Pengganti dari penundaan tgl ${d}`;
        } else if (dailyRecords[nextHdDay].status === 'Tunda') {
          // Tanggal berikutnya juga ditunda, teruskan informasi rantai penundaan
          dailyRecords[nextHdDay].postponedFromDate = d;
        }
      }
    }
  }

  // Khusus EPO 1x 2000 IU: jika sudah berstatus Diberikan di satu tanggal, bersihkan record Belum lainnya
  if (recommendationCategory === 'EPO_1X_2000') {
    const hasGiven = Object.values(dailyRecords).some((r) => r.status === 'Diberikan');
    if (hasGiven) {
      for (const [dateStr, rec] of Object.entries(dailyRecords)) {
        if (rec.status === 'Belum') {
          delete dailyRecords[parseInt(dateStr, 10)];
        }
      }
    }
  }

  return { dailyRecords, weeks };
}

async function readSingleSheetData(
  spreadsheetId: string,
  tabName: string,
  scheduleDay: HDDaySchedule,
  accessToken: string,
  currentMonth: string
): Promise<PatientRecord[]> {
  const range = `${tabName}!A1:AZ150`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!res.ok) return [];

  const json = await res.json();
  const rows: string[][] = json.values || [];
  if (rows.length <= 1) return [];

  const { daysInMonth } = getMonthDaysInfo(currentMonth);
  const dataRows = rows.slice(1);
  const patients: PatientRecord[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const name = (row[1] || '').trim();
    const noRm = (row[2] || '').trim();

    // Lewati baris kosong, header kelompok shift, baris total ringkasan, atau baris error
    if (!name || isSummaryOrHeaderRow(name, noRm, row.join(' '))) {
      continue;
    }

    const col3 = (row[3] || '').trim();
    const col3Lower = col3.toLowerCase();
    let hdFrequency: HDFrequency = '2 kali dalam satu minggu';
    let singleDay: SingleHDDay | undefined = undefined;
    let scheduleShift: HDShift = 'Shift 1 (Pagi)';
    let rawHb = 0;
    let doseTextHint = (row[6] || '').trim();

    if (col3Lower.includes('pagi') || col3Lower.includes('siang')) {
      // Format Lama (tanpa kolom Frekuensi HD)
      scheduleShift = col3Lower.includes('siang') ? 'Shift 2 (Siang)' : 'Shift 1 (Pagi)';
      doseTextHint = (row[5] || '').trim();
      rawHb = decodeHbFromValue(row[4], doseTextHint);
    } else {
      // Format Baru (dengan kolom Frekuensi HD)
      if (col3Lower.includes('2 minggu') || col3Lower.includes('1/2') || col3Lower.includes('2mgg') || col3Lower.includes('2 mgg')) {
        hdFrequency = '1 kali / 2 minggu';
      } else if (col3Lower.includes('1')) {
        hdFrequency = '1 kali dalam satu minggu';
      } else {
        hdFrequency = '2 kali dalam satu minggu';
      }
      if (col3Lower.includes('senin')) singleDay = 'Senin';
      else if (col3Lower.includes('selasa')) singleDay = 'Selasa';
      else if (col3Lower.includes('rabu')) singleDay = 'Rabu';
      else if (col3Lower.includes('kamis')) singleDay = 'Kamis';
      else if (col3Lower.includes('jumat')) singleDay = 'Jumat';
      else if (col3Lower.includes('sabtu')) singleDay = 'Sabtu';

      if ((hdFrequency === '1 kali dalam satu minggu' || hdFrequency === '1 kali / 2 minggu') && singleDay) {
        scheduleDay = getScheduleDayFromSingleDay(singleDay);
      }

      const shiftStr = (row[4] || '').toLowerCase();
      scheduleShift = shiftStr.includes('siang') ? 'Shift 2 (Siang)' : 'Shift 1 (Pagi)';
      // Cek apakah kolom 5 berisi alokasi/dosis (format baru tanpa kolom Hb)
      const col5Str = (row[5] || '').toString().toLowerCase();
      const isCol5DoseText = col5Str.includes('epo') || col5Str.includes('protokol') || col5Str.includes('maintenance') || col5Str.includes('transfusi') || col5Str.includes('evaluasi') || col5Str.includes('rawat');
      if (isCol5DoseText) {
        rawHb = 0; // Nilai Hb diambil dari REKAP_HB_TAHUNAN
      } else {
        rawHb = decodeHbFromValue(row[5], doseTextHint);
      }
    }

    const hbValue = isNaN(rawHb) || rawHb < 0 ? 0 : rawHb;
    const reco = calculateClinicalRecommendation(hbValue, hdFrequency);

    // Rekonstruksi status harian dan mingguan dari matriks tanggal
    const { dailyRecords, weeks } = parseDailyRecordsFromRow(
      row,
      daysInMonth,
      reco.category,
      scheduleDay,
      currentMonth,
      hdFrequency,
      singleDay
    );

    const statusColIndex = row.length - 2;
    const overallStatusRaw = (row[statusColIndex] || '').trim();
    let overallStatus: PatientRecord['overallStatus'] = 'Berjalan';
    let patientStatus: PatientRecord['patientStatus'] = 'Aktif';

    if (overallStatusRaw.includes('Meninggal')) {
      patientStatus = 'Meninggal Dunia';
      overallStatus = 'Selesai';
    } else if (overallStatusRaw.includes('Pindah')) {
      patientStatus = 'Pindah RS';
      overallStatus = 'Selesai';
    } else if (overallStatusRaw.includes('Rawat Inap')) {
      patientStatus = 'Rawat Inap';
      overallStatus = 'Perlu Perhatian';
    } else if (overallStatusRaw.includes('Berhenti')) {
      patientStatus = 'Berhenti HD';
      overallStatus = 'Selesai';
    } else if (overallStatusRaw.includes('Selesai')) {
      overallStatus = 'Selesai';
    } else if (overallStatusRaw.includes('Perhatian') || reco.category === 'TRANSFUSI_2_RAWAT_INAP') {
      overallStatus = 'Perlu Perhatian';
    }

    const notes = row[row.length - 1] || '';

    const cleanNoRm = noRm ? noRm.replace(/[^a-zA-Z0-9_-]/g, '') : `RM${1000 + i}`;
    const uniqueSuffix = `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;

    patients.push({
      id: `sheet-${tabName.toLowerCase()}-${cleanNoRm}-${uniqueSuffix}`,
      noRm: noRm || `RM-${1000 + i}`,
      name,
      patientStatus,
      hdFrequency,
      singleDay,
      scheduleDay,
      scheduleShift,
      hbValue,
      hbDate: `${currentMonth}-02`,
      monthPeriod: currentMonth,
      recommendation: reco,
      weeks,
      dailyRecords,
      overallStatus,
      clinicalNotes: notes,
      updatedAt: new Date().toISOString(),
    });
  }

  return patients;
}

/**
 * Membangun tabel matriks tahunan terintegrasi (REKAP_HB_TAHUNAN)
 * Menampilkan data pasien, Hb acuan bulan lalu, rencana cek lab bulan depan,
 * serta 12 kolom riwayat Hb bulanan (Jan s/d Des) dalam 1 lembar kerja.
 */
export function buildYearlySummaryTable(
  patients: PatientRecord[],
  yearMonth: string
): string[][] {
  const [yearStr, monthStr] = yearMonth.split('-');
  const monthNum = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const curMonthName = monthNames[monthNum - 1] || 'Bulan Ini';

  const header: string[] = [
    'No',
    'Nama Pasien',
    'No. RM',
    'Jadwal HD',
    'Shift',
    'Frekuensi HD',
    'Hb Acuan (Bln Lalu)',
    `Hb Bulan Ini (${curMonthName})`,
    'Rencana Cek Hb Bln Depan',
    'Alokasi Terapi Saat Ini',
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
    'Dokter DPJP',
    'Catatan Klinis Pasien'
  ];

  const rows: string[][] = [header];

  // Urutkan pasien sesuai urutan operasional klinis HD:
  // 1. Senin-Kamis (Pagi)
  // 2. Senin-Kamis (Siang)
  // 3. Selasa-Jumat (Pagi)
  // 4. Selasa-Jumat (Siang)
  // 5. Rabu-Sabtu (Pagi)
  // 6. Rabu-Sabtu (Siang)
  const getScheduleSortRank = (p: PatientRecord): number => {
    const day = (p.scheduleDay || '').toLowerCase();
    const shift = (p.scheduleShift || '').toLowerCase();
    const isPagi = shift.includes('pagi') || shift.includes('1');

    if (day.includes('senin') || day.includes('kamis')) {
      return isPagi ? 1 : 2;
    }
    if (day.includes('selasa') || day.includes('jumat')) {
      return isPagi ? 3 : 4;
    }
    if (day.includes('rabu') || day.includes('sabtu')) {
      return isPagi ? 5 : 6;
    }
    return isPagi ? 7 : 8;
  };

  const sorted = [...patients].sort((a, b) => {
    const rankA = getScheduleSortRank(a);
    const rankB = getScheduleSortRank(b);
    if (rankA !== rankB) return rankA - rankB;

    // Di dalam kelompok jadwal dan shift yang sama, urutkan nama pasien secara alfabetis
    return a.name.localeCompare(b.name, 'id');
  });

  sorted.forEach((p, idx) => {
    const prevVal = typeof p.prevHbValue === 'number' && p.prevHbValue > 0 
      ? p.prevHbValue 
      : undefined;

    const effHb = getEffectivePatientHb(p, yearMonth);
    const hasCurInput = Boolean(p.hbDate && p.hbDate.startsWith(yearMonth) && typeof p.hbValue === 'number' && p.hbValue > 0);
    const isScheduledPending = isSelectiveHbCandidate(p) && !hasCurInput;

    // Nilai Hb bulan berjalan:
    // 1. Jika terjadwal Cek Hb Pilihan dan belum ada hasil lab terbaru -> 0 (menunggu lab)
    // 2. Jika tidak terjadwal (Hb >= 9.0) -> otomatis nilai bulan sebelumnya (prevVal)
    // 3. Jika sudah ada input bulan berjalan -> nilai input terbaru
    const curVal = isScheduledPending ? 0 : (effHb > 0 ? effHb : (hasCurInput ? p.hbValue : 0));

    // Evaluasi klinis untuk rencana cek Hb bulan berikutnya:
    // Acuan utama: jika nilai Hb terakhir <= 8.9 mg/dL -> Cek Hb Pilihan (≤ 8.9)
    const effectiveHbForNext = curVal > 0 ? curVal : prevVal;
    const isMeninggal = p.patientStatus === 'Meninggal Dunia';
    const isOtherNonActive = p.patientStatus && p.patientStatus !== 'Aktif';

    let rencanaCek = 'Rutin Hb (Evaluasi EPO)';
    if (isMeninggal) {
      rencanaCek = '⬛ Meninggal Dunia';
    } else if (isOtherNonActive) {
      rencanaCek = `Non-Aktif (${p.patientStatus})`;
    } else if (effectiveHbForNext !== undefined && effectiveHbForNext > 0) {
      const roundedVal = Number(effectiveHbForNext.toFixed(1));
      if (roundedVal <= 8.9) {
        rencanaCek = '⭐ Cek Hb Pilihan (≤ 8.9)';
      } else if (roundedVal >= 9.0 && roundedVal <= 12.0) {
        rencanaCek = 'Rutin Maintenance';
      } else if (roundedVal > 12.0) {
        rencanaCek = 'Hold EPO (Evaluasi Ulang)';
      }
    } else if (isSelectiveHbCandidate(p)) {
      rencanaCek = '⭐ Cek Hb Pilihan (≤ 8.9)';
    } else {
      rencanaCek = 'Menunggu Input Lab';
    }

    const recoTitle = isMeninggal
      ? 'Non-Aktif (Meninggal Dunia)'
      : isOtherNonActive
      ? `Non-Aktif (${p.patientStatus})`
      : (p.recommendation?.title || '-');

    let finalNotes = p.clinicalNotes || '';
    if (isMeninggal) {
      const dateText = p.statusDate ? ` per ${p.statusDate}` : '';
      const notesText = p.statusNotes ? ` (${p.statusNotes})` : '';
      if (!finalNotes.includes('Meninggal Dunia')) {
        finalNotes = finalNotes ? `[Meninggal Dunia${dateText}${notesText}] ${finalNotes}` : `[Meninggal Dunia${dateText}${notesText}]`;
      }
    } else if (isOtherNonActive) {
      const dateText = p.statusDate ? ` per ${p.statusDate}` : '';
      const notesText = p.statusNotes ? ` (${p.statusNotes})` : '';
      if (!finalNotes.includes(p.patientStatus!)) {
        finalNotes = finalNotes ? `[${p.patientStatus}${dateText}${notesText}] ${finalNotes}` : `[${p.patientStatus}${dateText}${notesText}]`;
      }
    }

    const prevHbDisplay = prevVal !== undefined && prevVal > 0 ? prevVal.toFixed(1) : '-';
    const curHbDisplay = isMeninggal ? '-' : (curVal > 0 ? curVal.toFixed(1) : '0');

    const row: string[] = [
      String(idx + 1),
      p.name,
      p.noRm,
      p.scheduleDay,
      p.scheduleShift.includes('Pagi') ? 'Pagi (P)' : 'Siang (S)',
      p.hdFrequency === '1 kali / 2 minggu'
        ? (p.singleDay ? `1x/2 mgg (${p.singleDay})` : '1x/2 mgg')
        : p.hdFrequency === '1 kali dalam satu minggu'
        ? (p.singleDay ? `1x/mgg (${p.singleDay})` : '1x/mgg')
        : '2x/mgg',
      prevHbDisplay,
      curHbDisplay,
      rencanaCek,
      recoTitle,
    ];

    // Kolom 12 Bulan (Jan s/d Des)
    for (let m = 1; m <= 12; m++) {
      if (m === monthNum) {
        row.push(curHbDisplay);
      } else if (m === monthNum - 1 && prevVal !== undefined) {
        row.push(prevHbDisplay);
      } else {
        row.push('');
      }
    }

    row.push(p.doctorInCharge || 'dr. Sp.PD-KGH');
    row.push(finalNotes);

    rows.push(row);
  });

  return rows;
}

/**
 * Membangun tabel khusus PASIEN MENINGGAL untuk Google Sheets
 * Tab 'PASIEN MENINGGAL' mencatat seluruh riwayat pasien wafat secara permanen dan jelas
 */
export function buildDeceasedPatientsTable(patients: PatientRecord[]): string[][] {
  const header: string[] = [
    'No',
    'Nama Pasien',
    'No. RM',
    'Status',
    'Tanggal Wafat / Meninggal',
    'Tempat / Keterangan Wafat',
    'Jadwal HD Terakhir',
    'Shift Terakhir',
    'Frekuensi HD',
    'Hb Terakhir (g/dL)',
    'Dokter DPJP',
    'Catatan Klinis / Riwayat Medis',
    'Waktu Pencatatan Sistem'
  ];

  const rows: string[][] = [header];

  const deceasedPatients = patients.filter((p) => p.patientStatus === 'Meninggal Dunia');

  if (deceasedPatients.length === 0) {
    rows.push(['-', '(Belum ada data pasien meninggal dunia)', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
    return rows;
  }

  deceasedPatients.forEach((p, idx) => {
    const hbDisplay = p.hbValue > 0 
      ? p.hbValue.toFixed(1) 
      : (p.prevHbValue && p.prevHbValue > 0 ? p.prevHbValue.toFixed(1) : '-');

    const freqDisplay = p.hdFrequency === '1 kali / 2 minggu'
      ? (p.singleDay ? `1x/2 mgg (${p.singleDay})` : '1x/2 mgg')
      : p.hdFrequency === '1 kali dalam satu minggu'
      ? (p.singleDay ? `1x/mgg (${p.singleDay})` : '1x/mgg')
      : '2x/mgg';

    rows.push([
      String(idx + 1),
      p.name,
      p.noRm,
      'Meninggal Dunia',
      p.statusDate || '-',
      p.statusNotes || '-',
      p.scheduleDay || '-',
      p.scheduleShift ? (p.scheduleShift.includes('Pagi') ? 'Pagi (P)' : 'Siang (S)') : '-',
      freqDisplay,
      hbDisplay,
      p.doctorInCharge || 'dr. Sp.PD-KGH',
      p.clinicalNotes || '-',
      p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('id-ID') : '-'
    ]);
  });

  return rows;
}

/**
 * Mendapatkan string tahun-bulan (YYYY-MM) untuk bulan selanjutnya
 */
export function getNextYearMonth(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const nextDate = new Date(year, month, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Mendapatkan string tahun-bulan (YYYY-MM) untuk bulan sebelumnya
 * Sesuai aturan acuan Cek Hb Pilihan:
 * Jan 2026 -> Des 2025, Feb 2026 -> Jan 2026, Mar 2026 -> Feb 2026, dst.
 */
export function getPreviousYearMonth(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const prevDate = new Date(year, month - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

export const YEARLY_MONTH_KEYWORDS: Record<number, string[]> = {
  1: ['jan', 'januari', 'january'],
  2: ['feb', 'februari', 'february'],
  3: ['mar', 'maret', 'march'],
  4: ['apr', 'april'],
  5: ['mei', 'may'],
  6: ['jun', 'juni', 'june'],
  7: ['jul', 'juli', 'july'],
  8: ['agu', 'agt', 'agustus', 'aug', 'august'],
  9: ['sep', 'sept', 'september'],
  10: ['okt', 'oct', 'oktober', 'october'],
  11: ['nov', 'nop', 'november'],
  12: ['des', 'dec', 'desember', 'december'],
};

/**
 * Mendapatkan indeks kolom Hb Bulan Ini dari baris header REKAP HB TAHUNAN
 */
export function getYearlyCurrentMonthColIndex(headerRow: string[] = []): number {
  for (let idx = 0; idx < headerRow.length; idx++) {
    const hl = String(headerRow[idx] || '').trim().toLowerCase();
    if (hl.includes('bulan ini') || hl.includes('bln ini') || hl.includes('saat ini') || hl.includes('sekarang')) {
      return idx;
    }
  }
  return 7;
}

/**
 * Mendapatkan indeks kolom Hb Acuan (Bln Lalu) dari baris header REKAP HB TAHUNAN
 */
export function getYearlyAcuanColIndex(headerRow: string[] = []): number {
  for (let idx = 0; idx < headerRow.length; idx++) {
    const hl = String(headerRow[idx] || '').trim().toLowerCase();
    if (hl.includes('acuan') || hl.includes('bln lalu') || hl.includes('bulan lalu') || hl.includes('sebelumnya')) {
      return idx;
    }
  }
  return 6;
}

/**
 * Mendapatkan pemetaan indeks kolom 12 bulan (Jan s/d Des) dari baris header REKAP HB TAHUNAN.
 * Menjamin kolom Hb Acuan dan Hb Bulan Ini tidak tertukar dengan kolom 12 bulan murni.
 */
export function getYearlyMonthColIndices(headerRow: string[] = []): Record<number, number> {
  const map: Record<number, number> = {};

  headerRow.forEach((colName, idx) => {
    const lower = String(colName || '').trim().toLowerCase();
    // Abaikan kolom acuan atau bulan ini agar tidak mengaburkan kolom 12 bulan murni
    if (lower.includes('acuan') || lower.includes('bln lalu') || lower.includes('bulan lalu') || lower.includes('bulan ini') || lower.includes('bln ini')) {
      return;
    }
    const words = lower.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
    for (let m = 1; m <= 12; m++) {
      const kws = YEARLY_MONTH_KEYWORDS[m];
      const matchWord = words.some(w => kws.includes(w));
      const matchPrefix = kws.some(kw => lower === kw || lower.startsWith(kw + ' ') || lower.startsWith(kw + '-'));
      if (matchWord || matchPrefix) {
        if (map[m] === undefined) {
          map[m] = idx;
        }
      }
    }
  });

  // Fallback ke urutan kolom standar (kolom 10 s/d 21 untuk Jan s/d Des, 9 + m)
  let standardStart = 10;
  for (let idx = 0; idx < headerRow.length; idx++) {
    const hl = String(headerRow[idx] || '').toLowerCase();
    if (hl.includes('alokasi') || hl.includes('terapi')) {
      standardStart = idx + 1;
      break;
    }
  }

  for (let m = 1; m <= 12; m++) {
    if (map[m] === undefined) {
      map[m] = standardStart + (m - 1);
    }
  }
  return map;
}

export interface PatientYearlyHbInfo {
  prevHb?: number;
  currentHb: number;
  doctor?: string;
  notes?: string;
}

/**
 * Mengekstrak peta Hb bulan target dan acuan Cek Hb Pilihan dari data REKAP HB TAHUNAN
 * Sesuai aturan tepat:
 * - Jan 2026: acuan Des 2025
 * - Feb 2026: acuan Jan 2026
 * - Mar 2026: acuan Feb 2026
 * - Apr 2026: acuan Mar 2026
 * - Mei 2026: acuan Apr 2026
 * - Jun 2026: acuan Mei 2026
 * - Jul 2026: acuan Jun 2026
 * - Agu 2026: acuan Jul 2026
 * - Sep 2026: acuan Agu 2026
 * - Okt 2026: acuan Sep 2026
 * - Nov 2026: acuan Okt 2026
 * - Des 2026: acuan Nov 2026
 * dan untuk tahun-tahun selanjutnya.
 * Nilai Hb bulan berjalan diambil dari Google Sheet. Jika 0 atau tidak ada data maka bernilai 0.
 */
export function extractYearlyPatientInfoMap(
  yearlyRows: string[][],
  targetMonth: string
): Map<string, PatientYearlyHbInfo> {
  const map = new Map<string, PatientYearlyHbInfo>();
  if (!yearlyRows || yearlyRows.length <= 1) return map;

  const [_, curMonthPart] = targetMonth.split('-');
  const monthNum = parseInt(curMonthPart, 10) || (new Date().getMonth() + 1);

  const headerRow = yearlyRows[0] || [];
  const monthColMap = getYearlyMonthColIndices(headerRow);
  const colHbAcuanIdx = getYearlyAcuanColIndex(headerRow);
  const colHbBulanIniIdx = getYearlyCurrentMonthColIndex(headerRow);

  const colDoctorIdx = headerRow.findIndex(h => String(h || '').toLowerCase().includes('dokter') || String(h || '').toLowerCase().includes('dpjp'));
  const colNotesIdx = headerRow.findIndex(h => String(h || '').toLowerCase().includes('catatan'));

  yearlyRows.slice(1).forEach((yRow) => {
    const name = (yRow[1] || '').trim();
    const rm = (yRow[2] || '').trim();
    if (!name && !rm) return;
    if (isSummaryOrHeaderRow(name, rm, yRow.join(' '))) return;

    // Helper untuk mengambil nilai Hb pada bulan tertentu (1 s/d 12)
    const getHbAtMonth = (m: number): number => {
      const cIdx = monthColMap[m];
      if (cIdx !== undefined && yRow[cIdx] !== undefined) {
        const dec = decodeHbFromValue(yRow[cIdx]);
        if (dec > 0) return dec;
      }
      // Jika di kolom 12 bulan masih 0, cek kolom Hb Bulan Ini jika cocok dengan bulan m
      if (colHbBulanIniIdx !== -1 && yRow[colHbBulanIniIdx] !== undefined) {
        const colHeader = String(headerRow[colHbBulanIniIdx] || '').toLowerCase();
        const kws = YEARLY_MONTH_KEYWORDS[m] || [];
        const isMatch = kws.some(kw => colHeader.includes(kw)) ||
          (m === monthNum && !Object.entries(YEARLY_MONTH_KEYWORDS).some(([om, okws]) => Number(om) !== monthNum && okws.some(kw => colHeader.includes(kw))));
        if (isMatch) {
          const dec = decodeHbFromValue(yRow[colHbBulanIniIdx]);
          if (dec > 0) return dec;
        }
      }
      return 0;
    };

    // 1. Nilai Hb Bulan Berjalan:
    // Jika 0 atau tidak ada data pada Google Sheet maka nilainya 0
    let currentHb = getHbAtMonth(monthNum);
    if (currentHb === 0 && colHbBulanIniIdx !== -1 && yRow[colHbBulanIniIdx] !== undefined) {
      const colHeader = String(headerRow[colHbBulanIniIdx] || '').toLowerCase();
      const kws = YEARLY_MONTH_KEYWORDS[monthNum] || [];
      const isColMatchingMonth = kws.some(kw => colHeader.includes(kw));
      if (isColMatchingMonth) {
        const dec = decodeHbFromValue(yRow[colHbBulanIniIdx]);
        if (dec > 0) currentHb = dec;
      }
    }

    // 2. Nilai Hb Acuan untuk Sesi CEK HB PILIHAN:
    let prevHb: number | undefined = undefined;
    if (monthNum === 1) {
      if (colHbAcuanIdx !== -1 && yRow[colHbAcuanIdx] !== undefined) {
        const dec = decodeHbFromValue(yRow[colHbAcuanIdx]);
        if (dec > 0) prevHb = dec;
      }
    } else {
      const priorVal = getHbAtMonth(monthNum - 1);
      if (priorVal > 0) {
        prevHb = priorVal;
      } else if (colHbAcuanIdx !== -1 && yRow[colHbAcuanIdx] !== undefined) {
        const dec = decodeHbFromValue(yRow[colHbAcuanIdx]);
        if (dec > 0) prevHb = dec;
      }
    }

    const info: PatientYearlyHbInfo = {
      prevHb,
      currentHb,
      doctor: colDoctorIdx !== -1 ? yRow[colDoctorIdx] : (yRow[22] || undefined),
      notes: colNotesIdx !== -1 ? yRow[colNotesIdx] : (yRow[23] || undefined),
    };

    const rmKey = rm.toLowerCase();
    const normRmKey = rmKey.replace(/[^a-z0-9]/g, '');
    const normNameKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (rmKey) map.set(rmKey, info);
    if (normRmKey && normRmKey !== rmKey) map.set(normRmKey, info);
    if (normNameKey) map.set(normNameKey, info);
  });

  return map;
}

/**
 * Menyimpan cache data 12 bulan ke localStorage sehingga pergantian bulan di UI
 * selalu 100% konsisten dengan data Google Sheet.
 */
export function cacheAllYearlyMonthsData(
  yearlyRows: string[][],
  yearStr: string,
  basePatients: PatientRecord[]
): void {
  if (!yearlyRows || yearlyRows.length <= 1 || !basePatients || basePatients.length === 0) return;
  if (typeof localStorage === 'undefined') return;
  try {
    for (let m = 1; m <= 12; m++) {
      const monthStr = `${yearStr}-${String(m).padStart(2, '0')}`;
      const monthMap = extractYearlyPatientInfoMap(yearlyRows, monthStr);

      const monthPatients = basePatients.map(p => {
        const rmKey = p.noRm.toLowerCase().trim();
        const normRm = rmKey.replace(/[^a-z0-9]/g, '');
        const normName = p.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const info = monthMap.get(rmKey) || monthMap.get(normRm) || monthMap.get(normName);

        const hbValue = info?.currentHb && info.currentHb > 0 ? info.currentHb : 0;
        const prevHbValue = info?.prevHb && info.prevHb > 0 ? info.prevHb : undefined;

        const isSelective = (typeof prevHbValue === 'number' && prevHbValue > 0 && Number(prevHbValue.toFixed(1)) <= 8.9) ||
          (hbValue > 0 && Number(hbValue.toFixed(1)) <= 8.9) ||
          ((!prevHbValue || prevHbValue === 0) && hbValue === 0);

        const reco = calculateClinicalRecommendation(hbValue, p.hdFrequency);
        const weeks = generateDefaultWeeks(reco.category, monthStr, p.hdFrequency, p.scheduleDay, p.singleDay, p.lastHdDate);
        const firstHDDate = getFirstHDDateOfMonth(monthStr, p.scheduleDay, p.singleDay, p.hdFrequency, p.lastHdDate).dateString;

        return {
          ...p,
          hbValue,
          prevHbValue,
          monthPeriod: monthStr,
          hbDate: `${monthStr}-02`,
          isSelectiveHb: isSelective,
          recommendation: reco,
          weeks,
          dailyRecords: {},
          labSchedule: {
            scheduledDate: firstHDDate,
            testType: isSelective ? 'Cek Hb Pilihan (Hb ≤ 8.9)' : 'Rutin Hb (Evaluasi EPO)',
            status: hbValue > 0 ? 'Selesai' : 'Terjadwal',
            resultHb: hbValue > 0 ? hbValue : undefined,
            isSelectiveHb: isSelective,
            selectiveReason: isSelective ? `Nilai Hb acuan ${prevHbValue ? prevHbValue.toFixed(1) : '< 9.0'} g/dL (< 9.0 g/dL)` : undefined,
            notes: info?.notes,
          },
          updatedAt: new Date().toISOString(),
        };
      });

      localStorage.setItem('dialysis_patients_data_' + monthStr, JSON.stringify(monthPatients));
    }

    localStorage.setItem('epocare_yearly_rows_' + yearStr, JSON.stringify(yearlyRows));
  } catch (e) {
    console.warn('Gagal caching data 12 bulan:', e);
  }
}

/**
 * Membangun tabel penjadwalan CEK HB bulan selanjutnya (JADWAL_CEK_HB)
 * Berisi nama-nama seluruh pasien yang terjadwal cek Hb pada bulan berikutnya,
 * tersusun rapi dengan kolom lengkap:
 * No, Tanggal Terjadwal, Hari, Shift, Jadwal Rutin, No RM, Nama Pasien, Frekuensi,
 * Hb Terakhir, Kategori Pemeriksaan (⭐ Cek Hb Pilihan vs Rutin), Rekomendasi Terapi,
 * Status Sampling, Kolom Kosong Hasil Lab Baru, Paraf / Catatan.
 */
/**
 * Membangun tabel penjadwalan CEK HB bulan selanjutnya (JADWAL_CEK_HB)
 * Mendukung filter cakupan:
 * - 'PILIHAN': Hanya memasukkan pasien dengan Hb bulan sebelumnya < 9.0 mg/dL (Cek Hb Pilihan)
 * - 'SELURUH': Memasukkan seluruh pasien
 */
export function buildNextMonthLabScheduleTable(
  patients: PatientRecord[],
  currentYearMonth: string,
  scheduleScope?: 'PILIHAN' | 'SELURUH'
): string[][] {
  const nextMonth = getNextYearMonth(currentYearMonth);
  const [yStr, mStr] = nextMonth.split('-');
  const nextYear = parseInt(yStr, 10) || new Date().getFullYear();
  const nextMonthNum = parseInt(mStr, 10) || (new Date().getMonth() + 1);
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const nextMonthLabel = `${monthNames[nextMonthNum - 1]} ${nextYear}`;

  let effectiveScope: 'PILIHAN' | 'SELURUH' = scheduleScope || 'PILIHAN';
  if (!scheduleScope) {
    try {
      const stored = localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH' || stored === 'PILIHAN') {
        effectiveScope = stored;
      } else {
        const hasScheduledHighHb = patients.some(
          (p) => p.labSchedule?.status === 'Terjadwal' && !isSelectiveHbCandidate(p)
        );
        effectiveScope = hasScheduledHighHb ? 'SELURUH' : 'PILIHAN';
      }
    } catch (e) {
      // ignore
    }
  }

  const header: string[] = [
    'No',
    'Tanggal Terjadwal',
    'Hari',
    'Shift HD',
    'Jadwal Rutin',
    'No. RM',
    'Nama Pasien',
    'Frekuensi HD',
    'Hb Terakhir (g/dL)',
    'Kategori Pemeriksaan',
    'Rekomendasi Terapi Saat Ini',
    'Status Sampling',
    'Hasil Lab Hb Baru (g/dL)',
    'Paraf Petugas / Catatan'
  ];

  const rows: string[][] = [header];
  const dayNamesIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  // Saring pasien berdasarkan cakupan:
  // Jika PILIHAN: Hanya pasien dengan Hb < 9.0 mg/dL yang masuk tabel
  // Jika SELURUH: Seluruh pasien masuk tabel
  const targetPatients = patients.filter((p) => {
    // Pasien non-aktif (Meninggal Dunia, Pindah RS, Berhenti HD) tidak dijadwalkan bulan berikutnya
    if (p.patientStatus === 'Meninggal Dunia' || p.patientStatus === 'Pindah RS' || p.patientStatus === 'Berhenti HD') {
      return false;
    }

    const sched = p.labSchedule;
    if (effectiveScope === 'PILIHAN') {
      if (sched && (sched.status === 'Tidak Ada Jadwal' || sched.status === 'Ditunda')) {
        return false;
      }
      if (!isSelectiveHbCandidate(p)) {
        return false;
      }
    } else {
      if (sched && sched.status === 'Ditunda') {
        return false;
      }
    }
    return true;
  });

  // Petakan dan urutkan pasien berdasarkan Tanggal Terjadwal -> Shift -> Nama Pasien
  const mapped = targetPatients.map((p) => {
    let targetDate = p.labSchedule?.scheduledDate;
    if (!targetDate || !targetDate.startsWith(nextMonth)) {
      targetDate = getFirstHDDateOfMonth(nextMonth, p.scheduleDay, p.singleDay, p.hdFrequency, p.lastHdDate).dateString;
    }

    const [tY, tM, tD] = targetDate.split('-');
    const dateObj = new Date(parseInt(tY, 10), parseInt(tM, 10) - 1, parseInt(tD, 10));
    const dayOfWeek = dateObj.getDay();
    const dayName = dayNamesIndo[dayOfWeek] || 'Senin';
    const formattedDate = `${String(tD).padStart(2, '0')}/${String(tM).padStart(2, '0')}/${tY}`;

    // Kriteria Cek Hb Pilihan: jika riwayat Hb bulan sebelumnya < 9.0 mg/dL
    const isPilihan = isSelectiveHbCandidate(p);
    let testType = 'Rutin Hb (Evaluasi EPO)';
    if (isPilihan) {
      testType = '⭐ Cek Hb Pilihan (Hb < 9.0)';
    } else if (p.labSchedule?.testType && !p.labSchedule.testType.includes('Pilihan')) {
      testType = p.labSchedule.testType;
    }

    const curVal = p.hbValue > 0 ? p.hbValue : undefined;
    const prevVal = typeof p.prevHbValue === 'number' && p.prevHbValue > 0 ? p.prevHbValue : undefined;
    const lastHb = curVal !== undefined ? curVal.toFixed(1) : (prevVal !== undefined ? prevVal.toFixed(1) : '-');

    const statusSampling = p.labSchedule?.status || 'Terjadwal';
    const resultHb = p.labSchedule?.resultHb ? p.labSchedule.resultHb.toFixed(1) : '';
    const notes = p.labSchedule?.notes || p.clinicalNotes || '';

    return {
      patient: p,
      targetDate,
      formattedDate,
      dayName,
      shift: p.scheduleShift,
      isPilihan,
      testType,
      lastHb,
      statusSampling,
      resultHb,
      notes,
    };
  });

  mapped.sort((a, b) => {
    if (a.targetDate !== b.targetDate) return a.targetDate.localeCompare(b.targetDate);
    if (a.shift !== b.shift) return a.shift.localeCompare(b.shift);
    return a.patient.name.localeCompare(b.patient.name);
  });

  mapped.forEach((item, idx) => {
    const p = item.patient;
    const freqDisplay = p.hdFrequency === '1 kali / 2 minggu'
      ? (p.singleDay ? `1x/2 mgg (${p.singleDay})` : '1x/2 mgg')
      : p.hdFrequency === '1 kali dalam satu minggu'
      ? (p.singleDay ? `1x/mgg (${p.singleDay})` : '1x/mgg')
      : '2x/mgg';

    rows.push([
      String(idx + 1),
      item.formattedDate,
      item.dayName,
      item.shift.includes('Pagi') ? 'Shift 1 (Pagi)' : 'Shift 2 (Siang)',
      p.scheduleDay,
      p.noRm,
      p.name,
      freqDisplay,
      item.lastHb,
      item.testType,
      getEffectivePatientRecommendation(p).title,
      item.statusSampling,
      item.resultHb,
      item.notes,
    ]);
  });

  return rows;
}

/**
 * Membangun tabel matriks kalender 6 hari sesi HD pertama bulan selanjutnya (MATRIKS_CEK_HB / Matrik_Cek_HB)
 * 1. Jika mode "Cek HB Pilihan" (PILIHAN):
 *    HANYA menjadwalkan dan memunculkan pasien yang Hb bulan sebelumnya kurang dari 9,0 mg/dl.
 *    Pelaksanaan CEK HB dilakukan di sesi HD pertama pada bulan selanjutnya untuk masing-masing pasien.
 * 2. Jika mode "Cek HB Seluruh Pasien" (SELURUH):
 *    Menjadwalkan dan memunculkan seluruh pasien pada sesi HD pertama pada bulan selanjutnya untuk masing-masing pasien.
 */
export function buildNextMonthCalendarMatrix(
  patients: PatientRecord[],
  currentYearMonth: string,
  scheduleScope?: 'PILIHAN' | 'SELURUH'
): string[][] {
  const nextMonth = getNextYearMonth(currentYearMonth);
  const { days } = getMonthDaysInfo(nextMonth);
  const operatingDays = days.filter((d) => d.dayOfWeek !== 0).slice(0, 6);
  const dayNamesIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  let effectiveScope: 'PILIHAN' | 'SELURUH' = scheduleScope || 'PILIHAN';
  if (!scheduleScope) {
    try {
      const stored = localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH' || stored === 'PILIHAN') {
        effectiveScope = stored;
      } else {
        const hasScheduledHighHb = patients.some(
          (p) => p.labSchedule?.status === 'Terjadwal' && !isSelectiveHbCandidate(p)
        );
        effectiveScope = hasScheduledHighHb ? 'SELURUH' : 'PILIHAN';
      }
    } catch (e) {
      // ignore
    }
  }

  const colHeaders: string[] = operatingDays.map((d) => {
    const dName = dayNamesIndo[d.dayOfWeek] || '';
    const [_, m, dt] = d.dateString.split('-');
    return `${dName}, ${dt}/${m}`;
  });

  const matrixRows: string[][] = [
    colHeaders,
    colHeaders.map(() => '▶ SHIFT 1 (PAGI)')
  ];

  const pagiPatientsPerCol: string[][] = [];
  const siangPatientsPerCol: string[][] = [];

  operatingDays.forEach((d) => {
    const onThisDay = patients.filter((p) => {
      // Pasien non-aktif (Meninggal Dunia, Pindah RS, Berhenti HD) tidak dijadwalkan di matriks kalender bulan depan
      if (p.patientStatus === 'Meninggal Dunia' || p.patientStatus === 'Pindah RS' || p.patientStatus === 'Berhenti HD') {
        return false;
      }

      const sched = p.labSchedule;

      if (effectiveScope === 'PILIHAN') {
        // 1. Lewati pasien yang tidak ada jadwal atau ditunda
        if (sched && (sched.status === 'Tidak Ada Jadwal' || sched.status === 'Ditunda')) {
          return false;
        }
        // 2. ATURAN 1 (Cek HB Pilihan):
        // Hanya menjadwalkan cek HB untuk pasien yang Hb bulan sebelumnya kurang dari 9,0 mg/dl
        if (!isSelectiveHbCandidate(p)) {
          return false;
        }
      } else {
        // 2. ATURAN 2 (Cek HB Seluruh Pasien):
        // Menjadwalkan seluruh pasien hemodialisa
        if (sched && sched.status === 'Ditunda') {
          return false;
        }
      }

      // 3. ATURAN PELAKSANAAN: Sesi HD pertama pada bulan target untuk masing-masing pasien
      let targetDate = sched?.scheduledDate;
      if (!targetDate || !targetDate.startsWith(nextMonth)) {
        targetDate = getFirstHDDateOfMonth(nextMonth, p.scheduleDay, p.singleDay, p.hdFrequency, p.lastHdDate).dateString;
      }

      return targetDate === d.dateString;
    });

    const pagi = onThisDay
      .filter((p) => p.scheduleShift.includes('Pagi'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p, idx) => `${idx + 1}. ${p.name}`);

    const siang = onThisDay
      .filter((p) => p.scheduleShift.includes('Siang'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p, idx) => `${idx + 1}. ${p.name}`);

    pagiPatientsPerCol.push(pagi);
    siangPatientsPerCol.push(siang);
  });

  const maxPagiRows = Math.max(...pagiPatientsPerCol.map((list) => list.length), 1);
  for (let r = 0; r < maxPagiRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < operatingDays.length; c++) {
      row.push(pagiPatientsPerCol[c][r] || '');
    }
    matrixRows.push(row);
  }

  matrixRows.push(colHeaders.map(() => '▶ SHIFT 2 (SIANG)'));

  const maxSiangRows = Math.max(...siangPatientsPerCol.map((list) => list.length), 1);
  for (let r = 0; r < maxSiangRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < operatingDays.length; c++) {
      row.push(siangPatientsPerCol[c][r] || '');
    }
    matrixRows.push(row);
  }

  return matrixRows;
}

/**
 * Kode Google Apps Script Terintegrasi 1 Tahun:
 * 1. Mengelola 3 Tab Jadwal Harian: 'Senin-Kamis', 'Selasa-Jumat', 'Rabu-Sabtu'
 * 2. Mengelola 1 Tab Master Tahunan: 'REKAP_HB_TAHUNAN' (12 Bulan Jan-Des)
 * 3. Otomatis menghubungkan acuan Hb bulan sebelumnya dengan rencana Cek Hb Pilihan (<9.0)
 * 4. Mendukung batch writing super cepat & penginputan langsung di Google Sheets
 */
export const APPS_SCRIPT_SAMPLE_CODE = `/**
 * EPOCARE - Google Apps Script Sinkronisasi Terintegrasi 1 Tahun (TURBO HIGH-SPEED ENGINE)
 * RS Happy Land Medical Centre Yogyakarta
 * 
 * Optimalisasi Performa Super Cepat:
 * - Menghindari pemanggilan clearFormats() dan setColumnWidth() berulang pada sheet yang sudah ada (10x lebih cepat)
 * - Penulisan data dan format warna secara batch 2D array (1-call execution)
 * - Penarikan data efisien hanya pada tab jadwal & rekap master
 */
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Pertahankan sheet resmi: REKAP HB TAHUNAN, MATRIK CEK HB, Senin-Kamis, Selasa-Jumat, Rabu-Sabtu, PASIEN MENINGGAL
  var sheetNames = ["REKAP HB TAHUNAN", "REKAP_HB_TAHUNAN", "MATRIK CEK HB", "MATRIKS_CEK_HB", "Matrik_Cek_HB", "Senin-Kamis", "Selasa-Jumat", "Rabu-Sabtu", "PASIEN MENINGGAL", "PASIEN_MENINGGAL", "DATA PASIEN MENINGGAL"];
  var result = {};
  
  // Baca langsung hanya tab yang dibutuhkan tanpa looping seluruh tab workbook
  for (var i = 0; i < sheetNames.length; i++) {
    var name = sheetNames[i];
    var sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() > 0) {
      result[name] = sh.getDataRange().getDisplayValues();
    }
  }

  // Fallback hanya jika tab utama belum dibuat sama sekali
  if (Object.keys(result).length === 0) {
    var allSheets = ss.getSheets();
    for (var j = 0; j < allSheets.length; j++) {
      var sh = allSheets[j];
      var sName = sh.getName();
      if (sh.getLastRow() > 0) {
        result[sName] = sh.getDataRange().getDisplayValues();
        break;
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success", data: result }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var yearMonth = body.yearMonth || "";
    var monthNum = 0;
    if (yearMonth) {
      var parts = yearMonth.split("-");
      if (parts.length >= 2) monthNum = parseInt(parts[1], 10) || 0;
    }

    // Hapus sheet JADWAL CEK HB lama jika masih ada (karena nilai HB hanya ada pada sheet REKAP HB TAHUNAN)
    var oldLab = ss.getSheetByName("JADWAL_CEK_HB") || ss.getSheetByName("Jadwal_Cek_HB") || ss.getSheetByName("JADWAL CEK HB") || ss.getSheetByName("Jadwal Cek HB");
    if (oldLab) {
      try {
        ss.deleteSheet(oldLab);
      } catch (errDel) {}
    }

    // 1. SINKRONISASI TAB JADWAL HARIAN: 'Senin-Kamis', 'Selasa-Jumat', 'Rabu-Sabtu' (TANPA KOLOM NILAI HB)
    if (body.scheduleData) {
      for (var tabName in body.scheduleData) {
        var rows = body.scheduleData[tabName];
        if (!rows || rows.length === 0) continue;
        
        var sheet = ss.getSheetByName(tabName);
        var isNewSheet = false;
        if (!sheet) {
          sheet = ss.insertSheet(tabName);
          isNewSheet = true;
        }
        
        var numRows = rows.length;
        var numCols = rows[0].length;
        
        // HANYA atur format kolom & frozen saat sheet pertama kali dibuat atau masih kosong
        if (isNewSheet || sheet.getLastRow() === 0) {
          sheet.clearContents();
          sheet.clearFormats();
          
          sheet.getRange(1, 3, numRows, 4).setNumberFormat("@");
          var dateColCount = (numCols - 5) - 6;
          if (dateColCount > 0) {
            sheet.getRange(1, 7, numRows, dateColCount).setNumberFormat("@");
          }
          
          sheet.setFrozenRows(1);
          sheet.setFrozenColumns(4);
          
          sheet.setColumnWidth(1, 45);       // No
          sheet.setColumnWidth(2, 190);      // Nama Pasien
          sheet.setColumnWidth(3, 95);       // No. RM
          sheet.setColumnWidth(4, 140);      // Frekuensi HD
          sheet.setColumnWidth(5, 85);       // Shift
          sheet.setColumnWidth(6, 175);      // Alokasi Klinis / Dosis
          
          if (dateColCount > 0) {
            sheet.setColumnWidths(7, dateColCount, 32);
          }
          for (var c = numCols - 5; c <= numCols; c++) {
            sheet.setColumnWidth(c, 80);
          }
        } else {
          // Bersihkan sisa baris lama jika jumlah baris saat ini lebih sedikit
          if (sheet.getLastRow() > numRows) {
            sheet.getRange(numRows + 1, 1, sheet.getLastRow() - numRows, sheet.getLastColumn()).clearContent();
          }
          // Jika sebelumnya ada kolom Hb lebih banyak, bersihkan kolom berlebih
          if (sheet.getLastColumn() > numCols) {
            sheet.getRange(1, numCols + 1, sheet.getLastRow(), sheet.getLastColumn() - numCols).clearContent();
          }
        }
        
        // Tulis data teks sekaligus (1 kali batch call)
        var range = sheet.getRange(1, 1, numRows, numCols);
        range.setValues(rows);
        
        // Format Header & Baris Shift secara Batch
        var bgColors = [];
        var fontWeights = [];
        for (var r = 0; r < numRows; r++) {
          var rowBg = [];
          var rowFw = [];
          var valB = rows[r][1] ? rows[r][1].toString() : "";
          
          if (r === 0) {
            for (var c = 0; c < numCols; c++) {
              rowBg.push("#1c4587");
              rowFw.push("bold");
            }
          } else if (valB.indexOf("SHIFT PAGI") !== -1 || valB.indexOf("Total Shift Pagi") !== -1) {
            for (var c = 0; c < numCols; c++) {
              rowBg.push("#cfe2f3");
              rowFw.push("bold");
            }
          } else if (valB.indexOf("SHIFT SIANG") !== -1 || valB.indexOf("Total Shift Siang") !== -1) {
            for (var c = 0; c < numCols; c++) {
              rowBg.push("#fff2cc");
              rowFw.push("bold");
            }
          } else if (valB.indexOf("Total Kebutuhan") !== -1 || valB.indexOf("Kebutuhan Harian") !== -1 || valB.indexOf("Epo Keluar") !== -1) {
            for (var c = 0; c < numCols; c++) {
              rowBg.push("#d9ead3");
              rowFw.push("bold");
            }
          } else {
            var statusVal = (rows[r][numCols - 2] || "").toString();
            var isMeninggal = statusVal.indexOf("Meninggal") !== -1;
            var isPindah = statusVal.indexOf("Pindah") !== -1;
            var isBerhenti = statusVal.indexOf("Berhenti") !== -1;
            var isRawatInap = statusVal.indexOf("Rawat Inap") !== -1;
            var patientRowColor = isMeninggal ? "#f1f5f9" : (isPindah || isBerhenti ? "#fffbeb" : (isRawatInap ? "#faf5ff" : "#ffffff"));

            for (var c = 0; c < numCols; c++) {
              rowBg.push(patientRowColor);
              rowFw.push("normal");
            }
          }
          bgColors.push(rowBg);
          fontWeights.push(rowFw);
        }
        range.setBackgrounds(bgColors);
        range.setFontWeights(fontWeights);
      }
    }

    // 2. SINKRONISASI TAB MASTER TAHUNAN (REKAP_HB_TAHUNAN)
    if (body.yearlyData && body.yearlyData.length > 1) {
      var yearlySheet = ss.getSheetByName("REKAP_HB_TAHUNAN");
      var isNewYearlySheet = false;
      if (!yearlySheet) {
        yearlySheet = ss.insertSheet("REKAP_HB_TAHUNAN", 0);
        isNewYearlySheet = true;
      }

      var incomingRows = body.yearlyData;
      var finalYearlyRows = [];

      if (isNewYearlySheet || yearlySheet.getLastRow() <= 1) {
        finalYearlyRows = incomingRows;
      } else {
        var existingData = yearlySheet.getDataRange().getDisplayValues();
        finalYearlyRows.push(incomingRows[0]); // Header

        var existingMap = {};
        for (var ex = 1; ex < existingData.length; ex++) {
          var rmKey = (existingData[ex][2] || "").toString().trim().toLowerCase();
          if (rmKey) existingMap[rmKey] = existingData[ex];
        }

        var targetMonthColIdx = (monthNum >= 1 && monthNum <= 12) ? (9 + monthNum) : -1;
        var prevMonthColIdx = (monthNum >= 2 && monthNum <= 12) ? (9 + monthNum - 1) : -1;

        for (var inc = 1; inc < incomingRows.length; inc++) {
          var inRow = incomingRows[inc];
          var incRm = (inRow[2] || "").toString().trim().toLowerCase();
          var exRow = existingMap[incRm];

          if (exRow) {
            var merged = exRow.slice();
            while (merged.length < inRow.length) merged.push("");

            merged[0] = inRow[0]; // No
            merged[1] = inRow[1]; // Nama
            merged[3] = inRow[3]; // Jadwal
            merged[4] = inRow[4]; // Shift
            merged[5] = inRow[5]; // Frekuensi

            if (prevMonthColIdx !== -1 && exRow[prevMonthColIdx]) {
              merged[6] = exRow[prevMonthColIdx];
            } else if (inRow[6] && inRow[6] !== "-") {
              merged[6] = inRow[6];
            }

            merged[7] = inRow[7];
            merged[8] = inRow[8];
            merged[9] = inRow[9];

            if (targetMonthColIdx !== -1 && inRow[7] && inRow[7] !== "-") {
              merged[targetMonthColIdx] = inRow[7];
            }

            if (inRow[22]) merged[22] = inRow[22];
            if (inRow[23]) merged[23] = inRow[23];

            finalYearlyRows.push(merged);
            delete existingMap[incRm];
          } else {
            finalYearlyRows.push(inRow);
          }
        }

        for (var remKey in existingMap) {
          finalYearlyRows.push(existingMap[remKey]);
        }
      }

      var yRows = finalYearlyRows.length;
      var yCols = finalYearlyRows[0].length;
      
      if (isNewYearlySheet || yearlySheet.getLastRow() === 0) {
        yearlySheet.clearContents();
        yearlySheet.clearFormats();
        yearlySheet.getRange(1, 1, yRows, yCols).setNumberFormat("@");
        yearlySheet.setFrozenRows(1);
        yearlySheet.setFrozenColumns(3);

        yearlySheet.setColumnWidth(1, 40);   // No
        yearlySheet.setColumnWidth(2, 190);  // Nama Pasien
        yearlySheet.setColumnWidth(3, 95);   // No. RM
        yearlySheet.setColumnWidth(4, 110);  // Jadwal HD
        yearlySheet.setColumnWidth(5, 85);   // Shift
        yearlySheet.setColumnWidth(6, 120);  // Frekuensi HD
        yearlySheet.setColumnWidth(7, 95);   // Hb Acuan Bln Lalu
        yearlySheet.setColumnWidth(8, 95);   // Hb Bln Ini
        yearlySheet.setColumnWidth(9, 180);  // Rencana Cek Hb
        yearlySheet.setColumnWidth(10, 165); // Alokasi Terapi

        yearlySheet.setColumnWidths(11, 12, 55); // 12 Kolom Bulan (Jan-Des)
        yearlySheet.setColumnWidth(23, 130); // DPJP
        yearlySheet.setColumnWidth(24, 220); // Catatan
      } else {
        if (yearlySheet.getLastRow() > yRows) {
          yearlySheet.getRange(yRows + 1, 1, yearlySheet.getLastRow() - yRows, yearlySheet.getLastColumn()).clearContent();
        }
      }

      var yRange = yearlySheet.getRange(1, 1, yRows, yCols);
      yRange.setValues(finalYearlyRows);

      // Highlight Warna Otomatis secara Batch
      var yBgs = [];
      var yFws = [];
      var yColors = [];
      for (var yr = 0; yr < yRows; yr++) {
        var rB = [];
        var rF = [];
        var rC = [];
        if (yr === 0) {
          for (var yc = 0; yc < yCols; yc++) {
            rB.push("#1c4587");
            rF.push("bold");
            rC.push("#ffffff");
          }
        } else {
          var rowData = finalYearlyRows[yr];
          var rencanaStr = (rowData[8] || "").toString();
          var notesStr = (rowData[23] || "").toString();
          var isRowMeninggal = rencanaStr.indexOf("Meninggal") !== -1 || notesStr.indexOf("Meninggal") !== -1;

          for (var yc = 0; yc < yCols; yc++) {
            var cellVal = rowData[yc];
            var numVal = parseFloat(String(cellVal).replace(",", "."));

            if (isRowMeninggal) {
              rB.push("#f1f5f9");
              rF.push(yc === 8 || yc === 9 ? "bold" : "normal");
              rC.push("#475569");
            } else if (yc === 8 && rencanaStr.indexOf("Cek Hb Pilihan") !== -1) {
              rB.push("#fce8e6");
              rF.push("bold");
              rC.push("#c5221f");
            } else if ((yc === 6 || yc === 7 || (yc >= 10 && yc <= 21)) && !isNaN(numVal) && numVal > 0) {
              if (numVal <= 8.9) {
                rB.push("#fce8e6");
                rF.push("bold");
                rC.push("#c5221f");
              } else if (numVal >= 9.0 && numVal <= 12.0) {
                rB.push("#e6f4ea");
                rF.push("bold");
                rC.push("#137333");
              } else if (numVal > 12.0) {
                rB.push("#fef7e0");
                rF.push("bold");
                rC.push("#b06000");
              } else {
                rB.push("#ffffff");
                rF.push("normal");
                rC.push("#000000");
              }
            } else {
              rB.push(yr % 2 === 0 ? "#f8fafc" : "#ffffff");
              rF.push("normal");
              rC.push("#000000");
            }
          }
        }
        yBgs.push(rB);
        yFws.push(rF);
        yColors.push(rC);
      }
      yRange.setBackgrounds(yBgs);
      yRange.setFontWeights(yFws);
      yRange.setFontColors(yColors);
    }

    // 3. SINKRONISASI TAB MATRIK CEK HB (Matriks 6 Hari Sesi HD Pertama Awal Bulan)
    if (body.labMatrixData && body.labMatrixData.length > 1) {
      var matSheet = ss.getSheetByName("MATRIK CEK HB") || ss.getSheetByName("MATRIKS CEK HB") || ss.getSheetByName("MATRIKS_CEK_HB") || ss.getSheetByName("Matrik_Cek_HB");
      var isNewMatSheet = false;
      if (!matSheet) {
        matSheet = ss.insertSheet("MATRIK CEK HB");
        isNewMatSheet = true;
      }
      var mRows = body.labMatrixData;
      var numMRows = mRows.length;
      var numMCols = mRows[0].length;

      // Sanitasi nilai formula
      for (var mr = 0; mr < numMRows; mr++) {
        for (var mc = 0; mc < numMCols; mc++) {
          var mVal = mRows[mr][mc];
          if (typeof mVal === 'string' && (mVal.charAt(0) === '=' || mVal.charAt(0) === '+')) {
            mRows[mr][mc] = "'" + mVal;
          }
        }
      }

      if (isNewMatSheet || matSheet.getLastRow() === 0) {
        matSheet.clearContents();
        matSheet.clearFormats();
        matSheet.setFrozenRows(1);
        matSheet.setColumnWidths(1, numMCols, 240);
      } else {
        if (matSheet.getLastRow() > numMRows) {
          matSheet.getRange(numMRows + 1, 1, matSheet.getLastRow() - numMRows, matSheet.getLastColumn()).clearContent();
        }
      }

      var mRange = matSheet.getRange(1, 1, numMRows, numMCols);
      mRange.setNumberFormat("@");
      mRange.setValues(mRows);

      // Format Matrix secara Batch 2D Array (Jauh Lebih Cepat!)
      var mBgs = [];
      var mFws = [];
      var mFcs = [];
      for (var rIdx = 0; rIdx < numMRows; rIdx++) {
        var rowText = String(mRows[rIdx][0] || '');
        var rBg = [];
        var rFw = [];
        var rFc = [];
        if (rIdx === 0) {
          for (var cIdx = 0; cIdx < numMCols; cIdx++) {
            rBg.push("#1c4587");
            rFw.push("bold");
            rFc.push("#ffffff");
          }
        } else if (rowText.indexOf("SHIFT 1") !== -1) {
          for (var cIdx = 0; cIdx < numMCols; cIdx++) {
            rBg.push("#e8f0fe");
            rFw.push("bold");
            rFc.push("#1967d2");
          }
        } else if (rowText.indexOf("SHIFT 2") !== -1) {
          for (var cIdx = 0; cIdx < numMCols; cIdx++) {
            rBg.push("#fef3c7");
            rFw.push("bold");
            rFc.push("#b45309");
          }
        } else {
          for (var cIdx = 0; cIdx < numMCols; cIdx++) {
            rBg.push("#ffffff");
            rFw.push("normal");
            rFc.push("#000000");
          }
        }
        mBgs.push(rBg);
        mFws.push(rFw);
        mFcs.push(rFc);
      }
      mRange.setBackgrounds(mBgs);
      mRange.setFontWeights(mFws);
      mRange.setFontColors(mFcs);
    }

    // 4. SINKRONISASI TAB PASIEN MENINGGAL (Rekap Pasien Wafat & Riwayat Medis)
    if (body.deceasedData && body.deceasedData.length > 0) {
      var decSheet = ss.getSheetByName("PASIEN MENINGGAL") || ss.getSheetByName("PASIEN_MENINGGAL") || ss.getSheetByName("DATA PASIEN MENINGGAL");
      var isNewDecSheet = false;
      if (!decSheet) {
        decSheet = ss.insertSheet("PASIEN MENINGGAL");
        isNewDecSheet = true;
      }
      var dRows = body.deceasedData;
      var numDRows = dRows.length;
      var numDCols = dRows[0].length;

      if (isNewDecSheet || decSheet.getLastRow() === 0) {
        decSheet.clearContents();
        decSheet.clearFormats();
        decSheet.getRange(1, 1, numDRows, numDCols).setNumberFormat("@");
        decSheet.setFrozenRows(1);
        decSheet.setFrozenColumns(3);

        decSheet.setColumnWidth(1, 40);   // No
        decSheet.setColumnWidth(2, 200);  // Nama Pasien
        decSheet.setColumnWidth(3, 95);   // No. RM
        decSheet.setColumnWidth(4, 110);  // Status
        decSheet.setColumnWidth(5, 120);  // Tanggal Wafat
        decSheet.setColumnWidth(6, 200);  // Tempat / Keterangan Wafat
        decSheet.setColumnWidth(7, 110);  // Jadwal Terakhir
        decSheet.setColumnWidth(8, 85);   // Shift Terakhir
        decSheet.setColumnWidth(9, 110);  // Frekuensi
        decSheet.setColumnWidth(10, 95);  // Hb Terakhir
        decSheet.setColumnWidth(11, 130); // DPJP
        decSheet.setColumnWidth(12, 220); // Catatan Medis
        decSheet.setColumnWidth(13, 110); // Waktu Pencatatan
      } else {
        if (decSheet.getLastRow() > numDRows) {
          decSheet.getRange(numDRows + 1, 1, decSheet.getLastRow() - numDRows, decSheet.getLastColumn()).clearContent();
        }
      }

      var dRange = decSheet.getRange(1, 1, numDRows, numDCols);
      dRange.setValues(dRows);

      var dBgs = [];
      var dFws = [];
      var dFcs = [];
      for (var dr = 0; dr < numDRows; dr++) {
        var rB = [];
        var rF = [];
        var rC = [];
        if (dr === 0) {
          for (var dc = 0; dc < numDCols; dc++) {
            rB.push("#334155"); // Slate-700
            rF.push("bold");
            rC.push("#ffffff");
          }
        } else {
          for (var dc = 0; dc < numDCols; dc++) {
            rB.push(dr % 2 === 0 ? "#f8fafc" : "#ffffff");
            rF.push(dc === 3 ? "bold" : "normal");
            rC.push(dc === 3 ? "#0f172a" : "#334155");
          }
        }
        dBgs.push(rB);
        dFws.push(rF);
        dFcs.push(rC);
      }
      dRange.setBackgrounds(dBgs);
      dRange.setFontWeights(dFws);
      dRange.setFontColors(dFcs);
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      message: "Sukses mensinkronisasikan jadwal & rekap data super cepat!" 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

/**
 * Sinkronisasi via Google Apps Script:
 * 1. Membaca 3 tab jadwal ('Senin-Kamis', 'Selasa-Jumat', 'Rabu-Sabtu')
 * 2. Membaca tab master 'REKAP_HB_TAHUNAN' untuk mengekstrak Hb acuan bulan sebelumnya (prevHbValue)
 * 3. Membaca lembar 'JADWAL_CEK_HB' untuk mengekstrak tanggal & status sampling laboratorium
 * 4. Otomatis menjadwalkan 'Cek Hb Pilihan (<9.0)' jika Hb bulan lalu < 9.0 g/dL
 * 5. Mendekode nilai desimal Hb secara cerdas (mencegah bug konversi tanggal ISO)
 * 6. Merekonstruksi status harian (dailyRecords) dan mingguan (weeks)
 */
/**
 * Membersihkan dan memvalidasi Web App URL Google Apps Script:
 * Otomatis mengganti /edit atau /dev menjadi /exec jika pengguna menyalin dari editor skrip
 */
export function sanitizeAppsScriptUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim().replace(/[\r\n\t\s]+/g, '');
  if (url.includes('/edit')) {
    url = url.replace(/\/edit(\?.*)?$/, '/exec');
  } else if (url.includes('/dev')) {
    url = url.replace(/\/dev(\?.*)?$/, '/exec');
  }
  return url;
}

// In-memory cache untuk percepatan Tarik Data (Pull) berturut-turut
let lastPulledCache: { url: string; month: string; timestamp: number; data: PatientRecord[] } | null = null;

/**
 * Fungsi pembantu untuk mem-parsing teks CSV menjadi array 2D
 */
export function parseCsvText(str: string): string[][] {
  const arr: string[][] = [];
  let row: string[] = [''];
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      arr.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') arr.push(row);
  return arr;
}

/**
 * Mengambil data lembar kerja langsung via endpoint gviz CSV publik Google Sheets
 */
export async function fetchSheetCsvFromGviz(spreadsheetId: string, sheetName: string): Promise<string[][]> {
  const cleanId = (spreadsheetId || OFFICIAL_SPREADSHEET_ID).trim();
  const url = `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const text = await res.text();
    return parseCsvText(text);
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function pullViaAppsScript(
  webAppUrl: string, 
  currentMonth: string, 
  forceRefresh: boolean = false,
  spreadsheetId?: string
): Promise<PatientRecord[]> {
  const cleanUrl = sanitizeAppsScriptUrl(webAppUrl) || DEFAULT_APPS_SCRIPT_URL;
  const effectiveSheetId = (spreadsheetId || OFFICIAL_SPREADSHEET_ID).trim();

  // Gunakan cache jika baru ditarik kurang dari 8 detik lalu dan tidak dipaksa refresh
  const now = Date.now();
  if (!forceRefresh && lastPulledCache && lastPulledCache.url === cleanUrl && lastPulledCache.month === currentMonth && (now - lastPulledCache.timestamp) < 8000) {
    return lastPulledCache.data;
  }

  let yearlyRows: string[][] = [];
  let tabData: Record<string, string[][]> = {};
  let deceasedRows: string[][] = [];

  const scheduleNames = ['Senin-Kamis', 'Selasa-Jumat', 'Rabu-Sabtu'];

  // 1. Hubungi Apps Script Web App secara paralel untuk mengambil seluruh 4 lembar kerja resmi
  if (cleanUrl) {
    const separator = cleanUrl.includes('?') ? '&' : '?';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      // Ambil tab rekap tahunan, 3 tab jadwal harian, dan tab pasien meninggal secara paralel
      const fetchPromises: Promise<any>[] = [
        fetch(`${cleanUrl}${separator}sheet=REKAP_HB_TAHUNAN&_t=${now}`, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        ...scheduleNames.map((sName) =>
          fetch(`${cleanUrl}${separator}sheet=${encodeURIComponent(sName)}&_t=${now}`, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
          }).then(r => (r.ok ? r.json() : null)).catch(() => null)
        ),
        fetch(`${cleanUrl}${separator}sheet=${encodeURIComponent('PASIEN MENINGGAL')}&_t=${now}`, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ];

      const [yearlyResp, ...restResponses] = await Promise.all(fetchPromises);
      const schedResponses = restResponses.slice(0, scheduleNames.length);
      const deceasedResp = restResponses[scheduleNames.length];

      if (deceasedResp) {
        if (Array.isArray(deceasedResp.data) && deceasedResp.data.length > 1) {
          deceasedRows = deceasedResp.data;
        } else if (Array.isArray(deceasedResp) && deceasedResp.length > 1) {
          deceasedRows = deceasedResp;
        }
      }

      // Tangani respon REKAP_HB_TAHUNAN
      if (yearlyResp) {
        if (Array.isArray(yearlyResp.data)) {
          yearlyRows = yearlyResp.data;
        } else if (Array.isArray(yearlyResp)) {
          yearlyRows = yearlyResp;
        } else if (yearlyResp.data && typeof yearlyResp.data === 'object') {
          // Tangani jika Apps Script mengembalikan seluruh tab dalam satu objek
          const allTabs = yearlyResp.data;
          for (const k of Object.keys(allTabs)) {
            const norm = k.toLowerCase().replace(/[\s_-]+/g, '');
            if (norm.includes('rekaphb') && Array.isArray(allTabs[k])) {
              yearlyRows = allTabs[k];
              break;
            }
          }
          if (deceasedRows.length <= 1) {
            for (const k of Object.keys(allTabs)) {
              const norm = k.toLowerCase().replace(/[\s_-]+/g, '');
              if ((norm.includes('pasienmeninggal') || norm.includes('meninggal')) && Array.isArray(allTabs[k])) {
                deceasedRows = allTabs[k];
                break;
              }
            }
          }
          scheduleNames.forEach((sName) => {
            const normTarget = sName.toLowerCase().replace(/[\s_-]+/g, '');
            for (const k of Object.keys(allTabs)) {
              if (k.toLowerCase().replace(/[\s_-]+/g, '') === normTarget && Array.isArray(allTabs[k])) {
                tabData[sName] = allTabs[k];
                break;
              }
            }
          });
        }
      }

      // Isi 3 tab jadwal dari respon per-sheet masing-masing
      scheduleNames.forEach((sName, idx) => {
        const resp = schedResponses[idx];
        if (resp && Array.isArray(resp.data) && resp.data.length > 1) {
          tabData[sName] = resp.data;
        } else if (resp && Array.isArray(resp) && resp.length > 1) {
          tabData[sName] = resp;
        }
      });

      // Fallback: jika yearlyRows masih kosong, panggil URL dasar tanpa parameter ?sheet
      if (yearlyRows.length <= 1) {
        const baseResp = await fetch(`${cleanUrl}${separator}_t=${now}`, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        }).then(r => (r.ok ? r.json() : null)).catch(() => null);

        if (baseResp) {
          if (Array.isArray(baseResp.data)) {
            yearlyRows = baseResp.data;
          } else if (Array.isArray(baseResp)) {
            yearlyRows = baseResp;
          } else if (baseResp.data && typeof baseResp.data === 'object') {
            for (const k of Object.keys(baseResp.data)) {
              const norm = k.toLowerCase().replace(/[\s_-]+/g, '');
              if (norm.includes('rekaphb')) {
                yearlyRows = baseResp.data[k] || [];
                break;
              }
            }
          }
        }
      }
    } catch (netErr: any) {
      console.warn('Gagal menghubungi Apps Script, beralih ke penarikan alternatif Google Sheets:', netErr);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 2. Jika ada tab jadwal yang belum terisi, coba ambil via gviz CSV publik (jika didukung)
  const missingScheduleTabs = scheduleNames.filter((s) => {
    const norm = s.toLowerCase().replace(/[\s_-]+/g, '');
    for (const k of Object.keys(tabData)) {
      if (k.toLowerCase().replace(/[\s_-]+/g, '') === norm && tabData[k]?.length > 1) {
        return false;
      }
    }
    return true;
  });

  if (missingScheduleTabs.length > 0 && effectiveSheetId) {
    try {
      await Promise.all(
        missingScheduleTabs.map(async (sName) => {
          const rows = await fetchSheetCsvFromGviz(effectiveSheetId, sName);
          if (rows.length > 1) {
            tabData[sName] = rows;
          }
        })
      );
    } catch (gvizErr) {
      console.warn('Gagal mengambil tab jadwal via gviz CSV:', gvizErr);
    }
  }

  // 3. Jika Apps Script gagal dan yearlyRows masih kosong, ambil REKAP_HB_TAHUNAN via gviz CSV
  if (yearlyRows.length === 0 && effectiveSheetId) {
    try {
      const gvizYearly = await fetchSheetCsvFromGviz(effectiveSheetId, 'REKAP_HB_TAHUNAN');
      if (gvizYearly.length > 1) {
        yearlyRows = gvizYearly;
      } else {
        const altYearly = await fetchSheetCsvFromGviz(effectiveSheetId, 'REKAP HB TAHUNAN');
        if (altYearly.length > 1) yearlyRows = altYearly;
      }
    } catch (e) {
      console.warn('Gagal mengambil REKAP_HB_TAHUNAN via gviz:', e);
    }
  }

  // 4. Jika Apps Script gagal dan deceasedRows masih kosong, ambil PASIEN MENINGGAL via gviz CSV
  if (deceasedRows.length <= 1 && effectiveSheetId) {
    try {
      const gvizDec = await fetchSheetCsvFromGviz(effectiveSheetId, 'PASIEN MENINGGAL');
      if (gvizDec.length > 1) {
        deceasedRows = gvizDec;
      } else {
        const altDec = await fetchSheetCsvFromGviz(effectiveSheetId, 'PASIEN_MENINGGAL');
        if (altDec.length > 1) deceasedRows = altDec;
      }
    } catch (e) {
      // ignore
    }
  }

  // Jika tetap kosong sama sekali
  if (yearlyRows.length === 0 && Object.keys(tabData).length === 0) {
    throw new Error(
      'Gagal menarik data dari Google Sheets. ' +
      'Pastikan dokumen Google Spreadsheet dapat diakses publik ("Siapa saja yang memiliki link") ' +
      'atau Web App Google Apps Script telah disetel ke "Who has access: Anyone".'
    );
  }

  const { daysInMonth } = getMonthDaysInfo(currentMonth);
  const yearlyInfoMap = extractYearlyPatientInfoMap(yearlyRows, currentMonth);

  const patientMap = new Map<string, PatientRecord>();

  // 4. Proses 3 sheet jadwal ('Senin-Kamis', 'Selasa-Jumat', 'Rabu-Sabtu')
  SCHEDULE_SHEETS.forEach(({ title, tabName }) => {
    let rows: string[][] = tabData[tabName] || tabData[title] || [];
    if (rows.length === 0) {
      const normTarget = tabName.toLowerCase().replace(/[\s_-]+/g, '');
      for (const k of Object.keys(tabData)) {
        if (k.toLowerCase().replace(/[\s_-]+/g, '') === normTarget) {
          rows = tabData[k] || [];
          break;
        }
      }
    }
    if (rows.length <= 1) return;

    const dataRows = rows.slice(1);
    dataRows.forEach((row, i) => {
      const name = (row[1] || '').trim();
      const noRm = (row[2] || '').trim();
      if (!name || isSummaryOrHeaderRow(name, noRm, row.join(' '))) return;

      const col3 = (row[3] || '').trim();
      const col3Lower = col3.toLowerCase();
      let hdFrequency: HDFrequency = '2 kali dalam satu minggu';
      let singleDay: SingleHDDay | undefined = undefined;
      let scheduleDay: HDDaySchedule = title;
      let scheduleShift: HDShift = 'Shift 1 (Pagi)';
      let rawHb = 0;
      let doseTextHint = (row[5] || '').trim();

      if (col3Lower.includes('pagi') || col3Lower.includes('siang')) {
        scheduleShift = col3Lower.includes('siang') ? 'Shift 2 (Siang)' : 'Shift 1 (Pagi)';
        doseTextHint = (row[5] || '').trim();
        rawHb = decodeHbFromValue(row[4], doseTextHint);
      } else {
        if (col3Lower.includes('1/2') || col3Lower.includes('1x/2') || col3Lower.includes('1 x / 2') || col3Lower.includes('2 minggu')) {
          hdFrequency = '1 kali / 2 minggu';
        } else if ((col3Lower.includes('1x') || col3Lower.includes('1 x') || col3Lower.includes('1 kali')) && !col3Lower.includes('1/2') && !col3Lower.includes('1x/2')) {
          hdFrequency = '1 kali dalam satu minggu';
        } else {
          hdFrequency = '2 kali dalam satu minggu';
        }

        if (col3Lower.includes('senin')) singleDay = 'Senin';
        else if (col3Lower.includes('selasa')) singleDay = 'Selasa';
        else if (col3Lower.includes('rabu')) singleDay = 'Rabu';
        else if (col3Lower.includes('kamis')) singleDay = 'Kamis';
        else if (col3Lower.includes('jumat')) singleDay = 'Jumat';
        else if (col3Lower.includes('sabtu')) singleDay = 'Sabtu';

        if ((hdFrequency === '1 kali dalam satu minggu' || hdFrequency === '1 kali / 2 minggu') && singleDay) {
          scheduleDay = getScheduleDayFromSingleDay(singleDay);
        }

        const shiftStr = (row[4] || '').toLowerCase();
        scheduleShift = shiftStr.includes('siang') ? 'Shift 2 (Siang)' : 'Shift 1 (Pagi)';
        const col5Str = (row[5] || '').toString().toLowerCase();
        const isCol5Dose = col5Str.includes('epo') || col5Str.includes('protokol') || col5Str.includes('maintenance') || col5Str.includes('transfusi') || col5Str.includes('evaluasi') || col5Str.includes('rawat');
        if (isCol5Dose) {
          rawHb = 0;
        } else {
          rawHb = decodeHbFromValue(row[5], doseTextHint);
        }
      }

      const rmLookupKey = noRm.toLowerCase().trim();
      const normRmKey = rmLookupKey.replace(/[^a-z0-9]/g, '');
      const normNameKey = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const yearlyInfo = yearlyInfoMap.get(rmLookupKey) || yearlyInfoMap.get(normRmKey) || yearlyInfoMap.get(normNameKey);

      let hbValue = 0;
      if (yearlyRows.length > 1) {
        hbValue = yearlyInfo?.currentHb && yearlyInfo.currentHb > 0 ? yearlyInfo.currentHb : 0;
      } else if (rawHb > 0) {
        hbValue = rawHb;
      }

      const reco = calculateClinicalRecommendation(hbValue, hdFrequency);
      const { dailyRecords, weeks } = parseDailyRecordsFromRow(
        row,
        daysInMonth,
        reco.category,
        scheduleDay,
        currentMonth,
        hdFrequency,
        singleDay
      );

      // Status pasien
      const statusColIndex = row.length - 2;
      const overallStatusRaw = (row[statusColIndex] || '').trim();
      let overallStatus: PatientRecord['overallStatus'] = 'Berjalan';
      let patientStatus: PatientRecord['patientStatus'] = 'Aktif';

      if (overallStatusRaw.includes('Meninggal')) {
        patientStatus = 'Meninggal Dunia';
        overallStatus = 'Selesai';
      } else if (overallStatusRaw.includes('Pindah')) {
        patientStatus = 'Pindah RS';
        overallStatus = 'Selesai';
      } else if (overallStatusRaw.includes('Rawat Inap')) {
        patientStatus = 'Rawat Inap';
        overallStatus = 'Perlu Perhatian';
      } else if (overallStatusRaw.includes('Berhenti')) {
        patientStatus = 'Berhenti HD';
        overallStatus = 'Selesai';
      } else if (overallStatusRaw.includes('Selesai')) {
        overallStatus = 'Selesai';
      } else if (overallStatusRaw.includes('Perhatian') || reco.category === 'TRANSFUSI_2_RAWAT_INAP') {
        overallStatus = 'Perlu Perhatian';
      }

      const cleanNoRm = noRm ? noRm.replace(/[^a-zA-Z0-9_-]/g, '') : `RM${1000 + i}`;
      const stablePatientId = `pat-${cleanNoRm.toLowerCase()}`;
      const prevHbValue = yearlyInfo?.prevHb;
      const isSelective = (typeof prevHbValue === 'number' && prevHbValue > 0 && Number(prevHbValue.toFixed(1)) <= 8.9) ||
        (hbValue > 0 && Number(hbValue.toFixed(1)) <= 8.9) ||
        ((!prevHbValue || prevHbValue === 0) && hbValue === 0);

      const firstHDDate = getFirstHDDateOfMonth(currentMonth, scheduleDay, singleDay, hdFrequency).dateString;

      patientMap.set(normRmKey || normNameKey, {
        id: stablePatientId,
        noRm: noRm || `RM-${1000 + i}`,
        name,
        patientStatus,
        hdFrequency,
        singleDay,
        scheduleDay,
        scheduleShift,
        hbValue,
        hbDate: `${currentMonth}-02`,
        prevHbValue,
        isSelectiveHb: isSelective,
        labSchedule: {
          scheduledDate: firstHDDate,
          testType: (isSelective ? 'Cek Hb Pilihan (Hb ≤ 8.9)' : 'Rutin Hb (Evaluasi EPO)'),
          status: hbValue > 0 ? 'Selesai' : 'Terjadwal',
          resultHb: hbValue > 0 ? hbValue : undefined,
          isSelectiveHb: isSelective,
          selectiveReason: isSelective ? `Nilai Hb acuan ${prevHbValue ? prevHbValue.toFixed(1) : '< 9.0'} g/dL (< 9.0 g/dL)` : undefined,
          notes: yearlyInfo?.notes,
        },
        monthPeriod: currentMonth,
        recommendation: reco,
        weeks,
        dailyRecords,
        overallStatus,
        clinicalNotes: yearlyInfo?.notes || row[row.length - 1] || '',
        doctorInCharge: yearlyInfo?.doctor || 'dr. Sp.PD-KGH',
        updatedAt: new Date().toISOString(),
      });
    });
  });

  // 5. Proses REKAP_HB_TAHUNAN untuk pasien yang belum ada di tab jadwal harian
  if (yearlyRows.length > 1) {
    yearlyRows.slice(1).forEach((yRow, i) => {
      const name = (yRow[1] || '').trim();
      const noRm = (yRow[2] || '').trim();
      if (!name || isSummaryOrHeaderRow(name, noRm)) return;

      const normRmKey = noRm.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const normNameKey = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const lookupKey = normRmKey || normNameKey;

      if (patientMap.has(lookupKey)) {
        const existing = patientMap.get(lookupKey)!;
        if (!existing.doctorInCharge || existing.doctorInCharge === 'dr. Sp.PD-KGH') {
          existing.doctorInCharge = yRow[22] || existing.doctorInCharge;
        }
        if (!existing.clinicalNotes) {
          existing.clinicalNotes = yRow[23] || existing.clinicalNotes;
        }
        return;
      }

      const scheduleRaw = (yRow[3] || '').trim();
      let scheduleDay: HDDaySchedule = 'Senin - Kamis';
      if (scheduleRaw.includes('Selasa') || scheduleRaw.includes('Jumat')) scheduleDay = 'Selasa - Jumat';
      else if (scheduleRaw.includes('Rabu') || scheduleRaw.includes('Sabtu')) scheduleDay = 'Rabu - Sabtu';

      const shiftRaw = (yRow[4] || '').toLowerCase();
      const scheduleShift: HDShift = shiftRaw.includes('siang') ? 'Shift 2 (Siang)' : 'Shift 1 (Pagi)';

      const freqRaw = (yRow[5] || '').toLowerCase();
      let hdFrequency: HDFrequency = '2 kali dalam satu minggu';
      let singleDay: SingleHDDay | undefined = undefined;
      if (freqRaw.includes('1/2') || freqRaw.includes('1x/2') || freqRaw.includes('1 x / 2') || freqRaw.includes('2 minggu')) {
        hdFrequency = '1 kali / 2 minggu';
      } else if ((freqRaw.includes('1x') || freqRaw.includes('1 x') || freqRaw.includes('1 kali')) && !freqRaw.includes('1/2') && !freqRaw.includes('1x/2')) {
        hdFrequency = '1 kali dalam satu minggu';
      }
      if (freqRaw.includes('senin')) singleDay = 'Senin';
      else if (freqRaw.includes('selasa')) singleDay = 'Selasa';
      else if (freqRaw.includes('rabu')) singleDay = 'Rabu';
      else if (freqRaw.includes('kamis')) singleDay = 'Kamis';
      else if (freqRaw.includes('jumat')) singleDay = 'Jumat';
      else if (freqRaw.includes('sabtu')) singleDay = 'Sabtu';

      if ((hdFrequency === '1 kali dalam satu minggu' || hdFrequency === '1 kali / 2 minggu') && singleDay) {
        scheduleDay = getScheduleDayFromSingleDay(singleDay);
      }

      const yInfo = yearlyInfoMap.get(normRmKey) || yearlyInfoMap.get(normNameKey);
      const curHb = yInfo?.currentHb || decodeHbFromValue(yRow[7]) || 0;
      const prevHb = yInfo?.prevHb || decodeHbFromValue(yRow[6]) || undefined;

      const reco = calculateClinicalRecommendation(curHb, hdFrequency);
      const weeks = generateDefaultWeeks(reco.category, currentMonth, hdFrequency, scheduleDay, singleDay);
      const cleanNoRm = noRm ? noRm.replace(/[^a-zA-Z0-9_-]/g, '') : `RM${1000 + i}`;
      const firstHDDate = getFirstHDDateOfMonth(currentMonth, scheduleDay, singleDay, hdFrequency).dateString;

      const statusNote = (yRow[23] || '').toLowerCase();
      let patientStatus: PatientRecord['patientStatus'] = 'Aktif';
      let overallStatus: PatientRecord['overallStatus'] = curHb === 0 ? 'Menunggu' : 'Berjalan';
      if (statusNote.includes('meninggal')) {
        patientStatus = 'Meninggal Dunia';
        overallStatus = 'Selesai';
      } else if (statusNote.includes('pindah')) {
        patientStatus = 'Pindah RS';
        overallStatus = 'Selesai';
      } else if (statusNote.includes('rawat inap')) {
        patientStatus = 'Rawat Inap';
        overallStatus = 'Perlu Perhatian';
      } else if (statusNote.includes('berhenti')) {
        patientStatus = 'Berhenti HD';
        overallStatus = 'Selesai';
      }

      const isSelective = (typeof prevHb === 'number' && prevHb > 0 && Number(prevHb.toFixed(1)) <= 8.9) ||
        (curHb > 0 && Number(curHb.toFixed(1)) <= 8.9) ||
        ((!prevHb || prevHb === 0) && curHb === 0);

      patientMap.set(lookupKey, {
        id: `pat-${cleanNoRm.toLowerCase()}`,
        noRm: noRm || `RM-${1000 + i}`,
        name,
        patientStatus,
        hdFrequency,
        singleDay,
        scheduleDay,
        scheduleShift,
        hbValue: curHb,
        hbDate: `${currentMonth}-02`,
        prevHbValue: prevHb,
        isSelectiveHb: isSelective,
        labSchedule: {
          scheduledDate: firstHDDate,
          testType: (isSelective ? 'Cek Hb Pilihan (Hb ≤ 8.9)' : 'Rutin Hb (Evaluasi EPO)'),
          status: curHb > 0 ? 'Selesai' : 'Terjadwal',
          resultHb: curHb > 0 ? curHb : undefined,
          isSelectiveHb: isSelective,
          selectiveReason: isSelective ? `Nilai Hb acuan ${prevHb ? prevHb.toFixed(1) : '< 9.0'} g/dL (< 9.0 g/dL)` : undefined,
          notes: yInfo?.notes || yRow[23] || '',
        },
        monthPeriod: currentMonth,
        recommendation: reco,
        weeks,
        dailyRecords: {},
        overallStatus,
        clinicalNotes: yInfo?.notes || yRow[23] || '',
        doctorInCharge: yInfo?.doctor || yRow[22] || 'dr. Sp.PD-KGH',
        updatedAt: new Date().toISOString(),
      });
    });
  }

  // 6. Proses Tab PASIEN MENINGGAL untuk memastikan status wafat tercatat sempurna
  if (deceasedRows.length > 1) {
    deceasedRows.slice(1).forEach((dRow, i) => {
      const name = (dRow[1] || '').trim();
      const noRm = (dRow[2] || '').trim();
      if (!name || isSummaryOrHeaderRow(name, noRm)) return;

      const normRmKey = noRm.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const normNameKey = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      const lookupKey = normRmKey || normNameKey;

      const statusDate = (dRow[4] || '').trim();
      const statusNotes = (dRow[5] || '').trim();
      const schedRaw = (dRow[6] || '').trim();
      const shiftRaw = (dRow[7] || '').trim();
      const freqRaw = (dRow[8] || '').trim();
      const hbRaw = decodeHbFromValue(dRow[9]) || 0;
      const dpjp = (dRow[10] || '').trim();
      const medNotes = (dRow[11] || '').trim();

      if (patientMap.has(lookupKey)) {
        const existing = patientMap.get(lookupKey)!;
        existing.patientStatus = 'Meninggal Dunia';
        existing.overallStatus = 'Selesai';
        if (statusDate && statusDate !== '-') existing.statusDate = statusDate;
        if (statusNotes && statusNotes !== '-') existing.statusNotes = statusNotes;
        if (dpjp && dpjp !== '-' && (!existing.doctorInCharge || existing.doctorInCharge === 'dr. Sp.PD-KGH')) {
          existing.doctorInCharge = dpjp;
        }
        if (medNotes && medNotes !== '-' && !existing.clinicalNotes) {
          existing.clinicalNotes = medNotes;
        }
        return;
      }

      let scheduleDay: HDDaySchedule = 'Senin - Kamis';
      if (schedRaw.includes('Selasa') || schedRaw.includes('Jumat')) scheduleDay = 'Selasa - Jumat';
      else if (schedRaw.includes('Rabu') || schedRaw.includes('Sabtu')) scheduleDay = 'Rabu - Sabtu';

      const scheduleShift: HDShift = shiftRaw.toLowerCase().includes('siang') ? 'Shift 2 (Siang)' : 'Shift 1 (Pagi)';

      let hdFrequency: HDFrequency = '2 kali dalam satu minggu';
      if (freqRaw.includes('1/2') || freqRaw.includes('2 mgg')) hdFrequency = '1 kali / 2 minggu';
      else if (freqRaw.includes('1')) hdFrequency = '1 kali dalam satu minggu';

      const cleanNoRm = noRm ? noRm.replace(/[^a-zA-Z0-9_-]/g, '') : `RM${2000 + i}`;

      patientMap.set(lookupKey, {
        id: `pat-${cleanNoRm.toLowerCase()}`,
        noRm: noRm || `RM-${2000 + i}`,
        name,
        patientStatus: 'Meninggal Dunia',
        statusDate: statusDate && statusDate !== '-' ? statusDate : undefined,
        statusNotes: statusNotes && statusNotes !== '-' ? statusNotes : undefined,
        hdFrequency,
        scheduleDay,
        scheduleShift,
        hbValue: hbRaw,
        hbDate: `${currentMonth}-02`,
        monthPeriod: currentMonth,
        recommendation: calculateClinicalRecommendation(0, hdFrequency),
        weeks: generateDefaultWeeks('MENUNGGU_HASIL_LAB', currentMonth, hdFrequency, scheduleDay),
        dailyRecords: {},
        overallStatus: 'Selesai',
        clinicalNotes: medNotes && medNotes !== '-' ? medNotes : '',
        doctorInCharge: dpjp && dpjp !== '-' ? dpjp : 'dr. Sp.PD-KGH',
        updatedAt: new Date().toISOString(),
      });
    });
  }

  const allPatients = Array.from(patientMap.values());

  if (allPatients.length > 0) {
    lastPulledCache = {
      url: cleanUrl,
      month: currentMonth,
      timestamp: Date.now(),
      data: allPatients,
    };
    if (yearlyRows.length > 1) {
      cacheAllYearlyMonthsData(yearlyRows, currentMonth.split('-')[0], allPatients);
    }
  }

  return allPatients;
}

export async function pushViaAppsScript(
  webAppUrl: string,
  patients: PatientRecord[],
  yearMonth: string = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  targetSchedule?: HDDaySchedule,
  scheduleScope?: 'PILIHAN' | 'SELURUH'
) {
  const cleanUrl = sanitizeAppsScriptUrl(webAppUrl);
  if (!cleanUrl) {
    throw new Error('Web App URL Google Apps Script belum diisi.');
  }

  let effectiveScope = scheduleScope;
  if (!effectiveScope) {
    try {
      const stored = localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH' || stored === 'PILIHAN') effectiveScope = stored;
    } catch (e) {}
  }

  const scheduleData: Record<string, string[][]> = {};

  const sheetsToPush = targetSchedule 
    ? SCHEDULE_SHEETS.filter((s) => s.title === targetSchedule)
    : SCHEDULE_SHEETS;

  sheetsToPush.forEach(({ title, tabName }) => {
    scheduleData[tabName] = buildScheduleMatrixTable(patients, title, yearMonth);
  });

  // Bangun tabel terintegrasi tahunan (12 bulan + acuan Hb sebelumnya)
  const yearlyData = buildYearlySummaryTable(patients, yearMonth);

  // Matriks kalender 6 hari sesi HD pertama (MATRIK CEK HB) - Tanpa lembar JADWAL CEK HB
  const labMatrixData = targetSchedule ? undefined : buildNextMonthCalendarMatrix(patients, yearMonth, effectiveScope);

  // Tabel Rekap Khusus Pasien Meninggal Dunia
  const deceasedData = buildDeceasedPatientsTable(patients);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      signal: controller.signal,
      body: JSON.stringify({
        action: 'push',
        yearMonth,
        targetSchedule: targetSchedule || 'ALL',
        scheduleScope: effectiveScope,
        scheduleData,
        yearlyData,
        labMatrixData,
        deceasedData,
      }),
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Pengiriman data ke Google Sheets timeout (melebihi 60 detik).');
    }
    throw new Error(
      `Gagal mengirim data ke Apps Script (${err.message || 'Network Error'}). Pastikan koneksi aktif dan Web App URL valid.`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  return { success: true };
}

/**
 * Ekspor Data ke Format CSV per Jadwal atau Seluruh Jadwal
 */
export function exportToCSV(patients: PatientRecord[], period: string, selectedSchedule?: HDDaySchedule) {
  const schedulesToExport: HDDaySchedule[] = selectedSchedule 
    ? [selectedSchedule] 
    : ['Senin - Kamis', 'Selasa - Jumat', 'Rabu - Sabtu'];

  schedulesToExport.forEach((sched) => {
    const tableData = buildScheduleMatrixTable(patients, sched, period);
    const csvContent = '\uFEFF' + tableData.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Jadwal_HD_${sched.replace(/\s+/g, '_')}_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

/**
 * Impor data dari File CSV
 */
export function importFromCSV(csvText: string, currentMonth: string): PatientRecord[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const splitCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const dataLines = lines.slice(1);
  const patients: PatientRecord[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const parts = splitCsvLine(dataLines[i]);
    const name = parts[1] || '';
    const noRm = parts[2] || '';
    if (!name || isSummaryOrHeaderRow(name, noRm, dataLines[i])) {
      continue;
    }

    const col3 = (parts[3] || '').trim();
    const col3Lower = col3.toLowerCase();
    let hdFrequency: HDFrequency = '2 kali dalam satu minggu';
    let singleDay: SingleHDDay | undefined = undefined;
    let scheduleDay: HDDaySchedule = 'Senin - Kamis';
    let scheduleShift: HDShift = 'Shift 1 (Pagi)';
    let rawHb = 0;

    if (col3Lower.includes('pagi') || col3Lower.includes('siang')) {
      // Format CSV lama tanpa kolom Frekuensi HD
      scheduleShift = col3Lower.includes('siang') ? 'Shift 2 (Siang)' : 'Shift 1 (Pagi)';
      rawHb = parseFloat(parts[4]?.replace(',', '.') || '0');
    } else {
      // Format CSV baru dengan kolom Frekuensi HD
      if (col3Lower.includes('2 minggu') || col3Lower.includes('1/2') || col3Lower.includes('2mgg') || col3Lower.includes('2 mgg')) {
        hdFrequency = '1 kali / 2 minggu';
      } else if (col3Lower.includes('1')) {
        hdFrequency = '1 kali dalam satu minggu';
      } else {
        hdFrequency = '2 kali dalam satu minggu';
      }
      if (col3Lower.includes('senin')) singleDay = 'Senin';
      else if (col3Lower.includes('selasa')) singleDay = 'Selasa';
      else if (col3Lower.includes('rabu')) singleDay = 'Rabu';
      else if (col3Lower.includes('kamis')) singleDay = 'Kamis';
      else if (col3Lower.includes('jumat')) singleDay = 'Jumat';
      else if (col3Lower.includes('sabtu')) singleDay = 'Sabtu';

      if ((hdFrequency === '1 kali dalam satu minggu' || hdFrequency === '1 kali / 2 minggu') && singleDay) {
        scheduleDay = getScheduleDayFromSingleDay(singleDay);
      }

      const shiftStr = (parts[4] || '').toLowerCase();
      scheduleShift = shiftStr.includes('siang') ? 'Shift 2 (Siang)' : 'Shift 1 (Pagi)';
      rawHb = parseFloat(parts[5]?.replace(',', '.') || '0');
    }

    const hbValue = isNaN(rawHb) || rawHb < 0 ? 0 : rawHb;
    const reco = calculateClinicalRecommendation(hbValue, hdFrequency);

    const cleanNoRm = noRm ? noRm.replace(/[^a-zA-Z0-9_-]/g, '') : `RM${1000 + i}`;
    const uniqueSuffix = `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;

    patients.push({
      id: `csv-${cleanNoRm}-${uniqueSuffix}`,
      noRm: noRm || `RM-${1000 + i}`,
      name,
      hdFrequency,
      singleDay,
      scheduleDay,
      scheduleShift,
      hbDate: `${currentMonth}-02`,
      hbValue,
      monthPeriod: currentMonth,
      recommendation: reco,
      weeks: generateDefaultWeeks(reco.category, currentMonth),
      overallStatus: reco.category === 'TRANSFUSI_2_RAWAT_INAP' ? 'Perlu Perhatian' : 'Berjalan',
      clinicalNotes: parts[parts.length - 1] || '',
      updatedAt: new Date().toISOString(),
    });
  }

  return patients;
}

/**
 * Update data range pada spreadsheet
 */
async function updateSheetValues(
  spreadsheetId: string,
  range: string,
  values: string[][],
  accessToken: string
) {
  // Lindungi karakter formula pada teks agar Google Sheets tidak menghasilkan #ERROR!
  const sanitized = values.map((r) =>
    r.map((c) => {
      if (typeof c === 'string' && (c.startsWith('=') || c.startsWith('+'))) {
        return `'${c}`;
      }
      return c;
    })
  );
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values: sanitized,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gagal menulis ke Google Sheet: ${errorText}`);
  }

  return await res.json();
}

/**
 * Menambahkan tab sheet baru jika belum ada
 */
async function addSheetTab(spreadsheetId: string, tabTitle: string, accessToken: string) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: tabTitle,
              gridProperties: {
                frozenRowCount: 1,
                frozenColumnCount: 5,
              },
            },
          },
        },
      ],
    }),
  });
}

/**
 * Menerapkan warna latar header biru tua #1c4587 dan UKURAN KOLOM MINIMALIS
 */
async function applyHeaderAndColumnStyling(spreadsheetId: string, accessToken: string) {
  const metadata = await getSpreadsheetDetails(spreadsheetId, accessToken);
  const sheets: any[] = metadata.sheets || [];

  const requests: any[] = [];

  sheets.forEach((s) => {
    const sheetId = s.properties.sheetId;

    // 1. Format Header Row 1 (Biru Tua #1c4587)
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.11, green: 0.27, blue: 0.53 }, // #1c4587
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });

    // 2. ATUR UKURAN KOLOM MENYESUAIKAN PANJANG KALIMAT/KATA PADA CELL (AUTO-FIT):
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 44,
        },
      },
    });
  });

  if (requests.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
  }
}

function getColLetter(colIdx: number): string {
  let letter = '';
  while (colIdx > 0) {
    const mod = (colIdx - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    colIdx = Math.floor((colIdx - mod) / 26);
  }
  return letter || 'A';
}
