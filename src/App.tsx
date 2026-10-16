/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { Header } from './components/Header';
import { DashboardStats } from './components/DashboardStats';
import { PatientTable } from './components/PatientTable';
import { PatientModal } from './components/PatientModal';
import { GoogleSheetsSyncModal } from './components/GoogleSheetsSyncModal';
import { ClinicalCalculatorModal } from './components/ClinicalCalculatorModal';
import { PrintReportModal } from './components/PrintReportModal';
import { BulkImportModal } from './components/BulkImportModal';
import { MonthlyHbInputModal } from './components/MonthlyHbInputModal';
import { LabScheduleModal } from './components/LabScheduleModal';
import { ExportExcelModal } from './components/ExportExcelModal';
import { WorkflowGuideModal } from './components/WorkflowGuideModal';
import { EpoSchedulePrintModal } from './components/EpoSchedulePrintModal';
import { PatientRecord, SpreadsheetConfig, DoseStatus, HDDaySchedule, LabSchedule, LabScheduleScope, isSelectiveHbCandidate } from './types/dialysis';
import { getInitialDemoPatients, calculateClinicalRecommendation, generateDefaultWeeks, isDemoPatient, sortPatientsAlphabetically } from './services/clinicalRules';
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  getAccessToken 
} from './services/firebaseAuth';
import { 
  readPatientsFromSheet, 
  pushPatientsToSheet,
  pullViaAppsScript,
  pushViaAppsScript,
  importFromCSV,
  getPairedHDDate,
  getDateDoseDisplayInfo,
  getMonthDaysInfo,
  getHDSessionWeek,
  getFirstHDDateOfMonth,
  getSecondHDDateOfMonth,
  getNextYearMonth,
  getPreviousYearMonth,
  getPatientMonthHDSessions,
  extractYearlyPatientInfoMap,
  DEFAULT_APPS_SCRIPT_URL,
  OFFICIAL_SPREADSHEET_ID,
  OFFICIAL_SPREADSHEET_URL,
  isSummaryOrHeaderRow,
  getNowInIndonesianTime,
  isPrimaryHDDay,
  getActiveHDDaySchedule
} from './services/googleSheets';
import { 
  FileSpreadsheet, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  ArrowRight
} from 'lucide-react';

const isRemovedDemoNote = (note?: string): boolean => {
  if (!note) return false;
  const lower = note.toLowerCase().trim();
  return (
    lower.includes('penjadwalan epo hari awal: pemberian epo tgl 7 september 2026 ditunda') ||
    lower.includes('pasien mengeluh lemas, konjungtiva anemis berat') ||
    lower.includes('hasil lab hb awal bulan belum diinputkan') ||
    lower.includes('transfusi 1 bag saat hd running') ||
    lower.includes('rutin epo 4x sebulan di hari awal (senin)') ||
    lower.includes('rutin epo 4x sebulan, periksa saturasi transferin') ||
    lower.includes('target hb tercapai stabil, maintenance 1 ampul di m1') ||
    lower.includes('hb di atas target 12 g/dl, tunda injeksi epo bulan ini') ||
    lower.includes('hb diatas 12.00 mg/dl')
  );
};

/**
 * Memastikan seluruh pasien memiliki ID unik tanpa duplikasi (mencegah error React key)
 * serta mengurutkan daftar pasien secara otomatis sesuai abjad nama (A - Z).
 */
export const ensureUniquePatientIds = (patientList: PatientRecord[]): PatientRecord[] => {
  const seenIds = new Set<string>();
  const unique = patientList.map((p, index) => {
    let patientId = (p.id || '').trim();
    if (!patientId || seenIds.has(patientId)) {
      const cleanRm = (p.noRm || `pat${index}`).replace(/[^a-zA-Z0-9_-]/g, '');
      patientId = `${patientId || 'pat'}-${cleanRm}-${index}-${Math.random().toString(36).substring(2, 7)}`;
    }
    seenIds.add(patientId);
    return {
      ...p,
      id: patientId,
    };
  });
  return sortPatientsAlphabetically(unique);
};

