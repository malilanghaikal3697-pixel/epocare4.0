import React, { useState, useEffect } from 'react';
import { 
  X, 
  FlaskConical, 
  Search, 
  Calendar, 
  Check, 
  CheckCircle2, 
  Filter, 
  Sparkles, 
  Save, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  FileSpreadsheet, 
  Download, 
  Share2, 
  CalendarDays, 
  TableProperties,
  Users
} from 'lucide-react';
import { 
  PatientRecord, 
  HDDaySchedule, 
  HDShift, 
  LabTestType, 
  LabScheduleStatus, 
  LabScheduleScope,
  LabSchedule,
  isSelectiveHbCandidate
} from '../types/dialysis';
import { 
  getFirstHDDateOfMonth, 
  buildNextMonthLabScheduleTable, 
  buildNextMonthCalendarMatrix, 
  getNextYearMonth,
  getActiveHDDaySchedule,
  getTodayDayName
} from '../services/googleSheets';
import { exportToExcel } from '../services/excelExport';

interface LabScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: PatientRecord[];
  selectedMonth: string;
  onMonthChange?: (month: string) => void;
  onSaveLabSchedules: (
    updatedSchedules: { 
      id: string; 
      labSchedule: LabSchedule; 
      hbDate?: string;
      prevHbValue?: number;
      isSelectiveHb?: boolean;
    }[],
    scope?: LabScheduleScope,
    targetMonth?: string
  ) => void;
  onSyncToSheets?: (scope?: LabScheduleScope) => void;
  isSyncing?: boolean;
}

const LAB_TEST_OPTIONS: LabTestType[] = [
  'Rutin Hb (Evaluasi EPO)',
];

const LAB_STATUS_OPTIONS: LabScheduleStatus[] = ['Terjadwal', 'Tidak Ada Jadwal', 'Selesai', 'Ditunda'];

