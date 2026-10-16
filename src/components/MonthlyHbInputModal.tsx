import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  Calendar, 
  Droplet, 
  Syringe, 
  AlertTriangle,
  Sparkles,
  Save,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  CalendarDays
} from 'lucide-react';
import { PatientRecord, HDDaySchedule, HDShift, isSelectiveHbCandidate } from '../types/dialysis';
import { calculateClinicalRecommendation } from '../services/clinicalRules';
import { getFirstHDDateOfMonth, getNextYearMonth, getActiveHDDaySchedule, getTodayDayName } from '../services/googleSheets';

interface MonthlyHbInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: PatientRecord[];
  selectedMonth: string;
  onMonthChange?: (newMonth: string) => void;
  onSaveBatchHb: (
    updatedHbList: { id: string; hbValue: number; hbDate: string }[],
    targetMonth?: string,
    scope?: 'SELURUH' | 'PILIHAN'
  ) => void;
  onOpenLabScheduleModal?: () => void;
  onOpenWorkflowGuide?: () => void;
}

// Helper mendapatkan string tanggal real-time saat ini (YYYY-MM-DD)
const getRealTimeDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper format tanggal bahasa Indonesia
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

export const MonthlyHbInputModal: React.FC<MonthlyHbInputModalProps> = ({
  isOpen,
  onClose,
  patients,
  selectedMonth,
  onMonthChange,
  onSaveBatchHb,
  onOpenLabScheduleModal,
  onOpenWorkflowGuide,
}) => {
  const realTimeToday = getRealTimeDateString();

  // State bulan aktif
  const [activeMonth, setActiveMonth] = useState(selectedMonth);

  useEffect(() => {
    setActiveMonth(selectedMonth);
  }, [selectedMonth]);

  // Format Bulan Aktif
  const [yearStr, monthStr] = (activeMonth || '2026-09').split('-');
  const currentYear = parseInt(yearStr, 10) || new Date().getFullYear();
  const currentMonthNum = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

  const monthDate = new Date(currentYear, currentMonthNum - 1, 1);
  const activeMonthLabel = monthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // Bulan depan untuk Runtutan 6
  const nextMonthCode = getNextYearMonth(activeMonth);
  const [nextYearStr, nextMonthNumStr] = nextMonthCode.split('-');
  const nextMonthDate = new Date(parseInt(nextYearStr, 10), parseInt(nextMonthNumStr, 10) - 1, 1);
  const nextMonthName = nextMonthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const now = new Date();
  const realCurrentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentRealMonth = activeMonth === realCurrentMonthStr;

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

  // State Mode Sesi Input (Runtutan 1, 3, 4):
  // 'ALL_PATIENTS' = Sesi 1: Cek HB Seluruh Pasien
  // 'SELECTIVE_PATIENTS' = Sesi 2: Cek HB Pasien Pilihan (Hb Bulan Lalu <= 8.9 mg/dl)
  const [sessionMode, setSessionMode] = useState<'ALL_PATIENTS' | 'SELECTIVE_PATIENTS'>(() => {
    try {
      const stored = localStorage.getItem('epocare_lab_schedule_mode_' + activeMonth) || localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH') return 'ALL_PATIENTS';
      if (stored === 'PILIHAN') return 'SELECTIVE_PATIENTS';
    } catch (e) {}
    return 'ALL_PATIENTS';
  });

  // Identifikasi pasien selektif (kandidat Cek Hb Pilihan dengan Hb sebelumnya <= 8.9)
  const isSelective = (p: PatientRecord): boolean => {
    return isSelectiveHbCandidate(p);
  };

  const selectivePatients = patients.filter(isSelective);
  const totalPatientsCount = patients.length;
  const selectiveCount = selectivePatients.length;

  // Jadwal HD Aktif Hari Ini (Otomatis deteksi real-time)
  const todayActiveSchedule = getActiveHDDaySchedule();
  const todayDayName = getTodayDayName();

  // Local state for all patients' Hb and date
  const [formData, setFormData] = useState<Record<string, { hbValue: string; hbDate: string }>>({});
  const [initialFormData, setInitialFormData] = useState<Record<string, { hbValue: string; hbDate: string }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  // Otomatis menampilkan Hari aktif saat dibuka
  const [scheduleFilter, setScheduleFilter] = useState<string>(() => getActiveHDDaySchedule());
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');
  const [onlyPending, setOnlyPending] = useState(false);
  const [bulkDate, setBulkDate] = useState(realTimeToday);
  // Status feedback tersimpan per-pasien
  const [savedPatientId, setSavedPatientId] = useState<string | null>(null);

  // Inisialisasi data form:
  // Halaman INPUT NILAI HB berfungsi untuk mengedit atau update Nilai HB.
  // Hanya menampilkan Nilai HB terbaru setiap pasien agar tidak membingungkan.
  useEffect(() => {
    if (isOpen) {
      setScheduleFilter(getActiveHDDaySchedule());
      const initial: Record<string, { hbValue: string; hbDate: string }> = {};

      patients.forEach((p) => {
        // Tanggal tindakan Cek HB langsung otomatis sesuai Jadwal Rutin HD pasien di awal bulan
        const targetDate = getFirstHDDateOfMonth(
          activeMonth, 
          p.scheduleDay, 
          p.singleDay, 
          p.hdFrequency, 
          p.lastHdDate
        ).dateString;

        // Ambil Nilai HB bulan berjalan pasien (jika belum ada data pada Google Sheet maka nilainya 0)
        let latestHb = 0;
        if (p.labSchedule && p.labSchedule.status === 'Selesai' && typeof p.labSchedule.resultHb === 'number' && p.labSchedule.resultHb > 0) {
          latestHb = p.labSchedule.resultHb;
        } else if (typeof p.hbValue === 'number' && p.hbValue > 0) {
          latestHb = p.hbValue;
        }

        const initialHb = latestHb > 0 ? String(latestHb) : '0';

        initial[p.id] = {
          hbValue: initialHb,
          hbDate: targetDate,
        };
      });

      setFormData(initial);
      setInitialFormData(initial);
      setBulkDate(`${activeMonth}-01`);
    }
  }, [isOpen, patients, activeMonth, sessionMode]);

  const handleSwitchToAllPatients = () => {
    setSessionMode('ALL_PATIENTS');
    try {
      localStorage.setItem('epocare_lab_schedule_mode_' + activeMonth, 'SELURUH');
      localStorage.setItem('epocare_lab_schedule_mode', 'SELURUH');
    } catch (e) {}
  };

  const handleSwitchToSelectivePatients = () => {
    setSessionMode('SELECTIVE_PATIENTS');
    try {
      localStorage.setItem('epocare_lab_schedule_mode_' + activeMonth, 'PILIHAN');
      localStorage.setItem('epocare_lab_schedule_mode', 'PILIHAN');
    } catch (e) {}
  };

  // Simpan nilai Hb KHUSUS satu pasien tanpa merubah nilai pasien lain
  const handleSaveSinglePatient = (patient: PatientRecord) => {
    const item = formData[patient.id];
    const routineDate = getFirstHDDateOfMonth(
      activeMonth, 
      patient.scheduleDay, 
      patient.singleDay, 
      patient.hdFrequency, 
      patient.lastHdDate
    ).dateString;
    const rawHb = item ? parseFloat(item.hbValue.replace(',', '.')) : 0;
    const validHb = isNaN(rawHb) || rawHb < 0 ? 0 : rawHb;
    const targetDate = item?.hbDate || routineDate;

    const scopeMode: 'SELURUH' | 'PILIHAN' = sessionMode === 'ALL_PATIENTS' ? 'SELURUH' : 'PILIHAN';

    // Kirim HANYA data satu pasien ini
    onSaveBatchHb(
      [{ id: patient.id, hbValue: validHb, hbDate: targetDate }],
      activeMonth,
      scopeMode
    );

    // Feedback animasi berhasil tersimpan pada baris pasien ini
    setSavedPatientId(patient.id);
    setTimeout(() => {
      setSavedPatientId(null);
    }, 2500);
  };

  if (!isOpen) return null;

  const handleHbChange = (id: string, value: string) => {
    setFormData((prev) => {
      const p = patients.find((pat) => pat.id === id);
      const routineDate = p 
        ? getFirstHDDateOfMonth(activeMonth, p.scheduleDay, p.singleDay, p.hdFrequency, p.lastHdDate).dateString
        : `${activeMonth}-01`;
      const currentItem = prev[id] || { hbValue: '0', hbDate: routineDate };
      const nextDate = (!currentItem.hbDate || currentItem.hbDate.trim() === '') ? routineDate : currentItem.hbDate;
      return {
        ...prev,
        [id]: {
          ...currentItem,
          hbValue: value,
          hbDate: nextDate,
        },
      };
    });
  };

  const handleDateChange = (id: string, date: string) => {
    setFormData((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        hbDate: date,
      },
    }));
  };

  // Deteksi pasien mana saja yang nilai input Hb / tanggalnya diubah oleh user pada sesi formulir ini
  const modifiedPatients = patients.filter((p) => {
    const current = formData[p.id];
    const initial = initialFormData[p.id];
    if (!current || !initial) return false;
    return current.hbValue !== initial.hbValue || current.hbDate !== initial.hbDate;
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const scopeMode: 'SELURUH' | 'PILIHAN' = sessionMode === 'ALL_PATIENTS' ? 'SELURUH' : 'PILIHAN';

    // Jika tidak ada nilai HB yang diinputkan atau diedit, jangan lakukan penyimpanan apapun
    // (Menghapus fungsi simpan seluruh pasien saat tidak ada nilai Hb yang diinputkan/diedit)
    if (modifiedPatients.length === 0) {
      return;
    }

    // 1. KASUS UTAMA: Jika user hanya menginputkan/mengubah SATU pasien saja di formulir ini,
    // Tombol ini langsung menyimpan HANYA pasien tersebut TANPA merubah pasien lain!
    if (modifiedPatients.length === 1) {
      const targetPatient = modifiedPatients[0];
      handleSaveSinglePatient(targetPatient);
      onClose();
      return;
    }

    // 2. KASUS: Jika user mengubah beberapa pasien tertentu (lebih dari 1 pasien),
    // Simpan HANYA pasien-pasien yang diinputkan atau diedit tersebut tanpa merubah pasien lain
    const updateList = modifiedPatients.map((p) => {
      const item = formData[p.id];
      const routineDate = getFirstHDDateOfMonth(
        activeMonth, 
        p.scheduleDay, 
        p.singleDay, 
        p.hdFrequency, 
        p.lastHdDate
      ).dateString;
      const rawHb = item ? parseFloat(item.hbValue.replace(',', '.')) : 0;
      const validHb = isNaN(rawHb) || rawHb < 0 ? 0 : rawHb;
      return {
        id: p.id,
        hbValue: validHb,
        hbDate: item?.hbDate || routineDate,
      };
    });

    onSaveBatchHb(updateList, activeMonth, scopeMode);
    onClose();
  };

  // Filtered patients for editing view
  const filteredPatients = patients.filter((p) => {
    // Mode Sesi Cek HB:
    // Jika Sesi Pasien Pilihan, HANYA tampilkan pasien yang memenuhi kriteria Hb bulan lalu < 9.0
    if (sessionMode === 'SELECTIVE_PATIENTS' && !isSelective(p)) {
      return false;
    }

    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.noRm.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSchedule = scheduleFilter === 'ALL' || p.scheduleDay === scheduleFilter;
    const matchesShift = shiftFilter === 'ALL' || p.scheduleShift === shiftFilter;
    
    const curVal = parseFloat(formData[p.id]?.hbValue?.replace(',', '.') || '0');
    const matchesPending = !onlyPending || (curVal <= 0 || isNaN(curVal));

    return matchesSearch && matchesSchedule && matchesShift && matchesPending;
  });

  // Calculate statistics for current session
  const targetScopePatients = sessionMode === 'SELECTIVE_PATIENTS' ? selectivePatients : patients;
  let countFilled = 0;
  let countPending = 0;
  targetScopePatients.forEach((p) => {
    const val = parseFloat(formData[p.id]?.hbValue?.replace(',', '.') || '0');
    if (val > 0) countFilled++;
    else countPending++;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-1 flex flex-col max-h-[85vh]">
        
        {/* Header (Minimalist & Compact) */}
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-850 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-700 text-white flex items-center justify-center shadow-xs shrink-0">
              <Droplet className="w-4 h-4 text-rose-100 fill-white" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                Input Hasil Nilai HB
              </h3>

              {/* Selector Bulan Aktif */}
              <div className="flex items-center gap-0.5 bg-rose-100/90 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 rounded-md p-0.5 shadow-2xs">
                <span className="text-[10px] font-bold text-rose-900 dark:text-rose-200 pl-1">
                  Bulan:
                </span>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="w-4 h-4 flex items-center justify-center text-rose-800 hover:text-rose-950 dark:text-rose-300 dark:hover:text-white rounded transition cursor-pointer"
                  title="Pindah ke bulan sebelumnya"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <div className="relative flex items-center px-1">
                  <span className="text-[11px] font-extrabold text-rose-950 dark:text-rose-100 whitespace-nowrap cursor-pointer">
                    {activeMonthLabel}
                  </span>
                  <input
                    type="month"
                    value={activeMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Klik untuk memilih bulan"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="w-4 h-4 flex items-center justify-center text-rose-800 hover:text-rose-950 dark:text-rose-300 dark:hover:text-white rounded transition cursor-pointer"
                  title="Pindah ke bulan berikutnya"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenWorkflowGuide && (
              <button
                type="button"
                onClick={onOpenWorkflowGuide}
                className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer px-1.5 py-1 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                title="Panduan alur penggunaan aplikasi"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Panduan</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Banner Penjelasan Sesi Aktif */}
        <div className={`px-4 py-1.5 border-b text-[11px] flex items-center gap-2 shrink-0 ${
          sessionMode === 'ALL_PATIENTS'
            ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900 text-indigo-950 dark:text-indigo-200 font-medium'
            : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-950 dark:text-amber-200 font-medium'
        }`}>
          {sessionMode === 'ALL_PATIENTS' ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                <strong>Halaman Edit &amp; Update Nilai HB:</strong> Menampilkan Nilai HB terbaru pasien. Ubah nilai jika ada hasil lab baru, lalu simpan.
              </span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Sesi Cek HB Pilihan (≤ 8.9):</strong> Menampilkan pasien dengan Nilai HB terbaru acuan ≤ 8.9 g/dL untuk diperbarui.
              </span>
            </>
          )}
        </div>

        {/* Toolbar & Filters (Minimalist Single Bar) */}
        <div className="px-3 py-1.5 bg-slate-50/70 dark:bg-slate-850/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1.5 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {/* Search */}
            <div className="relative min-w-[140px] max-w-[180px] flex-1">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari pasien..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-7 pl-7 pr-2 rounded-md border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
              />
            </div>

            {/* Jadwal Filter (Otomatis Hari Aktif) */}
            <select
              value={scheduleFilter}
              onChange={(e) => setScheduleFilter(e.target.value)}
              className="h-7 px-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold focus:outline-hidden cursor-pointer"
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

            {/* Shift Filter */}
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="h-7 px-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Semua Shift</option>
              <option value="Shift 1 (Pagi)">Shift 1 (Pagi)</option>
              <option value="Shift 2 (Siang)">Shift 2 (Siang)</option>
            </select>

            {/* Checkbox Pending */}
            <label className="flex items-center gap-1 cursor-pointer text-[10.5px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 ml-0.5">
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer w-3 h-3"
              />
              <span>Hb: 0</span>
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Status Counter */}
            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold text-[10.5px] border border-emerald-300/70">
              ✅ Sudah: {countFilled}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-semibold text-[10.5px] border border-amber-300/70">
              ⚠️ Belum: {countPending}
            </span>
          </div>
        </div>

        {/* Referensi Dosis & Catatan Minimalis (Single Micro Row) */}
        <div className="px-3 py-1 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="font-bold text-slate-700 dark:text-slate-300">Protokol:</span>
            <span>&lt;5.9 (Ranap 2 Bag)</span>
            <span>•</span>
            <span>6.0–6.9 (1 Bag PRC)</span>
            <span>•</span>
            <span>7.0–8.9 (EPO 4x)</span>
            <span>•</span>
            <span>9.0–12.0 (EPO 1x)</span>
            <span>•</span>
            <span>&gt;12.0 (Tanpa EPO)</span>
          </div>
          <span className="text-[9.5px] italic hidden sm:inline text-slate-400 shrink-0 ml-2">
            *Tgl tindakan otomatis mengikuti jadwal rutin HD pasien
          </span>
        </div>

        {/* Form Body - Table of Patients (Compact rows) */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-slate-700 z-10 text-[11px]">
              <tr>
                <th className="py-1.5 px-2 text-center w-8">No</th>
                <th className="py-1.5 px-2">Nama Pasien & No. RM</th>
                <th className="py-1.5 px-2 w-24">Jadwal & Shift</th>
                <th className="py-1.5 px-2 w-36">Nilai HB Terbaru (g/dL)</th>
                <th className="py-1.5 px-2 w-48">Tgl Tindakan Cek HB</th>
                <th className="py-1.5 px-2">Protokol Klinis Otomatis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <p className="text-xs font-medium">Tidak ada pasien yang sesuai sesi/filter ini.</p>
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient, idx) => {
                  const currentHbStr = formData[patient.id]?.hbValue ?? String(patient.hbValue);
                  const currentDate = formData[patient.id]?.hbDate ?? patient.hbDate;
                  const parsedHb = parseFloat(currentHbStr.replace(',', '.'));
                  const numericHb = isNaN(parsedHb) || parsedHb < 0 ? 0 : parsedHb;
                  const reco = calculateClinicalRecommendation(numericHb);

                  return (
                    <tr 
                      key={`${patient.id || patient.noRm}-${idx + 1}`} 
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                        numericHb <= 0 ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-1 px-2 text-center text-slate-400 font-mono text-[10px]">
                        {idx + 1}
                      </td>

                      {/* Nama Pasien & RM */}
                      <td className="py-1 px-2">
                        <div className="font-bold text-slate-900 dark:text-white text-xs">
                          {patient.name}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          {patient.noRm}
                        </div>
                      </td>

                      {/* Jadwal & Shift */}
                      <td className="py-1 px-2 text-[10px]">
                        <div className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                          {patient.scheduleDay}
                        </div>
                        <div className={`font-bold ${
                          patient.scheduleShift.includes('Pagi') 
                            ? 'text-blue-600 dark:text-blue-400' 
                            : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {patient.scheduleShift}
                        </div>
                      </td>

                      {/* Input / Update Nilai Hb Terbaru */}
                      <td className="py-1 px-2">
                        <div className="flex items-center gap-1">
                          <div className="relative w-24">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="24"
                              value={currentHbStr}
                              onChange={(e) => handleHbChange(patient.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveSinglePatient(patient);
                                }
                              }}
                              placeholder="0.0"
                              className={`w-full pl-2 pr-7 py-0.5 rounded border font-mono font-bold text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-rose-500 ${
                                numericHb <= 0 
                                  ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200' 
                                  : numericHb < 6.0 
                                  ? 'border-rose-400 text-rose-700 dark:text-rose-400' 
                                  : numericHb > 12.0 
                                  ? 'border-purple-400 text-purple-700 dark:text-purple-300' 
                                  : 'border-slate-300 dark:border-slate-700'
                              }`}
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-slate-400">
                              g/dL
                            </span>
                          </div>

                          {/* Quick 0 button */}
                          <button
                            type="button"
                            onClick={() => handleHbChange(patient.id, '0')}
                            className="px-1 py-0.5 text-[9px] font-bold text-slate-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition cursor-pointer"
                            title="Set nilai Hb: 0"
                          >
                            Set 0
                          </button>
                        </div>
                        {numericHb > 0 && numericHb < 6.0 && (
                          <div className="mt-0.5 flex items-center gap-0.5 text-[8.5px] font-extrabold text-rose-700 dark:text-rose-400 animate-pulse">
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            <span>Kritis: Ranap 2 Bag</span>
                          </div>
                        )}
                        {numericHb >= 14.0 && (
                          <div className="mt-0.5 flex items-center gap-0.5 text-[8.5px] font-extrabold text-purple-700 dark:text-purple-400">
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            <span>Hb Tinggi (≥14.0)</span>
                          </div>
                        )}
                      </td>

                      {/* Tanggal Tindakan Cek HB (Langsung Menyesuaikan Jadwal Rutin Pasien) */}
                      <td className="py-1 px-2">
                        {(() => {
                          const routineDate = getFirstHDDateOfMonth(
                            activeMonth, 
                            patient.scheduleDay, 
                            patient.singleDay, 
                            patient.hdFrequency,
                            patient.lastHdDate
                          ).dateString;
                          const isRoutineMatch = currentDate === routineDate;

                          return (
                            <div className="space-y-0.5">
                              <input
                                type="date"
                                value={currentDate}
                                onChange={(e) => handleDateChange(patient.id, e.target.value)}
                                className={`px-1.5 py-0.5 w-full rounded border text-[11px] font-semibold focus:outline-hidden focus:ring-1 focus:ring-rose-500 cursor-pointer ${
                                  isRoutineMatch
                                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200'
                                    : 'border-amber-400 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200'
                                }`}
                              />
                              <div className="flex items-center justify-between text-[9px] gap-1">
                                {isRoutineMatch ? (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-emerald-700 dark:text-emerald-400 truncate" title={`Sesuai jadwal rutin HD awal bulan (${patient.scheduleDay})`}>
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                    <span>Jadwal Rutin: {formatDateIndo(routineDate)}</span>
                                  </span>
                                ) : (
                                  <>
                                    <span className="inline-flex items-center gap-0.5 font-bold text-amber-700 dark:text-amber-400 truncate" title="Tanggal diinputkan secara manual">
                                      <span>✏️ Manual: {formatDateIndo(currentDate)}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDateChange(patient.id, routineDate)}
                                      className="text-blue-600 dark:text-blue-400 hover:underline font-bold cursor-pointer shrink-0 ml-1"
                                      title={`Kembalikan tanggal tindakan ke jadwal rutin (${formatDateIndo(routineDate)})`}
                                    >
                                      ↺ Rutin
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Live Clinical Recommendation Badge */}
                      <td className="py-1 px-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${reco.badgeBg} ${reco.badgeColor} ${reco.borderColor}`}>
                            {reco.transfusionBags > 0 ? (
                              <Droplet className="w-3 h-3 fill-rose-600 text-rose-600 shrink-0" />
                            ) : reco.totalEpoVials > 0 ? (
                              <Syringe className="w-3 h-3 text-blue-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-purple-600 shrink-0" />
                            )}
                            <span className="truncate max-w-[200px]" title={reco.title}>
                              {reco.title}
                            </span>
                          </span>

                          <span className="text-[9px] text-slate-400 hidden xl:inline truncate max-w-[140px]">
                            {reco.doseDescription}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </form>

        {/* Footer Actions (Pinned) */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate flex items-center gap-2">
            {modifiedPatients.length > 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-in fade-in duration-150">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{modifiedPatients.length} data nilai Hb pasien siap disimpan</span>
              </span>
            ) : (
              <span>* Masukkan atau edit nilai Hb pada tabel di atas untuk menyimpan perubahan.</span>
            )}
            {sessionMode === 'SELECTIVE_PATIENTS' && (
              <span className="font-bold text-amber-700 dark:text-amber-300">
                (Sesi Pasien Pilihan: {filteredPatients.length} Pasien)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Pintasan Runtutan 6: Lanjut ke Penjadwalan Cek HB Bulan Depan */}
            {onOpenLabScheduleModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLabScheduleModal();
                }}
                className="h-8.5 inline-flex items-center gap-1.5 px-3 rounded-lg text-indigo-900 dark:text-indigo-200 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 border border-indigo-300 dark:border-indigo-800 text-xs font-bold transition cursor-pointer"
                title="Langkah 6: Penjadwalan Cek HB untuk bulan depan saat seluruh data Hb terupdate"
              >
                <CalendarDays className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Ke Jadwal Bulan Depan ({nextMonthName})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-8.5 px-3 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 font-medium text-xs transition cursor-pointer"
            >
              {modifiedPatients.length > 0 ? 'Batal' : 'Tutup'}
            </button>

            {/* Hapus fungsi & tombol Simpan Nilai HB seluruh pasien jika tidak ada nilai HB yang diinputkan atau diedit */}
            {modifiedPatients.length > 0 && (
              <button
                type="button"
                onClick={handleSave}
                className={`h-8.5 inline-flex items-center gap-1.5 px-4 rounded-lg text-white font-semibold text-xs transition cursor-pointer shadow-xs animate-in fade-in duration-200 ${
                  modifiedPatients.length === 1
                    ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 ring-2 ring-emerald-300 dark:ring-emerald-700'
                    : 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800'
                }`}
                title={
                  modifiedPatients.length === 1
                    ? `Simpan nilai Hb untuk ${modifiedPatients[0].name} tanpa merubah data pasien lain`
                    : `Simpan nilai Hb untuk ${modifiedPatients.length} pasien yang diubah tanpa merubah pasien lain`
                }
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {modifiedPatients.length === 1
                    ? `Simpan Nilai Hb (${modifiedPatients[0].name})`
                    : `Simpan ${modifiedPatients.length} Pasien yang Diubah`}
                </span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