export default function App() {
  // Current Month: format YYYY-MM (Kalender Indonesia WIB)
  const currentRealMonth = getNowInIndonesianTime().yearMonth;
  const defaultMonth = currentRealMonth;
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const isPastMonth = selectedMonth < currentRealMonth;
  const [isPastMonthUnlocked, setIsPastMonthUnlocked] = useState(false);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Patient Records State (Dikosongkan dari data bawaan sistem, baris rekapitulasi, serta ID terduplikasi)
  const [patients, setPatients] = useState<PatientRecord[]>(() => {
    try {
      const saved = localStorage.getItem('dialysis_patients_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Bersihkan secara otomatis pasien demo bawaan sistem serta baris total/rekapitulasi & rapikan ID
          const cleaned = ensureUniquePatientIds(
            parsed
              .filter((p: PatientRecord) => !isSummaryOrHeaderRow(p.name, p.noRm) && !isDemoPatient(p))
              .map((p: PatientRecord) => ({
                ...p,
                clinicalNotes: isRemovedDemoNote(p.clinicalNotes) ? '' : p.clinicalNotes,
              }))
          );
          localStorage.setItem('dialysis_patients_data', JSON.stringify(cleaned));
          return cleaned;
        }
      }
    } catch (e) {
      console.error('Error loading saved patients:', e);
    }
    return [];
  });

  // Bersihkan data pasien dari baris total/rekapitulasi, data demo bawaan sistem, serta jamin ID unik
  useEffect(() => {
    setPatients((prev) => {
      let changed = false;
      const seenIds = new Set<string>();
      const filtered = prev
        .filter((p) => {
          if (isSummaryOrHeaderRow(p.name, p.noRm) || isDemoPatient(p)) {
            changed = true;
            return false;
          }
          return true;
        })
        .map((p, idx) => {
          let currentId = (p.id || '').trim();
          let note = p.clinicalNotes;
          if (isRemovedDemoNote(note)) {
            changed = true;
            note = '';
          }
          if (!currentId || seenIds.has(currentId)) {
            changed = true;
            const cleanRm = (p.noRm || `pat${idx}`).replace(/[^a-zA-Z0-9_-]/g, '');
            currentId = `${currentId || 'pat'}-${cleanRm}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
          }
          seenIds.add(currentId);

          // Sinkronisasi status Cek Hb Pilihan: HANYA nilai Hb <= 8.9 mg/dl yang masuk Cek Hb Pilihan
          const refHb = (typeof p.prevHbValue === 'number' && p.prevHbValue > 0)
            ? Number(p.prevHbValue.toFixed(1))
            : (p.hbValue > 0 ? Number(p.hbValue.toFixed(1)) : undefined);
          
          let isSelective = p.isSelectiveHb;
          let labSchedule = p.labSchedule;

          if (refHb !== undefined) {
            if (refHb >= 9.0) {
              if (isSelective || labSchedule?.isSelectiveHb || labSchedule?.testType?.includes('Pilihan')) {
                changed = true;
                isSelective = false;
                if (labSchedule) {
                  labSchedule = {
                    ...labSchedule,
                    testType: 'Rutin Hb (Evaluasi EPO)',
                    isSelectiveHb: false,
                    selectiveReason: undefined,
                  };
                }
              }
            } else if (refHb <= 8.9) {
              if (labSchedule?.testType && (labSchedule.testType === 'Cek Hb Pilihan (Hb < 9.0)' || (labSchedule.testType as any) === 'Cek Hb Pilihan (Hb ≤ 9.0)')) {
                changed = true;
                labSchedule = {
                  ...labSchedule,
                  testType: 'Cek Hb Pilihan (Hb ≤ 8.9)',
                };
              }
            }
          }

          // Sinkronisasi alokasi Terapi EPO:
          // - Pasien HD 1x/minggu dan 1x/2 minggu: pemberian EPO dimulai dari SESI AWAL HD (Sesi Pertama)
          // - Pasien HD 2x/minggu: otomatis pada Pertemuan HD Kedua
          let weeks = p.weeks;
          let dailyRecords = p.dailyRecords;
          const monthInfo = getMonthDaysInfo(selectedMonth);
          const sessions = getPatientMonthHDSessions(p, monthInfo);
          const firstHdDate = sessions.length >= 1 ? sessions[0] : null;
          const secondHdDate = sessions.length >= 2 ? sessions[1] : (sessions[0] || null);
          const isSingleSessFreq = p.hdFrequency === '1 kali dalam satu minggu' || p.hdFrequency === '1 kali / 2 minggu';

          // Bersihkan status 'Belum' yang tidak sengaja tercatat di pertemuan pertama (sesi Cek Hb)
          // HANYA untuk pasien HD 2x/minggu (karena pasien HD 1x/minggu dan 1x/2 minggu sesi 1 memang terjadwal EPO)
          if (sessions.length >= 2 && dailyRecords && !isSingleSessFreq) {
            const firstSessionDate = sessions[0].dateNumber;
            if (dailyRecords[firstSessionDate]?.status === 'Belum' && !dailyRecords[firstSessionDate]?.postponedFromDate) {
              changed = true;
              const newDaily = { ...dailyRecords };
              delete newDaily[firstSessionDate];
              dailyRecords = newDaily;
            }
          }

          // Sinkronisasi rekomendasi pasien HD 1x/2 minggu
          let recommendation = p.recommendation;
          if (p.hdFrequency === '1 kali / 2 minggu' && recommendation?.category === 'EPO_4X_2000' && recommendation.totalEpoVials !== 2) {
            changed = true;
            recommendation = calculateClinicalRecommendation(p.hbValue, p.hdFrequency);
          }

          if (p.recommendation?.category === 'EPO_1X_2000') {
            const targetHdDate = isSingleSessFreq ? firstHdDate : secondHdDate;
            if (weeks) {
              const w2Status = weeks.week2?.status;
              const w3Status = weeks.week3?.status;
              const w4Status = weeks.week4?.status;
              if (
                (w2Status === 'Belum' || (weeks.week2?.doseIU && weeks.week2.doseIU > 0)) ||
                (w3Status === 'Belum' || (weeks.week3?.doseIU && weeks.week3.doseIU > 0)) ||
                (w4Status === 'Belum' || (weeks.week4?.doseIU && weeks.week4.doseIU > 0)) ||
                (targetHdDate && weeks.week1?.plannedDate !== targetHdDate.dateString)
              ) {
                changed = true;
                weeks = {
                  ...weeks,
                  week1: { 
                    weekNumber: 1, 
                    status: weeks.week1?.status || 'Belum', 
                    doseIU: 2000, 
                    plannedDate: targetHdDate ? targetHdDate.dateString : weeks.week1?.plannedDate,
                    notes: isSingleSessFreq
                      ? 'Pemberian EPO Pemeliharaan dimulai dari sesi awal HD di bulan terkait'
                      : 'Otomatis dijadwalkan pada pertemuan HD kedua di bulan terkait',
                  },
                  week2: w2Status === 'Diberikan' ? weeks.week2 : { weekNumber: 2, status: 'Tidak Ada Jadwal', doseIU: 0 },
                  week3: w3Status === 'Diberikan' ? weeks.week3 : { weekNumber: 3, status: 'Tidak Ada Jadwal', doseIU: 0 },
                  week4: w4Status === 'Diberikan' ? weeks.week4 : { weekNumber: 4, status: 'Tidak Ada Jadwal', doseIU: 0 },
                };
              }
            }

            // Bersihkan sisa 'Belum' duplikat di dailyRecords
            if (dailyRecords) {
              const hasGiven = Object.values(dailyRecords).some((r) => r.status === 'Diberikan');
              const belumKeys = Object.entries(dailyRecords)
                .filter(([_, r]) => r.status === 'Belum' && !r.postponedFromDate)
                .map(([k]) => parseInt(k, 10));

              if (hasGiven && belumKeys.length > 0) {
                changed = true;
                const newDaily = { ...dailyRecords };
                belumKeys.forEach((k) => delete newDaily[k]);
                dailyRecords = newDaily;
              } else if (belumKeys.length > 1) {
                changed = true;
                const newDaily = { ...dailyRecords };
                belumKeys.slice(1).forEach((k) => delete newDaily[k]);
                dailyRecords = newDaily;
              }
            }
          } else if (p.recommendation?.category === 'EPO_4X_2000') {
            if (p.hdFrequency === '1 kali / 2 minggu') {
              const firstSession = sessions[0] || null;
              const secondSession = sessions.length >= 2 ? sessions[1] : null;
              if (weeks && firstSession) {
                const firstWeekNum = firstSession.dateNumber <= 7 ? 1 : 2;
                const secondWeekNum = (secondSession && secondSession.dateNumber <= 21) ? 3 : 4;
                const w1Key = `week${firstWeekNum}` as 'week1' | 'week2';
                const w2Key = `week${secondWeekNum}` as 'week3' | 'week4';
                if (weeks[w1Key]?.plannedDate !== firstSession.dateString) {
                  changed = true;
                  const newWeeks: PatientRecord['weeks'] = {
                    week1: { weekNumber: 1, status: 'Tidak Ada Jadwal', doseIU: 0 },
                    week2: { weekNumber: 2, status: 'Tidak Ada Jadwal', doseIU: 0 },
                    week3: { weekNumber: 3, status: 'Tidak Ada Jadwal', doseIU: 0 },
                    week4: { weekNumber: 4, status: 'Tidak Ada Jadwal', doseIU: 0 },
                  };
                  newWeeks[w1Key] = {
                    weekNumber: firstWeekNum as 1 | 2,
                    plannedDate: firstSession.dateString,
                    status: weeks[w1Key]?.status || 'Belum',
                    doseIU: 2000,
                    notes: 'Terjadwal EPO Sesi Awal HD (1x/2 Minggu)',
                  };
                  if (secondSession) {
                    newWeeks[w2Key] = {
                      weekNumber: secondWeekNum as 3 | 4,
                      plannedDate: secondSession.dateString,
                      status: weeks[w2Key]?.status || 'Belum',
                      doseIU: 2000,
                      notes: 'Terjadwal EPO Sesi HD Kedua (1x/2 Minggu)',
                    };
                  }
                  weeks = newWeeks;
                }
              }
            } else if (p.hdFrequency === '1 kali dalam satu minggu') {
              const firstSession = sessions[0] || null;
              if (weeks && firstSession && weeks.week1?.plannedDate !== firstSession.dateString && weeks.week1?.status !== 'Diberikan') {
                changed = true;
                weeks = {
                  ...weeks,
                  week1: {
                    ...weeks.week1,
                    plannedDate: firstSession.dateString,
                    notes: 'Pemberian EPO Sesi Awal HD (HD 1x/Minggu)',
                  }
                };
              }
            } else if (weeks && secondHdDate && weeks.week1?.plannedDate !== secondHdDate.dateString && weeks.week1?.status !== 'Diberikan') {
              changed = true;
              weeks = {
                ...weeks,
                week1: {
                  ...weeks.week1,
                  plannedDate: secondHdDate.dateString,
                  notes: 'Otomatis dijadwalkan pada pertemuan HD kedua di bulan terkait',
                }
              };
            }
          }

          if (
            currentId !== p.id ||
            note !== p.clinicalNotes ||
            isSelective !== p.isSelectiveHb ||
            labSchedule !== p.labSchedule ||
            recommendation !== p.recommendation ||
            weeks !== p.weeks ||
            dailyRecords !== p.dailyRecords
          ) {
            changed = true;
            return { 
              ...p, 
              id: currentId, 
              clinicalNotes: note,
              isSelectiveHb: isSelective,
              labSchedule,
              recommendation,
              weeks,
              dailyRecords,
            };
          }
          return p;
        });
      const sorted = sortPatientsAlphabetically(filtered);
      if (changed || filtered.length !== prev.length) {
        try {
          localStorage.setItem('dialysis_patients_data', JSON.stringify(sorted));
        } catch (e) {
          // ignore
        }
        return sorted;
      }
      return sortPatientsAlphabetically(prev);
    });
  }, []);

  // Spreadsheet Config State - Tetapkan URL resmi Google Sheet & Apps Script
  const [spreadsheetConfig, setSpreadsheetConfig] = useState<SpreadsheetConfig>(() => {
    const DEFAULT_CONFIG: SpreadsheetConfig = {
      spreadsheetId: OFFICIAL_SPREADSHEET_ID,
      spreadsheetUrl: OFFICIAL_SPREADSHEET_URL,
      sheetName: 'Senin-Kamis, Selasa-Jumat, Rabu-Sabtu',
      appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
      syncMode: 'appsscript',
      lastSyncedAt: new Date().toISOString(),
    };
    try {
      const saved = localStorage.getItem('dialysis_spreadsheet_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged: SpreadsheetConfig = {
          ...DEFAULT_CONFIG,
          ...parsed,
          spreadsheetId: OFFICIAL_SPREADSHEET_ID,
          spreadsheetUrl: OFFICIAL_SPREADSHEET_URL,
          appsScriptUrl: DEFAULT_APPS_SCRIPT_URL, // Tetapkan URL resmi Google Apps Script
        };
        localStorage.setItem('dialysis_spreadsheet_config', JSON.stringify(merged));
        return merged;
      }
    } catch (e) {
      console.error('Error loading saved spreadsheet config:', e);
    }
    return DEFAULT_CONFIG;
  });

  // Pastikan URL Apps Script resmi selalu tersimpan aktif
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dialysis_spreadsheet_config');
      const parsed = saved ? JSON.parse(saved) : {};
      if (parsed.appsScriptUrl !== DEFAULT_APPS_SCRIPT_URL) {
        const updated = {
          ...parsed,
          spreadsheetId: OFFICIAL_SPREADSHEET_ID,
          spreadsheetUrl: OFFICIAL_SPREADSHEET_URL,
          appsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
          syncMode: 'appsscript',
        };
        localStorage.setItem('dialysis_spreadsheet_config', JSON.stringify(updated));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Modals state
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
  const [isMonthlyHbModalOpen, setIsMonthlyHbModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isCalculatorModalOpen, setIsCalculatorModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isEpoSchedulePrintModalOpen, setIsEpoSchedulePrintModalOpen] = useState(false);
  const [isLabScheduleModalOpen, setIsLabScheduleModalOpen] = useState(false);
  const [isExportExcelModalOpen, setIsExportExcelModalOpen] = useState(false);
  const [isWorkflowGuideOpen, setIsWorkflowGuideOpen] = useState(false);
  const [exportExcelTarget, setExportExcelTarget] = useState<HDDaySchedule | 'ALL'>('ALL');
  const [activeSheetTab, setActiveSheetTab] = useState<HDDaySchedule | 'ALL'>(() => getActiveHDDaySchedule());

  // Syncing status & notifications
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastNotification, setToastNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Auto-Sync ke Google Sheets (Otomatis edit data di Google Sheet tanpa harus klik kirim manual)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('epocare_auto_sync_enabled');
      return stored !== null ? stored === 'true' : true; // Default AKTIF
    } catch (e) {
      return true;
    }
  });

  const autoSyncDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  const triggerAutoSync = (
    updatedPatientsList: PatientRecord[], 
    targetScope?: LabScheduleScope,
    targetSchedule?: HDDaySchedule
  ) => {
    if (!autoSyncEnabled) return;
    const url = spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL;
    if (!url && !spreadsheetConfig?.spreadsheetId) return;

    if (autoSyncDebounceTimer.current) {
      clearTimeout(autoSyncDebounceTimer.current);
    }

    // 500ms debounce cepat & responsif
    autoSyncDebounceTimer.current = setTimeout(async () => {
      setIsSyncing(true);
      try {
        if (url) {
          await pushViaAppsScript(url, updatedPatientsList, selectedMonth, targetSchedule, targetScope);
        } else if (spreadsheetConfig?.spreadsheetId) {
          const token = await getAccessToken();
          if (token) {
            await pushPatientsToSheet(spreadsheetConfig.spreadsheetId, updatedPatientsList, token, selectedMonth, targetSchedule, targetScope);
          }
        }
      } catch (err) {
        console.warn('Auto-sync background error:', err);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const toggleAutoSync = () => {
    setAutoSyncEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('epocare_auto_sync_enabled', String(next));
      } catch (e) {}
      setToastNotification({
        type: next ? 'success' : 'info',
        message: next
          ? '⚡ Auto-Sync ke Google Sheets Diaktifkan! Setiap pengeditan data pasien/Hb akan langsung mengedit data di Google Sheet secara otomatis.'
          : 'Auto-Sync Dimatikan. Pengiriman data ke Google Sheet menggunakan tombol Kirim manual.',
      });
      return next;
    });
  };
  useEffect(() => {
    if (toastNotification) {
      const timer = setTimeout(() => {
        setToastNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toastNotification]);

  // Save patients to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('dialysis_patients_data', JSON.stringify(patients));
      if (selectedMonth && patients.length > 0) {
        localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(patients));
      }
    } catch (e) {
      console.error('Failed to save patients to localStorage', e);
    }
  }, [patients, selectedMonth]);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser) => {
        setUser(currentUser);
      },
      () => {
        setUser(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Penarikan Data Otomatis dari Google Sheets saat pertama kali aplikasi dibuka / dimuat
  useEffect(() => {
    let isCancelled = false;
    const url = spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL;

    // Jika data pasien lokal masih kosong, segera tarik otomatis dari Google Sheets
    if (patients.length === 0 && url) {
      setIsSyncing(true);
      pullViaAppsScript(url, selectedMonth, true)
        .then((imported) => {
          if (!isCancelled && imported.length > 0) {
            const unique = ensureUniquePatientIds(imported);
            setPatients(unique);
            try {
              localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(unique));
              localStorage.setItem('dialysis_patients_data', JSON.stringify(unique));
            } catch (e) {}
            setToastNotification({
              type: 'success',
              message: `Berhasil memuat ${unique.length} data pasien dan alokasi dari Google Sheets!`,
            });
          }
        })
        .catch((err) => {
          console.warn('Auto-pull on mount failed:', err);
        })
        .finally(() => {
          if (!isCancelled) {
            setIsSyncing(false);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, []);

  // Google Sign In Handler
  const handleSignIn = async () => {
    try {
      setIsLoggingIn(true);
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToastNotification({
          type: 'success',
          message: `Berhasil masuk dengan akun Google: ${res.user.displayName || res.user.email}`,
        });
      }
    } catch (err: any) {
      console.error(err);
      setToastNotification({
        type: 'error',
        message: err.message || 'Gagal masuk dengan akun Google. Periksa koneksi atau izin popup.',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Google Sign Out Handler
  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setToastNotification({
      type: 'info',
      message: 'Anda telah keluar dari akun Google.',
    });
  };

  // Save Spreadsheet Config
  const handleSaveSpreadsheetConfig = (config: SpreadsheetConfig) => {
    setSpreadsheetConfig(config);
    try {
      localStorage.setItem('dialysis_spreadsheet_config', JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save spreadsheet config', e);
    }
  };

  // Pull data from Google Sheet
  const handlePullFromSheet = async (spreadsheetId: string) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Silakan masuk dengan akun Google terlebih dahulu untuk menarik data.');
    }

    setIsSyncing(true);
    try {
      const importedPatients = await readPatientsFromSheet(spreadsheetId, token, selectedMonth);
      if (importedPatients.length === 0) {
        setToastNotification({
          type: 'info',
          message: 'Sheet terhubung, namun belum ada baris pasien yang ditemukan pada spreadsheet.',
        });
      } else {
        const uniqueImported = ensureUniquePatientIds(importedPatients);
        setPatients(uniqueImported);
        try {
          localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(uniqueImported));
          localStorage.setItem('dialysis_patients_data', JSON.stringify(uniqueImported));
        } catch (e) {}
        setToastNotification({
          type: 'success',
          message: `Berhasil mengimpor ${uniqueImported.length} pasien dari Google Sheet!`,
        });
      }

      handleSaveSpreadsheetConfig({
        spreadsheetId,
        sheetName: 'Alokasi_EPO_HD',
        lastSyncedAt: new Date().toISOString(),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Push data to Google Sheet
  const handlePushToSheet = async (spreadsheetId: string) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Silakan masuk dengan akun Google terlebih dahulu untuk menyimpan ke Sheet.');
    }

    setIsSyncing(true);
    try {
      await pushPatientsToSheet(spreadsheetId, patients, token, selectedMonth);
      handleSaveSpreadsheetConfig({
        spreadsheetId,
        sheetName: 'Senin-Kamis, Selasa-Jumat, Rabu-Sabtu',
        lastSyncedAt: new Date().toISOString(),
      });
      setToastNotification({
        type: 'success',
        message: `Berhasil menyimpan & mensinkronisasikan ${patients.length} pasien ke 3 sheet jadwal di Google Sheet!`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Pull via Apps Script (Tanpa Login Google)
  const handlePullViaAppsScript = async (url: string) => {
    setIsSyncing(true);
    try {
      const imported = await pullViaAppsScript(url, selectedMonth);
      if (imported.length === 0) {
        if (patients.length > 0) {
          setToastNotification({
            type: 'info',
            message: `Terhubung ke Apps Script! Spreadsheet Google Sheets Anda saat ini masih kosong. Klik tombol 'Kirim ke Sheet (Push)' untuk mengirimkan ${patients.length} data pasien dari aplikasi ke spreadsheet Anda.`,
          });
        } else {
          setToastNotification({
            type: 'info',
            message: 'Terhubung ke Apps Script! Spreadsheet Google Sheets Anda saat ini belum memiliki baris data pasien.',
          });
        }
      } else {
        const uniqueImported = ensureUniquePatientIds(imported);
        setPatients(uniqueImported);
        try {
          localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(uniqueImported));
          localStorage.setItem('dialysis_patients_data', JSON.stringify(uniqueImported));
        } catch (e) {}
        handleSaveSpreadsheetConfig({
          ...(spreadsheetConfig || {}),
          spreadsheetId: spreadsheetConfig?.spreadsheetId || OFFICIAL_SPREADSHEET_ID,
          sheetName: 'REKAP HB TAHUNAN & JADWAL HD',
          appsScriptUrl: url,
          lastSyncedAt: new Date().toISOString(),
        });
        setToastNotification({
          type: 'success',
          message: `Berhasil membaca ${uniqueImported.length} data pasien via Apps Script tanpa login!`,
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Push via Apps Script (Tanpa Login Google)
  const handlePushViaAppsScript = async (url: string, scheduleScope?: LabScheduleScope) => {
    setIsSyncing(true);
    try {
      await pushViaAppsScript(url, patients, selectedMonth, undefined, scheduleScope);
      handleSaveSpreadsheetConfig({
        ...(spreadsheetConfig || {}),
        spreadsheetId: spreadsheetConfig?.spreadsheetId || OFFICIAL_SPREADSHEET_ID,
        sheetName: 'REKAP HB TAHUNAN & JADWAL HD',
        appsScriptUrl: url,
        lastSyncedAt: new Date().toISOString(),
      });
      setToastNotification({
        type: 'success',
        message: `Berhasil mengirim ${patients.length} data pasien ke 3 sheet jadwal dan matriks Cek HB via Apps Script!`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Quick Push to Google Sheets (Per Sheet / Semua Sheet) langsung dari tombol tabel
  const handleQuickPushToSheet = async (targetSchedule?: HDDaySchedule, scheduleScope?: LabScheduleScope) => {
    const url = spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL;
    setIsSyncing(true);
    try {
      if (url) {
        await pushViaAppsScript(url, patients, selectedMonth, targetSchedule, scheduleScope);
        handleSaveSpreadsheetConfig({
          ...(spreadsheetConfig || {}),
          spreadsheetId: spreadsheetConfig?.spreadsheetId || OFFICIAL_SPREADSHEET_ID,
          sheetName: 'REKAP HB TAHUNAN & JADWAL HD',
          appsScriptUrl: url,
          lastSyncedAt: new Date().toISOString(),
        });
        setToastNotification({
          type: 'success',
          message: targetSchedule
            ? `Berhasil mengirim data yang diinputkan (${targetSchedule}) ke sheet di Google Sheets!`
            : `Berhasil mensinkronisasikan seluruh jadwal dan matriks Cek HB ke Google Sheets!`,
        });
      } else if (spreadsheetConfig?.spreadsheetId) {
        const token = await getAccessToken();
        if (token) {
          await pushPatientsToSheet(spreadsheetConfig.spreadsheetId, patients, token, selectedMonth, targetSchedule, scheduleScope);
          setToastNotification({
            type: 'success',
            message: targetSchedule
              ? `Berhasil mengirim data ${targetSchedule} ke tab spreadsheet!`
              : `Berhasil mensinkronisasikan seluruh data dan matriks Cek HB ke spreadsheet!`,
          });
        } else {
          setIsSyncModalOpen(true);
        }
      } else {
        setIsSyncModalOpen(true);
      }
    } catch (err: any) {
      console.error(err);
      setToastNotification({
        type: 'error',
        message: 'Gagal mengirim data ke Google Sheet. Periksa koneksi internet atau URL Apps Script.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Import from CSV (Tanpa Login Google)
  const handleImportCsv = (csvText: string) => {
    const imported = importFromCSV(csvText, selectedMonth);
    if (imported.length > 0) {
      const uniqueImported = ensureUniquePatientIds(imported);
      setPatients(uniqueImported);
      setToastNotification({
        type: 'success',
        message: `Berhasil memuat ${uniqueImported.length} data pasien dari file CSV!`,
      });
    } else {
      setToastNotification({
        type: 'error',
        message: 'File CSV tidak berisi data pasien yang valid.',
      });
    }
  };

  // Add or Edit Patient
  const handleSavePatient = (patientData: Partial<PatientRecord>) => {
    if (editingPatient) {
      // Update existing
      let savedList: PatientRecord[] = [];
      setPatients((prev) => {
        const updated = sortPatientsAlphabetically(prev.map((p) => {
          const isMatch = p.id === editingPatient.id || (
            Boolean(p.noRm && editingPatient.noRm) && 
            p.noRm.toLowerCase().trim() === editingPatient.noRm.toLowerCase().trim()
          );
          if (!isMatch) return p;
          const merged: PatientRecord = {
            ...p,
            ...patientData,
            id: p.id,
            dailyRecords: patientData.dailyRecords !== undefined ? patientData.dailyRecords : (p.dailyRecords || {}),
            updatedAt: new Date().toISOString(),
          };
          return merged;
        }));

        savedList = updated;

        try {
          localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(updated));
          localStorage.setItem('dialysis_patients_data', JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to save updated patient:', e);
        }

        return updated;
      });

      // Sinkronisasi perubahan identitas (Nama, No. RM, Shift, Jadwal, Frekuensi, DPJP) ke seluruh cache bulan di localStorage
      try {
        const allKeys = Object.keys(localStorage);
        for (const key of allKeys) {
          if (key.startsWith('dialysis_patients_data_') && key !== 'dialysis_patients_data_' + selectedMonth) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                let touched = false;
                const nextList = sortPatientsAlphabetically(list.map((p: PatientRecord) => {
                  const isMatch = p.id === editingPatient.id || (
                    Boolean(p.noRm && editingPatient.noRm) && 
                    p.noRm.toLowerCase().trim() === editingPatient.noRm.toLowerCase().trim()
                  );
                  if (!isMatch) return p;
                  touched = true;
                  return {
                    ...p,
                    name: patientData.name !== undefined ? patientData.name : p.name,
                    noRm: patientData.noRm !== undefined ? patientData.noRm : p.noRm,
                    age: patientData.age !== undefined ? patientData.age : p.age,
                    gender: patientData.gender !== undefined ? patientData.gender : p.gender,
                    scheduleDay: patientData.scheduleDay !== undefined ? patientData.scheduleDay : p.scheduleDay,
                    scheduleShift: patientData.scheduleShift !== undefined ? patientData.scheduleShift : p.scheduleShift,
                    hdFrequency: patientData.hdFrequency !== undefined ? patientData.hdFrequency : p.hdFrequency,
                    singleDay: patientData.singleDay !== undefined ? patientData.singleDay : p.singleDay,
                    lastHdDate: patientData.lastHdDate !== undefined ? patientData.lastHdDate : p.lastHdDate,
                    doctorInCharge: patientData.doctorInCharge !== undefined ? patientData.doctorInCharge : p.doctorInCharge,
                    patientStatus: patientData.patientStatus !== undefined ? patientData.patientStatus : p.patientStatus,
                    statusDate: patientData.statusDate !== undefined ? patientData.statusDate : p.statusDate,
                    statusNotes: patientData.statusNotes !== undefined ? patientData.statusNotes : p.statusNotes,
                    updatedAt: new Date().toISOString(),
                  };
                }));
                if (touched) {
                  localStorage.setItem(key, JSON.stringify(nextList));
                }
              }
            }
          }
        }
      } catch (syncErr) {
        console.warn('Cross-month demographic sync warning:', syncErr);
      }

      setToastNotification({
        type: 'success',
        message: autoSyncEnabled
          ? `Perubahan data pasien ${patientData.name || editingPatient.name} berhasil disimpan & disinkronkan langsung ke Google Sheets!`
          : `Perubahan data pasien ${patientData.name || editingPatient.name} berhasil disimpan.`,
      });

      if (autoSyncEnabled && savedList.length > 0) {
        const isStatusChanged = patientData.patientStatus !== undefined && patientData.patientStatus !== editingPatient.patientStatus;
        triggerAutoSync(
          savedList, 
          undefined, 
          isStatusChanged ? undefined : ((patientData.scheduleDay || editingPatient.scheduleDay) as HDDaySchedule)
        );
      }
    } else {
      // Create new
      const newPatient: PatientRecord = {
        id: `pat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        noRm: patientData.noRm || `RM-${Math.floor(10000 + Math.random() * 90000)}`,
        name: patientData.name || 'Pasien Baru',
        age: patientData.age,
        gender: patientData.gender || 'L',
        patientStatus: patientData.patientStatus || 'Aktif',
        statusDate: patientData.statusDate,
        statusNotes: patientData.statusNotes,
        hdFrequency: patientData.hdFrequency || '2 kali dalam satu minggu',
        singleDay: patientData.singleDay,
        lastHdDate: patientData.lastHdDate,
        scheduleDay: patientData.scheduleDay || 'Senin - Kamis',
        scheduleShift: patientData.scheduleShift || 'Shift 1 (Pagi)',
        hbValue: typeof patientData.hbValue === 'number' ? patientData.hbValue : 0,
        hbDate: patientData.hbDate || getFirstHDDateOfMonth(selectedMonth, patientData.scheduleDay || 'Senin - Kamis', patientData.singleDay, patientData.hdFrequency, patientData.lastHdDate).dateString,
        monthPeriod: selectedMonth,
        recommendation: patientData.recommendation!,
        weeks: patientData.weeks!,
        dailyRecords: patientData.dailyRecords || {},
        overallStatus: patientData.overallStatus || 'Berjalan',
        clinicalNotes: patientData.clinicalNotes,
        doctorInCharge: patientData.doctorInCharge || 'dr. Sp.PD-KGH',
        updatedAt: new Date().toISOString(),
      };
      let savedList: PatientRecord[] = [];
      setPatients((prev) => {
        // Otomatis langsung urut sesuai abjad nama (A - Z) saat menambahkan pasien baru
        const updated = sortPatientsAlphabetically([...prev, newPatient]);
        savedList = updated;
        try {
          localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(updated));
          localStorage.setItem('dialysis_patients_data', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      // Pindahkan sheet tab aktif ke jadwal pasien baru agar langsung terlihat otomatis urut abjad
      if (newPatient.scheduleDay) {
        setActiveSheetTab(newPatient.scheduleDay);
      }

      setToastNotification({
        type: 'success',
        message: autoSyncEnabled
          ? `Pasien baru ${newPatient.name} berhasil ditambahkan & otomatis terurut sesuai abjad di jadwal ${newPatient.scheduleDay}!`
          : `Pasien baru ${newPatient.name} ditambahkan & otomatis terurut sesuai abjad di jadwal ${newPatient.scheduleDay}.`,
      });
      if (autoSyncEnabled && savedList.length > 0) {
        triggerAutoSync(savedList, undefined, newPatient.scheduleDay);
      }
    }
    setEditingPatient(null);
  };

  // Navigasi & Sinkronisasi Perpindahan Bulan:
  // Sesuai Permintaan Inti:
  // 1. Pada sesi CEK HB SELURUH PASIEN:
  //    Contoh: input CEK HB SELURUH PASIEN untuk BULAN FEBRUARI 2026 di bulan JANUARI 2026,
  //    maka seluruh pasien Tn A, Tn B, Tn C dan Tn D pada bulan Februari 2026 nilai HB nya berstatus 0 (menunggu hasil lab).
  // 2. Pada sesi CEK HB PILIHAN:
  //    Pasien yang tidak terjadwal otomatis terisi nilai HB nya sesuai dengan nilai bulan sebelumnya karena tidak melakukan CEK HB.
  //    Contoh: input CEK HB PILIHAN untuk BULAN FEBRUARI 2026 di bulan JANUARI 2026,
  //    maka pada bulan Februari 2026 Tn A otomatis terisi nilai HB nya (12.0),
  //    sedangkan Tn B, Tn C, dan Tn D terisi nilai 0 (Menunggu Hasil Lab).
  const handleMonthChange = (newMonth: string) => {
    setIsPastMonthUnlocked(false);
    // 1. Simpan data pasien bulan aktif saat ini sebelum berpindah
    try {
      localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(patients));
      localStorage.setItem('dialysis_selected_month', newMonth);
    } catch (e) {}

    setSelectedMonth(newMonth);

    // 2. Cek apakah sudah ada data tersimpan khusus untuk newMonth
    let savedForNewMonth: PatientRecord[] | null = null;
    try {
      const raw = localStorage.getItem('dialysis_patients_data_' + newMonth);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          savedForNewMonth = ensureUniquePatientIds(parsed);
        }
      }
    } catch (e) {}

    if (savedForNewMonth && savedForNewMonth.length > 0) {
      setPatients(savedForNewMonth);
      try {
        localStorage.setItem('dialysis_patients_data', JSON.stringify(savedForNewMonth));
      } catch (e) {}
      return;
    }

    // 3. Jika belum ada data tersimpan untuk newMonth, generate dari data pasien saat ini
    // Sesuai mode sesi yang terkonfigurasi untuk newMonth ('SELURUH' atau 'PILIHAN'):
    let scope: 'SELURUH' | 'PILIHAN' = 'PILIHAN';
    try {
      const stored = localStorage.getItem('epocare_lab_schedule_mode_' + newMonth) || localStorage.getItem('epocare_lab_schedule_mode');
      if (stored === 'SELURUH' || stored === 'PILIHAN') {
        scope = stored;
      }
    } catch (e) {}

    const [newYearStr] = newMonth.split('-');
    let cachedYearlyMap: Map<string, { currentHb: number; prevHb?: number; doctor?: string; notes?: string }> | null = null;
    try {
      const cachedRowsRaw = localStorage.getItem('epocare_yearly_rows_' + newYearStr);
      if (cachedRowsRaw) {
        const cachedRows = JSON.parse(cachedRowsRaw);
        if (Array.isArray(cachedRows) && cachedRows.length > 1) {
          cachedYearlyMap = extractYearlyPatientInfoMap(cachedRows, newMonth);
        }
      }
    } catch (e) {}

    const prevMonthStr = getPreviousYearMonth(newMonth);
    const prevMonthMap = new Map<string, number>();
    try {
      const rawPrev = localStorage.getItem('dialysis_patients_data_' + prevMonthStr);
      if (rawPrev) {
        const parsedPrev = JSON.parse(rawPrev);
        if (Array.isArray(parsedPrev)) {
          parsedPrev.forEach((pp: any) => {
            const key = (pp.noRm || pp.id || '').toLowerCase().trim();
            if (key && typeof pp.hbValue === 'number' && pp.hbValue > 0) {
              prevMonthMap.set(key, pp.hbValue);
            }
          });
        }
      }
    } catch (e) {}

    setPatients((prev) => {
      const generated: PatientRecord[] = prev.map((p) => {
        const targetFirstDate = getFirstHDDateOfMonth(
          newMonth,
          p.scheduleDay,
          p.singleDay,
          p.hdFrequency,
          p.lastHdDate
        ).dateString;

        const key = (p.noRm || p.id || '').toLowerCase().trim();
        const normKey = key.replace(/[^a-z0-9]/g, '');
        const normName = (p.name || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const yInfo = cachedYearlyMap ? (cachedYearlyMap.get(key) || cachedYearlyMap.get(normKey) || cachedYearlyMap.get(normName)) : null;

        // Acuan nilai Hb untuk bulan newMonth
        let priorHb = 0;
        if (yInfo?.prevHb !== undefined && yInfo.prevHb > 0) {
          priorHb = yInfo.prevHb;
        } else if (prevMonthMap.has(key)) {
          priorHb = prevMonthMap.get(key) || 0;
        } else if (p.monthPeriod === prevMonthStr && typeof p.hbValue === 'number' && p.hbValue > 0) {
          priorHb = p.hbValue;
        }

        const currentHbFromYearly = yInfo?.currentHb && yInfo.currentHb > 0 ? yInfo.currentHb : 0;
        const isCandidate = (priorHb > 0 && priorHb < 9.0) || isSelectiveHbCandidate(p);

        // Jika Google Sheet sudah mencatat hasil Hb untuk bulan ini, gunakan nilai riil dari sheet
        if (currentHbFromYearly > 0) {
          const reco = calculateClinicalRecommendation(currentHbFromYearly, p.hdFrequency);
          const weeks = generateDefaultWeeks(reco.category, newMonth, p.hdFrequency, p.scheduleDay, p.singleDay, p.lastHdDate);
          return {
            ...p,
            hbValue: currentHbFromYearly,
            prevHbValue: priorHb > 0 ? priorHb : p.prevHbValue,
            hbDate: targetFirstDate,
            monthPeriod: newMonth,
            recommendation: reco,
            overallStatus: reco.category === 'TRANSFUSI_2_RAWAT_INAP' ? 'Perlu Perhatian' : 'Berjalan',
            weeks,
            dailyRecords: {},
            labSchedule: {
              scheduledDate: targetFirstDate,
              testType: (priorHb > 0 && priorHb <= 8.9) ? 'Cek Hb Pilihan (Hb ≤ 8.9)' : 'Rutin Hb (Evaluasi EPO)',
              status: 'Selesai',
              resultHb: currentHbFromYearly,
              notes: yInfo?.notes || 'Hasil Lab Tercatat di Google Sheet',
              isSelectiveHb: (priorHb > 0 && priorHb <= 8.9),
            },
            clinicalNotes: yInfo?.notes || p.clinicalNotes,
            doctorInCharge: yInfo?.doctor || p.doctorInCharge,
            updatedAt: new Date().toISOString(),
          };
        }

        if (scope === 'SELURUH') {
          // ATURAN 1 (CEK HB SELURUH PASIEN):
          // Seluruh pasien (Tn A, Tn B, Tn C, Tn D) berstatus 0 (menunggu hasil lab)
          const reco = calculateClinicalRecommendation(0, p.hdFrequency);
          const weeks = generateDefaultWeeks('MENUNGGU_HASIL_LAB', newMonth, p.hdFrequency, p.scheduleDay, p.singleDay, p.lastHdDate);
          return {
            ...p,
            hbValue: 0,
            prevHbValue: priorHb > 0 ? priorHb : p.prevHbValue,
            hbDate: targetFirstDate,
            monthPeriod: newMonth,
            recommendation: reco,
            overallStatus: 'Menunggu',
            weeks,
            dailyRecords: {},
            labSchedule: {
              scheduledDate: targetFirstDate,
              testType: 'Rutin Hb (Evaluasi EPO)',
              status: 'Terjadwal',
              notes: 'Evaluasi rutin awal bulan (Cek Hb Seluruh Pasien)',
              isSelectiveHb: false,
            },
            updatedAt: new Date().toISOString(),
          };
        } else {
          // ATURAN 2 (CEK HB PILIHAN):
          if (priorHb >= 9.0 && !isCandidate) {
            // Pasien tidak terjadwal (Tn A) otomatis terisi nilai bulan sebelumnya (12.0)
            const reco = calculateClinicalRecommendation(priorHb, p.hdFrequency);
            const weeks = generateDefaultWeeks(reco.category, newMonth, p.hdFrequency, p.scheduleDay, p.singleDay, p.lastHdDate);
            return {
              ...p,
              hbValue: priorHb,
              prevHbValue: priorHb,
              hbDate: targetFirstDate,
              monthPeriod: newMonth,
              recommendation: reco,
              overallStatus: reco.category === 'TRANSFUSI_2_RAWAT_INAP' ? 'Perlu Perhatian' : 'Berjalan',
              weeks,
              dailyRecords: {},
              labSchedule: {
                scheduledDate: '',
                testType: 'Rutin Hb (Evaluasi EPO)',
                status: 'Tidak Ada Jadwal',
                notes: `Tidak dijadwalkan Cek Hb bulan depan (Hb acuan ${priorHb.toFixed(1)} g/dL)`,
                isSelectiveHb: false,
              },
              updatedAt: new Date().toISOString(),
            };
          } else {
            // Pasien terjadwal (Tn B, Tn C, Tn D) berstatus 0 (menunggu hasil lab)
            const reco = calculateClinicalRecommendation(0, p.hdFrequency);
            const weeks = generateDefaultWeeks('MENUNGGU_HASIL_LAB', newMonth, p.hdFrequency, p.scheduleDay, p.singleDay, p.lastHdDate);
            return {
              ...p,
              hbValue: 0,
              prevHbValue: priorHb > 0 ? priorHb : p.prevHbValue,
              hbDate: targetFirstDate,
              monthPeriod: newMonth,
              recommendation: reco,
              overallStatus: 'Menunggu',
              weeks,
              dailyRecords: {},
              labSchedule: {
                scheduledDate: targetFirstDate,
                testType: 'Cek Hb Pilihan (Hb ≤ 8.9)',
                status: 'Terjadwal',
                notes: `⭐ Cek Hb Pilihan: Evaluasi anemia (Hb acuan ${priorHb > 0 ? priorHb.toFixed(1) : '< 9.0'} g/dL)`,
                isSelectiveHb: true,
                selectiveReason: `Nilai Hb acuan < 9.0 mg/dL (${priorHb > 0 ? priorHb.toFixed(1) : '< 9.0'})`,
              },
              updatedAt: new Date().toISOString(),
            };
          }
        }
      });

      const sortedGenerated = sortPatientsAlphabetically(generated);
      try {
        localStorage.setItem('dialysis_patients_data_' + newMonth, JSON.stringify(sortedGenerated));
        localStorage.setItem('dialysis_patients_data', JSON.stringify(sortedGenerated));
      } catch (e) {}

      return sortedGenerated;
    });
  };

  // Delete Patient
  const handleDeletePatient = (patientId: string) => {
    const target = patients.find((p) => p.id === patientId);
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus data pasien ${target?.name || 'ini'} dari jadwal alokasi?`
    );
    if (!confirmed) return;

    let remainingList: PatientRecord[] = [];
    setPatients((prev) => {
      const filtered = prev.filter((p) => p.id !== patientId);
      remainingList = filtered;
      return filtered;
    });
    setToastNotification({
      type: 'info',
      message: autoSyncEnabled
        ? `Pasien ${target?.name || ''} telah dihapus dan disinkronkan ke Google Sheets.`
        : `Pasien ${target?.name || ''} telah dihapus dari daftar.`,
    });
    if (autoSyncEnabled) {
      triggerAutoSync(remainingList);
    }
  };

  // Update Week Status (M1, M2, M3, M4)
  const handleUpdateWeekStatus = (
    patientId: string,
    weekKey: 'week1' | 'week2' | 'week3' | 'week4',
    newStatus: DoseStatus,
    nurseName?: string
  ) => {
    let updatedList: PatientRecord[] = [];
    setPatients((prev) => {
      const next = prev.map((patient) => {
        if (patient.id !== patientId) return patient;

        const currentWeek = patient.weeks[weekKey];
        const updatedWeek = {
          ...currentWeek,
          status: newStatus,
          administeredAt: newStatus === 'Diberikan' 
            ? new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
            : undefined,
          administeredBy: newStatus === 'Diberikan' ? (nurseName || 'Perawat HD') : undefined,
        };

        const updatedWeeks = {
          ...patient.weeks,
          [weekKey]: updatedWeek,
        };

        // Recalculate overall status
        const allActiveWeeks = ['week1', 'week2', 'week3', 'week4'].filter(
          (k) => (updatedWeeks as any)[k].status !== 'Tidak Ada Jadwal'
        );
        const allDone = allActiveWeeks.every(
          (k) => (updatedWeeks as any)[k].status === 'Diberikan'
        );

        let overallStatus = patient.overallStatus;
        if (patient.recommendation.category === 'TRANSFUSI_2_RAWAT_INAP') {
          overallStatus = 'Perlu Perhatian';
        } else if (allDone && allActiveWeeks.length > 0) {
          overallStatus = 'Selesai';
        } else {
          overallStatus = 'Berjalan';
        }

        return {
          ...patient,
          weeks: updatedWeeks,
          overallStatus,
          updatedAt: new Date().toISOString(),
        };
      });
      updatedList = next;
      return next;
    });

    if (autoSyncEnabled && updatedList.length > 0) {
      const pat = patients.find((p) => p.id === patientId);
      triggerAutoSync(updatedList, undefined, pat?.scheduleDay);
    }
  };

  // Update Date-level action (Injeksi Diberikan, Tunda ke Hari Kedua, Ubah Sel Kustom, Reset, dll)
  const handleUpdateDateAction = (
    patientId: string,
    dateNumber: number,
    newStatus: DoseStatus,
    nurseName?: string,
    notes?: string,
    customCellText?: string,
    doseIU?: number
  ) => {
    let updatedList: PatientRecord[] = [];
    setPatients((prev) => {
      const next = prev.map((patient) => {
        if (patient.id !== patientId) return patient;

        const monthInfo = getMonthDaysInfo(selectedMonth);
        const dayInfo = monthInfo.days[dateNumber - 1];
        if (!dayInfo) return patient;

        const isOnceWeekly = patient.hdFrequency === '1 kali dalam satu minggu';
        const { isPrimary, pairedDate } = getPairedHDDate(
          dateNumber,
          dayInfo.dayOfWeek,
          patient.scheduleDay,
          monthInfo.daysInMonth,
          patient.hdFrequency,
          patient.singleDay
        );

        const sessions = getPatientMonthHDSessions(patient, monthInfo);
        const currIdx = sessions.findIndex((s) => s.dateNumber === dateNumber);
        const nextSession = currIdx >= 0 && currIdx < sessions.length - 1 ? sessions[currIdx + 1] : null;
        const targetNextDate = nextSession ? nextSession.dateNumber : pairedDate;

        const currentRecords = { ...(patient.dailyRecords || {}) };

        if (customCellText !== undefined) {
          const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
          const isGiven = customCellText === '✅' || newStatus === 'Diberikan';
          currentRecords[dateNumber] = {
            ...(currentRecords[dateNumber] || {}),
            status: isGiven ? 'Diberikan' : newStatus,
            customCellText: customCellText || undefined,
            doseIU: doseIU !== undefined ? doseIU : (customCellText === '4000' ? 4000 : 2000),
            administeredAt: isGiven ? nowStr : undefined,
            administeredBy: isGiven ? (nurseName || 'Ns. Maya') : undefined,
            notes: notes || undefined,
          };
          setToastNotification({
            type: 'success',
            message: `Isi sel tgl ${dateNumber} diubah menjadi "${customCellText}". Seluruh terapi sebelumnya tetap tersimpan utuh!`,
          });
        } else if (newStatus === 'Tunda') {
          if (targetNextDate) {
            const isBiweekly = patient.hdFrequency === '1 kali / 2 minggu';
            const defaultNote = isBiweekly
              ? `Ditunda tgl ${dateNumber}, dialihkan ke sesi HD 14 hari berikutnya tgl ${targetNextDate}`
              : `Ditunda tgl ${dateNumber}, dialihkan ke sesi HD berikutnya tgl ${targetNextDate}`;
            currentRecords[dateNumber] = {
              status: 'Tunda',
              postponedToDate: targetNextDate,
              notes: notes || defaultNote,
            };
            currentRecords[targetNextDate] = {
              ...(currentRecords[targetNextDate] || {}),
              status: 'Belum',
              postponedFromDate: dateNumber,
              notes: `Jadwal Pengganti dari penundaan tgl ${dateNumber}`,
            };
            setToastNotification({
              type: 'info',
              message: isBiweekly
                ? `Pemberian EPO tgl ${dateNumber} Ditunda (❌) dan otomatis dialihkan ke sesi HD 14 hari berikutnya tgl ${targetNextDate}.`
                : `Pemberian EPO tgl ${dateNumber} Ditunda (❌) dan otomatis dialihkan ke sesi HD berikutnya tgl ${targetNextDate}.`,
            });
          } else {
            currentRecords[dateNumber] = {
              status: 'Tunda',
              notes: notes || `Ditunda tgl ${dateNumber} (Akhir bulan — alokasi dialihkan ke bulan berikutnya)`,
            };
            setToastNotification({
              type: 'info',
              message: `Pemberian EPO tgl ${dateNumber} Ditunda (❌) pada sesi akhir bulan.`,
            });
          }
        } else if (newStatus === 'Diberikan') {
          const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
          currentRecords[dateNumber] = {
            ...(currentRecords[dateNumber] || {}),
            status: 'Diberikan',
            administeredAt: nowStr,
            administeredBy: nurseName || 'Ns. Maya',
            notes: notes || undefined,
          };
          setToastNotification({
            type: 'success',
            message: `EPO Diberikan (✅) 2000 IU pada tanggal ${dateNumber}.`,
          });
        } else if (newStatus === 'Batal') {
          currentRecords[dateNumber] = {
            ...(currentRecords[dateNumber] || {}),
            status: 'Batal',
            notes: notes || 'Dibatalkan',
          };
          setToastNotification({
            type: 'info',
            message: `Pemberian EPO tgl ${dateNumber} dibatalkan.`,
          });
        } else if (newStatus === 'Belum') {
          // Reset status tanggal dan batalkan pengalihan / reschedule terkait
          const existing = currentRecords[dateNumber];
          if (existing?.postponedToDate) {
            const destDate = existing.postponedToDate;
            if (currentRecords[destDate]?.postponedFromDate === dateNumber) {
              if (currentRecords[destDate].status === 'Belum') {
                delete currentRecords[destDate];
              } else {
                delete currentRecords[destDate].postponedFromDate;
              }
            }
          }
          if (existing?.postponedFromDate) {
            const srcDate = existing.postponedFromDate;
            if (currentRecords[srcDate]?.postponedToDate === dateNumber) {
              delete currentRecords[srcDate].postponedToDate;
            }
          }
          if (existing?.rescheduledToDate) {
            const destDate = existing.rescheduledToDate;
            if (currentRecords[destDate]?.rescheduledFromDate === dateNumber) {
              if (currentRecords[destDate].status === 'Belum') {
                delete currentRecords[destDate];
              } else {
                delete currentRecords[destDate].rescheduledFromDate;
              }
            }
          }
          if (existing?.rescheduledFromDate) {
            const srcDate = existing.rescheduledFromDate;
            if (currentRecords[srcDate]?.rescheduledToDate === dateNumber) {
              delete currentRecords[srcDate];
            }
          }
          delete currentRecords[dateNumber];
          setToastNotification({
            type: 'info',
            message: `Status tanggal ${dateNumber} di-reset ke jadwal default semula.`,
          });
        }

        // Hitung total dosis diberikan dan sinkronkan dengan status overall
        let totalGiven = 0;
        for (let d = 1; d <= monthInfo.daysInMonth; d++) {
          const info = getDateDoseDisplayInfo({ ...patient, dailyRecords: currentRecords }, d, monthInfo);
          if (info.cellCode === '✅' || (info.cellCode as any) === 'P') totalGiven++;
        }

        let overallStatus = patient.overallStatus;
        if (patient.recommendation.category === 'TRANSFUSI_2_RAWAT_INAP') {
          overallStatus = 'Perlu Perhatian';
        } else if (totalGiven >= patient.recommendation.totalEpoVials && patient.recommendation.totalEpoVials > 0) {
          overallStatus = 'Selesai';
        } else if (totalGiven > 0) {
          overallStatus = 'Berjalan';
        }

        // Sinkronkan ke alokasi minggu (weeks) secara akurat
        const updatedWeeks = { ...patient.weeks };
        const originalSourceDate = currentRecords[dateNumber]?.postponedFromDate || dateNumber;
        const weekNum = getHDSessionWeek(originalSourceDate, monthInfo.daysInMonth, patient.scheduleDay, currentRecords[dateNumber]?.postponedFromDate);
        const weekKey = `week${weekNum}` as 'week1' | 'week2' | 'week3' | 'week4';
        if (updatedWeeks[weekKey]) {
          if (newStatus === 'Diberikan') {
            updatedWeeks[weekKey] = {
              ...updatedWeeks[weekKey],
              status: 'Diberikan',
              administeredAt: currentRecords[dateNumber]?.administeredAt,
              administeredBy: currentRecords[dateNumber]?.administeredBy,
              notes: currentRecords[dateNumber]?.postponedFromDate 
                ? `Diberikan pada Hari Kedua (tgl ${dateNumber}) pengalihan dari penundaan tgl ${currentRecords[dateNumber].postponedFromDate}`
                : undefined,
            };
          } else if (newStatus === 'Tunda') {
            updatedWeeks[weekKey] = {
              ...updatedWeeks[weekKey],
              status: 'Tunda',
              notes: targetNextDate ? `Ditunda tgl ${dateNumber}, dialihkan ke sesi HD berikutnya tgl ${targetNextDate}` : 'Ditunda',
            };
          } else if (newStatus === 'Belum') {
            updatedWeeks[weekKey] = {
              ...updatedWeeks[weekKey],
              status: 'Belum',
              notes: undefined,
              administeredAt: undefined,
              administeredBy: undefined,
            };
          }
        }

        return {
          ...patient,
          dailyRecords: currentRecords,
          weeks: updatedWeeks,
          overallStatus,
          updatedAt: new Date().toISOString(),
        };
      });
      updatedList = next;
      return next;
    });

    if (autoSyncEnabled && updatedList.length > 0) {
      const pat = patients.find((p) => p.id === patientId);
      triggerAutoSync(updatedList, undefined, pat?.scheduleDay);
    }
  };

  // Reschedule 1 Sesi HD (Tukar Hari Bebas / Geser Jadwal Sesi Tertentu)
  // Tidak mengubah jadwal reguler (scheduleDay / scheduleShift), hanya mengubah sel pada matriks kalender bulan berjalan
  const handleRescheduleDate = (
    patientId: string,
    sourceDate: number,
    targetDate: number,
    notes?: string
  ) => {
    let updatedList: PatientRecord[] = [];
    setPatients((prev) => {
      const next = prev.map((patient) => {
        if (patient.id !== patientId) return patient;

        const monthInfo = getMonthDaysInfo(selectedMonth);
        const currentRecords = { ...(patient.dailyRecords || {}) };

        // Deteksi apa isi/dosis sesi di sourceDate sebelum di-reschedule
        const sourceInfo = getDateDoseDisplayInfo(patient, sourceDate, monthInfo);
        const inheritedDose = sourceInfo.doseIU || (sourceInfo.cellCode === '4000' ? 4000 : (sourceInfo.cellCode === '2000' ? 2000 : undefined));
        let inheritedCellCode: string = 'HD';

        if (sourceInfo.cellCode === 'PRC 1' || sourceInfo.cellCode === 'PRC 2') {
          inheritedCellCode = sourceInfo.cellCode;
        } else if (sourceInfo.cellCode === 'Cek') {
          inheritedCellCode = 'Cek';
        } else if (sourceInfo.cellCode === '4000') {
          inheritedCellCode = '4000';
        } else if (sourceInfo.cellCode === '2000') {
          inheritedCellCode = '2000';
        } else if (sourceInfo.cellCode === 'Hold') {
          inheritedCellCode = 'Hold';
        } else {
          inheritedCellCode = 'HD';
        }

        const noteText = notes || `Reschedule HD dari tgl ${sourceDate} ke tgl ${targetDate}`;

        // 1. Sesi Asal (sourceDate): Pasien tidak HD pada tanggal ini, dipindah ke targetDate
        currentRecords[sourceDate] = {
          ...(currentRecords[sourceDate] || {}),
          status: 'Tunda',
          rescheduledToDate: targetDate,
          customCellText: `→${targetDate}`,
          notes: noteText,
        };

        // 2. Sesi Tujuan (targetDate): Menjadi sesi HD aktif pengganti tukar hari
        currentRecords[targetDate] = {
          ...(currentRecords[targetDate] || {}),
          status: 'Belum',
          rescheduledFromDate: sourceDate,
          doseIU: inheritedDose,
          customCellText: inheritedCellCode,
          notes: `Sesi HD pengganti tukar hari dari tgl ${sourceDate}${notes ? `: ${notes}` : ''}`,
        };

        return {
          ...patient,
          dailyRecords: currentRecords,
          updatedAt: new Date().toISOString(),
        };
      });
      updatedList = next;
      return next;
    });

    const pat = patients.find((p) => p.id === patientId);
    setToastNotification({
      type: 'success',
      message: `Reschedule ${pat?.name || 'Pasien'}: Sesi tgl ${sourceDate} berhasil dipindah ke tgl ${targetDate}. Jadwal reguler tetap aman!`,
    });

    if (autoSyncEnabled && updatedList.length > 0) {
      const pat = patients.find((p) => p.id === patientId);
      triggerAutoSync(updatedList, undefined, pat?.scheduleDay);
    }
  };

  // Batalkan Reschedule (Kembalikan ke jadwal semula)
  const handleCancelReschedule = (patientId: string, dateNumber: number) => {
    let updatedList: PatientRecord[] = [];
    setPatients((prev) => {
      const next = prev.map((patient) => {
        if (patient.id !== patientId) return patient;
        const currentRecords = { ...(patient.dailyRecords || {}) };
        const rec = currentRecords[dateNumber];
        if (!rec) return patient;

        if (rec.rescheduledToDate) {
          const dest = rec.rescheduledToDate;
          delete currentRecords[dateNumber];
          if (currentRecords[dest]?.rescheduledFromDate === dateNumber) {
            delete currentRecords[dest];
          }
        } else if (rec.rescheduledFromDate) {
          const src = rec.rescheduledFromDate;
          delete currentRecords[dateNumber];
          if (currentRecords[src]?.rescheduledToDate === dateNumber) {
            delete currentRecords[src];
          }
        }

        return {
          ...patient,
          dailyRecords: currentRecords,
          updatedAt: new Date().toISOString(),
        };
      });
      updatedList = next;
      return next;
    });

    const pat = patients.find((p) => p.id === patientId);
    setToastNotification({
      type: 'info',
      message: `Reschedule ${pat?.name || 'Pasien'} dibatalkan. Sesi telah dikembalikan ke status jadwal reguler semula.`,
    });

    if (autoSyncEnabled && updatedList.length > 0) {
      const pat = patients.find((p) => p.id === patientId);
      triggerAutoSync(updatedList, undefined, pat?.scheduleDay);
    }
  };

  // Update Nilai Hb di Tengah Bulan / Sel Spesifik (Evaluasi Lab Pasca Transfusi / Lab Khusus)
  // Menyesuaikan rekomendasi terapi lanjutan dan terapi sesi selanjutnya sesuai protokol klinis
  // tanpa mereset atau menghapus riwayat sesi yang sudah berstatus 'Diberikan' (✅)
  const handleUpdateMidMonthHb = (
    patientId: string,
    newHb: number,
    testDate: string,
    notes?: string,
    dateNumber?: number
  ) => {
    let updatedList: PatientRecord[] = [];
    let appliedRecoTitle = '';
    setPatients((prev) => {
      const next = prev.map((patient) => {
        if (patient.id !== patientId) return patient;

        const validHb = Number(newHb.toFixed(1));
        const reco = calculateClinicalRecommendation(validHb, patient.hdFrequency);
        appliedRecoTitle = reco.protocolBadge || reco.title;
        const isCategoryChanged = reco.category !== patient.recommendation.category;

        // 1. Seluruh dailyRecords riwayat sebelumnya 100% AMAN DIPERTAHANKAN
        const currentDailyRecords = { ...(patient.dailyRecords || {}) };
        const monthInfo = getMonthDaysInfo(selectedMonth);
        const sessions = getPatientMonthHDSessions(patient, monthInfo);

        // 2. Cek apakah di bulan ini sudah ada sesi yang pernah berstatus 'Diberikan' (✅)
        const alreadyGivenDoses = Object.entries(currentDailyRecords).filter(([dStr, r]) => {
          const dNum = parseInt(dStr, 10);
          return r.status === 'Diberikan' && (!dateNumber || dNum < dateNumber);
        });
        const hasGivenBefore = alreadyGivenDoses.length > 0;

        // 3. Tentukan isi sel pada tanggal spesifik yang diupdate (dateNumber)
        let cellText = '2000';
        let dose = 2000;
        let dateNote = notes || `Update Hb ${validHb} g/dL (${reco.title})`;

        if (reco.category === 'TRANSFUSI_2_RAWAT_INAP') {
          cellText = 'PRC 2';
          dose = 0;
          dateNote = notes || `Update Hb ${validHb} g/dL (Protokol 1: Transfusi 2 Bag PRC via Rawat Inap)`;
        } else if (reco.category === 'TRANSFUSI_1_KANTONG') {
          cellText = 'PRC 1';
          dose = 0;
          dateNote = notes || `Update Hb ${validHb} g/dL (Protokol 2: Transfusi 1 Bag PRC)`;
        } else if (reco.category === 'HOLD_EVALUASI') {
          cellText = 'Hold';
          dose = 0;
          dateNote = notes || `Update Hb ${validHb} g/dL (Protokol 5: Tanpa Terapi EPO / Hold)`;
        } else if (reco.category === 'EPO_1X_2000') {
          if (hasGivenBefore) {
            cellText = 'HD';
            dose = 0;
            dateNote = notes || `Update Hb ${validHb} g/dL (Target 1x 2000 IU Maintenance bulan ini telah diberikan di sesi sebelumnya)`;
          } else {
            cellText = '2000';
            dose = 2000;
            dateNote = notes || `Update Hb ${validHb} g/dL (Protokol 4: Terjadwal EPO 1x 2000 IU Maintenance)`;
          }
        } else if (reco.category === 'EPO_4X_2000') {
          cellText = '2000';
          dose = 2000;
          dateNote = notes || `Update Hb ${validHb} g/dL (Protokol 3: Terjadwal EPO 2000 IU Dosis Penuh)`;
        } else if (reco.category === 'MENUNGGU_HASIL_LAB') {
          cellText = 'Cek';
          dose = 0;
        }

        if (dateNumber) {
          const existingAtDate = currentDailyRecords[dateNumber];
          currentDailyRecords[dateNumber] = {
            ...(existingAtDate || {}),
            status: existingAtDate?.status === 'Diberikan' ? 'Diberikan' : 'Belum',
            customCellText: existingAtDate?.status === 'Diberikan' ? '✅' : cellText,
            doseIU: existingAtDate?.status === 'Diberikan' ? (existingAtDate.doseIU || dose) : dose,
            isHbUpdateDate: true,
            updatedHbValue: validHb,
            updatedHbDate: testDate,
            notes: dateNote,
          };

          // 4. TERAPI SELANJUTNYA: Sesuaikan seluruh sesi HD setelah tanggal tersebut (d > dateNumber)
          // mengikuti protokol klinis dari nilai Hb yang baru saja diinputkan!
          const futureHDSessions = sessions.filter((s) => s.dateNumber > dateNumber);
          let epoAllocatedForMaintenance = (cellText === '2000') || hasGivenBefore;

          futureHDSessions.forEach((fut) => {
            const d = fut.dateNumber;
            const existingFut = currentDailyRecords[d];

            // Riwayat sesi yang sudah berstatus 'Diberikan' (✅) tetap aman dan tidak diubah
            if (existingFut?.status === 'Diberikan') return;

            const resTo = existingFut?.rescheduledToDate;
            const resFrom = existingFut?.rescheduledFromDate;

            if (reco.category === 'TRANSFUSI_2_RAWAT_INAP') {
              currentDailyRecords[d] = {
                ...(existingFut || {}),
                status: 'Belum',
                customCellText: 'HD',
                doseIU: 0,
                notes: `Sesi Rutin HD (Pasca Transfusi 2 Bag Rawat Inap tgl ${dateNumber})`,
                ...(resTo ? { rescheduledToDate: resTo } : {}),
                ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
              };
            } else if (reco.category === 'TRANSFUSI_1_KANTONG') {
              currentDailyRecords[d] = {
                ...(existingFut || {}),
                status: 'Belum',
                customCellText: 'HD',
                doseIU: 0,
                notes: `Sesi Rutin HD (Observasi Pasca Transfusi 1 Bag PRC tgl ${dateNumber})`,
                ...(resTo ? { rescheduledToDate: resTo } : {}),
                ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
              };
            } else if (reco.category === 'HOLD_EVALUASI') {
              currentDailyRecords[d] = {
                ...(existingFut || {}),
                status: 'Belum',
                customCellText: 'Hold',
                doseIU: 0,
                notes: `Protokol 5: Tanpa Terapi EPO (Hb ${validHb} g/dL > 12.00 mg/dl)`,
                ...(resTo ? { rescheduledToDate: resTo } : {}),
                ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
              };
            } else if (reco.category === 'EPO_1X_2000') {
              // Maintenance: Tepat 1x 2000 IU per bulan
              if (!epoAllocatedForMaintenance) {
                epoAllocatedForMaintenance = true;
                currentDailyRecords[d] = {
                  ...(existingFut || {}),
                  status: 'Belum',
                  customCellText: '2000',
                  doseIU: 2000,
                  notes: `Terjadwal EPO 1x 2000 IU Maintenance (Protokol 4)`,
                  ...(resTo ? { rescheduledToDate: resTo } : {}),
                  ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
                };
              } else {
                currentDailyRecords[d] = {
                  ...(existingFut || {}),
                  status: 'Belum',
                  customCellText: 'HD',
                  doseIU: 0,
                  notes: `Sesi Rutin HD (Target Maintenance 1x 2000 IU bulan ini telah dialokasikan)`,
                  ...(resTo ? { rescheduledToDate: resTo } : {}),
                  ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
                };
              }
            } else if (reco.category === 'EPO_4X_2000') {
              // Dosis Penuh: 4x 2000 IU
              if (patient.hdFrequency === '1 kali / 2 minggu') {
                currentDailyRecords[d] = {
                  ...(existingFut || {}),
                  status: 'Belum',
                  customCellText: '2000',
                  doseIU: 2000,
                  notes: `Terjadwal EPO 2000 IU (HD 1x/2 Minggu)`,
                  ...(resTo ? { rescheduledToDate: resTo } : {}),
                  ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
                };
              } else if (patient.hdFrequency === '1 kali dalam satu minggu') {
                currentDailyRecords[d] = {
                  ...(existingFut || {}),
                  status: 'Belum',
                  customCellText: '2000',
                  doseIU: 2000,
                  notes: `Terjadwal EPO 2000 IU (HD 1x/Minggu)`,
                  ...(resTo ? { rescheduledToDate: resTo } : {}),
                  ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
                };
              } else {
                // Pasien HD 2x/minggu: Hari Awal (Senin/Selasa/Rabu) = 2000 IU, Hari Kedua (Kamis/Jumat/Sabtu) = HD Rutin
                const dayObj = monthInfo.days.find((day) => day.dateNumber === d);
                const dayOfWeek = dayObj ? dayObj.dayOfWeek : 1;
                const isPrimary = isPrimaryHDDay(dayOfWeek, patient.scheduleDay, patient.singleDay, patient.hdFrequency);

                if (isPrimary) {
                  currentDailyRecords[d] = {
                    ...(existingFut || {}),
                    status: 'Belum',
                    customCellText: '2000',
                    doseIU: 2000,
                    notes: `Terjadwal EPO 2000 IU (Protokol 3: Dosis Penuh)`,
                    ...(resTo ? { rescheduledToDate: resTo } : {}),
                    ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
                  };
                } else {
                  currentDailyRecords[d] = {
                    ...(existingFut || {}),
                    status: 'Belum',
                    customCellText: 'HD',
                    doseIU: 0,
                    notes: `Sesi Rutin HD`,
                    ...(resTo ? { rescheduledToDate: resTo } : {}),
                    ...(resFrom ? { rescheduledFromDate: resFrom } : {}),
                  };
                }
              }
            }
          });
        }

        // 5. Pertahankan status minggu yang sudah 'Diberikan'
        let weeks = patient.weeks;
        if (isCategoryChanged) {
          const generated = generateDefaultWeeks(
            reco.category,
            selectedMonth,
            patient.hdFrequency,
            patient.scheduleDay,
            patient.singleDay,
            patient.lastHdDate
          );
          const mergedWeeks = { ...generated };
          (['week1', 'week2', 'week3', 'week4'] as const).forEach((wKey) => {
            if (patient.weeks && patient.weeks[wKey]?.status === 'Diberikan') {
              mergedWeeks[wKey] = {
                ...mergedWeeks[wKey],
                status: 'Diberikan',
                administeredAt: patient.weeks[wKey].administeredAt,
                administeredBy: patient.weeks[wKey].administeredBy,
                doseIU: patient.weeks[wKey].doseIU || mergedWeeks[wKey].doseIU,
                notes: patient.weeks[wKey].notes,
              };
            }
          });
          weeks = mergedWeeks;
        }

        const prevHb = patient.hbValue > 0 ? patient.hbValue : (patient.prevHbValue || 0);

        const computedOverallStatus: 'Menunggu' | 'Berjalan' | 'Selesai' | 'Perlu Perhatian' = 
          validHb === 0 ? 'Menunggu' : reco.category === 'TRANSFUSI_2_RAWAT_INAP' ? 'Perlu Perhatian' : 'Berjalan';

        // 6. Sinkronisasi labSchedule agar selalu konsisten dengan nilai Hb baru
        const updatedLabSchedule = {
          ...(patient.labSchedule || {
            scheduledDate: testDate,
            testType: 'Darah Lengkap & Hb',
            notes: '',
          }),
          status: 'Selesai' as const,
          resultHb: validHb,
          completedAt: testDate,
          notes: notes || patient.labSchedule?.notes,
        };

        const updatedPat: PatientRecord = {
          ...patient,
          hbValue: validHb,
          prevHbValue: prevHb,
          hbDate: testDate || patient.hbDate,
          labSchedule: updatedLabSchedule,
          recommendation: reco,
          weeks,
          dailyRecords: currentDailyRecords,
          clinicalNotes: notes 
            ? `${patient.clinicalNotes ? patient.clinicalNotes + ' • ' : ''}${notes}` 
            : (patient.clinicalNotes || `Update Hb ${validHb} g/dL (Evaluasi tgl ${testDate})`),
          overallStatus: computedOverallStatus,
          updatedAt: new Date().toISOString(),
        };
        return updatedPat;
      });
      updatedList = next;
      try {
        localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(next));
        localStorage.setItem('dialysis_patients_data', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    setToastNotification({
      type: 'success',
      message: `Nilai Hb berhasil diperbarui menjadi ${newHb.toFixed(1)} g/dL (tgl ${dateNumber || testDate}). Protokol: ${appliedRecoTitle}. Seluruh terapi selanjutnya otomatis disesuaikan sesuai protokol klinis!`,
    });

    if (autoSyncEnabled && updatedList.length > 0) {
      const pat = patients.find((p) => p.id === patientId);
      triggerAutoSync(updatedList, undefined, pat?.scheduleDay);
    }
  };

  // Bulk Import Patients Handler
  const handleImportPatients = (newPatients: PatientRecord[], mode: 'append' | 'replace') => {
    const sanitizedNew = ensureUniquePatientIds(newPatients);
    if (mode === 'replace') {
      setPatients(sanitizedNew);
      setToastNotification({
        type: 'success',
        message: `Berhasil mengganti seluruh data dengan ${sanitizedNew.length} pasien baru.`,
      });
    } else {
      // Append mode: update if same RM exists, or add new
      const incomingRmMap = new Map(sanitizedNew.map((p) => [p.noRm.toLowerCase(), p]));
      const updatedExisting = patients.map((p) => {
        const match = incomingRmMap.get(p.noRm.toLowerCase());
        if (match) {
          incomingRmMap.delete(p.noRm.toLowerCase());
          return match;
        }
        return p;
      });
      const remainingNew = Array.from(incomingRmMap.values());
      const combined = ensureUniquePatientIds([...remainingNew, ...updatedExisting]);
      setPatients(combined);
      setToastNotification({
        type: 'success',
        message: `Berhasil memasukkan ${sanitizedNew.length} pasien (${remainingNew.length} pasien baru, ${sanitizedNew.length - remainingNew.length} data diperbarui).`,
      });
    }
  };

  // Batch Update Hb Awal Bulan (Runtutan 2, 3, 4, 5)
  const handleSaveBatchHb = (
    updatedHbList: { id: string; hbValue: number; hbDate: string }[],
    targetMonth?: string,
    scope?: 'SELURUH' | 'PILIHAN'
  ) => {
    const effectiveMonth = targetMonth || selectedMonth;
    const effectiveScope = scope || 'PILIHAN';

    const isSingle = updatedHbList.length === 1;
    const targetPat = isSingle ? patients.find((p) => p.id === updatedHbList[0].id) : null;

    if (!isSingle) {
      try {
        localStorage.setItem('epocare_lab_schedule_mode_' + effectiveMonth, effectiveScope);
        localStorage.setItem('epocare_lab_schedule_mode', effectiveScope);
      } catch (e) {}
    }

    const updateMap = new Map(updatedHbList.map((item) => [item.id, item]));

    const updatePatientItem = (patient: PatientRecord): PatientRecord => {
      const update = updateMap.get(patient.id);
      if (!update) return patient;

      const validHb = update.hbValue;
      const reco = calculateClinicalRecommendation(validHb, patient.hdFrequency);
      const isCategoryChanged = reco.category !== patient.recommendation.category;
      
      // PERTAHANKAN TERAPI YANG SUDAH DILAKUKAN SEBELUMNYA (TIDAK BOLEH DIRESET/DIHAPUS):
      const dailyRecords = patient.dailyRecords ? { ...patient.dailyRecords } : {};

      let weeks = patient.weeks;
      if (isCategoryChanged) {
        const newGeneratedWeeks = generateDefaultWeeks(
          reco.category,
          effectiveMonth,
          patient.hdFrequency,
          patient.scheduleDay,
          patient.singleDay,
          patient.lastHdDate
        );
        // Pertahankan status 'Diberikan' atau tindakan yang sudah berjalan pada minggu sebelumnya
        const mergedWeeks = { ...newGeneratedWeeks };
        (['week1', 'week2', 'week3', 'week4'] as const).forEach((wKey) => {
          if (patient.weeks && patient.weeks[wKey]?.status === 'Diberikan') {
            mergedWeeks[wKey] = {
              ...mergedWeeks[wKey],
              status: 'Diberikan',
              administeredAt: patient.weeks[wKey].administeredAt,
              administeredBy: patient.weeks[wKey].administeredBy,
              doseIU: patient.weeks[wKey].doseIU || mergedWeeks[wKey].doseIU,
              notes: patient.weeks[wKey].notes,
            };
          }
        });
        weeks = mergedWeeks;
      }

      // PENTING (Runtutan 3 & 4):
      // Catat nilai Hb bulan sebelumnya sebagai riwayat prevHbValue jika nilai Hb diperbarui
      const prevHb = (patient.hbValue > 0 && patient.hbValue !== validHb)
        ? patient.hbValue 
        : (patient.prevHbValue !== undefined && patient.prevHbValue > 0 ? patient.prevHbValue : (patient.hbValue > 0 ? patient.hbValue : 0));

      const isSelective = (prevHb > 0 && prevHb < 9.0) || isSelectiveHbCandidate(patient);

      let updatedLabSchedule = patient.labSchedule;
      if (validHb > 0) {
        updatedLabSchedule = {
          ...(patient.labSchedule || {
            scheduledDate: update.hbDate || patient.hbDate,
            testType: isSelective ? 'Cek Hb Pilihan (Hb ≤ 8.9)' : 'Rutin Hb (Evaluasi EPO)',
            notes: '',
          }),
          status: 'Selesai',
          resultHb: validHb,
          completedAt: new Date().toISOString(),
        };
      } else if (effectiveScope === 'SELURUH') {
        updatedLabSchedule = {
          ...(patient.labSchedule || {
            scheduledDate: update.hbDate || patient.hbDate,
            testType: 'Rutin Hb (Evaluasi EPO)',
            notes: '',
          }),
          status: 'Terjadwal',
          resultHb: undefined,
        };
      } else if (effectiveScope === 'PILIHAN') {
        if (prevHb >= 9.0 && !isSelective) {
          updatedLabSchedule = {
            ...(patient.labSchedule || {
              scheduledDate: '',
              testType: 'Rutin Hb (Evaluasi EPO)',
              notes: '',
            }),
            status: 'Tidak Ada Jadwal',
            resultHb: undefined,
          };
        } else {
          updatedLabSchedule = {
            ...(patient.labSchedule || {
              scheduledDate: update.hbDate || patient.hbDate,
              testType: 'Cek Hb Pilihan (Hb ≤ 8.9)',
              notes: '',
            }),
            status: 'Terjadwal',
            resultHb: undefined,
          };
        }
      }

      return {
        ...patient,
        hbValue: validHb,
        prevHbValue: prevHb,
        hbDate: update.hbDate || patient.hbDate,
        monthPeriod: effectiveMonth,
        recommendation: reco,
        weeks,
        dailyRecords,
        labSchedule: updatedLabSchedule,
        overallStatus: validHb === 0 
          ? 'Menunggu' 
          : reco.category === 'TRANSFUSI_2_RAWAT_INAP' 
          ? 'Perlu Perhatian' 
          : 'Berjalan',
        updatedAt: new Date().toISOString(),
      };
    };

    let finalHbUpdatedList: PatientRecord[] = [];
    if (effectiveMonth === selectedMonth) {
      setPatients((prev) => {
        const updated = prev.map(updatePatientItem);
        finalHbUpdatedList = updated;
        try {
          localStorage.setItem('dialysis_patients_data_' + effectiveMonth, JSON.stringify(updated));
          localStorage.setItem('dialysis_patients_data', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    } else {
      try {
        const raw = localStorage.getItem('dialysis_patients_data_' + effectiveMonth);
        const existing = raw ? JSON.parse(raw) : patients;
        const updated = (existing as PatientRecord[]).map(updatePatientItem);
        finalHbUpdatedList = updated;
        localStorage.setItem('dialysis_patients_data_' + effectiveMonth, JSON.stringify(updated));
      } catch (e) {}
    }

    if (autoSyncEnabled && finalHbUpdatedList.length > 0) {
      triggerAutoSync(finalHbUpdatedList, effectiveScope);
    }

    if (isSingle && targetPat) {
      setToastNotification({
        type: 'success',
        message: `Nilai Hb ${updatedHbList[0].hbValue.toFixed(1)} g/dL untuk ${targetPat.name} berhasil disimpan tanpa merubah nilai pasien lain.`,
      });
    } else {
      const isSelectiveMode = effectiveScope === 'PILIHAN';
      setToastNotification({
        type: 'success',
        message: isSelectiveMode
          ? `Berhasil memperbarui data Cek HB Pilihan untuk bulan ${effectiveMonth}! Pasien stabil (≥ 9.0) terisi otomatis nilai bulan lalu, pasien terjadwal anemia (< 9.0) berstatus 0 (Menunggu Hasil Lab).`
          : `Berhasil memperbarui data Cek HB Seluruh Pasien untuk bulan ${effectiveMonth}! Seluruh pasien tanpa hasil lab berstatus 0 (Menunggu Hasil Lab).`,
      });
    }
  };

  // Simpan Jadwal Cek Lab Manual & Cek Hb Pilihan
  const handleSaveLabSchedules = (
    updatedSchedules: { id: string; labSchedule: LabSchedule; hbDate?: string; prevHbValue?: number; isSelectiveHb?: boolean }[],
    scope?: LabScheduleScope,
    targetMonth?: string
  ) => {
    const effectiveScope = scope || 'PILIHAN';
    const effectiveTargetMonth = targetMonth || getNextYearMonth(selectedMonth);

    try {
      localStorage.setItem('epocare_lab_schedule_mode_' + effectiveTargetMonth, effectiveScope);
      localStorage.setItem('epocare_lab_schedule_mode', effectiveScope);
    } catch (e) {}

    const scheduleMap = new Map(updatedSchedules.map((item) => [item.id, item]));

    // 1. Update status labSchedule di bulan berjalan
    setPatients((prev) => {
      const updated = prev.map((patient) => {
        const item = scheduleMap.get(patient.id);
        if (!item) return patient;

        return {
          ...patient,
          labSchedule: item.labSchedule,
          prevHbValue: item.prevHbValue !== undefined ? item.prevHbValue : patient.prevHbValue,
          isSelectiveHb: item.isSelectiveHb !== undefined ? item.isSelectiveHb : patient.isSelectiveHb,
          updatedAt: new Date().toISOString(),
        };
      });

      try {
        localStorage.setItem('dialysis_patients_data', JSON.stringify(updated));
        localStorage.setItem('dialysis_patients_data_' + selectedMonth, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving lab schedules to storage:', e);
      }

      return updated;
    });

    // 2. OTOMATIS GENERATE & SIMPAN DATA UNTUK BULAN SELANJUTNYA (effectiveTargetMonth):
    // Sesuai Permintaan Inti:
    // 1. Pada sesi CEK HB SELURUH PASIEN: Seluruh pasien Tn A, Tn B, Tn C dan Tn D pada bulan target nilai HB nya berstatus 0 (menunggu hasil lab)
    // 2. Pada sesi CEK HB PILIHAN: Pasien yang tidak terjadwal otomatis terisi nilai HB nya sesuai nilai bulan sebelumnya karena tidak melakukan CEK HB.
    //    Contoh: Tn A otomatis terisi nilai HB nya (12.0). Sedangkan Tn B, Tn C, dan Tn D terisi nilai 0 (Menunggu Hasil Lab)
    const targetMonthPatients: PatientRecord[] = patients.map((p) => {
      const targetFirstDate = getFirstHDDateOfMonth(
        effectiveTargetMonth,
        p.scheduleDay,
        p.singleDay,
        p.hdFrequency,
        p.lastHdDate
      ).dateString;

      const priorHb = (typeof p.hbValue === 'number' && p.hbValue > 0)
        ? p.hbValue
        : (typeof p.prevHbValue === 'number' && p.prevHbValue > 0 ? p.prevHbValue : 0);

      const isCandidate = (priorHb > 0 && priorHb < 9.0) || isSelectiveHbCandidate(p);

      if (effectiveScope === 'SELURUH') {
        // ATURAN 1 (CEK HB SELURUH PASIEN):
        // Seluruh pasien (Tn A, Tn B, Tn C, Tn D) berstatus 0 (menunggu hasil lab)
        const reco = calculateClinicalRecommendation(0, p.hdFrequency);
        const weeks = generateDefaultWeeks('MENUNGGU_HASIL_LAB', effectiveTargetMonth, p.hdFrequency, p.scheduleDay, p.singleDay, p.lastHdDate);
        return {
          ...p,
          hbValue: 0,
          prevHbValue: priorHb > 0 ? priorHb : p.prevHbValue,
          hbDate: targetFirstDate,
          monthPeriod: effectiveTargetMonth,
          recommendation: reco,
          overallStatus: 'Menunggu',
          weeks,
          dailyRecords: {},
          labSchedule: {
            scheduledDate: targetFirstDate,
            testType: 'Rutin Hb (Evaluasi EPO)',
            status: 'Terjadwal',
            notes: 'Evaluasi rutin awal bulan (Cek Hb Seluruh Pasien)',
            isSelectiveHb: false,
          },
          updatedAt: new Date().toISOString(),
        };
      } else {
        // ATURAN 2 (CEK HB PILIHAN):
        if (priorHb >= 9.0 && !isCandidate) {
          // Pasien tidak terjadwal (Tn A) otomatis terisi nilai bulan sebelumnya (12.0)
          const reco = calculateClinicalRecommendation(priorHb, p.hdFrequency);
          const weeks = generateDefaultWeeks(reco.category, effectiveTargetMonth, p.hdFrequency, p.scheduleDay, p.singleDay, p.lastHdDate);
          return {
            ...p,
            hbValue: priorHb,
            prevHbValue: priorHb,
            hbDate: targetFirstDate,
            monthPeriod: effectiveTargetMonth,
            recommendation: reco,
            overallStatus: reco.category === 'TRANSFUSI_2_RAWAT_INAP' ? 'Perlu Perhatian' : 'Berjalan',
            weeks,
            dailyRecords: {},
            labSchedule: {
              scheduledDate: '',
              testType: 'Rutin Hb (Evaluasi EPO)',
              status: 'Tidak Ada Jadwal',
              notes: `Tidak dijadwalkan Cek Hb bulan depan (Hb acuan ${priorHb.toFixed(1)} g/dL)`,
              isSelectiveHb: false,
            },
            updatedAt: new Date().toISOString(),
          };
        } else {
          // Pasien terjadwal (Tn B, Tn C, Tn D) berstatus 0 (menunggu hasil lab)
          const reco = calculateClinicalRecommendation(0, p.hdFrequency);
          const weeks = generateDefaultWeeks('MENUNGGU_HASIL_LAB', effectiveTargetMonth, p.hdFrequency, p.scheduleDay, p.singleDay, p.lastHdDate);
          return {
            ...p,
            hbValue: 0,
            prevHbValue: priorHb > 0 ? priorHb : p.prevHbValue,
            hbDate: targetFirstDate,
            monthPeriod: effectiveTargetMonth,
            recommendation: reco,
            overallStatus: 'Menunggu',
            weeks,
            dailyRecords: {},
            labSchedule: {
              scheduledDate: targetFirstDate,
              testType: 'Cek Hb Pilihan (Hb ≤ 8.9)',
              status: 'Terjadwal',
              notes: `⭐ Cek Hb Pilihan: Evaluasi anemia (Hb acuan ${priorHb > 0 ? priorHb.toFixed(1) : '< 9.0'} g/dL)`,
              isSelectiveHb: true,
              selectiveReason: `Nilai Hb acuan < 9.0 mg/dL (${priorHb > 0 ? priorHb.toFixed(1) : '< 9.0'})`,
            },
            updatedAt: new Date().toISOString(),
          };
        }
      }
    });

    try {
      localStorage.setItem('dialysis_patients_data_' + effectiveTargetMonth, JSON.stringify(targetMonthPatients));
    } catch (e) {
      console.error('Error saving target month data:', e);
    }

    if (selectedMonth === effectiveTargetMonth) {
      setPatients(targetMonthPatients);
    }

    if (autoSyncEnabled && targetMonthPatients.length > 0) {
      triggerAutoSync(targetMonthPatients, effectiveScope);
    }

    const isScopePilihan = effectiveScope === 'PILIHAN';
    const scheduledCount = updatedSchedules.filter((s) => s.labSchedule.status === 'Terjadwal').length;
    setToastNotification({
      type: 'success',
      message: isScopePilihan
        ? `Jadwal Cek HB Pilihan tersimpan untuk ${effectiveTargetMonth}! Pasien stabil (≥ 9.0) otomatis terisi nilai bulan lalu, pasien anemia (< 9.0) berstatus 0 (Menunggu Hasil Lab).`
        : `Jadwal Cek HB Seluruh Pasien tersimpan untuk ${effectiveTargetMonth}! Seluruh (${scheduledCount}) pasien berstatus 0 (Menunggu Hasil Lab).`,
    });
  };

  const pendingHbCount = patients.filter((p) => p.hbValue <= 0).length;
  const scheduledLabCount = patients.filter((p) => p.labSchedule?.status === 'Terjadwal' || (!p.labSchedule && p.hbValue <= 0)).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      
      {/* Toast Notification Banner */}
      {toastNotification && (
        <div className="print:hidden fixed top-20 right-4 z-50 max-w-md animate-in slide-in-from-top-4 duration-200">
          <div className={`p-4 rounded-xl shadow-xl border flex items-start gap-3 text-xs ${
            toastNotification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-700'
              : toastNotification.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-700'
              : 'bg-indigo-50 text-indigo-900 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-100 dark:border-indigo-700'
          }`}>
            {toastNotification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
            {toastNotification.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
            {toastNotification.type === 'info' && <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />}
            <div className="flex-1 font-medium">{toastNotification.message}</div>
            <button
              onClick={() => setToastNotification(null)}
              className="text-slate-400 hover:text-slate-600 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main App Header */}
      <div className="print:hidden">
        <Header
          user={user}
          spreadsheetConfig={spreadsheetConfig}
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
          onOpenSyncModal={() => setIsSyncModalOpen(true)}
          onOpenMonthlyHbModal={() => setIsMonthlyHbModalOpen(true)}
          onOpenLabScheduleModal={() => setIsLabScheduleModalOpen(true)}
          onOpenCalculatorModal={() => setIsCalculatorModalOpen(true)}
          onOpenPrintModal={() => setIsPrintModalOpen(true)}
          onOpenEpoSchedulePrintModal={() => setIsEpoSchedulePrintModalOpen(true)}
          onOpenExportExcelModal={() => {
            setExportExcelTarget('ALL');
            setIsExportExcelModalOpen(true);
          }}
          onOpenAddPatientModal={() => {
            setEditingPatient(null);
            setIsPatientModalOpen(true);
          }}
          onOpenBulkImportModal={() => setIsBulkImportModalOpen(true)}
          onOpenWorkflowGuide={() => setIsWorkflowGuideOpen(true)}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          isSyncing={isSyncing}
          isLoggingIn={isLoggingIn}
          pendingHbCount={pendingHbCount}
          scheduledLabCount={scheduledLabCount}
          autoSyncEnabled={autoSyncEnabled}
          onToggleAutoSync={toggleAutoSync}
        />
      </div>

      {/* Main Content Area */}
      <main className="print:hidden flex-1 max-w-[1920px] 2xl:max-w-[2400px] w-full mx-auto px-2 sm:px-4 lg:px-6 py-4 space-y-3.5">
        
        {/* Google Sheets Sync Banner Indicator if Not Connected */}
        {!spreadsheetConfig?.spreadsheetId && (
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/20 backdrop-blur-xs shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm">Sinkronisasikan dengan Google Sheets (2 Arah)</h3>
                <p className="text-[11px] text-emerald-100">
                  Hubungkan dengan spreadsheet tim HD atau buat file spreadsheet baru otomatis di Google Drive Anda.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="h-8.5 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 active:bg-emerald-100 shadow-xs transition cursor-pointer shrink-0"
            >
              <span>Setup Google Sheets</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Clinical Protocol & Key Statistics */}
        <DashboardStats patients={patients} />

        {/* Past Month Archive Protection Banner */}
        {isPastMonth && (
          <div className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs transition shadow-2xs ${
            isPastMonthUnlocked
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
              : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-300'
          }`}>
            <div className="flex items-center gap-2.5">
              <span className={`p-1.5 rounded-lg text-white font-bold shrink-0 text-sm ${
                isPastMonthUnlocked ? 'bg-amber-600' : 'bg-slate-700'
              }`}>
                {isPastMonthUnlocked ? '🔓' : '🔒'}
              </span>
              <div>
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <span>{isPastMonthUnlocked ? 'Mode Koreksi Bulan Lampau Aktif' : 'Arsip Bulan Lampau Terkunci (Perlindungan Rekam Medis)'}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {isPastMonthUnlocked
                    ? 'Kunci telah dibuka sementara. Anda dapat mengoreksi data riwayat tindakan pasien.'
                    : 'Bulan lampau dikunci untuk melindungi data rekam medis historis dari klik tidak disengaja. Buka kunci jika perlu melakukan koreksi.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPastMonthUnlocked(!isPastMonthUnlocked)}
              className={`h-7.5 px-3 rounded-lg font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs ${
                isPastMonthUnlocked
                  ? 'bg-slate-700 hover:bg-slate-800 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              <span>{isPastMonthUnlocked ? '🔒 Kunci Kembali' : '🔓 Buka Kunci Edit'}</span>
            </button>
          </div>
        )}

        {/* Patient Table & Schedule Management */}
        <PatientTable
          patients={patients}
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
          activeSheetTab={activeSheetTab}
          onSheetTabChange={setActiveSheetTab}
          isLocked={isPastMonth && !isPastMonthUnlocked}
          onLockedNotice={() => {
            setToastNotification({
              type: 'info',
              message: 'Data bulan lampau sedang dalam mode arsip terkunci. Klik tombol "Buka Kunci Edit" di atas tabel jika ingin mengubah data.',
            });
          }}
          onEditPatient={(patient) => {
            if (isPastMonth && !isPastMonthUnlocked) {
              setToastNotification({
                type: 'info',
                message: 'Data bulan lampau sedang dalam mode arsip terkunci. Buka kunci terlebih dahulu untuk mengedit pasien.',
              });
              return;
            }
            setEditingPatient(patient);
            setIsPatientModalOpen(true);
          }}
          onDeletePatient={(patientId) => {
            if (isPastMonth && !isPastMonthUnlocked) {
              setToastNotification({
                type: 'info',
                message: 'Data bulan lampau sedang dalam mode arsip terkunci. Buka kunci terlebih dahulu untuk menghapus pasien.',
              });
              return;
            }
            handleDeletePatient(patientId);
          }}
          onUpdateWeekStatus={handleUpdateWeekStatus}
          onUpdateDateAction={handleUpdateDateAction}
          onRescheduleDate={handleRescheduleDate}
          onCancelReschedule={handleCancelReschedule}
          onUpdateMidMonthHb={handleUpdateMidMonthHb}
          onOpenBulkImportModal={() => setIsBulkImportModalOpen(true)}
          onOpenAddPatientModal={() => {
            setEditingPatient(null);
            setIsPatientModalOpen(true);
          }}
          onOpenMonthlyHbModal={() => setIsMonthlyHbModalOpen(true)}
          onOpenLabScheduleModal={() => setIsLabScheduleModalOpen(true)}
          onOpenExportExcelModal={(target) => {
            setExportExcelTarget(target || 'ALL');
            setIsExportExcelModalOpen(true);
          }}
          onOpenEpoSchedulePrintModal={() => setIsEpoSchedulePrintModalOpen(true)}
          onPushToSheet={handleQuickPushToSheet}
          onPullFromSheet={() => handlePullViaAppsScript(spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL)}
          isSyncing={isSyncing}
          autoSyncEnabled={autoSyncEnabled}
          onToggleAutoSync={toggleAutoSync}
        />

      </main>

      {/* Footer */}
      <footer className="print:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-3 text-[11px] text-slate-500 dark:text-slate-400 text-center">
        <p className="flex items-center justify-center gap-1.5 flex-wrap">
          <strong className="text-rose-700 dark:text-rose-400 font-bold">EPOCARE</strong>
          <span>•</span>
          <span>Sistem Alokasi Terapi Eritropoietin & Transfusi Pasien Hemodialisa RS Happy Land Medical Centre</span>
        </p>
      </footer>

      {/* Modals */}
      <PatientModal
        isOpen={isPatientModalOpen}
        onClose={() => {
          setIsPatientModalOpen(false);
          setEditingPatient(null);
        }}
        onSave={handleSavePatient}
        initialPatient={editingPatient}
        defaultScheduleDay={activeSheetTab !== 'ALL' ? activeSheetTab : undefined}
        currentMonth={selectedMonth}
      />

      <GoogleSheetsSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        user={user}
        spreadsheetConfig={spreadsheetConfig}
        onSaveSpreadsheetConfig={handleSaveSpreadsheetConfig}
        patients={patients}
        onPullFromSheet={handlePullFromSheet}
        onPushToSheet={handlePushToSheet}
        onPullViaAppsScript={handlePullViaAppsScript}
        onPushViaAppsScript={handlePushViaAppsScript}
        onImportCsv={handleImportCsv}
        onSignIn={handleSignIn}
        onOpenExportExcelModal={() => {
          setExportExcelTarget('ALL');
          setIsExportExcelModalOpen(true);
        }}
        selectedMonth={selectedMonth}
        autoSyncEnabled={autoSyncEnabled}
        onToggleAutoSync={toggleAutoSync}
      />

      <ClinicalCalculatorModal
        isOpen={isCalculatorModalOpen}
        onClose={() => setIsCalculatorModalOpen(false)}
        onApplyToNewPatient={(hb) => {
          setEditingPatient(null);
          setIsPatientModalOpen(true);
        }}
      />

      <PrintReportModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        patients={patients}
        selectedMonth={selectedMonth}
        onSwitchToEpoSchedule={() => {
          setIsPrintModalOpen(false);
          setIsEpoSchedulePrintModalOpen(true);
        }}
      />

      <EpoSchedulePrintModal
        isOpen={isEpoSchedulePrintModalOpen}
        onClose={() => setIsEpoSchedulePrintModalOpen(false)}
        patients={patients}
        selectedMonth={selectedMonth}
      />

      <BulkImportModal
        isOpen={isBulkImportModalOpen}
        onClose={() => setIsBulkImportModalOpen(false)}
        onImportPatients={handleImportPatients}
        selectedMonth={selectedMonth}
      />

      <MonthlyHbInputModal
        isOpen={isMonthlyHbModalOpen}
        onClose={() => setIsMonthlyHbModalOpen(false)}
        patients={patients}
        selectedMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        onSaveBatchHb={handleSaveBatchHb}
        onOpenLabScheduleModal={() => {
          setIsMonthlyHbModalOpen(false);
          setIsLabScheduleModalOpen(true);
        }}
        onOpenWorkflowGuide={() => setIsWorkflowGuideOpen(true)}
      />

      <LabScheduleModal
        isOpen={isLabScheduleModalOpen}
        onClose={() => setIsLabScheduleModalOpen(false)}
        patients={patients}
        selectedMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        onSaveLabSchedules={handleSaveLabSchedules}
        onSyncToSheets={(scope) => handleQuickPushToSheet(undefined, scope)}
        isSyncing={isSyncing}
      />

      <ExportExcelModal
        isOpen={isExportExcelModalOpen}
        onClose={() => setIsExportExcelModalOpen(false)}
        patients={patients}
        selectedMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        initialSchedule={exportExcelTarget}
      />

      <WorkflowGuideModal
        isOpen={isWorkflowGuideOpen}
        onClose={() => setIsWorkflowGuideOpen(false)}
        onOpenMonthlyHbModal={() => setIsMonthlyHbModalOpen(true)}
        onOpenLabScheduleModal={() => setIsLabScheduleModalOpen(true)}
      />

    </div>
  );
}