export const LabScheduleModal: React.FC<LabScheduleModalProps> = ({
  isOpen,
  onClose,
  patients,
  selectedMonth,
  onMonthChange,
  onSaveLabSchedules,
  onSyncToSheets,
  isSyncing = false,
}) => {
  // Pilihan Bulan Aktif di dalam Modal
  const [activeMonth, setActiveMonth] = useState<string>(selectedMonth);
  // View Mode: 'editor' | 'table_preview' | 'matrix_preview'
  const [viewMode, setViewMode] = useState<'editor' | 'table_preview' | 'matrix_preview'>('editor');

  useEffect(() => {
    setActiveMonth(selectedMonth);
  }, [selectedMonth]);

  // Jadwal HD Aktif Hari Ini (Otomatis deteksi real-time)
  const todayActiveSchedule = getActiveHDDaySchedule();
  const todayDayName = getTodayDayName();

  // Local state form per patient ID
  const [scheduleData, setScheduleData] = useState<Record<string, LabSchedule>>({});
  const [prevHbMap, setPrevHbMap] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  // Otomatis menampilkan Hari aktif saat dibuka
  const [scheduleFilter, setScheduleFilter] = useState<string>(() => getActiveHDDaySchedule());
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'SELECTIVE_HB' | 'ROUTINE'>('ALL');

  // Format dan Navigasi Bulan di Header Modal
  const [yearStr, monthStr] = (activeMonth || '2026-09').split('-');
  const currentYear = parseInt(yearStr, 10) || new Date().getFullYear();
  const currentMonthNum = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

  const monthDate = new Date(currentYear, currentMonthNum - 1, 1);
  const monthLabel = monthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const now = new Date();
  const realCurrentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const realCurrentDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const realCurrentDateFormatted = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const isCurrentRealMonth = activeMonth === realCurrentMonthStr;

  const formatDateIndo = (dateStr?: string): string => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!y || !m || !d) return dateStr;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleMonthChange = (newMonth: string) => {
    if (!newMonth) return;
    setActiveMonth(newMonth);
    if (onMonthChange) {
      onMonthChange(newMonth);
    }
  };

  const handlePrevMonth = () => {
    const prev = new Date(currentYear, currentMonthNum - 2, 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    handleMonthChange(prevStr);
  };

  const handleNextMonth = () => {
    const next = new Date(currentYear, currentMonthNum, 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    handleMonthChange(nextStr);
  };

  const handleCurrentMonth = () => {
    handleMonthChange(realCurrentMonthStr);
  };

  // Cakupan Mode Penjadwalan Lab: 'PILIHAN' (Hb < 9.0) atau 'SELURUH' (Semua Pasien)
  const [scheduleScope, setScheduleScope] = useState<LabScheduleScope>(() => {
    try {
      const stored = localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH' || stored === 'PILIHAN') return stored;
    } catch (e) {}
    return 'PILIHAN';
  });

  // Initialize data on modal open or month change
  useEffect(() => {
    if (isOpen) {
      // Selalu otomatis tampilkan jadwal hari aktif saat modal dibuka
      setScheduleFilter(getActiveHDDaySchedule());

      let currentScope: LabScheduleScope = 'PILIHAN';
      try {
        const stored = localStorage.getItem('epocare_lab_schedule_mode');
        if (stored === 'SELURUH' || stored === 'PILIHAN') {
          currentScope = stored;
        } else {
          const hasScheduledHigh = patients.some(
            (p) => p.labSchedule?.status === 'Terjadwal' && !isSelectiveHbCandidate(p)
          );
          currentScope = hasScheduledHigh ? 'SELURUH' : 'PILIHAN';
        }
      } catch (e) {}
      setScheduleScope(currentScope);

      const initial: Record<string, LabSchedule> = {};
      const initialPrev: Record<string, string> = {};
      const targetScheduleMonth = getNextYearMonth(activeMonth);

      patients.forEach((p) => {
        const firstHDDateNextMonth = getFirstHDDateOfMonth(targetScheduleMonth, p.scheduleDay, p.singleDay, p.hdFrequency, p.lastHdDate).dateString;
        
        // Cek kandidat Cek Hb Pilihan: Hb acuan < 9.0 atau flag
        const isCandidate = isSelectiveHbCandidate(p);
        const defaultTest: LabTestType = isCandidate ? 'Cek Hb Pilihan (Hb ≤ 8.9)' : 'Rutin Hb (Evaluasi EPO)';

        // Inisialisasi nilai Hb acuan (terakhir dari bulan berjalan)
        const prevHbVal = p.hbValue > 0 
          ? String(p.hbValue) 
          : (p.prevHbValue !== undefined ? String(p.prevHbValue) : '');
        initialPrev[p.id] = prevHbVal;

        let scheduledDate = p.labSchedule?.scheduledDate;
        let existingStatus = p.labSchedule?.status;

        // Tentukan status default berdasarkan mode aktif
        if (!existingStatus) {
          if (currentScope === 'PILIHAN') {
            existingStatus = isCandidate ? 'Terjadwal' : 'Tidak Ada Jadwal';
          } else {
            existingStatus = 'Terjadwal';
          }
        }

        if (existingStatus === 'Tidak Ada Jadwal') {
          scheduledDate = '';
        } else {
          // Otomatis selalu sesuaikan dengan jadwal HD rutin sesi pertama bulan selanjutnya
          scheduledDate = firstHDDateNextMonth;
        }

        let existingTest = p.labSchedule?.testType;
        if (!isCandidate && existingTest && existingTest.includes('Pilihan')) {
          existingTest = 'Rutin Hb (Evaluasi EPO)';
        }

        initial[p.id] = {
          scheduledDate,
          testType: existingTest || defaultTest,
          status: existingStatus,
          notes: p.labSchedule?.notes || (isCandidate ? '⭐ Cek Hb Pilihan: Evaluasi anemia (Hb acuan < 9.0 g/dL)' : ''),
          isSelectiveHb: isCandidate,
          selectiveReason: isCandidate ? 'Nilai Hb acuan < 9.0 mg/dL' : undefined,
        };
      });

      setScheduleData(initial);
      setPrevHbMap(initialPrev);
    }
  }, [isOpen, patients, activeMonth]);

  if (!isOpen) return null;

  const handleFieldChange = (id: string, field: keyof LabSchedule, value: any) => {
    setScheduleData((prev) => {
      const current = prev[id] || ({} as LabSchedule);
      const isSelective = field === 'testType' 
        ? String(value).includes('Pilihan')
        : current.isSelectiveHb;

      return {
        ...prev,
        [id]: {
          ...current,
          [field]: value,
          isSelectiveHb: isSelective,
        },
      };
    });
  };

  const handlePrevHbChange = (id: string, value: string) => {
    setPrevHbMap((prev) => ({ ...prev, [id]: value }));
    const parsed = parseFloat(value.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      const rounded = Number(parsed.toFixed(1));
      if (rounded < 9.0) {
        handleFieldChange(id, 'testType', 'Cek Hb Pilihan (Hb ≤ 8.9)');
        handleFieldChange(id, 'isSelectiveHb', true);
      } else {
        handleFieldChange(id, 'testType', 'Rutin Hb (Evaluasi EPO)');
        handleFieldChange(id, 'isSelectiveHb', false);
      }
    }
  };

  const handleSetToFirstHD = (patient: PatientRecord) => {
    const targetScheduleMonth = getNextYearMonth(activeMonth);
    const firstDate = getFirstHDDateOfMonth(targetScheduleMonth, patient.scheduleDay, patient.singleDay, patient.hdFrequency, patient.lastHdDate).dateString;
    handleFieldChange(patient.id, 'scheduledDate', firstDate);
  };

  // Helper evaluasi kandidat Cek Hb Pilihan dinamis
  const isCandidatePatient = (p: PatientRecord): boolean => {
    return isSelectiveHbCandidate(p, prevHbMap);
  };

  const selectiveCandidatePatients = patients.filter(isCandidatePatient);

  // Filtered patients list
  const filteredPatients = patients.filter((p) => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.noRm.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSchedule = scheduleFilter === 'ALL' || p.scheduleDay === scheduleFilter;
    const matchesShift = shiftFilter === 'ALL' || p.scheduleShift === shiftFilter;

    const currentSched = scheduleData[p.id];
    let matchesStatus = true;
    if (statusFilter !== 'ALL') {
      matchesStatus = currentSched?.status === statusFilter;
    }

    let matchesCategory = true;
    if (categoryFilter === 'SELECTIVE_HB') {
      matchesCategory = isCandidatePatient(p);
    } else if (categoryFilter === 'ROUTINE') {
      matchesCategory = !isCandidatePatient(p);
    }

    return matchesSearch && matchesSchedule && matchesShift && matchesStatus && matchesCategory;
  });

  // 1. Jadwalkan Cek HB Pilihan (Khusus Pasien dengan Hb Bulan Sebelumnya < 9,0 mg/dl)
  const handleSelectScopePilihan = () => {
    const targetScheduleMonth = getNextYearMonth(activeMonth);
    setScheduleScope('PILIHAN');
    try {
      localStorage.setItem('epocare_lab_schedule_mode', 'PILIHAN');
      localStorage.setItem('epocare_lab_schedule_mode_' + targetScheduleMonth, 'PILIHAN');
    } catch (e) {}

    const updated = { ...scheduleData };

    patients.forEach((p) => {
      const isCand = isCandidatePatient(p);
      const rawPrev = prevHbMap[p.id];
      const prevVal = rawPrev ? rawPrev : (p.hbValue > 0 ? p.hbValue.toFixed(1) : (p.prevHbValue ? p.prevHbValue.toFixed(1) : undefined));

      if (isCand) {
        // Pasien Hb < 9.0: Dijadwalkan pada sesi HD pertama bulan depan
        const firstDate = getFirstHDDateOfMonth(targetScheduleMonth, p.scheduleDay, p.singleDay, p.hdFrequency, p.lastHdDate).dateString;
        updated[p.id] = {
          ...(updated[p.id] || {}),
          scheduledDate: firstDate,
          testType: 'Rutin Hb (Evaluasi EPO)',
          status: 'Terjadwal',
          notes: `⭐ Cek Hb Pilihan: Evaluasi anemia (Hb acuan ${prevVal || '< 9.0'} g/dL)`,
          isSelectiveHb: true,
          selectiveReason: `Nilai Hb acuan < 9.0 mg/dL (${prevVal || '< 9.0'})`,
        };
      } else {
        // Pasien Hb >= 9.0: Tidak dijadwalkan
        updated[p.id] = {
          ...(updated[p.id] || {}),
          scheduledDate: '',
          testType: 'Rutin Hb (Evaluasi EPO)',
          status: 'Tidak Ada Jadwal',
          notes: `Tidak dijadwalkan Cek Hb bulan depan (Hb acuan ${prevVal || '≥ 9.0'} g/dL)`,
          isSelectiveHb: false,
          selectiveReason: undefined,
        };
      }
    });

    setScheduleData(updated);
    setCategoryFilter('ALL');
  };

  // 2. Jadwalkan Cek HB Seluruh Pasien (Seluruh Pasien Hemodialisa)
  const handleSelectScopeSeluruh = () => {
    const targetScheduleMonth = getNextYearMonth(activeMonth);
    setScheduleScope('SELURUH');
    try {
      localStorage.setItem('epocare_lab_schedule_mode', 'SELURUH');
      localStorage.setItem('epocare_lab_schedule_mode_' + targetScheduleMonth, 'SELURUH');
    } catch (e) {}

    const updated = { ...scheduleData };

    patients.forEach((p) => {
      const isCand = isCandidatePatient(p);
      const rawPrev = prevHbMap[p.id];
      const prevVal = rawPrev ? rawPrev : (p.hbValue > 0 ? p.hbValue.toFixed(1) : (p.prevHbValue ? p.prevHbValue.toFixed(1) : undefined));
      const firstDate = getFirstHDDateOfMonth(targetScheduleMonth, p.scheduleDay, p.singleDay, p.hdFrequency, p.lastHdDate).dateString;

      updated[p.id] = {
        ...(updated[p.id] || {}),
        scheduledDate: firstDate,
        testType: 'Rutin Hb (Evaluasi EPO)',
        status: 'Terjadwal',
        notes: isCand 
          ? `⭐ Cek Hb Pilihan: Evaluasi anemia (Hb acuan ${prevVal || '< 9.0'} g/dL)`
          : `Evaluasi rutin awal bulan`,
        isSelectiveHb: isCand,
        selectiveReason: isCand ? `Nilai Hb acuan < 9.0 mg/dL (${prevVal || '< 9.0'})` : undefined,
      };
    });

    setScheduleData(updated);
    setCategoryFilter('ALL');
  };

  // Simpan semua perubahan penjadwalan bulan selanjutnya
  const handleSave = () => {
    const targetScheduleMonth = getNextYearMonth(activeMonth);
    const updates = Object.entries(scheduleData).map(([id, labSchedule]) => {
      const patientObj = patients.find((p) => p.id === id);
      const rawPrev = prevHbMap[id];
      const parsedPrev = rawPrev ? parseFloat(rawPrev.replace(',', '.')) : undefined;
      const finalPrev = parsedPrev !== undefined && !isNaN(parsedPrev) && parsedPrev > 0 ? parsedPrev : patientObj?.prevHbValue;
      
      const isSelective = (finalPrev !== undefined && Number(finalPrev.toFixed(1)) < 9.0) ||
        (finalPrev === undefined && patientObj ? isCandidatePatient(patientObj) : false);

      const effectiveTestType: LabTestType = 'Rutin Hb (Evaluasi EPO)';

      return {
        id,
        labSchedule: {
          ...labSchedule,
          testType: effectiveTestType,
          isSelectiveHb: isSelective,
          selectiveReason: isSelective ? 'Nilai Hb acuan < 9.0 mg/dL' : undefined,
        },
        prevHbValue: finalPrev,
        isSelectiveHb: isSelective,
      };
    });

    try {
      localStorage.setItem('epocare_lab_schedule_mode', scheduleScope);
      localStorage.setItem('epocare_lab_schedule_mode_' + targetScheduleMonth, scheduleScope);
    } catch (e) {}

    onSaveLabSchedules(updates, scheduleScope, targetScheduleMonth);
    onClose();
  };

  const countScheduled = Object.values(scheduleData).filter((s) => s.status === 'Terjadwal').length;
  const countDone = Object.values(scheduleData).filter((s) => s.status === 'Selesai').length;
  const countSelective = Object.values(scheduleData).filter((s) => (s.testType.includes('Pilihan') || s.isSelectiveHb) && s.status === 'Terjadwal').length;

  // Daftar pasien terkini dengan perubahan jadwal yang sedang aktif di modal
  const updatedPatientsForPreview = patients.map((p) => {
    const isPilihan = isCandidatePatient(p);
    const sched = scheduleData[p.id];
    const rawPrev = prevHbMap[p.id];
    const parsedPrev = rawPrev ? parseFloat(rawPrev.replace(',', '.')) : undefined;
    const finalPrev = parsedPrev !== undefined && !isNaN(parsedPrev) && parsedPrev > 0 ? parsedPrev : p.prevHbValue;

    let testType = isPilihan ? 'Cek Hb Pilihan (Hb ≤ 8.9)' : 'Rutin Hb (Evaluasi EPO)';
    if (!isPilihan && sched?.testType && !sched.testType.includes('Pilihan')) {
      testType = sched.testType;
    }

    return {
      ...p,
      prevHbValue: finalPrev,
      isSelectiveHb: isPilihan,
      labSchedule: sched ? {
        ...sched,
        testType: testType as LabTestType,
        isSelectiveHb: isPilihan,
        selectiveReason: isPilihan ? `Nilai Hb sebelumnya ${finalPrev ? finalPrev.toFixed(1) : '< 9.0'} mg/dL` : undefined,
      } : p.labSchedule,
    };
  });

  const nextMonthCode = getNextYearMonth(activeMonth);
  const [nY, nM] = nextMonthCode.split('-');
  const nextMonthDate = new Date(parseInt(nY, 10), parseInt(nM, 10) - 1, 1);
  const nextMonthName = nextMonthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // Data Tabel JADWAL_CEK_HB dan MATRIKS_CEK_HB sesuai scope aktif
  const labScheduleRows = buildNextMonthLabScheduleTable(updatedPatientsForPreview, activeMonth, scheduleScope);
  const labMatrixRows = buildNextMonthCalendarMatrix(updatedPatientsForPreview, activeMonth, scheduleScope);

  const handleDownloadExcel = () => {
    exportToExcel(updatedPatientsForPreview, {
      period: activeMonth,
      targetSchedule: 'ALL',
      includeSummaryTab: true,
    });
  };

  const handleSaveAndSync = () => {
    handleSave();
    if (onSyncToSheets) {
      setTimeout(() => {
        onSyncToSheets(scheduleScope);
      }, 150);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-6xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[94vh]">
        
        {/* Header Modal */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-700/80 border border-indigo-400/40 text-white flex items-center justify-center shadow-xs shrink-0">
              <CalendarDays className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                  Penjadwalan Cek HB Bulan Selanjutnya
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>Target: {nextMonthName}</span>
                </span>
              </div>
              <p className="text-[11px] text-indigo-200/80 mt-0.5">
                Rencana tanggal sampling darah Cek Hb bulan selanjutnya & otomatisasi pasien Cek Hb Pilihan (≤ 8.9 mg/dL)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pemilihan Periode Bulan di Header Modal */}
            <div className="flex items-center gap-1 bg-white/10 hover:bg-white/15 border border-rose-400/30 rounded-lg p-0.5 shadow-2xs backdrop-blur-xs text-xs text-white">
              <span className="text-[11px] font-semibold text-rose-200 pl-1.5 hidden sm:inline flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-rose-300" />
                <span>Pilih Bulan:</span>
              </span>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="w-6 h-7 flex items-center justify-center text-rose-200 hover:text-white hover:bg-white/10 rounded transition cursor-pointer"
                title="Pindah ke bulan sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="relative flex items-center px-1.5 py-0.5">
                <span className="text-xs font-bold text-white whitespace-nowrap cursor-pointer">
                  {monthLabel}
                </span>
                <input
                  type="month"
                  value={activeMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full [color-scheme:dark]"
                  title="Klik untuk memilih bulan & tahun"
                />
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="w-6 h-7 flex items-center justify-center text-rose-200 hover:text-white hover:bg-white/10 rounded transition cursor-pointer"
                title="Pindah ke bulan berikutnya"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {!isCurrentRealMonth && (
              <button
                type="button"
                onClick={handleCurrentMonth}
                className="px-2 h-7.5 rounded-lg text-[11px] font-bold text-rose-100 bg-rose-700/80 hover:bg-rose-600 border border-rose-400/40 transition cursor-pointer shrink-0 shadow-2xs"
                title="Kembali ke bulan berjalan"
              >
                Bulan Ini
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-rose-200/70 hover:text-white hover:bg-white/10 transition cursor-pointer ml-1"
              aria-label="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Switcher & Action Bar (Clean Minimalist Bar) */}
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-850 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 p-0.5 bg-slate-200 dark:bg-slate-800 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('editor')}
              className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'editor'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <TableProperties className="w-3.5 h-3.5 text-rose-600" />
              <span>Jadwal Sampling ({patients.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix_preview')}
              className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'matrix_preview'
                  ? 'bg-rose-700 text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 text-rose-200" />
              <span>Matriks 6 Hari</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="h-7.5 px-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              title="Unduh jadwal Cek Hb dalam format Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Excel</span>
            </button>
            {onSyncToSheets && (
              <button
                type="button"
                onClick={handleSaveAndSync}
                disabled={isSyncing}
                className="h-7.5 px-3 rounded-lg text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Simpan dan sinkronisasikan lembar MATRIK CEK HB ke Google Sheets"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{isSyncing ? 'Menyinkronkan...' : 'Kirim ke Google Sheets'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Banner Pemilihan Mode: 1. Cek HB Pilihan vs 2. Cek HB Seluruh Pasien */}
        <div className="px-4 py-2.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-indigo-800/40 text-white shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/60 border border-indigo-400/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">
                    Mode Penjadwalan Cek HB ({nextMonthName}):
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                    scheduleScope === 'PILIHAN'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40'
                  }`}>
                    {scheduleScope === 'PILIHAN' 
                      ? `⭐ Cek HB Pilihan Aktif (${countSelective} Pasien Terjadwal)` 
                      : `👥 Cek HB Seluruh Pasien Aktif (${countScheduled} Pasien Terjadwal)`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300/90 mt-0.5">
                  {scheduleScope === 'PILIHAN'
                    ? 'Hanya menjadwalkan pasien yang Hb bulan sebelumnya < 9,0 mg/dl pada sesi HD pertama bulan depan. Matrik Cek HB di Google Sheet hanya memunculkan pasien-pasien ini.'
                    : 'Menjadwalkan seluruh pasien HD pada sesi HD pertama bulan depan untuk masing-masing pasien.'}
                </p>
              </div>
            </div>

            {/* Dua Tombol Pilihan Mode Sesuai Permintaan */}
            <div className="flex items-center gap-2 self-stretch lg:self-auto">
              <button
                type="button"
                onClick={handleSelectScopePilihan}
                className={`flex-1 lg:flex-initial px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs border ${
                  scheduleScope === 'PILIHAN'
                    ? 'bg-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-400/40 font-extrabold shadow-md'
                    : 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/10'
                }`}
                title="Hanya menjadwalkan pasien dengan Hb bulan sebelumnya < 9,0 mg/dl pada sesi HD pertama bulan depan"
              >
                <Sparkles className={`w-3.5 h-3.5 ${scheduleScope === 'PILIHAN' ? 'text-slate-950' : 'text-amber-300'}`} />
                <span>1. Cek HB Pilihan (Hb &lt; 9,0)</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                  scheduleScope === 'PILIHAN' ? 'bg-black/20 text-slate-950' : 'bg-amber-500/20 text-amber-200'
                }`}>
                  {selectiveCandidatePatients.length}
                </span>
                {scheduleScope === 'PILIHAN' && <Check className="w-3.5 h-3.5 text-slate-950 ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={handleSelectScopeSeluruh}
                className={`flex-1 lg:flex-initial px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs border ${
                  scheduleScope === 'SELURUH'
                    ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/40 font-extrabold shadow-md'
                    : 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/10'
                }`}
                title="Menjadwalkan seluruh pasien HD pada sesi HD pertama bulan depan untuk masing-masing pasien"
              >
                <Users className={`w-3.5 h-3.5 ${scheduleScope === 'SELURUH' ? 'text-white' : 'text-indigo-300'}`} />
                <span>2. Cek HB Seluruh Pasien</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                  scheduleScope === 'SELURUH' ? 'bg-black/20 text-white' : 'bg-indigo-500/20 text-indigo-200'
                }`}>
                  {patients.length}
                </span>
                {scheduleScope === 'SELURUH' && <Check className="w-3.5 h-3.5 text-white ml-0.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar & Filters (Compact Single Bar) */}
        <div className="p-2.5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {/* Search */}
            <div className="relative min-w-[150px] max-w-[220px] flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari pasien / RM..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-7.5 pl-8 pr-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Filter Jadwal (Otomatis Hari Aktif) */}
            <select
              value={scheduleFilter}
              onChange={(e) => setScheduleFilter(e.target.value)}
              className="h-7.5 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold focus:outline-hidden cursor-pointer"
            >
              <option value="Senin - Kamis">
                Senin - Kamis {todayActiveSchedule === 'Senin - Kamis' ? `⭐ (Aktif Hari Ini - ${todayDayName})` : ''}
              </option>
              <option value="Selasa - Jumat">
                Selasa - Jumat {todayActiveSchedule === 'Selasa - Jumat' ? `⭐ (Aktif Hari Ini - ${todayDayName})` : ''}
              </option>
              <option value="Rabu - Sabtu">
                Rabu - Sabtu {todayActiveSchedule === 'Rabu - Sabtu' ? `⭐ (Aktif Hari Ini - ${todayDayName})` : ''}
              </option>
              <option value="ALL">Semua Jadwal HD</option>
            </select>

            {/* Filter Shift */}
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="h-7.5 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] focus:outline-hidden"
            >
              <option value="ALL">Semua Shift</option>
              <option value="Shift 1 (Pagi)">Shift 1 (Pagi)</option>
              <option value="Shift 2 (Siang)">Shift 2 (Siang)</option>
            </select>
          </div>
        </div>

        {/* Tabel Pasien & Input Jadwal Manual atau Pratinjau Tabel/Matriks */}
        {viewMode === 'matrix_preview' ? (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs bg-white dark:bg-slate-900">
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-blue-950 dark:text-blue-200">
                      Pratinjau Lembar MATRIKS_CEK_HB ({nextMonthName})
                    </h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      scheduleScope === 'PILIHAN'
                        ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200'
                        : 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-200'
                    }`}>
                      {scheduleScope === 'PILIHAN' ? '⭐ Mode Cek HB Pilihan (Hb < 9.0)' : '👥 Mode Cek HB Seluruh Pasien'}
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-800 dark:text-blue-300 mt-0.5">
                    {scheduleScope === 'PILIHAN'
                      ? 'Hanya menjadwalkan dan memunculkan pasien dengan Hb bulan sebelumnya < 9,0 mg/dl pada sesi HD pertama bulan depan.'
                      : 'Menjadwalkan dan memunculkan seluruh pasien hemodialisa pada sesi HD pertama bulan depan.'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                    {labMatrixRows[0]?.length || 6} Kolom Hari
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#1c4587] text-white">
                      {labMatrixRows[0]?.map((col, idx) => (
                        <th key={idx} className="py-2.5 px-3 text-center font-bold border border-blue-900 min-w-[210px]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {labMatrixRows.slice(1).map((row, rIdx) => {
                      const isShift1 = row[0]?.includes('SHIFT 1');
                      const isShift2 = row[0]?.includes('SHIFT 2');
                      if (isShift1 || isShift2) {
                        return (
                          <tr 
                            key={rIdx} 
                            className={
                              isShift1 
                                ? 'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 font-bold' 
                                : 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-bold'
                            }
                          >
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="py-2 px-3 text-center border border-slate-300 dark:border-slate-700">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        );
                      }
                      return (
                        <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 divide-x divide-slate-200 dark:divide-slate-800">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="py-1.5 px-3 border border-slate-200 dark:border-slate-800 align-top">
                              {cell ? (
                                <span className="text-slate-800 dark:text-slate-200 font-medium">
                                  {cell}
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700 italic">-</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : viewMode === 'table_preview' ? (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs bg-white dark:bg-slate-900">
              <div className="p-3 bg-purple-50/70 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-900 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-purple-950 dark:text-purple-200">
                    Pratinjau Lembar JADWAL_CEK_HB (14 Kolom)
                  </h4>
                  <p className="text-[11px] text-purple-800 dark:text-purple-300">
                    Daftar lengkap registrasi sampling lab untuk Google Sheets.
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                  {labScheduleRows.length - 1} Pasien
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="bg-[#1c4587] text-white sticky top-0 z-10">
                    <tr>
                      {labScheduleRows[0]?.map((hdr, hIdx) => (
                        <th key={hIdx} className="py-2 px-2.5 text-center font-bold border border-blue-900 whitespace-nowrap">
                          {hdr}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {labScheduleRows.slice(1).map((row, rIdx) => {
                      const isPilihan = row.some((cell) => typeof cell === 'string' && cell.includes('⭐'));
                      return (
                        <tr key={rIdx} className={isPilihan ? 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className={`py-1.5 px-2 border border-slate-200 dark:border-slate-800 whitespace-nowrap ${cIdx === 0 || cIdx === 1 || cIdx === 2 || cIdx === 3 || cIdx === 7 || cIdx === 8 || cIdx === 11 || cIdx === 12 ? 'text-center' : ''}`}>
                              {cIdx === 8 && parseFloat(cell) > 0 ? (
                                <span className={parseFloat(cell) < 9.0 ? 'font-bold text-red-600 bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded' : 'font-semibold'}>
                                  {cell}
                                </span>
                              ) : (
                                cell || '-'
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
          {filteredPatients.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-40 text-purple-500" />
              <p className="font-semibold text-sm">Tidak ada data pasien yang sesuai kriteria pencarian / filter.</p>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-2 text-center w-10">No</th>
                    <th className="py-2.5 px-3 min-w-[170px]">Pasien & No. RM</th>
                    <th className="py-2.5 px-2 text-center w-32">Acuan Hb Terakhir (g/dL)</th>
                    <th className="py-2.5 px-2 text-center min-w-[110px]">Jadwal Rutin HD</th>
                    <th className="py-2.5 px-2.5 min-w-[190px]">Tgl Rencana Sampling ({nextMonthName})</th>
                    <th className="py-2.5 px-2.5 min-w-[170px]">Jenis Pemeriksaan Lab</th>
                    <th className="py-2.5 px-2 text-center w-32">Status Jadwal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                  {filteredPatients.map((patient, idx) => {
                    const sched = scheduleData[patient.id] || {
                      scheduledDate: patient.hbDate || '',
                      testType: 'Rutin Hb (Evaluasi EPO)',
                      status: 'Terjadwal',
                      notes: '',
                    };

                    const prevHbStr = prevHbMap[patient.id] ?? '';
                    const parsedPrev = parseFloat(prevHbStr.replace(',', '.'));
                    const hasAnemiaPrev = !isNaN(parsedPrev) && parsedPrev > 0 && Number(parsedPrev.toFixed(1)) <= 8.9;
                    const isSelective = hasAnemiaPrev || isCandidatePatient(patient);

                    return (
                      <tr 
                        key={`${patient.id || patient.noRm}-${idx + 1}`} 
                        className={`transition ${
                          isSelective
                            ? 'bg-amber-50/50 hover:bg-amber-100/60 dark:bg-amber-950/20 dark:hover:bg-amber-950/30'
                            : sched.status === 'Selesai'
                            ? 'bg-emerald-50/20 hover:bg-purple-50/30 dark:bg-emerald-950/10'
                            : 'hover:bg-purple-50/40 dark:hover:bg-purple-950/20'
                        }`}
                      >
                        {/* No */}
                        <td className="py-2 px-2 text-center font-mono text-slate-400 text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Pasien Info */}
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-1.5 flex-wrap">
                            <span>{patient.name}</span>
                            {isSelective && (
                              <span 
                                className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-700 flex items-center gap-0.5"
                                title="Pasien masuk kategori Cek Hb Pilihan karena nilai Hb acuan ≤ 8.9 mg/dL"
                              >
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>Cek Hb Pilihan</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                            <span className="font-semibold text-rose-700 dark:text-rose-400">{patient.noRm}</span>
                            <span>•</span>
                            <span>Sesi: {patient.scheduleDay}</span>
                          </div>
                        </td>

                        {/* Nilai Hb Acuan (Terakhir) */}
                        <td className="py-2 px-2 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`px-2 py-0.5 rounded-md font-bold font-mono text-xs ${
                              hasAnemiaPrev
                                ? 'bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                                : parsedPrev > 0
                                ? 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                                : 'bg-slate-50 text-slate-400 italic'
                            }`}>
                              {parsedPrev > 0 ? `${parsedPrev.toFixed(1)} g/dL` : 'Belum Ada'}
                            </span>
                            {hasAnemiaPrev ? (
                              <span className="text-[8.5px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-0.5 leading-none">
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>≤ 8.9 (Pilihan)</span>
                              </span>
                            ) : (
                              <span className="text-[8.5px] text-slate-500 dark:text-slate-400">
                                {parsedPrev >= 9.0 ? '≥ 9.0 (Rutin)' : 'Hasil Belum Diinput'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Jadwal HD */}
                        <td className="py-2 px-2 text-center">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">
                            {patient.scheduleDay}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {patient.scheduleShift.includes('Pagi') ? 'Pagi (07:00)' : 'Siang (12:30)'}
                          </span>
                        </td>

                        {/* Tanggal Rencana Cek Hb */}
                        <td className="py-2 px-2.5">
                          {(() => {
                            const targetScheduleMonth = getNextYearMonth(activeMonth);
                            const routineDate = getFirstHDDateOfMonth(
                              targetScheduleMonth, 
                              patient.scheduleDay, 
                              patient.singleDay, 
                              patient.hdFrequency,
                              patient.lastHdDate
                            ).dateString;
                            const effectiveDate = sched.scheduledDate || routineDate;

                            return (
                              <div className="space-y-1">
                                <input
                                  type="date"
                                  value={effectiveDate}
                                  onChange={(e) => handleFieldChange(patient.id, 'scheduledDate', e.target.value)}
                                  className="h-8 w-full px-2 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200 text-xs font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-hidden"
                                />
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold truncate flex items-center gap-0.5" title={`Otomatis sesuai jadwal rutin sesi 1 HD bulan selanjutnya (${patient.scheduleDay})`}>
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                    <span>Jadwal Rutin HD ({formatDateIndo(routineDate)})</span>
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* Jenis Pemeriksaan Lab */}
                        <td className="py-2 px-2.5">
                          <select
                            value="Rutin Hb (Evaluasi EPO)"
                            onChange={(e) => handleFieldChange(patient.id, 'testType', e.target.value as LabTestType)}
                            className="h-8 w-full px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:outline-hidden"
                          >
                            <option value="Rutin Hb (Evaluasi EPO)">Rutin Hb (Evaluasi EPO)</option>
                          </select>
                        </td>

                        {/* Status Pemeriksaan */}
                        <td className="py-2 px-2 text-center">
                          <select
                            value={sched.status}
                            onChange={(e) => handleFieldChange(patient.id, 'status', e.target.value as LabScheduleStatus)}
                            className={`h-8 w-full px-2 rounded-lg border text-xs font-bold focus:outline-hidden ${
                              sched.status === 'Selesai'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700'
                                : sched.status === 'Tidak Ada Jadwal'
                                ? 'bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                : sched.status === 'Ditunda'
                                ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
                                : 'bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700'
                            }`}
                          >
                            <option value="Terjadwal">🕒 Terjadwal</option>
                            <option value="Tidak Ada Jadwal">⚪ Tidak Ada Jadwal</option>
                            <option value="Selesai">✅ Selesai</option>
                            <option value="Ditunda">⚠️ Ditunda</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className="text-slate-600 dark:text-slate-400">
              Total <strong>{patients.length}</strong> Pasien
            </span>
            <span>•</span>
            <span className="text-amber-800 dark:text-amber-300 font-bold bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-md">
              ⭐ {countSelective} Cek Hb Pilihan (&lt; 9.0)
            </span>
            <span>•</span>
            <span className="text-purple-700 dark:text-purple-400 font-semibold">
              🕒 {countScheduled} Terjadwal
            </span>
            <span>•</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              ✅ {countDone} Selesai
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-medium text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl font-bold text-xs text-white bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Jadwal Cek Hb Bulan Selanjutnya</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
