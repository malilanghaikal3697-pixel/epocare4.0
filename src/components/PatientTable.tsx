import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Calendar, 
  Edit3, 
  Trash2, 
  Check, 
  Clock, 
  X, 
  AlertCircle, 
  Syringe, 
  Droplet, 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  Layers, 
  Info, 
  Sun, 
  Sunset, 
  Moon, 
  ClipboardPaste, 
  Plus, 
  Users, 
  ArrowUpFromLine, 
  ArrowDownToLine, 
  RefreshCw, 
  FlaskConical, 
  FileSpreadsheet, 
  CalendarDays,
  HeartPulse,
  ArrowRightLeft,
  CalendarClock
} from 'lucide-react';
import { PatientRecord, DoseStatus, HDDaySchedule, HDShift, PatientLifeStatus } from '../types/dialysis';
import { getHbProtocolStyle, getEffectivePatientRecommendation, getEffectivePatientHb, sortPatientsAlphabetically } from '../services/clinicalRules';
import { 
  getMonthDaysInfo, 
  isDateInHDDay, 
  isPrimaryHDDay, 
  isPatientHbCheckDay, 
  getHDSessionWeek, 
  getPairedHDDate, 
  getDateDoseDisplayInfo, 
  DateDoseInfo,
  getActiveHDDaySchedule,
  getTodayDayName
} from '../services/googleSheets';

interface PatientTableProps {
  patients: PatientRecord[];
  selectedMonth: string;
  onMonthChange?: (month: string) => void;
  onEditPatient: (patient: PatientRecord) => void;
  onDeletePatient: (patientId: string) => void;
  onUpdateWeekStatus: (
    patientId: string, 
    weekKey: 'week1' | 'week2' | 'week3' | 'week4', 
    newStatus: DoseStatus,
    nurseName?: string
  ) => void;
  onUpdateDateAction?: (
    patientId: string,
    dateNumber: number,
    newStatus: DoseStatus,
    nurseName?: string,
    notes?: string,
    customCellText?: string,
    doseIU?: number
  ) => void;
  onRescheduleDate?: (
    patientId: string,
    sourceDate: number,
    targetDate: number,
    notes?: string
  ) => void;
  onCancelReschedule?: (
    patientId: string,
    dateNumber: number
  ) => void;
  onUpdateMidMonthHb?: (
    patientId: string,
    newHb: number,
    testDate: string,
    notes?: string,
    dateNumber?: number
  ) => void;
  onOpenBulkImportModal?: () => void;
  onOpenAddPatientModal?: () => void;
  onOpenMonthlyHbModal?: () => void;
  onOpenLabScheduleModal?: (patientId?: string) => void;
  onOpenExportExcelModal?: (schedule?: HDDaySchedule | 'ALL') => void;
  onOpenEpoSchedulePrintModal?: () => void;
  onPushToSheet?: (targetSchedule?: HDDaySchedule) => Promise<void>;
  onPullFromSheet?: () => Promise<void>;
  isSyncing?: boolean;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
  isLocked?: boolean;
  onLockedNotice?: () => void;
  activeSheetTab?: HDDaySchedule | 'ALL';
  onSheetTabChange?: (tab: HDDaySchedule | 'ALL') => void;
}

/**
 * Tanda Visual Khusus Sel yang Memiliki Tindakan UPDATE HB
 */
const HbUpdateBadge: React.FC<{ info: DateDoseInfo; patientHb?: number }> = ({ info, patientHb }) => {
  if (!info.isHbUpdateDate) return null;
  const hbDisplay = info.updatedHbValue !== undefined ? info.updatedHbValue.toFixed(1) : (patientHb && patientHb > 0 ? patientHb.toFixed(1) : '');

  return (
    <span 
      className="absolute -top-1.5 -right-1 bg-rose-600 hover:bg-rose-700 text-white font-black text-[7.5px] px-1 py-0.2 rounded-full shadow-md border border-white dark:border-slate-900 flex items-center gap-0.5 z-20 animate-pulse tracking-tight select-none pointer-events-none"
      title={`UPDATE HB: ${hbDisplay ? `${hbDisplay} g/dL` : 'Tercatat'}`}
    >
      <span className="text-[7.5px] leading-none">🩸</span>
      <span className="leading-none">{hbDisplay ? hbDisplay : 'Hb'}</span>
    </span>
  );
};

export const PatientTable: React.FC<PatientTableProps> = ({
  patients,
  selectedMonth,
  onMonthChange,
  onEditPatient,
  onDeletePatient,
  onUpdateWeekStatus,
  onUpdateDateAction,
  onRescheduleDate,
  onCancelReschedule,
  onUpdateMidMonthHb,
  onOpenBulkImportModal,
  onOpenAddPatientModal,
  onOpenMonthlyHbModal,
  onOpenLabScheduleModal,
  onOpenExportExcelModal,
  onOpenEpoSchedulePrintModal,
  onPushToSheet,
  onPullFromSheet,
  isSyncing = false,
  autoSyncEnabled = true,
  onToggleAutoSync,
  isLocked = false,
  onLockedNotice,
  activeSheetTab: activeSheetTabProp,
  onSheetTabChange,
}) => {
  // Jadwal HD Aktif Hari Ini (Otomatis deteksi real-time)
  const todayActiveSchedule = getActiveHDDaySchedule();
  const todayDayName = getTodayDayName();

  // Aktif Sheet Tab: Menggunakan prop jika dikontrol, atau internal state default hari aktif
  const [internalActiveSheetTab, setInternalActiveSheetTab] = useState<HDDaySchedule | 'ALL'>(() => getActiveHDDaySchedule());
  const activeSheetTab = activeSheetTabProp !== undefined ? activeSheetTabProp : internalActiveSheetTab;
  const setActiveSheetTab = (tab: HDDaySchedule | 'ALL') => {
    setInternalActiveSheetTab(tab);
    onSheetTabChange?.(tab);
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Format Nama Bulan untuk Judul
  const [yearStr, monthStr] = (selectedMonth || '2026-09').split('-');
  const currentYear = parseInt(yearStr, 10) || new Date().getFullYear();
  const currentMonthNum = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const monthDate = new Date(currentYear, currentMonthNum - 1, 1);
  const monthLabel = monthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const currentMonthName = monthDate.toLocaleDateString('id-ID', { month: 'long' });

  // Popover Interaktif Pemilih Bulan & Tahun
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(currentYear);

  useEffect(() => {
    setPickerYear(currentYear);
  }, [currentYear]);

  const INDONESIA_MONTH_LIST = [
    { num: '01', name: 'Januari' },
    { num: '02', name: 'Februari' },
    { num: '03', name: 'Maret' },
    { num: '04', name: 'April' },
    { num: '05', name: 'Mei' },
    { num: '06', name: 'Juni' },
    { num: '07', name: 'Juli' },
    { num: '08', name: 'Agustus' },
    { num: '09', name: 'September' },
    { num: '10', name: 'Oktober' },
    { num: '11', name: 'November' },
    { num: '12', name: 'Desember' }
  ];

  // Nama bulan sebelumnya (contoh: "September" jika bulan aktif "Oktober")
  const prevMonthDate = new Date(currentYear, currentMonthNum - 2, 1);
  const prevMonthName = prevMonthDate.toLocaleDateString('id-ID', { month: 'long' });

  // Menu Popup Cepat saat Tombol Sel Diklik (Cukup klik tombol saja, tanpa halaman modal)
  const [quickMenuData, setQuickMenuData] = useState<{
    patient: PatientRecord;
    dateNumber: number;
    info: DateDoseInfo;
    x: number;
    y: number;
  } | null>(null);

  const [quickMenuMode, setQuickMenuMode] = useState<'ACTIONS' | 'UPDATE_HB' | 'CUSTOM_CELL' | 'RESCHEDULE'>('ACTIONS');
  const [quickHbValue, setQuickHbValue] = useState<string>('');
  const [quickHbNotes, setQuickHbNotes] = useState<string>('');
  const [quickCustomText, setQuickCustomText] = useState<string>('');
  const [quickCustomDose, setQuickCustomDose] = useState<number>(2000);
  const [quickCustomStatus, setQuickCustomStatus] = useState<DoseStatus>('Belum');
  const [targetRescheduleDate, setTargetRescheduleDate] = useState<number>(1);
  const [rescheduleNotes, setRescheduleNotes] = useState<string>('');

  const monthInfo = getMonthDaysInfo(selectedMonth);

  const handleCellClick = (
    patient: PatientRecord,
    dateNumber: number,
    info: DateDoseInfo,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (isLocked) {
      if (onLockedNotice) onLockedNotice();
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popoverWidth = 320;
    let x = rect.left;
    if (x + popoverWidth > window.innerWidth - 16) {
      x = window.innerWidth - popoverWidth - 16;
    }
    if (x < 16) x = 16;
    let y = rect.bottom + 6;
    if (y + 390 > window.innerHeight) {
      y = Math.max(16, rect.top - 380);
    }
    setQuickMenuMode('ACTIONS');
    setQuickHbValue(patient.hbValue > 0 ? String(patient.hbValue) : '');
    setQuickHbNotes('');
    setQuickCustomText(info.cellCode !== '-' ? info.cellCode : '2000');
    setQuickCustomDose(info.doseIU || (info.cellCode === '4000' ? 4000 : 2000));
    setQuickCustomStatus(info.cellCode === '✅' ? 'Diberikan' : 'Belum');

    // Default target date for reschedule:
    // Contoh: jika sesi tgl 15 ingin dipindah, otomatis disiapkan ke tgl 16 (+1 hari)
    const defaultNext = info.rescheduledToDate || (dateNumber + 1 <= monthInfo.daysInMonth ? dateNumber + 1 : (dateNumber > 1 ? dateNumber - 1 : 1));
    setTargetRescheduleDate(defaultNext);
    setRescheduleNotes('');

    setQuickMenuData({ patient, dateNumber, info, x, y });
  };

  // Tampilan Matriks Sebulan Penuh (Tanggal 1 s/d Akhir Bulan)
  const totalDays = monthInfo.daysInMonth;
  const displayedDays = monthInfo.days;

  const realNow = new Date();
  const currentRealYM = `${realNow.getFullYear()}-${String(realNow.getMonth() + 1).padStart(2, '0')}`;
  const realTodayDate = selectedMonth === currentRealYM ? realNow.getDate() : -1;


  // Mode Pengurutan Pasien Berdasarkan Abjad Nama (A - Z secara otomatis)
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  // Filter Pasien (Sheet, Search, Shift, dan Status Pasien) - Otomatis terurut sesuai abjad nama
  const filteredPatients = sortPatientsAlphabetically(
    patients.filter((patient) => {
      const matchesSheet = activeSheetTab === 'ALL' || patient.scheduleDay === activeSheetTab;
      const matchesSearch = 
        patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patient.noRm.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesShift = selectedShiftFilter === 'ALL' || patient.scheduleShift === selectedShiftFilter;
      
      const pStatus = patient.patientStatus || 'Aktif';
      const matchesStatus = 
        selectedStatusFilter === 'ALL'
          ? true
          : selectedStatusFilter === 'NON_AKTIF'
          ? pStatus !== 'Aktif'
          : pStatus === selectedStatusFilter;

      return matchesSheet && matchesSearch && matchesShift && matchesStatus;
    }),
    sortOrder
  );

  // Hitung jumlah pasien per status
  const countAktif = patients.filter((p) => !p.patientStatus || p.patientStatus === 'Aktif').length;
  const countMeninggal = patients.filter((p) => p.patientStatus === 'Meninggal Dunia').length;
  const countPindah = patients.filter((p) => p.patientStatus === 'Pindah RS').length;
  const countRanap = patients.filter((p) => p.patientStatus === 'Rawat Inap').length;
  const countBerhenti = patients.filter((p) => p.patientStatus === 'Berhenti HD').length;
  const countNonAktif = countMeninggal + countPindah + countRanap + countBerhenti;

  // Pisahkan Pasien Berdasarkan Shift (Otomatis Terurut Sesuai Abjad A - Z)
  const pagiPatients = sortPatientsAlphabetically(
    filteredPatients.filter((p) => p.scheduleShift.includes('Pagi')),
    sortOrder
  );
  const siangPatients = sortPatientsAlphabetically(
    filteredPatients.filter((p) => p.scheduleShift.includes('Siang')),
    sortOrder
  );
  const lainnyaPatients = sortPatientsAlphabetically(
    filteredPatients.filter((p) => !p.scheduleShift.includes('Pagi') && !p.scheduleShift.includes('Siang')),
    sortOrder
  );

  // Pasien pada sheet aktif saat ini (untuk badge tombol pilihan shift)
  const currentSheetPatients = patients.filter((p) => activeSheetTab === 'ALL' || p.scheduleDay === activeSheetTab);
  const countCurrentSheetPagi = currentSheetPatients.filter((p) => p.scheduleShift.includes('Pagi')).length;
  const countCurrentSheetSiang = currentSheetPatients.filter((p) => p.scheduleShift.includes('Siang')).length;

  // Hitung jumlah pasien per sheet untuk badge tab
  const countSeninKamis = patients.filter((p) => p.scheduleDay === 'Senin - Kamis').length;
  const countSelasaJumat = patients.filter((p) => p.scheduleDay === 'Selasa - Jumat').length;
  const countRabuSabtu = patients.filter((p) => p.scheduleDay === 'Rabu - Sabtu').length;

  // Akumulator Baris Total Harian Bawah
  const dailyPagi = new Array(monthInfo.daysInMonth).fill(0);
  const dailySiang = new Array(monthInfo.daysInMonth).fill(0);
  const dailyCekHb = new Array(monthInfo.daysInMonth).fill(0);
  const dailyEpoTerjadwal = new Array(monthInfo.daysInMonth).fill(0);
  const dailyEpoKeluar = new Array(monthInfo.daysInMonth).fill(0);
  const dailyPrc = new Array(monthInfo.daysInMonth).fill(0);
  const dailyTotal = new Array(monthInfo.daysInMonth).fill(0);

  filteredPatients.forEach((patient) => {
    for (let d = 1; d <= monthInfo.daysInMonth; d++) {
      const info = getDateDoseDisplayInfo(patient, d, monthInfo);
      if (info.isHD) {
        if (!info.rescheduledToDate) {
          dailyTotal[d - 1]++;
          if (patient.scheduleShift.includes('Pagi')) dailyPagi[d - 1]++;
          else dailySiang[d - 1]++;
        }

        if (info.cellCode === 'Cek') {
          dailyCekHb[d - 1]++;
        } else if (info.cellCode === '2000') {
          dailyEpoTerjadwal[d - 1] += 1;
        } else if (info.cellCode === '4000') {
          dailyEpoTerjadwal[d - 1] += 2;
        } else if (info.cellCode === '✅') {
          dailyEpoKeluar[d - 1] += (info.doseIU === 4000 ? 2 : 1);
        }

        if (info.cellCode === 'PRC 2') {
          dailyPrc[d - 1] += 2;
        } else if (info.cellCode === 'PRC 1') {
          dailyPrc[d - 1] += 1;
        }
      }
    }
  });

  // Render satu baris pasien pada tampilan matriks kalender
  const renderPatientMatrixRow = (patient: PatientRecord, displayNo: number) => {
    const reco = getEffectivePatientRecommendation(patient, selectedMonth);
    const effectiveHb = getEffectivePatientHb(patient, selectedMonth);
    let patientEpoGiven = 0;

    return (
      <tr
        key={`${patient.id || patient.noRm}-${patient.scheduleDay}-${patient.scheduleShift}-${displayNo}`}
        className="h-8 hover:bg-blue-50/50 dark:hover:bg-slate-800/40 divide-x divide-slate-200 dark:divide-slate-800 transition"
      >
        {/* No */}
        <td className="py-1 px-1.5 text-center font-mono text-[10px] text-slate-400 sticky left-0 z-10 bg-white dark:bg-slate-900 w-[35px] min-w-[35px]">
          {displayNo}
        </td>

        {/* Nama Pasien & Status Keaktifan */}
        <td className={`py-1 px-2 font-bold sticky left-[35px] z-10 truncate max-w-[170px] min-w-[170px] ${
          patient.patientStatus === 'Meninggal Dunia'
            ? 'bg-slate-100/90 dark:bg-slate-900/90 text-slate-500 dark:text-slate-400'
            : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
        }`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span 
              className={`truncate max-w-[105px] ${patient.patientStatus === 'Meninggal Dunia' ? 'line-through text-slate-600 dark:text-slate-400' : ''}`} 
              title={`${patient.name}${patient.patientStatus && patient.patientStatus !== 'Aktif' ? ` • Status: ${patient.patientStatus}` : ''}${patient.statusDate ? ` (${patient.statusDate})` : ''}${patient.statusNotes ? ` — ${patient.statusNotes}` : ''}`}
            >
              {patient.name}
            </span>
            {patient.patientStatus === 'Meninggal Dunia' && (
              <span 
                className="px-1 py-0.2 rounded text-[7.5px] font-black bg-slate-900 text-white dark:bg-slate-800 shadow-2xs shrink-0"
                title={`Pasien Meninggal Dunia${patient.statusDate ? ` pada ${patient.statusDate}` : ''}${patient.statusNotes ? ` (${patient.statusNotes})` : ''}`}
              >
                Wafat
              </span>
            )}
            {patient.patientStatus === 'Pindah RS' && (
              <span 
                className="px-1 py-0.2 rounded text-[7.5px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 shrink-0"
                title={`Pasien Pindah RS${patient.statusDate ? ` pada ${patient.statusDate}` : ''}${patient.statusNotes ? ` (${patient.statusNotes})` : ''}`}
              >
                Pindah RS
              </span>
            )}
            {patient.patientStatus === 'Rawat Inap' && (
              <span 
                className="px-1 py-0.2 rounded text-[7.5px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-950 dark:text-purple-200 shrink-0"
                title={`Pasien Sedang Rawat Inap${patient.statusDate ? ` sejak ${patient.statusDate}` : ''}${patient.statusNotes ? ` (${patient.statusNotes})` : ''}`}
              >
                Ranap
              </span>
            )}
            {patient.patientStatus === 'Berhenti HD' && (
              <span 
                className="px-1 py-0.2 rounded text-[7.5px] font-extrabold bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950 dark:text-rose-200 shrink-0"
                title={`Pasien Berhenti/Cuti HD${patient.statusDate ? ` sejak ${patient.statusDate}` : ''}${patient.statusNotes ? ` (${patient.statusNotes})` : ''}`}
              >
                Berhenti
              </span>
            )}
          </div>
        </td>

        {/* Jadwal Shift (sebelumnya No. RM) */}
        <td 
          className="py-1 px-1.5 font-semibold text-[9px] sticky left-[195px] z-10 bg-white dark:bg-slate-900 min-w-[85px] max-w-[85px] text-center whitespace-nowrap"
          title={`Jadwal Shift: ${patient.scheduleShift} • ${patient.scheduleDay}${patient.noRm ? ` (No. RM: ${patient.noRm})` : ''}`}
        >
          <div className="flex items-center justify-center gap-1">
            <span className={`px-1.5 py-0.5 rounded font-bold ${
              patient.scheduleShift.includes('Pagi')
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}>
              {patient.scheduleShift.includes('Pagi') ? 'Pagi (P)' : 'Siang (S)'}
            </span>
            {patient.hdFrequency === '1 kali dalam satu minggu' && (
              <span 
                className="px-1 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/60" 
                title={`Frekuensi HD: 1 kali dalam satu minggu (Hari ${patient.singleDay || 'Rutin'})`}
              >
                1x
              </span>
            )}
            {patient.hdFrequency === '1 kali / 2 minggu' && (
              <span 
                className="px-1 py-0.5 rounded text-[8px] font-bold bg-purple-50 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300/60" 
                title={`Frekuensi HD: 1 kali / 2 minggu (Hari ${patient.singleDay || 'Rutin'} • Siklus 14 hari)`}
              >
                1x/2mgg
              </span>
            )}
          </div>
        </td>

        {/* Nilai HB Bulan Sebelumnya (HB + Nama Bulan Lalu) */}
        {(() => {
          const prevHbVal = (typeof patient.prevHbValue === 'number' && patient.prevHbValue > 0)
            ? patient.prevHbValue
            : undefined;
          return (
            <td 
              className="py-1 px-1 text-center font-mono text-[10.5px] font-bold min-w-[80px] bg-slate-50/50 dark:bg-slate-850/50"
              title={`Nilai HB ${prevMonthName}: ${prevHbVal && prevHbVal > 0 ? `${prevHbVal.toFixed(1)} g/dL` : 'Belum tercatat'}`}
            >
              {prevHbVal && prevHbVal > 0 ? (
                <span className="text-slate-700 dark:text-slate-300">
                  {prevHbVal.toFixed(1)}
                </span>
              ) : (
                <span className="text-slate-400 dark:text-slate-600 font-normal">-</span>
              )}
            </td>
          );
        })()}

        {/* Hb Bulan Berjalan (HB + Nama Bulan Aktif) */}
        {(() => {
          const displayHb = typeof patient.hbValue === 'number' && !isNaN(patient.hbValue) && patient.hbValue > 0
            ? Number(patient.hbValue.toFixed(1))
            : 0;
          const { cellClass, colorClass, protocolName } = getHbProtocolStyle(displayHb);
          return (
            <td 
              className={`py-1 px-1 text-center font-mono text-[11px] font-black min-w-[75px] transition-colors ${cellClass}`}
              title={
                displayHb > 0
                  ? `Kadar HB ${currentMonthName}: ${displayHb.toFixed(1)} g/dL • ${protocolName}`
                  : `Kadar HB ${currentMonthName}: 0.0 g/dL (Belum ada data Hb di Google Sheet / Menunggu Lab)`
              }
            >
              <span className={colorClass}>
                {displayHb > 0 ? displayHb.toFixed(1) : '0.0'}
              </span>
            </td>
          );
        })()}

        {/* Alokasi Klinis */}
        <td className="py-1 px-2 text-[10px] min-w-[130px] max-w-[150px]">
          <span className="font-semibold line-clamp-1 text-slate-800 dark:text-slate-200" title={reco.title}>
            {reco.title}
          </span>
        </td>

        {/* Kolom Tanggal Sebulan Penuh (Ukuran Lega & Nyaman Dilihat: min-w-[48px] max-w-[54px], Tinggi h-8.5 sm:h-9) */}
        {displayedDays.map((day) => {
          const info = getDateDoseDisplayInfo(patient, day.dateNumber, monthInfo);
          const cellWidthClass = 'w-[48px] min-w-[48px] max-w-[54px] p-0.5';

          if (!info.isHD) {
            return (
              <td
                key={day.dateNumber}
                className={`text-center text-slate-300 dark:text-slate-700 bg-slate-50/40 dark:bg-slate-900/40 font-mono ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}
              >
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 rounded-lg font-mono text-slate-300 dark:text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 text-xs font-bold transition cursor-pointer flex items-center justify-center relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-xs text-rose-600 dark:text-rose-400' : ''
                  }`}
                  title={info.title || `Hari Bebas (Tgl ${day.dateNumber}) — Klik untuk reschedule tukar hari atau tambah sesi HD`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  -
                </button>
              </td>
            );
          }

          if (info.rescheduledToDate || info.cellCode?.startsWith('→')) {
            const targetDate = info.rescheduledToDate || (info.cellCode.startsWith('→') ? info.cellCode.replace('→', '') : '');
            return (
              <td key={day.dateNumber} className={`text-center bg-amber-50 dark:bg-amber-950/40 ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-2xs transition cursor-pointer flex flex-col items-center justify-center leading-none relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  }`}
                  title={`${info.title} — Klik untuk batalkan atau ganti tanggal reschedule`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className="text-[10px] font-black leading-tight text-white flex items-center justify-center gap-0.5">
                    <span>➔</span>
                    <span>Tgl {targetDate}</span>
                  </span>
                  <span className="text-[7px] text-amber-100 font-extrabold mt-0.5 uppercase tracking-tight">
                    Tukar
                  </span>
                </button>
              </td>
            );
          }

          if (info.rescheduledFromDate && info.cellCode === 'HD') {
            return (
              <td key={day.dateNumber} className={`text-center bg-emerald-50 dark:bg-emerald-950/40 ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs transition cursor-pointer flex flex-col items-center justify-center leading-none border border-amber-400 relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  }`}
                  title={`${info.title} — Klik untuk ubah tindakan / status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className="text-[10px] font-black leading-tight text-white">
                    HD*
                  </span>
                  <span className="text-[7px] text-amber-200 font-extrabold mt-0.5">
                    Dari {info.rescheduledFromDate}
                  </span>
                </button>
              </td>
            );
          }

          if (info.cellCode === 'PRC 2') {
            return (
              <td key={day.dateNumber} className={`text-center bg-rose-50 dark:bg-rose-950/40 ${cellWidthClass} ${info.isHbUpdateDate ? 'ring-1 ring-rose-300' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xs transition cursor-pointer flex flex-col items-center justify-center leading-none relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-400 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  }`}
                  title={`${info.title} — Klik untuk ubah tindakan / status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className="text-[10px] font-black leading-tight text-white">
                    PRC 2
                  </span>
                  <span className="text-[7.5px] text-rose-100 font-semibold mt-0.5">2 Bag</span>
                </button>
              </td>
            );
          }

          if (info.cellCode === 'PRC 1') {
            return (
              <td key={day.dateNumber} className={`text-center bg-amber-50 dark:bg-amber-950/40 ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-2xs transition cursor-pointer flex flex-col items-center justify-center leading-none relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  }`}
                  title={`${info.title} — Klik untuk ubah tindakan / status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className="text-[10px] font-black leading-tight text-white">
                    PRC 1
                  </span>
                  <span className="text-[7.5px] text-amber-100 font-semibold mt-0.5">1 Bag</span>
                </button>
              </td>
            );
          }

          if (info.cellCode === '4000') {
            return (
              <td key={day.dateNumber} className={`text-center bg-purple-50 dark:bg-purple-950/40 ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs transition cursor-pointer flex flex-col items-center justify-center leading-none relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  }`}
                  title={`${info.title} — Klik untuk ubah tindakan / status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className="text-[10px] font-black leading-tight text-white">
                    4000
                  </span>
                  <span className="text-[7.5px] text-indigo-100 font-semibold mt-0.5">2 Amp</span>
                </button>
              </td>
            );
          }

          if (info.cellCode === 'Cek') {
            const isHbNotInput = !patient.hbValue || patient.hbValue <= 0;
            const labStatus = patient.labSchedule?.status || (patient.hbValue > 0 ? 'Selesai' : 'Terjadwal');
            const isDone = labStatus === 'Selesai';
            const isPostponed = labStatus === 'Ditunda';

            return (
              <td key={day.dateNumber} className={`text-center ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black transition cursor-pointer flex flex-col items-center justify-center leading-none shadow-2xs relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  } ${
                    isHbNotInput
                      ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs'
                      : 'bg-sky-100 text-blue-900 border border-blue-300 hover:bg-sky-200 active:bg-sky-300 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-700'
                  }`}
                  title={`${info.title} — Klik untuk ubah tindakan / status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className={`text-[10px] font-black leading-tight tracking-tight ${isHbNotInput ? 'text-white' : 'text-blue-950 dark:text-blue-100'}`}>
                    🩸 Cek
                  </span>
                  <span 
                    className={`text-[7px] leading-tight font-extrabold flex items-center justify-center mt-0.5 ${
                      isHbNotInput
                        ? 'text-indigo-100'
                        : isDone
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : isPostponed
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-blue-700 dark:text-sky-300'
                    }`}
                  >
                    {isDone ? '✓ Lab' : isPostponed ? '⚠️ Tunda' : 'Lab'}
                  </span>
                </button>
              </td>
            );
          }

          if (info.cellCode === '✅') {
            patientEpoGiven++;
            return (
              <td key={day.dateNumber} className={`text-center bg-emerald-50 dark:bg-emerald-950/30 ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs transition cursor-pointer flex flex-col items-center justify-center leading-none relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  }`}
                  title={`${info.title} — Klik tombol untuk ubah status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className="text-[10px] leading-tight font-black flex items-center justify-center gap-0.5 text-white">
                    ✅ 2000
                  </span>
                  <span className="text-[7.5px] leading-tight text-emerald-100 font-bold mt-0.5">
                    {info.isCatchUp ? 'Alih' : 'Diberikan'}
                  </span>
                </button>
              </td>
            );
          }

          if (info.cellCode === '❌') {
            return (
              <td key={day.dateNumber} className={`text-center bg-red-50 dark:bg-red-950/30 ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-2xs transition cursor-pointer flex flex-col items-center justify-center leading-none relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  }`}
                  title={`${info.title} — Klik tombol untuk ubah status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className="text-[10px] font-black leading-tight flex items-center justify-center gap-0.5 text-white">
                    ✕ Ditunda
                  </span>
                  <span className="text-[7px] leading-tight text-red-100 font-bold mt-0.5">
                    Ke Hari Ke-2
                  </span>
                </button>
              </td>
            );
          }

          if (info.cellCode === '2000') {
            return (
              <td key={day.dateNumber} className={`text-center ${info.isCatchUp ? 'bg-amber-100/70 dark:bg-amber-950/40' : ''} ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-black transition cursor-pointer flex flex-col items-center justify-center leading-none shadow-2xs relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  } ${
                    info.isCatchUp
                      ? 'bg-amber-200 hover:bg-amber-300 active:bg-amber-400 text-amber-950 border border-amber-500'
                      : 'bg-sky-100 text-blue-900 border border-blue-300 hover:bg-sky-200 active:bg-sky-300 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-700'
                  }`}
                  title={`${info.title} — Klik tombol untuk ubah status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className={`text-[10.5px] font-black leading-tight ${info.isCatchUp ? 'text-amber-950' : ''}`}>
                    2000
                  </span>
                  <span className={`text-[7.5px] leading-tight font-bold mt-0.5 ${info.isCatchUp ? 'text-amber-800 dark:text-amber-300' : 'text-blue-700 dark:text-sky-300'}`}>
                    {info.isCatchUp ? 'Alih' : 'EPO'}
                  </span>
                </button>
              </td>
            );
          }

          if (info.cellCode === 'Hold') {
            return (
              <td key={day.dateNumber} className={`text-center ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
                <button
                  type="button"
                  onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                  className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg text-purple-900 bg-purple-100 border border-purple-300 hover:bg-purple-200 active:bg-purple-300 font-bold shadow-2xs transition cursor-pointer flex flex-col items-center justify-center leading-none relative ${
                    info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                  }`}
                  title={`${info.title} — Klik untuk ubah tindakan / status`}
                >
                  <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                  <span className="text-[10px] font-bold">Hold</span>
                  <span className="text-[7.5px] text-purple-700 font-medium mt-0.5">Tunda</span>
                </button>
              </td>
            );
          }

          return (
            <td key={day.dateNumber} className={`text-center ${cellWidthClass} ${info.isHbUpdateDate ? 'bg-rose-50/70 dark:bg-rose-950/40' : ''}`}>
              <button
                type="button"
                onClick={(e) => handleCellClick(patient, day.dateNumber, info, e)}
                className={`w-full h-8.5 sm:h-9 px-0.5 rounded-lg font-semibold bg-[#d9ead3] border border-emerald-300 hover:bg-[#cbe2c4] active:bg-[#bddbb5] text-emerald-950 transition cursor-pointer flex flex-col items-center justify-center leading-none shadow-2xs dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800 relative ${
                  info.isHbUpdateDate ? 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900 shadow-md' : ''
                }`}
                title={`${info.title} — Klik untuk ubah tindakan / status`}
              >
                <HbUpdateBadge info={info} patientHb={patient.hbValue} />
                <span className="text-[10px] font-bold leading-tight">
                  HD
                </span>
                <span className="text-[7.5px] leading-tight text-emerald-800 dark:text-emerald-400 mt-0.5">
                  Rutin
                </span>
              </button>
            </td>
          );
        })}

        {/* Target EPO */}
        <td className="py-1 px-1.5 text-center font-bold text-blue-700 w-[55px] min-w-[55px] text-[10px]">
          {reco.totalEpoVials}
        </td>

        {/* Realisasi EPO */}
        <td className="py-1 px-1.5 text-center font-bold text-emerald-700 w-[55px] min-w-[55px] text-[10px]">
          {patientEpoGiven}
        </td>

        {/* Rasio */}
        <td className="py-1 px-1.5 text-center font-mono text-[9px] w-[55px] min-w-[55px]">
          {patientEpoGiven}:{reco.totalEpoVials}
        </td>

        {/* PRC */}
        <td className="py-1 px-1.5 text-center font-bold text-rose-600 w-[50px] min-w-[50px] text-[10px]">
          {reco.transfusionBags > 0 ? reco.transfusionBags : '-'}
        </td>

        {/* Status */}
        <td className="py-1 px-1 text-center w-[80px] min-w-[80px]">
          <div className="flex flex-col items-center justify-center gap-0.5">
            {patient.patientStatus && patient.patientStatus !== 'Aktif' ? (
              <span 
                className={`px-1.5 py-0.5 rounded text-[8px] font-black cursor-help ${
                  patient.patientStatus === 'Meninggal Dunia'
                    ? 'bg-slate-900 text-white dark:bg-slate-800'
                    : patient.patientStatus === 'Pindah RS'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                    : patient.patientStatus === 'Rawat Inap'
                    ? 'bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-950 dark:text-purple-200'
                    : 'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950 dark:text-rose-200'
                }`}
                title={`Status Pasien: ${patient.patientStatus}${patient.statusDate ? ` (${patient.statusDate})` : ''}${patient.statusNotes ? ` — ${patient.statusNotes}` : ''}`}
              >
                {patient.patientStatus === 'Meninggal Dunia' ? 'Wafat' : patient.patientStatus}
              </span>
            ) : (
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                patient.overallStatus === 'Selesai'
                  ? 'bg-emerald-100 text-emerald-800'
                  : patient.overallStatus === 'Perlu Perhatian'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {patient.overallStatus}
              </span>
            )}
            {patient.statusDate && patient.patientStatus && patient.patientStatus !== 'Aktif' && (
              <span className="text-[7px] text-slate-400 font-mono leading-none" title={`Tanggal status: ${patient.statusDate}`}>
                {patient.statusDate}
              </span>
            )}
          </div>
        </td>

        {/* Aksi */}
        <td className="py-1 px-1 text-center w-[65px] min-w-[65px]">
          <div className="flex items-center justify-center gap-0.5">
            {onOpenLabScheduleModal && (
              <button
                type="button"
                onClick={() => onOpenLabScheduleModal(patient.id)}
                className="p-1 text-slate-400 hover:text-purple-600 rounded transition cursor-pointer"
                title={`Atur Jadwal Cek Lab Manual (${patient.name})`}
              >
                <FlaskConical className="w-3 h-3 text-purple-600" />
              </button>
            )}
            <button
              onClick={() => onEditPatient(patient)}
              className="p-1 text-slate-400 hover:text-indigo-600 rounded"
              title="Edit Data Pasien"
            >
              <Edit3 className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDeletePatient(patient.id)}
              className="p-1 text-slate-400 hover:text-rose-600 rounded"
              title="Hapus Pasien"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </td>

      </tr>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      
      {/* JUDUL UTAMA DI ATAS DAFTAR SHEET: TERAPI EPO & TRANSFUSI BULAN (NAMA BULAN) */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-600 to-rose-700 text-white flex items-center justify-center shadow-xs shrink-0">
            <Syringe className="w-5 h-5 text-rose-50" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase">
                TERAPI EPO &amp; TRANSFUSI BULAN {monthLabel.toUpperCase()}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                Hemodialisa
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
              Jadwal alokasi pemberian Eritropoietin dan transfusi darah berbasis target klinis Hb
            </p>
          </div>
        </div>

        {/* Quick Summary Info & Legenda Warna Hb */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs">
          {/* Legenda Warna Protokol Klinis Hb */}
          <div className="hidden lg:flex items-center gap-1 text-[10px] bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 font-bold mr-1">Warna Hb:</span>
            <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 px-1" title="Protokol 1: Hb < 5.9 — Transfusi 2 Bag Rawat Inap">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
              &lt;5.9 (2 Bag)
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 px-1" title="Protokol 2: Hb 6.0 – 6.9 — Transfusi 1 Bag PRC">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
              6.0–6.9 (1 Bag)
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 px-1" title="Protokol 3: Hb 7.0 – 8.9 — Terapi EPO 4x 2000 IU">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              7.0–8.9 (EPO 4x)
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 px-1" title="Protokol 4: Hb 9.0 – 12.0 — Terapi EPO 1x Maintenance">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              9.0–12.0 (EPO 1x)
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="inline-flex items-center gap-1 font-bold text-purple-600 dark:text-purple-400 px-1" title="Protokol 5: Hb > 12.00 — Tanpa Terapi EPO">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
              &gt;12.0 (Tanpa EPO)
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-2xs">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-semibold text-slate-500 dark:text-slate-400">Total:</span>
              <span className="font-bold text-slate-900 dark:text-white">{patients.length} Pasien</span>
            </div>

            {/* Pemilih Bulan Aktif Popover */}
            <div className="relative">
              <button 
                type="button"
                onClick={() => {
                  setPickerYear(currentYear);
                  setIsMonthPickerOpen(!isMonthPickerOpen);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-rose-50/90 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/50 border border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200 flex items-center gap-1.5 cursor-pointer shadow-2xs transition font-extrabold text-xs select-none"
                title="Klik untuk memilih bulan & tahun"
              >
                <Calendar className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="tracking-tight uppercase">{monthLabel}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-rose-500 transition-transform duration-200 ${isMonthPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Popover Kalender Pemilih Bulan */}
              {isMonthPickerOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsMonthPickerOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 z-50 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3.5 text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-100">
                    {/* Header Pemilih Tahun */}
                    <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPickerYear(y => y - 1)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                        title="Tahun Sebelumnya"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800 dark:text-slate-200">
                        <span className="text-slate-500 dark:text-slate-400 text-xs">Tahun:</span>
                        <span className="text-rose-600 dark:text-rose-400 font-extrabold text-base tracking-tight">{pickerYear}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPickerYear(y => y + 1)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                        title="Tahun Selanjutnya"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Grid 12 Bulan */}
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      {INDONESIA_MONTH_LIST.map((m, idx) => {
                        const isSelected = pickerYear === currentYear && (idx + 1) === currentMonthNum;
                        return (
                          <button
                            key={m.num}
                            type="button"
                            onClick={() => {
                              onMonthChange?.(`${pickerYear}-${m.num}`);
                              setIsMonthPickerOpen(false);
                            }}
                            className={`py-2 px-2 text-xs font-bold rounded-lg text-center transition cursor-pointer ${
                              isSelected
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-slate-50 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200/60 dark:border-slate-700/60'
                            }`}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Footer Navigasi Cepat */}
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          const y = now.getFullYear();
                          const m = String(now.getMonth() + 1).padStart(2, '0');
                          onMonthChange?.(`${y}-${m}`);
                          setIsMonthPickerOpen(false);
                        }}
                        className="text-rose-600 dark:text-rose-400 font-bold hover:underline py-1 px-1 rounded cursor-pointer"
                      >
                        Bulan Sekarang
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMonthPickerOpen(false)}
                        className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 py-1 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer font-medium"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3 DAFTAR SHEET TABS: SENIN-KAMIS, SELASA-JUMAT, RABU-SABTU */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 px-3 pt-2 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-rose-700 dark:text-rose-400 mr-1 hidden sm:inline flex items-center gap-1 shrink-0">
            <Layers className="w-3.5 h-3.5" />
            <span>Sheet:</span>
          </span>

          {/* Sheet 1: Senin - Kamis */}
          <button
            onClick={() => setActiveSheetTab('Senin - Kamis')}
            className={`h-8.5 px-3 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 border-t-2 transition cursor-pointer shrink-0 ${
              activeSheetTab === 'Senin - Kamis'
                ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border-rose-600 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>Senin - Kamis</span>
            {todayActiveSchedule === 'Senin - Kamis' && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-400 text-amber-950 font-black shadow-2xs">
                Hari Ini ({todayDayName})
              </span>
            )}
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-extrabold">
              {countSeninKamis}
            </span>
          </button>

          {/* Sheet 2: Selasa - Jumat */}
          <button
            onClick={() => setActiveSheetTab('Selasa - Jumat')}
            className={`h-8.5 px-3 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 border-t-2 transition cursor-pointer shrink-0 ${
              activeSheetTab === 'Selasa - Jumat'
                ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border-rose-600 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>Selasa - Jumat</span>
            {todayActiveSchedule === 'Selasa - Jumat' && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-400 text-amber-950 font-black shadow-2xs">
                Hari Ini ({todayDayName})
              </span>
            )}
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-extrabold">
              {countSelasaJumat}
            </span>
          </button>

          {/* Sheet 3: Rabu - Sabtu */}
          <button
            onClick={() => setActiveSheetTab('Rabu - Sabtu')}
            className={`h-8.5 px-3 rounded-t-lg font-semibold text-xs flex items-center gap-1.5 border-t-2 transition cursor-pointer shrink-0 ${
              activeSheetTab === 'Rabu - Sabtu'
                ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border-rose-600 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>Rabu - Sabtu</span>
            {todayActiveSchedule === 'Rabu - Sabtu' && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-400 text-amber-950 font-black shadow-2xs">
                Hari Ini ({todayDayName})
              </span>
            )}
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-extrabold">
              {countRabuSabtu}
            </span>
          </button>

          {/* Semua Pasien */}
          <button
            onClick={() => setActiveSheetTab('ALL')}
            className={`h-8.5 px-3 rounded-t-lg font-medium text-xs border-t-2 transition cursor-pointer shrink-0 ${
              activeSheetTab === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-white border-rose-600 shadow-2xs font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-transparent'
            }`}
          >
            Semua ({patients.length})
          </button>
        </div>
      </div>

      {/* BAR NAVIGASI MINGGU / 2-MINGGUAN & PENGALIH MODE TAMPILAN */}
      {/* BAR INFORMASI MATRIKS SEBULAN PENUH */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-850 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center shadow-2xs shrink-0">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                Matriks Jadwal & Alokasi Sebulan Penuh
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-700 text-white shadow-2xs">
                Tanggal 1 – {totalDays} {currentMonthName} {currentYear}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
              <span>{totalDays} Hari Terjadwal Lengkap</span>
              {realTodayDate > 0 && (
                <>
                  <span>•</span>
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">
                    Hari ini: {todayDayName}, {realTodayDate} {currentMonthName}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
          <span className="font-semibold text-rose-700 dark:text-rose-400">💡 Petunjuk:</span>
          <span>Geser tabel ke kanan (scroll) untuk menelusuri seluruh tanggal 1 s/d {totalDays}.</span>
        </div>
      </div>

      {/* Toolbar Filter & Tombol Pilihan Shift */}
      <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative min-w-[160px] max-w-[220px] flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama / No. RM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-slate-50/60 dark:bg-slate-800/60 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
            />
          </div>

          {/* TOMBOL PILIHAN SHIFT (PAGI & SIANG) */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setSelectedShiftFilter(selectedShiftFilter === 'Shift 1 (Pagi)' ? 'ALL' : 'Shift 1 (Pagi)')}
              className={`h-7 px-2.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                selectedShiftFilter === 'Shift 1 (Pagi)'
                  ? 'bg-rose-700 text-white shadow-2xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700'
              }`}
              title="Filter pasien Shift 1 (Pagi - 07:00 WIB)"
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Shift 1 (Pagi)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                selectedShiftFilter === 'Shift 1 (Pagi)'
                  ? 'bg-rose-900 text-white'
                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
              }`}>
                {countCurrentSheetPagi}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedShiftFilter(selectedShiftFilter === 'Shift 2 (Siang)' ? 'ALL' : 'Shift 2 (Siang)')}
              className={`h-7 px-2.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer ${
                selectedShiftFilter === 'Shift 2 (Siang)'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-slate-750'
              }`}
              title="Filter pasien Shift 2 (Siang - 12:30 WIB)"
            >
              <Sunset className="w-3.5 h-3.5 text-amber-500" />
              <span>Shift 2 (Siang)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                selectedShiftFilter === 'Shift 2 (Siang)'
                  ? 'bg-amber-800 text-white'
                  : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
              }`}>
                {countCurrentSheetSiang}
              </span>
            </button>
          </div>

          {/* FILTER STATUS KEAKTIFAN PASIEN */}
          <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 px-1.5 flex items-center gap-1">
              <HeartPulse className="w-3 h-3 text-rose-500" />
              <span className="hidden sm:inline">Status:</span>
            </span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="h-7 px-2 rounded-md font-bold text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus:outline-hidden cursor-pointer"
              title="Filter tampilan pasien berdasarkan status keaktifan"
            >
              <option value="ALL">Semua Status ({patients.length})</option>
              <option value="Aktif">🟢 Aktif ({countAktif})</option>
              <option value="NON_AKTIF">⚠️ Seluruh Non-Aktif ({countNonAktif})</option>
              <option value="Meninggal Dunia">⬛ Meninggal Dunia ({countMeninggal})</option>
              <option value="Pindah RS">🚗 Pindah RS ({countPindah})</option>
              <option value="Rawat Inap">🏥 Rawat Inap ({countRanap})</option>
              <option value="Berhenti HD">⏸️ Berhenti HD ({countBerhenti})</option>
            </select>
          </div>

          {/* INDIKATOR & PENGATUR URUTAN ABJAD NAMA OTOMATIS */}
          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
            className={`h-7 px-2.5 rounded-lg border flex items-center gap-1.5 font-bold text-xs shadow-2xs transition cursor-pointer select-none ${
              sortOrder === 'ASC'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200'
            }`}
            title={`Otomatis mengurutkan nama pasien sesuai abjad (${sortOrder === 'ASC' ? 'A s/d Z' : 'Z s/d A'}). Klik untuk membalik.`}
          >
            <span className="text-xs">🔤</span>
            <span className="hidden sm:inline">Urut Abjad:</span>
            <span className="px-1.5 py-0.2 rounded bg-white dark:bg-slate-900 text-[10px] font-black shadow-2xs border border-slate-200 dark:border-slate-700">
              {sortOrder === 'ASC' ? 'A → Z ↑' : 'Z → A ↓'}
            </span>
          </button>
        </div>

        {/* Legend Kode Minimalis Sesuai Permintaan */}
        <div className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300 flex-wrap">
          <span className="font-semibold text-slate-400 mr-0.5">Legenda:</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-700 text-white font-bold" title="Cek HB Lab Awal Bulan (Tanpa EPO)">
            Cek = Cek HB
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-800 text-white font-bold" title="Transfusi Protokol 2">
            PRC 2 = Transfusi 2 Bag
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-600 text-white font-bold" title="Transfusi Protokol 1">
            PRC 1 = Transfusi 1 Bag
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-50 text-rose-800 font-bold border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800" title="Terjadwal EPO">
            2000 = Jadwal EPO
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-600 text-white font-bold" title="EPO Diberikan">
            ✅ = Diberikan
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-600 text-white font-bold inline-flex items-center gap-1" title="Ditunda (Ke Hari Ke-2)">
            <span>✕ Ditunda</span>
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-600 text-white font-bold inline-flex items-center gap-1" title="Sesi Dipindah (Reschedule Tukar Hari)">
            <span>→Tgl = Reschedule</span>
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-600 text-white font-bold inline-flex items-center gap-0.5 shadow-2xs" title="Sesi yang memuat tindakan Update Nilai Hb">
            <span>🩸</span>
            <span>Update Hb</span>
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-900 font-bold border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" title="Sesi Rutin">
            HD = Rutin
          </span>
        </div>
      </div>

      {/* TAMPILAN MATRIKS KALENDER DENGAN PEMISAHAN SHIFT PAGI & SIANG PADA BARIS TERPISAH */}
      <div className="overflow-x-auto max-h-[82vh]">
          <table className="w-full text-left border-collapse text-[10px] font-sans">
            {/* Header Kolom - Modern Medical Deep Ruby dengan ukuran kolom minimalis */}
            <thead className="sticky top-0 z-20">
              <tr className="bg-rose-900 dark:bg-rose-950 text-white text-center font-bold tracking-wider divide-x divide-rose-800/80 text-[10px]">
                <th className="py-1.5 px-1.5 text-center sticky left-0 z-30 bg-rose-900 dark:bg-rose-950 w-[35px] min-w-[35px]">No</th>
                <th 
                  onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
                  className="py-1.5 px-2 text-left sticky left-[35px] z-30 bg-rose-900 dark:bg-rose-950 min-w-[160px] max-w-[160px] cursor-pointer hover:bg-rose-800 transition select-none group"
                  title={`Otomatis urut abjad nama pasien (${sortOrder === 'ASC' ? 'A s/d Z' : 'Z s/d A'}). Klik untuk membalik.`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Nama Pasien</span>
                    <span className="px-1.5 py-0.2 rounded bg-rose-950/80 text-amber-300 text-[9px] font-mono font-black group-hover:bg-rose-800 border border-rose-700/60 shadow-2xs">
                      {sortOrder === 'ASC' ? 'A-Z ↑' : 'Z-A ↓'}
                    </span>
                  </div>
                </th>
                <th className="py-1.5 px-1.5 text-center sticky left-[195px] z-30 bg-rose-900 dark:bg-rose-950 min-w-[85px] max-w-[85px]">
                  Jadwal Shift
                </th>
                <th 
                  className="py-1.5 px-1 text-center min-w-[80px]" 
                  title={`Nilai Hb Laboratorium Bulan Sebelumnya (${prevMonthName})`}
                >
                  HB {prevMonthName}
                </th>
                <th 
                  className="py-1.5 px-1 text-center min-w-[75px]" 
                  title={`Nilai Hb Laboratorium Bulan Berjalan (${currentMonthName})`}
                >
                  HB {currentMonthName}
                </th>
                <th className="py-1.5 px-2 text-left min-w-[130px]">Alokasi Dosis</th>

                {/* Kolom Tanggal Sebulan Penuh (Ukuran Lega & Nyaman Dilihat: min-w-[48px] max-w-[54px]) */}
                {displayedDays.map((day) => {
                  const dayNamesShort = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                  const DAY_NAMES_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                  const isDialysisDay = activeSheetTab !== 'ALL' && isDateInHDDay(day.dayOfWeek, activeSheetTab);
                  const isToday = realTodayDate === day.dateNumber;

                  return (
                    <th
                      key={day.dateNumber}
                      className={`py-2 px-0.5 text-center transition w-[48px] min-w-[48px] max-w-[54px] ${
                        isDialysisDay ? 'bg-rose-800/95 text-amber-200 font-extrabold shadow-inner' : 'bg-rose-950/70 opacity-90'
                      } ${isToday ? 'bg-rose-700 ring-2 ring-amber-400 font-black' : ''}`}
                      title={`${DAY_NAMES_FULL[day.dayOfWeek]}, ${day.dateString}${isDialysisDay ? ' (Jadwal HD Aktif)' : ''}`}
                    >
                      <div className="flex flex-col items-center justify-center leading-tight">
                        <span className="text-[8.5px] font-black uppercase tracking-wider text-rose-100">
                          {dayNamesShort[day.dayOfWeek]}
                        </span>
                        <span className="text-xs sm:text-[13px] font-black text-amber-200 leading-tight">
                          {day.dateNumber}
                        </span>
                        {isToday && (
                          <span className="mt-0.5 px-1 py-0.1 rounded-full text-[6.5px] bg-amber-400 text-amber-950 font-black shadow-2xs leading-none">
                            Hari Ini
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}

                {/* Kolom Rekap Kanan Minimalis */}
                <th className="py-1.5 px-1 min-w-[55px] bg-rose-950 text-center">Target</th>
                <th className="py-1.5 px-1 min-w-[55px] bg-rose-950 text-center">Realisasi</th>
                <th className="py-1.5 px-1 min-w-[55px] bg-rose-950 text-center">Rasio</th>
                <th className="py-1.5 px-1 min-w-[50px] bg-rose-950 text-center">PRC</th>
                <th className="py-1.5 px-1 min-w-[75px] bg-rose-950 text-center">Status</th>
                <th className="py-1.5 px-1 min-w-[65px] bg-rose-950 text-center">Aksi</th>
              </tr>
            </thead>

            {/* Isi Baris Pasien: DIPISAHKAN BERDASARKAN SHIFT */}
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              
              {/* JIKA TIDAK ADA PASIEN */}
              {filteredPatients.length === 0 && (
                <tr>
                  <td colSpan={displayedDays.length + 12} className="py-12 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 mx-auto flex items-center justify-center shadow-xs">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                          Belum Ada Pasien di Jadwal {activeSheetTab}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          Anda dapat memasukkan banyak data pasien sekaligus dengan menyalin tabel dari Microsoft Excel atau mengunggah berkas CSV.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                        {onPullFromSheet && (
                          <button
                            onClick={() => onPullFromSheet()}
                            disabled={isSyncing}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                            <span>Tarik Data dari Google Sheet</span>
                          </button>
                        )}
                        {onOpenBulkImportModal && (
                          <button
                            onClick={onOpenBulkImportModal}
                            className="px-4 py-2 bg-rose-700 hover:bg-rose-800 active:bg-rose-900 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                          >
                            <ClipboardPaste className="w-4 h-4" />
                            <span>Input Massal dari Excel / CSV</span>
                          </button>
                        )}
                        {onOpenAddPatientModal && (
                          <button
                            onClick={onOpenAddPatientModal}
                            className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>Tambah 1 Pasien</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {/* SECTION 1: SHIFT PAGI (07:00 WIB) - BARIS TERPISAH (MERGE & CENTER) */}
              {pagiPatients.length > 0 && (
                <>
                  <tr className="bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 font-bold border-y border-rose-200 dark:border-rose-900/60">
                    <td 
                      colSpan={displayedDays.length + 12} 
                      className="py-1 px-3 text-center bg-rose-50/90 dark:bg-rose-950/50"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400 shrink-0" />
                        <span>KELOMPOK SHIFT PAGI (07:00 WIB) — {pagiPatients.length} Pasien</span>
                      </div>
                    </td>
                  </tr>
                  {pagiPatients.map((patient, idx) => renderPatientMatrixRow(patient, idx + 1))}
                </>
              )}

              {/* SECTION 2: SHIFT SIANG (12:30 WIB) - BARIS TERPISAH (MERGE & CENTER) */}
              {siangPatients.length > 0 && (
                <>
                  <tr className="bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-200 font-bold border-y border-amber-200 dark:border-amber-900/60">
                    <td 
                      colSpan={displayedDays.length + 12} 
                      className="py-1 px-3 text-center bg-amber-50/90 dark:bg-amber-950/50"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Sunset className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>KELOMPOK SHIFT SIANG (12:30 WIB) — {siangPatients.length} Pasien</span>
                      </div>
                    </td>
                  </tr>
                  {siangPatients.map((patient, idx) => renderPatientMatrixRow(patient, idx + 1))}
                </>
              )}

              {/* SECTION 3: SHIFT LAINNYA / TIDAK TERDEFINISI */}
              {lainnyaPatients.length > 0 && (
                <>
                  <tr className="bg-slate-100 dark:bg-slate-850 text-slate-800 dark:text-slate-200 font-bold border-y border-slate-300 dark:border-slate-700">
                    <td 
                      colSpan={displayedDays.length + 12} 
                      className="py-1 px-3 text-center bg-slate-100/90 dark:bg-slate-850/90"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" />
                        <span>KELOMPOK SHIFT LAINNYA — {lainnyaPatients.length} Pasien</span>
                      </div>
                    </td>
                  </tr>
                  {lainnyaPatients.map((patient, idx) => renderPatientMatrixRow(patient, idx + 1))}
                </>
              )}

            </tbody>

            {/* BARIS TOTAL RINGKASAN BAWAH */}
            <tfoot className="divide-y divide-slate-200 dark:divide-slate-800 font-bold text-[9px]">
              {/* Row 1: Total Shift Pagi */}
              <tr className="bg-rose-50/60 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 divide-x divide-rose-200/70 dark:divide-rose-900/40">
                <td colSpan={6} className="py-1 px-3 text-left sticky left-0 z-10 bg-rose-50/90 dark:bg-rose-950/60 font-semibold">
                  Total Shift Pagi (P)
                </td>
                {displayedDays.map((day) => {
                  const cnt = dailyPagi[day.dateNumber - 1];
                  return (
                    <td key={day.dateNumber} className="w-[48px] min-w-[48px] max-w-[54px] py-1 px-0 text-center font-bold text-xs">
                      {cnt > 0 ? cnt : '-'}
                    </td>
                  );
                })}
                <td colSpan={6} className="py-1 px-2 text-center bg-rose-100 dark:bg-rose-900/40 font-bold text-rose-900 dark:text-rose-200">
                  {displayedDays.reduce((a, b) => a + dailyPagi[b.dateNumber - 1], 0)} Sesi Pagi
                </td>
              </tr>

              {/* Row 2: Total Shift Siang */}
              <tr className="bg-amber-50/60 dark:bg-amber-950/20 text-slate-800 dark:text-amber-200 divide-x divide-amber-200/70 dark:divide-amber-900/40">
                <td colSpan={6} className="py-1 px-3 text-left sticky left-0 z-10 bg-amber-50/90 dark:bg-amber-950/60 font-semibold">
                  Total Shift Siang (S)
                </td>
                {displayedDays.map((day) => {
                  const cnt = dailySiang[day.dateNumber - 1];
                  return (
                    <td key={day.dateNumber} className="w-[48px] min-w-[48px] max-w-[54px] py-1 px-0 text-center font-bold text-xs">
                      {cnt > 0 ? cnt : '-'}
                    </td>
                  );
                })}
                <td colSpan={6} className="py-1 px-2 text-center bg-amber-100 dark:bg-amber-900/40 font-bold text-amber-950 dark:text-amber-200">
                  {displayedDays.reduce((a, b) => a + dailySiang[b.dateNumber - 1], 0)} Sesi Siang
                </td>
              </tr>

              {/* Row 3: Total Kebutuhan Transfusi PRC (Sesi Cek Hb) */}
              <tr className="bg-rose-100/50 dark:bg-rose-900/20 text-rose-950 dark:text-rose-200 divide-x divide-rose-200/70 dark:divide-rose-900/40">
                <td colSpan={6} className="py-1 px-3 text-left sticky left-0 z-10 bg-rose-100/80 dark:bg-rose-900/50 font-semibold">
                  Kebutuhan Transfusi PRC (Kantong)
                </td>
                {displayedDays.map((day) => {
                  const cnt = dailyPrc[day.dateNumber - 1];
                  return (
                    <td key={day.dateNumber} className="w-[48px] min-w-[48px] max-w-[54px] py-1 px-0 text-center font-extrabold text-rose-700 dark:text-rose-400 text-xs">
                      {cnt > 0 ? cnt : '-'}
                    </td>
                  );
                })}
                <td colSpan={6} className="py-1 px-2 text-center bg-rose-200/80 dark:bg-rose-800/60 font-extrabold text-rose-950 dark:text-rose-100">
                  {displayedDays.reduce((a, b) => a + dailyPrc[b.dateNumber - 1], 0)} Kantong PRC
                </td>
              </tr>

              {/* Row 3.5: Total Pasien Cek Hb (Cek) */}
              <tr className="bg-amber-100/50 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200 divide-x divide-amber-200/70 dark:divide-amber-900/40">
                <td colSpan={6} className="py-1 px-3 text-left sticky left-0 z-10 bg-amber-100/80 dark:bg-amber-950/50 font-bold">
                  Jadwal Cek Hb Lab (Cek)
                </td>
                {displayedDays.map((day) => {
                  const cnt = dailyCekHb[day.dateNumber - 1];
                  return (
                    <td key={day.dateNumber} className="w-[48px] min-w-[48px] max-w-[54px] py-1 px-0 text-center font-black text-amber-800 dark:text-amber-300 text-xs">
                      {cnt > 0 ? cnt : '-'}
                    </td>
                  );
                })}
                <td colSpan={6} className="py-1 px-2 text-center bg-amber-200/80 dark:bg-amber-800/60 font-black text-amber-950 dark:text-amber-100">
                  {displayedDays.reduce((a, b) => a + dailyCekHb[b.dateNumber - 1], 0)} Sesi Cek Hb
                </td>
              </tr>

              {/* Row 4: Total Kebutuhan Harian EPO (Ampul 2000 IU) */}
              <tr className="bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 divide-x divide-rose-200/70 dark:divide-rose-900/40">
                <td colSpan={6} className="py-1 px-3 text-left sticky left-0 z-10 bg-rose-50/90 dark:bg-rose-950/60 font-bold">
                  Kebutuhan Harian EPO (Ampul 2000 IU)
                </td>
                {displayedDays.map((day) => {
                  const cnt = dailyEpoTerjadwal[day.dateNumber - 1];
                  return (
                    <td key={day.dateNumber} className="w-[48px] min-w-[48px] max-w-[54px] py-1 px-0 text-center font-extrabold text-rose-700 dark:text-rose-300 text-xs">
                      {cnt > 0 ? cnt : '-'}
                    </td>
                  );
                })}
                <td colSpan={6} className="py-1 px-2 text-center bg-rose-100 dark:bg-rose-900/50 font-extrabold text-rose-900 dark:text-rose-200">
                  {displayedDays.reduce((a, b) => a + dailyEpoTerjadwal[b.dateNumber - 1], 0)} Ampul Terjadwal
                </td>
              </tr>

              {/* Row 5: Epo Keluar */}
              <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200 divide-x divide-emerald-200/70 dark:divide-emerald-900/40">
                <td colSpan={6} className="py-1 px-3 text-left sticky left-0 z-10 bg-emerald-50/90 dark:bg-emerald-950/60 font-bold">
                  Epo Keluar
                </td>
                {displayedDays.map((day) => {
                  const cnt = dailyEpoKeluar[day.dateNumber - 1];
                  return (
                    <td key={day.dateNumber} className="w-[48px] min-w-[48px] max-w-[54px] py-1 px-0 text-center font-extrabold text-emerald-700 dark:text-emerald-300 text-xs">
                      {cnt > 0 ? cnt : '-'}
                    </td>
                  );
                })}
                <td colSpan={6} className="py-1 px-2 text-center bg-emerald-100 dark:bg-emerald-900/50 font-extrabold text-emerald-950 dark:text-emerald-100">
                  {displayedDays.reduce((a, b) => a + dailyEpoKeluar[b.dateNumber - 1], 0)} Ampul Diberikan
                </td>
              </tr>

              {/* Row 6: Total Pasien HD Harian */}
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white divide-x divide-slate-200 dark:divide-slate-700">
                <td colSpan={6} className="py-1 px-3 text-left sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 font-semibold">
                  Total Pasien HD per Hari
                </td>
                {displayedDays.map((day) => {
                  const cnt = dailyTotal[day.dateNumber - 1];
                  return (
                    <td key={day.dateNumber} className="w-[48px] min-w-[48px] max-w-[54px] py-1 px-0 text-center font-bold text-xs">
                      {cnt > 0 ? cnt : '-'}
                    </td>
                  );
                })}
                <td colSpan={6} className="py-1 px-2 text-center bg-slate-200 dark:bg-slate-700 font-bold">
                  {filteredPatients.length} Pasien
                </td>
              </tr>
            </tfoot>

          </table>
        </div>

      {/* MENU AKSI CEPAT KLIK TOMBOL (Cukup klik tombol saja, tanpa halaman modal) */}
      {quickMenuData && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setQuickMenuData(null)} 
          />
          <div
            className="fixed z-50 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-2.5 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100 w-[320px] max-w-[95vw]"
            style={{ top: quickMenuData.y, left: quickMenuData.x }}
          >
            {/* Header Mini Info */}
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px]">
              <div className="font-bold text-slate-800 dark:text-slate-200 truncate pr-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600 inline-block shrink-0" />
                <span>{quickMenuData.patient.name.split(' ')[0]}</span>
                <span className="text-slate-400 font-normal">•</span>
                <span className="font-semibold text-rose-700 dark:text-rose-400">Tgl {quickMenuData.dateNumber} {currentMonthName}</span>
              </div>
              <button
                type="button"
                onClick={() => setQuickMenuData(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer leading-none text-xs"
              >
                ✕
              </button>
            </div>

            {/* TAMPILAN UTAMA: MENU AKSI SESI HD */}
            {quickMenuMode === 'ACTIONS' && (
              <div className="space-y-1.5">

                {/* Banner Penanda Khusus UPDATE HB */}
                {quickMenuData.info.isHbUpdateDate && (
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-[10.5px] text-rose-950 dark:text-rose-200 flex items-start gap-2 shadow-2xs">
                    <div className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">
                      🩸
                    </div>
                    <div className="flex-1 leading-snug">
                      <div className="font-bold flex items-center justify-between text-rose-800 dark:text-rose-300">
                        <span>Sesi Ada UPDATE HB</span>
                        <span className="font-mono bg-rose-600 text-white px-1.5 py-0.5 rounded text-[10px] font-black">
                          {quickMenuData.info.updatedHbValue !== undefined ? `${quickMenuData.info.updatedHbValue.toFixed(1)} g/dL` : `${quickMenuData.patient.hbValue.toFixed(1)} g/dL`}
                        </span>
                      </div>
                      <div className="text-[9.5px] text-rose-700 dark:text-rose-300/90 mt-0.5">
                        Nilai Hb telah diinputkan pada sesi ini. Seluruh terapi lanjutan telah diselaraskan dengan protokol klinis.
                      </div>
                    </div>
                  </div>
                )}

                {/* KONDISI A: SESI INI TELAH DI-RESCHEDULE KELUAR (TIDAK HD PADA TANGGAL INI) */}
                {Boolean(quickMenuData.info.rescheduledToDate) ? (
                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] text-amber-950 dark:text-amber-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                        <ArrowRightLeft className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Sesi Di-reschedule (Tukar Hari)</span>
                      </div>
                      <p className="leading-snug text-[10.5px]">
                        Sesi tgl <strong>{quickMenuData.dateNumber}</strong> dipindahkan ke tgl <strong>{quickMenuData.info.rescheduledToDate} {currentMonthName}</strong>. Pasien <strong>tidak HD</strong> pada tanggal ini.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onCancelReschedule) {
                          onCancelReschedule(quickMenuData.patient.id, quickMenuData.dateNumber);
                        } else if (onUpdateDateAction) {
                          onUpdateDateAction(quickMenuData.patient.id, quickMenuData.dateNumber, 'Belum');
                        }
                        setQuickMenuData(null);
                      }}
                      className="w-full p-2 rounded-lg text-left bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                          🔄
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">Batalkan Reschedule</div>
                          <div className="text-[10px] text-rose-100 font-medium">Kembalikan sesi ke tgl {quickMenuData.dateNumber}</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-rose-800/80 px-1.5 py-0.5 rounded text-white shrink-0">
                        Batal
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuickMenuMode('RESCHEDULE')}
                      className="w-full p-2 rounded-lg text-left bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                          <ArrowRightLeft className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">Ganti Tanggal Reschedule Lain</div>
                          <div className="text-[10px] text-amber-100 font-medium">Pilih hari pengganti yang berbeda</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-amber-800/80 px-1.5 py-0.5 rounded text-white shrink-0">
                        Ubah ➔
                      </span>
                    </button>
                  </div>
                ) : Boolean(quickMenuData.info.rescheduledFromDate) ? (
                  /* KONDISI B: SESI INI ADALAH SESI HD PENGGANTI TUKAR HARI BEBAS */
                  <div className="space-y-1.5">
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-[10.5px] text-emerald-950 dark:text-emerald-200 space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Sesi HD Pengganti (Tukar Hari Bebas)</span>
                      </div>
                      <p className="leading-snug">
                        Sesi HD ini merupakan pengganti dari tgl <strong>{quickMenuData.info.rescheduledFromDate} {currentMonthName}</strong>.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const dose = quickMenuData.info.doseIU || 2000;
                        if (onUpdateDateAction) {
                          onUpdateDateAction(
                            quickMenuData.patient.id,
                            quickMenuData.dateNumber,
                            'Diberikan',
                            'Ns. Maya',
                            `HD Pengganti dari tgl ${quickMenuData.info.rescheduledFromDate} selesai`,
                            '✅',
                            dose
                          );
                        }
                        setQuickMenuData(null);
                      }}
                      className="w-full p-2 rounded-lg text-left bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                          ✅
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">HD / Terapi Selesai Diberikan</div>
                          <div className="text-[10px] text-emerald-100 font-medium">Tandai sesi terlaksana dengan baik</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-emerald-800/80 px-1.5 py-0.5 rounded text-white shrink-0">
                        Selesai ✅
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onCancelReschedule) {
                          onCancelReschedule(quickMenuData.patient.id, quickMenuData.dateNumber);
                        } else if (onUpdateDateAction) {
                          onUpdateDateAction(quickMenuData.patient.id, quickMenuData.dateNumber, 'Belum');
                        }
                        setQuickMenuData(null);
                      }}
                      className="w-full p-2 rounded-lg text-left bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                          🔄
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">Batalkan Reschedule Ini</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Kembalikan ke tgl {quickMenuData.info.rescheduledFromDate}</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 shrink-0">Batal</span>
                    </button>
                  </div>
                ) : !quickMenuData.info.isHD ? (
                  /* KONDISI C: HARI BEBAS (BUKAN JADWAL RUTIN PASIEN) */
                  <div className="space-y-1.5">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10.5px] text-slate-700 dark:text-slate-300 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                        <span>🗓️</span>
                        <span>Hari Bebas (Bukan Jadwal HD Rutin)</span>
                      </div>
                      <p className="leading-snug text-[10px]">
                        Tanggal <strong>{quickMenuData.dateNumber} {currentMonthName}</strong> bukan hari HD reguler {quickMenuData.patient.name.split(' ')[0]}. Anda dapat menjadikannya sesi pengganti atau sesi tambahan:
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onUpdateDateAction) {
                          onUpdateDateAction(
                            quickMenuData.patient.id,
                            quickMenuData.dateNumber,
                            'Belum',
                            undefined,
                            'Sesi HD Tambahan / Tukar Hari Bebas',
                            'HD',
                            0
                          );
                        }
                        setQuickMenuData(null);
                      }}
                      className="w-full p-2 rounded-lg text-left bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                          🏥
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">Jadikan Sesi HD Rutin Pengganti</div>
                          <div className="text-[10px] text-emerald-100 font-medium">Sesi HD tanpa suntikan EPO</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-emerald-800/80 px-1.5 py-0.5 rounded text-white shrink-0">
                        HD Rutin
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onUpdateDateAction) {
                          onUpdateDateAction(
                            quickMenuData.patient.id,
                            quickMenuData.dateNumber,
                            'Belum',
                            undefined,
                            'Sesi Terjadwal EPO 2000 IU',
                            '2000',
                            2000
                          );
                        }
                        setQuickMenuData(null);
                      }}
                      className="w-full p-2 rounded-lg text-left bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                          💉
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">Jadwalkan Terapi EPO (2000 IU)</div>
                          <div className="text-[10px] text-sky-100 font-medium">Terjadwal 1 ampul EPO</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-sky-800/80 px-1.5 py-0.5 rounded text-white shrink-0">
                        2000 IU
                      </span>
                    </button>
                  </div>
                ) : (
                  /* KONDISI D: SESI HD REGULER AKTIF */
                  <>
                    {/* 1. EPO DIBERIKAN */}
                    <button
                      type="button"
                      onClick={() => {
                        const dose = quickMenuData.info.cellCode === '4000' ? 4000 : (quickMenuData.info.doseIU || 2000);
                        if (onUpdateDateAction) {
                          onUpdateDateAction(
                            quickMenuData.patient.id,
                            quickMenuData.dateNumber,
                            'Diberikan',
                            'Ns. Maya',
                            quickMenuData.info.isCatchUp 
                              ? `Pengalihan dari tgl ${quickMenuData.info.postponedFromDate || quickMenuData.info.pairedDate}` 
                              : undefined,
                            '✅',
                            dose
                          );
                        } else {
                          const weekNum = getHDSessionWeek(quickMenuData.dateNumber, monthInfo.daysInMonth);
                          onUpdateWeekStatus(quickMenuData.patient.id, `week${weekNum}` as any, 'Diberikan');
                        }
                        setQuickMenuData(null);
                      }}
                      className="w-full p-2 rounded-lg text-left bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                          ✅
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">EPO diberikan (Selesai)</div>
                          <div className="text-[10px] text-emerald-100 font-medium">Tandai injeksi selesai diberikan</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-emerald-800/80 px-1.5 py-0.5 rounded text-white shrink-0">
                        {quickMenuData.info.cellCode === '4000' ? '4000 IU' : '2000 IU'}
                      </span>
                    </button>

                    {/* 2. DITUNDA KE SESI BERIKUTNYA */}
                    {(() => {
                      const destDate = quickMenuData.info.postponedToDate || quickMenuData.info.pairedDate;
                      const isOnceWeekly = quickMenuData.patient.hdFrequency === '1 kali dalam satu minggu';
                      const isBiweekly = quickMenuData.patient.hdFrequency === '1 kali / 2 minggu';
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const defaultNote = isBiweekly
                              ? `Ditunda tgl ${quickMenuData.dateNumber}, dialihkan ke sesi HD 14 hari berikutnya tgl ${destDate || '-'}`
                              : isOnceWeekly
                              ? `Ditunda tgl ${quickMenuData.dateNumber}, dialihkan ke sesi HD berikutnya tgl ${destDate || '-'}`
                              : quickMenuData.info.isPrimary
                              ? `Ditunda di Hari Awal, dialihkan ke Hari Ke-2 tgl ${destDate || '-'}`
                              : `Ditunda di Hari Kedua, dialihkan ke sesi HD berikutnya tgl ${destDate || '-'}`;

                            if (onUpdateDateAction) {
                              onUpdateDateAction(
                                quickMenuData.patient.id,
                                quickMenuData.dateNumber,
                                'Tunda',
                                'Ns. Maya',
                                destDate ? defaultNote : 'Ditunda',
                                '❌'
                              );
                            } else {
                              const weekNum = getHDSessionWeek(quickMenuData.dateNumber, monthInfo.daysInMonth);
                              onUpdateWeekStatus(quickMenuData.patient.id, `week${weekNum}` as any, 'Tunda');
                            }
                            setQuickMenuData(null);
                          }}
                          className="w-full p-2 rounded-lg text-left bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                              ✕
                            </div>
                            <div>
                              <div className="text-xs font-bold leading-tight">Ditunda (Sesi Berikutnya)</div>
                              <div className="text-[10px] text-red-100 font-medium">
                                {destDate ? `Dialihkan ke tgl ${destDate}` : 'Dialihkan ke sesi berikutnya'}
                              </div>
                            </div>
                          </div>
                          {destDate && (
                            <span className="text-[10px] font-black bg-red-800/80 px-1.5 py-0.5 rounded text-white shrink-0">
                              ➔ {destDate}
                            </span>
                          )}
                        </button>
                      );
                    })()}

                    {/* 3. RESCHEDULE SESI (TUKAR HARI BEBAS - HANYA UBAH 1 HARI INI SAJA) */}
                    <button
                      type="button"
                      onClick={() => setQuickMenuMode('RESCHEDULE')}
                      className="w-full p-2 rounded-lg text-left bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                          <ArrowRightLeft className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">Reschedule Sesi (Tukar Hari)</div>
                          <div className="text-[10px] text-amber-100 font-medium">Pindah 1 hari ini saja, jadwal reguler aman</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-black bg-amber-800/80 px-1.5 py-0.5 rounded text-white shrink-0 flex items-center gap-0.5">
                        <span>Pilih Hari</span>
                        <span>➔</span>
                      </span>
                    </button>

                    {/* 4. UPDATE HB */}
                    <button
                      type="button"
                      onClick={() => setQuickMenuMode('UPDATE_HB')}
                      className="w-full p-2 rounded-lg text-left bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center font-bold text-xs shrink-0">
                          🩸
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">UPDATE HB</div>
                          <div className="text-[10px] text-rose-100 font-medium">Input Hb & ubah sel sesuai protokol klinis</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-rose-800/80 px-1.5 py-0.5 rounded text-white shrink-0">
                        Input Nilai
                      </span>
                    </button>

                    {/* 5. RESET KE JADWAL SEMULA */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onUpdateDateAction) {
                          onUpdateDateAction(quickMenuData.patient.id, quickMenuData.dateNumber, 'Belum');
                        } else {
                          const weekNum = getHDSessionWeek(quickMenuData.dateNumber, monthInfo.daysInMonth);
                          onUpdateWeekStatus(quickMenuData.patient.id, `week${weekNum}` as any, 'Belum');
                        }
                        setQuickMenuData(null);
                      }}
                      className="w-full p-2 rounded-lg text-left bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                          🔄
                        </div>
                        <div>
                          <div className="text-xs font-bold leading-tight">RESET</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Kembalikan sel ke jadwal semula</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 shrink-0">Default</span>
                    </button>
                  </>
                )}

                {/* Opsi Lanjutan Tambahan: Ganti Isi Sel Kustom Secara Manual */}
                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setQuickMenuMode('CUSTOM_CELL')}
                    className="text-[10px] font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 cursor-pointer flex items-center gap-1"
                  >
                    <span>✏️ Opsi Ubah Isi Sel Manual</span>
                  </button>
                  {onOpenMonthlyHbModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenMonthlyHbModal();
                        setQuickMenuData(null);
                      }}
                      className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 cursor-pointer"
                    >
                      Buka Form Semua Pasien
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* SUB-VIEW: UPDATE HB (MENGINPUTKAN NILAI HB TERBARU & MENGUBAH TAMPILAN SEL SESUAI PROTOKOL KLINIS) */}
            {quickMenuMode === 'UPDATE_HB' && (
              <div className="space-y-2 text-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <span>🩸</span>
                    <span>Update Hb Sesi Tgl {quickMenuData.dateNumber}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickMenuMode('ACTIONS')}
                    className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold cursor-pointer"
                  >
                    ← Kembali
                  </button>
                </div>

                {/* Banner Jaminan Keamanan Terapi */}
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[10px] text-emerald-900 dark:text-emerald-200 leading-snug">
                  <div className="font-bold flex items-center gap-1 mb-0.5 text-emerald-800 dark:text-emerald-300">
                    <span>🛡️</span>
                    <span>Riwayat Terapi Tetap Aman:</span>
                  </div>
                  <span>Terapi yang sudah berstatus <strong>Diberikan (✅)</strong> sebelumnya tidak akan direset atau dihapus. Tampilan sel tgl {quickMenuData.dateNumber} dan sesi ke depan otomatis menyesuaikan protokol klinis baru.</span>
                </div>

                <div className="flex items-center justify-between text-[11px] bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500">Hb Acuan Saat Ini:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                    {quickMenuData.patient.hbValue > 0 ? `${quickMenuData.patient.hbValue.toFixed(1)} g/dL` : '0.0 g/dL (Menunggu Lab)'}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                    Nilai Hb Terbaru (g/dL) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="25"
                    value={quickHbValue}
                    onChange={(e) => setQuickHbValue(e.target.value)}
                    placeholder="Contoh: 8.8"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-sm focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                    autoFocus
                  />
                </div>

                {/* LIVE PREVIEW PROTOKOL KLINIS & TAMPILAN SEL BERDASARKAN INPUT HB */}
                {(() => {
                  const val = parseFloat(quickHbValue.replace(',', '.'));
                  if (isNaN(val) || val <= 0) return null;

                  let previewTitle = '';
                  let previewCellCode = '';
                  let previewStyle = '';
                  let previewNote = '';
                  let previewSubsequent = '';

                  if (val < 5.95) {
                    previewTitle = 'Protokol 1: Transfusi 2 Bag PRC (Rawat Inap)';
                    previewCellCode = 'PRC 2';
                    previewStyle = 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200';
                    previewNote = `Sel tgl ${quickMenuData.dateNumber} berubah menjadi "PRC 2"`;
                    previewSubsequent = 'Sesi selanjutnya: HD Rutin (tanpa EPO) pemantauan Rawat Inap';
                  } else if (val >= 5.95 && val < 6.95) {
                    previewTitle = 'Protokol 2: Transfusi 1 Bag PRC';
                    previewCellCode = 'PRC 1';
                    previewStyle = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200';
                    previewNote = `Sel tgl ${quickMenuData.dateNumber} berubah menjadi "PRC 1"`;
                    previewSubsequent = 'Sesi selanjutnya: HD Rutin observasi pasca transfusi (tanpa EPO)';
                  } else if (val >= 6.95 && val < 8.95) {
                    previewTitle = 'Protokol 3: Terapi EPO Dosis Penuh (4x 2000 IU)';
                    previewCellCode = '2000';
                    previewStyle = 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/70 dark:text-blue-200';
                    previewNote = `Sel tgl ${quickMenuData.dateNumber} terjadwal EPO 2000 IU`;
                    previewSubsequent = 'Sesi selanjutnya: Terapi EPO 2000 IU mingguan pada Hari Awal HD';
                  } else if (val >= 8.95 && val <= 12.0) {
                    previewTitle = 'Protokol 4: Terapi EPO Maintenance (1x 2000 IU)';
                    previewCellCode = '2000';
                    previewStyle = 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200';
                    previewNote = `Sel tgl ${quickMenuData.dateNumber} terjadwal EPO 1x 2000 IU`;
                    previewSubsequent = 'Sesi selanjutnya: HD Rutin (Kuota maintenance 1 ampul/bln terpenuhi)';
                  } else {
                    previewTitle = 'Protokol 5: Tanpa Terapi EPO (Hb > 12.00)';
                    previewCellCode = 'Hold';
                    previewStyle = 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/70 dark:text-purple-200';
                    previewNote = `Sel tgl ${quickMenuData.dateNumber} berubah menjadi "Hold"`;
                    previewSubsequent = 'Sesi selanjutnya: Seluruh terapi EPO di-Hold (Hb > 12.00)';
                  }

                  return (
                    <div className={`p-2 rounded-lg border text-[10px] space-y-1 ${previewStyle}`}>
                      <div className="font-bold flex items-center justify-between">
                        <span>📋 Protokol Klinis Otomatis:</span>
                        <span className="font-mono font-black text-xs px-1.5 py-0.5 rounded bg-white/80 dark:bg-black/40">
                          {previewCellCode}
                        </span>
                      </div>
                      <div className="font-semibold">{previewTitle}</div>
                      <div className="text-[9.5px] opacity-90 font-medium">➔ {previewNote}</div>
                      <div className="text-[9.5px] opacity-90 font-medium">➔ {previewSubsequent}</div>
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Catatan Klinis (Opsional)
                  </label>
                  <input
                    type="text"
                    value={quickHbNotes}
                    onChange={(e) => setQuickHbNotes(e.target.value)}
                    placeholder="Misal: Cek lab pasca transfusi darah"
                    className="w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] focus:outline-hidden"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(quickHbValue.replace(',', '.'));
                    if (isNaN(parsed) || parsed < 0) return;
                    const testDate = `${selectedMonth}-${String(quickMenuData.dateNumber).padStart(2, '0')}`;
                    if (onUpdateMidMonthHb) {
                      onUpdateMidMonthHb(
                        quickMenuData.patient.id, 
                        parsed, 
                        testDate, 
                        quickHbNotes,
                        quickMenuData.dateNumber
                      );
                    }
                    setQuickMenuData(null);
                  }}
                  className="w-full py-2 px-2.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-2xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>💾 Simpan & Terapkan Protokol</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickMenuMode('ACTIONS')}
                  className="w-full py-0.5 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer text-center"
                >
                  ← Kembali ke Menu Aksi
                </button>
              </div>
            )}

            {/* SUB-VIEW: UBAH ISI SEL SECARA MANUAL (CUSTOM CHIPS) */}
            {quickMenuMode === 'CUSTOM_CELL' && (
              <div className="space-y-2 text-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <span>✏️</span>
                    <span>Ubah Isi Sel Manual</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickMenuMode('ACTIONS')}
                    className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold cursor-pointer"
                  >
                    ← Kembali
                  </button>
                </div>

                <div className="p-1 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[10px] text-blue-900 dark:text-blue-200 leading-tight">
                  Pilih isi sel pada sesi tgl <strong>{quickMenuData.dateNumber} {currentMonthName}</strong>. Terapi sesi lain tetap aman.
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Pilihan Cepat:
                  </label>
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
                    {[
                      { code: '2000', label: '2000 IU', color: 'bg-sky-100 text-sky-900 border-sky-300' },
                      { code: '4000', label: '4000 IU', color: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
                      { code: 'PRC 1', label: 'PRC 1', color: 'bg-amber-100 text-amber-900 border-amber-300' },
                      { code: 'PRC 2', label: 'PRC 2', color: 'bg-rose-100 text-rose-900 border-rose-300' },
                      { code: 'Cek', label: 'Cek Lab', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
                      { code: 'Hold', label: 'Hold', color: 'bg-purple-100 text-purple-900 border-purple-300' },
                      { code: 'HD', label: 'HD Rutin', color: 'bg-emerald-50 text-emerald-900 border-emerald-300' },
                      { code: '✅', label: '✅ Selesai', color: 'bg-emerald-600 text-white border-emerald-700' },
                      { code: '❌', label: '❌ Tunda', color: 'bg-red-600 text-white border-red-700' },
                    ].map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          setQuickCustomText(item.code);
                          if (item.code === '4000') setQuickCustomDose(4000);
                          else if (item.code === '2000') setQuickCustomDose(2000);
                          if (item.code === '✅') setQuickCustomStatus('Diberikan');
                        }}
                        className={`py-1 px-1 rounded-md border text-center transition cursor-pointer ${item.color} ${
                          quickCustomText === item.code ? 'ring-2 ring-indigo-500 font-black scale-102' : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                    Teks Kustom / Catatan
                  </label>
                  <input
                    type="text"
                    value={quickCustomText}
                    onChange={(e) => setQuickCustomText(e.target.value)}
                    placeholder="Contoh: 2000, 4000, PRC 1, dll"
                    className="w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const text = quickCustomText.trim() || '2000';
                    const dose = text === '4000' ? 4000 : quickCustomDose;
                    const isGiven = text === '✅' || quickCustomStatus === 'Diberikan';
                    if (onUpdateDateAction) {
                      onUpdateDateAction(
                        quickMenuData.patient.id,
                        quickMenuData.dateNumber,
                        isGiven ? 'Diberikan' : 'Belum',
                        'Ns. Maya',
                        quickHbNotes || undefined,
                        text,
                        dose
                      );
                    }
                    setQuickMenuData(null);
                  }}
                  className="w-full py-1.5 px-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Terapkan Isi Sel ({quickCustomText})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickMenuMode('ACTIONS')}
                  className="w-full py-0.5 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer text-center"
                >
                  ← Kembali ke Menu Utama
                </button>
              </div>
            )}

            {/* SUB-VIEW: RESCHEDULE SESI (TUKAR HARI BEBAS - HANYA UBAH 1 HARI INI SAJA) */}
            {quickMenuMode === 'RESCHEDULE' && (
              <div className="space-y-2.5 text-xs animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <ArrowRightLeft className="w-4 h-4 text-amber-600" />
                    <span>Reschedule Sesi Tgl {quickMenuData.dateNumber}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickMenuMode('ACTIONS')}
                    className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold cursor-pointer"
                  >
                    ← Kembali
                  </button>
                </div>

                {/* Banner Kepastian Klinis & SOP */}
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[10.5px] text-emerald-950 dark:text-emerald-200 leading-snug space-y-0.5">
                  <div className="font-bold flex items-center gap-1 text-emerald-800 dark:text-emerald-300">
                    <span>🛡️</span>
                    <span>Jadwal Reguler Tetap Aman:</span>
                  </div>
                  <p>
                    Reschedule <strong>hanya memindahkan sesi 1 hari ini saja</strong> (tgl {quickMenuData.dateNumber}). Jadwal reguler pasien ({quickMenuData.patient.scheduleDay} • {quickMenuData.patient.scheduleShift}) tidak akan berubah!
                  </p>
                </div>

                {/* Pilihan Cepat Offset Hari (+1, +2, -1) */}
                <div>
                  <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>Pilihan Cepat:</span>
                    <span className="text-[9px] text-slate-400 font-normal">Pilih 1 hari tujuan</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
                    {quickMenuData.dateNumber + 1 <= monthInfo.daysInMonth && (
                      <button
                        type="button"
                        onClick={() => setTargetRescheduleDate(quickMenuData.dateNumber + 1)}
                        className={`p-1.5 rounded-lg border text-center transition cursor-pointer ${
                          targetRescheduleDate === quickMenuData.dateNumber + 1
                            ? 'bg-amber-600 text-white border-amber-700 font-black ring-2 ring-amber-400 shadow-xs'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200'
                        }`}
                      >
                        <div className="text-[9px] opacity-80 leading-none">Besok (+1)</div>
                        <div className="text-xs font-black mt-0.5">Tgl {quickMenuData.dateNumber + 1}</div>
                      </button>
                    )}
                    {quickMenuData.dateNumber + 2 <= monthInfo.daysInMonth && (
                      <button
                        type="button"
                        onClick={() => setTargetRescheduleDate(quickMenuData.dateNumber + 2)}
                        className={`p-1.5 rounded-lg border text-center transition cursor-pointer ${
                          targetRescheduleDate === quickMenuData.dateNumber + 2
                            ? 'bg-amber-600 text-white border-amber-700 font-black ring-2 ring-amber-400 shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="text-[9px] opacity-80 leading-none">Lusa (+2)</div>
                        <div className="text-xs font-black mt-0.5">Tgl {quickMenuData.dateNumber + 2}</div>
                      </button>
                    )}
                    {quickMenuData.dateNumber - 1 >= 1 && (
                      <button
                        type="button"
                        onClick={() => setTargetRescheduleDate(quickMenuData.dateNumber - 1)}
                        className={`p-1.5 rounded-lg border text-center transition cursor-pointer ${
                          targetRescheduleDate === quickMenuData.dateNumber - 1
                            ? 'bg-amber-600 text-white border-amber-700 font-black ring-2 ring-amber-400 shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="text-[9px] opacity-80 leading-none">Kemarin (-1)</div>
                        <div className="text-xs font-black mt-0.5">Tgl {quickMenuData.dateNumber - 1}</div>
                      </button>
                    )}
                  </div>
                </div>

                {/* Pemilih Tanggal Kalender Mini Sebulan Penuh */}
                <div>
                  <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>Atau Pilih Dari Kalender Bulan {currentMonthName}:</span>
                    <span className="text-[9px] text-amber-700 dark:text-amber-400 font-bold">
                      Tujuan: Tgl {targetRescheduleDate}
                    </span>
                  </div>
                  
                  {/* Grid 7 Hari dalam seminggu */}
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-7 gap-1 text-[8.5px] font-bold text-center text-slate-400 mb-1">
                      <span>M</span><span>S</span><span>S</span><span>R</span><span>K</span><span>J</span><span>S</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-[10px]">
                      {(() => {
                        const firstDayOfWeek = monthInfo.days[0]?.dayOfWeek || 0;
                        const emptyPads = Array.from({ length: firstDayOfWeek });
                        return (
                          <>
                            {emptyPads.map((_, i) => (
                              <div key={`pad-${i}`} className="h-7" />
                            ))}
                            {monthInfo.days.map((d) => {
                              const isSrc = d.dateNumber === quickMenuData.dateNumber;
                              const isTarget = d.dateNumber === targetRescheduleDate;
                              const isRoutine = isDateInHDDay(
                                d.dayOfWeek,
                                quickMenuData.patient.scheduleDay,
                                quickMenuData.patient.singleDay,
                                quickMenuData.patient.hdFrequency
                              );

                              return (
                                <button
                                  key={d.dateNumber}
                                  type="button"
                                  disabled={isSrc}
                                  onClick={() => setTargetRescheduleDate(d.dateNumber)}
                                  className={`h-7 rounded-md font-bold transition flex flex-col items-center justify-center leading-none cursor-pointer relative ${
                                    isSrc
                                      ? 'bg-rose-100 text-rose-400 line-through cursor-not-allowed border border-rose-300'
                                      : isTarget
                                      ? 'bg-amber-600 text-white ring-2 ring-amber-400 font-black shadow-xs'
                                      : isRoutine
                                      ? 'bg-emerald-100/70 hover:bg-emerald-200 text-emerald-950 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200'
                                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'
                                  }`}
                                  title={
                                    isSrc
                                      ? `Tgl ${d.dateNumber} adalah tanggal asal yang di-reschedule`
                                      : `${d.dateString} (${isRoutine ? 'HD Reguler' : 'Hari Bebas'})`
                                  }
                                >
                                  <span>{d.dateNumber}</span>
                                  {!isSrc && !isRoutine && (
                                    <span className="w-1 h-1 rounded-full bg-emerald-500 mt-0.5" />
                                  )}
                                </button>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[8.5px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      <span>Titik hijau: Hari Bebas (Bukan jadwal HD rutin)</span>
                    </span>
                  </div>
                </div>

                {/* Ringkasan Dampak Tindakan */}
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[10px] space-y-1">
                  <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center justify-between">
                    <span>📋 Alur Reschedule:</span>
                    <span className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.2 rounded font-bold">
                      {quickMenuData.dateNumber} ➔ {targetRescheduleDate}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 leading-tight">
                    • Tgl <strong>{quickMenuData.dateNumber}</strong>: Ditandai <strong>→{targetRescheduleDate}</strong> (Tidak HD)
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 leading-tight">
                    • Tgl <strong>{targetRescheduleDate}</strong>: Aktif sebagai <strong>HD Pengganti ({quickMenuData.info.cellCode === '2000' || quickMenuData.info.cellCode === '4000' ? `${quickMenuData.info.cellCode} IU` : 'HD Rutin'})</strong>
                  </div>
                </div>

                {/* Catatan Reschedule (Opsional) */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                    Catatan Reschedule (Opsional):
                  </label>
                  <input
                    type="text"
                    value={rescheduleNotes}
                    onChange={(e) => setRescheduleNotes(e.target.value)}
                    placeholder={`Contoh: Pasien berhalangan tgl ${quickMenuData.dateNumber}, tukar ke tgl ${targetRescheduleDate}`}
                    className="w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-[11px] focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                {/* Tombol Konfirmasi Reschedule */}
                <button
                  type="button"
                  disabled={targetRescheduleDate === quickMenuData.dateNumber}
                  onClick={() => {
                    if (targetRescheduleDate === quickMenuData.dateNumber) return;
                    if (onRescheduleDate) {
                      onRescheduleDate(
                        quickMenuData.patient.id,
                        quickMenuData.dateNumber,
                        targetRescheduleDate,
                        rescheduleNotes.trim() || undefined
                      );
                    }
                    setQuickMenuData(null);
                  }}
                  className="w-full py-2 px-3 rounded-lg text-xs font-black bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Konfirmasi Reschedule ke Tgl {targetRescheduleDate}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickMenuMode('ACTIONS')}
                  className="w-full py-0.5 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer text-center"
                >
                  ← Kembali ke Menu Utama
                </button>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
};
