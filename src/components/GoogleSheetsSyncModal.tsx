import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { 
  X, 
  FileSpreadsheet, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RotateCcw,
  Code2,
  Globe,
  Settings2,
  BookOpen,
  Download
} from 'lucide-react';
import { PatientRecord, SpreadsheetConfig } from '../types/dialysis';
import { 
  DEFAULT_APPS_SCRIPT_URL, 
  OFFICIAL_SPREADSHEET_URL, 
  OFFICIAL_SPREADSHEET_ID,
  sanitizeAppsScriptUrl,
  extractSpreadsheetId,
  APPS_SCRIPT_SAMPLE_CODE
} from '../services/googleSheets';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  spreadsheetConfig: SpreadsheetConfig | null;
  onSaveSpreadsheetConfig: (config: SpreadsheetConfig) => void;
  patients: PatientRecord[];
  onPullFromSheet?: (spreadsheetId: string) => Promise<void>;
  onPushToSheet?: (spreadsheetId: string) => Promise<void>;
  onPullViaAppsScript: (url: string) => Promise<void>;
  onPushViaAppsScript: (url: string) => Promise<void>;
  onImportCsv?: (csvText: string) => void;
  onSignIn?: () => void;
  onOpenExportExcelModal?: () => void;
  selectedMonth: string;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
}

const formatDateTimeIndo = (isoStr?: string): string => {
  if (!isoStr) return 'Belum pernah disinkronkan';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB';
  } catch (e) {
    return isoStr;
  }
};

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({
  isOpen,
  onClose,
  spreadsheetConfig,
  onSaveSpreadsheetConfig,
  patients,
  onPullViaAppsScript,
  onPushViaAppsScript,
}) => {
  // Input states - Default to target official Web App URL & Spreadsheet
  const [appsScriptUrl, setAppsScriptUrl] = useState(
    spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL
  );
  const [spreadsheetUrlInput, setSpreadsheetUrlInput] = useState(
    spreadsheetConfig?.spreadsheetUrl || OFFICIAL_SPREADSHEET_URL
  );

  // Dropdown collapse state & tab selector
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeDropdownTab, setActiveDropdownTab] = useState<'all' | 'webhook' | 'sheet' | 'code'>('all');
  const [isCodePreviewOpen, setIsCodePreviewOpen] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<'webhook' | 'sheetUrl' | 'code' | null>(null);

  // Operation states
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Perbarui nilai input sesuai konfigurasi aktif saat modal dibuka
  React.useEffect(() => {
    if (isOpen) {
      setAppsScriptUrl(spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL);
      setSpreadsheetUrlInput(spreadsheetConfig?.spreadsheetUrl || OFFICIAL_SPREADSHEET_URL);
    }
  }, [isOpen, spreadsheetConfig]);

  if (!isOpen) return null;

  // Handler salin ke clipboard dengan notifikasi visual
  const handleCopyToClipboard = (text: string, target: 'webhook' | 'sheetUrl' | 'code') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTarget(target);
    setTimeout(() => {
      setCopiedTarget((prev) => (prev === target ? null : prev));
    }, 2500);
  };

  // Unduh kode Apps Script sebagai file .js
  const handleDownloadCode = () => {
    const blob = new Blob([APPS_SCRIPT_SAMPLE_CODE], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'epocare-appsscript-code.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Simpan URL Apps Script jika perlu
  const handleSaveAppsScriptUrl = () => {
    const raw = appsScriptUrl.trim() || DEFAULT_APPS_SCRIPT_URL;
    const targetUrl = sanitizeAppsScriptUrl(raw) || DEFAULT_APPS_SCRIPT_URL;
    setAppsScriptUrl(targetUrl);
    if (!targetUrl.startsWith('http')) {
      setStatusMessage({ 
        type: 'error', 
        text: 'Masukkan Web App URL Apps Script yang valid (diawali https://script.google.com/...)' 
      });
      return;
    }
    const cleanSheetUrl = spreadsheetUrlInput.trim() || OFFICIAL_SPREADSHEET_URL;
    const sheetId = extractSpreadsheetId(cleanSheetUrl) || spreadsheetConfig?.spreadsheetId || OFFICIAL_SPREADSHEET_ID;

    const updated: SpreadsheetConfig = {
      spreadsheetId: sheetId,
      spreadsheetUrl: cleanSheetUrl,
      sheetName: spreadsheetConfig?.sheetName || 'REKAP HB TAHUNAN & JADWAL HD',
      appsScriptUrl: targetUrl,
      syncMode: 'appsscript',
      lastSyncedAt: spreadsheetConfig?.lastSyncedAt || new Date().toISOString(),
    };
    onSaveSpreadsheetConfig(updated);
    setStatusMessage({
      type: 'success',
      text: 'WEB HOOK URL berhasil disimpan!',
    });
  };

  // Simpan URL Google Sheet
  const handleSaveSpreadsheetUrl = () => {
    const cleanSheetUrl = spreadsheetUrlInput.trim() || OFFICIAL_SPREADSHEET_URL;
    setSpreadsheetUrlInput(cleanSheetUrl);
    const sheetId = extractSpreadsheetId(cleanSheetUrl) || spreadsheetConfig?.spreadsheetId || OFFICIAL_SPREADSHEET_ID;

    const updated: SpreadsheetConfig = {
      spreadsheetId: sheetId,
      spreadsheetUrl: cleanSheetUrl,
      sheetName: spreadsheetConfig?.sheetName || 'REKAP HB TAHUNAN & JADWAL HD',
      appsScriptUrl: appsScriptUrl.trim() || spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL,
      syncMode: 'appsscript',
      lastSyncedAt: spreadsheetConfig?.lastSyncedAt || new Date().toISOString(),
    };
    onSaveSpreadsheetConfig(updated);
    setStatusMessage({
      type: 'success',
      text: 'URL GOOGLE SHEET berhasil disimpan!',
    });
  };

  // Tarik via Apps Script (Tanpa Login)
  const handlePullAppsScript = async () => {
    const url = appsScriptUrl.trim() || spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL;
    if (!url) {
      setStatusMessage({ type: 'error', text: 'Masukkan Web App URL Apps Script terlebih dahulu.' });
      return;
    }
    try {
      setIsProcessing(true);
      setStatusMessage({ type: 'info', text: 'Menghubungi Apps Script dan membaca data...' });
      await onPullViaAppsScript(url);
      handleSaveAppsScriptUrl();
      setStatusMessage({ type: 'success', text: 'Berhasil membaca data alokasi dari Google Sheet!' });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: err.message || 'Gagal terhubung dengan Apps Script.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Kirim via Apps Script (Tanpa Login)
  const handlePushAppsScript = async () => {
    const url = appsScriptUrl.trim() || spreadsheetConfig?.appsScriptUrl || DEFAULT_APPS_SCRIPT_URL;
    if (!url) {
      setStatusMessage({ type: 'error', text: 'Masukkan Web App URL Apps Script terlebih dahulu.' });
      return;
    }
    try {
      setIsProcessing(true);
      setStatusMessage({ type: 'info', text: 'Mengirimkan data alokasi pasien ke Google Sheet...' });
      await onPushViaAppsScript(url);
      handleSaveAppsScriptUrl();
      setStatusMessage({ type: 'success', text: `Sukses menyimpan ${patients.length} data pasien (termasuk rekap data pasien meninggal) ke Google Sheet!` });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: err.message || 'Gagal mengirim ke Apps Script.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md sm:max-w-xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-emerald-50/70 dark:bg-emerald-950/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileSpreadsheet className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                Sinkronisasi Google Sheets
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Alokasi 2 Arah &amp; Jadwal Hemodialisa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 space-y-3.5 flex-1 overflow-y-auto">
          
          {/* Status Singkat & Terakhir Disinkronkan */}
          <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${spreadsheetConfig?.lastSyncedAt ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <div className="truncate text-[11px] sm:text-xs">
                <span className="text-slate-500 dark:text-slate-400">Terakhir: </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatDateTimeIndo(spreadsheetConfig?.lastSyncedAt)}
                </span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 shrink-0">
              {patients.length} Pasien
            </span>
          </div>

          {/* Notifikasi Status (jika sedang proses / sukses / gagal) */}
          {statusMessage && (
            <div className={`p-3 rounded-xl flex items-start gap-2.5 text-xs animate-in fade-in duration-200 ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-800'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800'
                : 'bg-blue-50 text-blue-900 border border-blue-300 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800'
            }`}>
              {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />}
              {statusMessage.type === 'info' && <RefreshCw className="w-4 h-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400 animate-spin" />}
              <span className="font-medium leading-relaxed text-[11px] sm:text-xs">{statusMessage.text}</span>
            </div>
          )}

          {/* 3 TOMBOL BESAR UTAMA (TIDAK TERGANGGU) */}
          <div className="space-y-3 pt-1">
            
            {/* 1. TOMBOL BESAR: TARIK DATA */}
            <button
              type="button"
              onClick={handlePullAppsScript}
              disabled={isProcessing}
              className="w-full p-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 transition shadow-md hover:shadow-lg flex items-center justify-between gap-3.5 cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-white/20 group-hover:bg-white/25 flex items-center justify-center shrink-0 shadow-inner">
                  {isProcessing ? (
                    <RefreshCw className="w-5.5 h-5.5 animate-spin" />
                  ) : (
                    <ArrowDownToLine className="w-5.5 h-5.5" />
                  )}
                </div>
                <div className="text-left">
                  <div className="text-base sm:text-lg font-black tracking-wide">
                    {isProcessing ? 'SEDANG MENARIK DATA...' : 'TARIK DATA'}
                  </div>
                  <div className="text-xs text-blue-100 font-normal mt-0.5">
                    Ambil data alokasi &amp; jadwal terbaru dari Google Sheet
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold bg-blue-900/60 px-3 py-1.5 rounded-lg shrink-0 group-hover:bg-blue-900/80 transition">
                PULL
              </span>
            </button>

            {/* 2. TOMBOL BESAR: KIRIM DATA */}
            <button
              type="button"
              onClick={handlePushAppsScript}
              disabled={isProcessing}
              className="w-full p-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 transition shadow-md hover:shadow-lg flex items-center justify-between gap-3.5 cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-white/20 group-hover:bg-white/25 flex items-center justify-center shrink-0 shadow-inner">
                  {isProcessing ? (
                    <RefreshCw className="w-5.5 h-5.5 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="w-5.5 h-5.5" />
                  )}
                </div>
                <div className="text-left">
                  <div className="text-base sm:text-lg font-black tracking-wide">
                    {isProcessing ? 'SEDANG MENGIRIM DATA...' : 'KIRIM DATA'}
                  </div>
                  <div className="text-xs text-emerald-100 font-normal mt-0.5">
                    Kirim {patients.length} data pasien &amp; alokasi ke Google Sheet
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold bg-emerald-900/60 px-3 py-1.5 rounded-lg shrink-0 group-hover:bg-emerald-900/80 transition">
                PUSH
              </span>
            </button>

            {/* 3. TOMBOL BESAR: BUKA SHEET */}
            <a
              href={spreadsheetUrlInput || spreadsheetConfig?.spreadsheetUrl || OFFICIAL_SPREADSHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full p-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition shadow-md hover:shadow-lg flex items-center justify-between gap-3.5 cursor-pointer group"
              title="Buka dokumen Google Sheets langsung di tab baru"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-white/20 group-hover:bg-white/25 flex items-center justify-center shrink-0 shadow-inner">
                  <FileSpreadsheet className="w-5.5 h-5.5" />
                </div>
                <div className="text-left">
                  <div className="text-base sm:text-lg font-black tracking-wide">
                    BUKA SHEET
                  </div>
                  <div className="text-xs text-indigo-100 font-normal mt-0.5">
                    Buka spreadsheet 5 lembar kerja resmi di Google Drive
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold bg-indigo-900/60 px-3 py-1.5 rounded-lg shrink-0 group-hover:bg-indigo-900/80 transition">
                <span>BUKA</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </div>
            </a>
          </div>

          {/* TAMPILAN DROPDOWN: WEB HOOK URL, URL GOOGLE SHEET, KODE APP SCRIPT */}
          <div className="pt-2">
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/70 dark:bg-slate-850/70 shadow-xs transition-all">
              
              {/* DROPDOWN TOGGLE HEADER */}
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-100/90 dark:hover:bg-slate-800/80 transition cursor-pointer select-none"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-2xs">
                    <Settings2 className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                      PENGATURAN KONEKSI &amp; KODE SCRIPT
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      WEB HOOK URL • URL GOOGLE SHEET • KODE APP SCRIPT
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                  <span className="hidden sm:inline">
                    {isDropdownOpen ? 'Sembunyikan' : 'Buka Pengaturan'}
                  </span>
                  <div className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                    {isDropdownOpen ? (
                      <ChevronUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    )}
                  </div>
                </div>
              </button>

              {/* DROPDOWN CONTENT (Hanya tampil saat dropdown dibuka) */}
              {isDropdownOpen && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4 bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-top-1 duration-150">
                  
                  {/* TAB / FILTER PILIHAN DROPDOWN */}
                  <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-400 mr-1">Tampilkan:</span>
                    <button
                      type="button"
                      onClick={() => setActiveDropdownTab('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        activeDropdownTab === 'all'
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      Semua (3)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDropdownTab('webhook')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        activeDropdownTab === 'webhook'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      🔗 Web Hook URL
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDropdownTab('sheet')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        activeDropdownTab === 'sheet'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      📊 URL Google Sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDropdownTab('code')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        activeDropdownTab === 'code'
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      📜 Kode App Script
                    </button>
                  </div>

                  {/* 1. BAGIAN: WEB HOOK URL */}
                  {(activeDropdownTab === 'all' || activeDropdownTab === 'webhook') && (
                    <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          <span className="text-xs font-bold uppercase tracking-wider text-blue-950 dark:text-blue-200">
                            WEB HOOK URL
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                          {appsScriptUrl.includes('macros/s/') ? 'Web App Aktif' : 'Default'}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Endpoint Web App Google Apps Script untuk operasi <strong>TARIK DATA (doGet)</strong> dan <strong>KIRIM DATA (doPost)</strong> tanpa perlu login Google.
                      </p>

                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={appsScriptUrl}
                          onChange={(e) => setAppsScriptUrl(e.target.value)}
                          placeholder="https://script.google.com/macros/s/.../exec"
                          className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(appsScriptUrl, 'webhook')}
                          className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                          title="Salin Web Hook URL"
                        >
                          {copiedTarget === 'webhook' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-600 font-bold text-[11px]">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-[11px]">Salin</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL)}
                          className="text-[11px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset ke Webhook Resmi</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAppsScriptUrl}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition cursor-pointer shadow-xs"
                        >
                          Simpan Webhook URL
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. BAGIAN: URL GOOGLE SHEET */}
                  {(activeDropdownTab === 'all' || activeDropdownTab === 'sheet') && (
                    <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-950 dark:text-emerald-200">
                            URL GOOGLE SHEET
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                          ID: {extractSpreadsheetId(spreadsheetUrlInput).slice(0, 10)}...
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Tautan lengkap dokumen Google Sheets tempat penyimpanan 6 lembar kerja terintegrasi: <strong>Senin-Kamis, Selasa-Jumat, Rabu-Sabtu, REKAP_HB_TAHUNAN, MATRIK CEK HB, dan PASIEN MENINGGAL</strong>.
                      </p>

                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={spreadsheetUrlInput}
                          onChange={(e) => setSpreadsheetUrlInput(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                          className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(spreadsheetUrlInput, 'sheetUrl')}
                          className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                          title="Salin URL Google Sheet"
                        >
                          {copiedTarget === 'sheetUrl' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-600 font-bold text-[11px]">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-[11px]">Salin</span>
                            </>
                          )}
                        </button>
                        <a
                          href={spreadsheetUrlInput || OFFICIAL_SPREADSHEET_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition"
                          title="Buka Spreadsheet di Tab Baru"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setSpreadsheetUrlInput(OFFICIAL_SPREADSHEET_URL)}
                          className="text-[11px] text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 inline-flex items-center gap-1 transition cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset ke Dokumen Resmi</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveSpreadsheetUrl}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition cursor-pointer shadow-xs"
                        >
                          Simpan URL Sheet
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. BAGIAN: KODE APP SCRIPT */}
                  {(activeDropdownTab === 'all' || activeDropdownTab === 'code') && (
                    <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                          <span className="text-xs font-bold uppercase tracking-wider text-purple-950 dark:text-purple-200">
                            KODE APP SCRIPT
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200">
                          Turbo High-Speed Engine
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Kode Google Apps Script berkecepatan tinggi yang ditempelkan ke Google Sheet (menu <em>Ekstensi &gt; Apps Script</em>) untuk menghubungkan aplikasi dengan Google Drive.
                      </p>

                      {/* Tombol Aksi Cepat Kode */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(APPS_SCRIPT_SAMPLE_CODE, 'code')}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        >
                          {copiedTarget === 'code' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" />
                              <span>Kode Apps Script Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Salin Kode Apps Script</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadCode}
                          className="px-2.5 py-1.5 rounded-lg border border-purple-300 dark:border-purple-800 bg-white dark:bg-slate-800 hover:bg-purple-50 text-purple-700 dark:text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh File .js</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsCodePreviewOpen(!isCodePreviewOpen)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          <span>{isCodePreviewOpen ? 'Sembunyikan Cuplikan' : 'Lihat Cuplikan Kode'}</span>
                        </button>
                      </div>

                      {/* Panduan 4 Langkah Pemasangan */}
                      <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-purple-200 dark:border-purple-900/40 text-[11px] space-y-1 text-slate-700 dark:text-slate-300">
                        <div className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Panduan Pasang di Google Sheet (1 Menit):</span>
                        </div>
                        <ol className="list-decimal list-inside space-y-0.5 text-[10.5px] text-slate-600 dark:text-slate-400 pl-1">
                          <li>Buka Google Sheet tujuan &gt; menu <strong>Ekstensi &gt; Apps Script</strong>.</li>
                          <li>Hapus kode bawaan (jika ada), lalu tempel (<strong>Paste</strong>) kode di atas.</li>
                          <li>Klik tombol biru <strong>Terapkan (Deploy) &gt; Penerapan baru</strong>.</li>
                          <li>Pilih jenis <strong>Aplikasi web</strong>, setel Akses: <strong>Siapa saja (Anyone)</strong>.</li>
                          <li>Salin URL Web App yang muncul, lalu tempelkan ke kolom <strong>WEB HOOK URL</strong> di atas.</li>
                        </ol>
                      </div>

                      {/* Cuplikan Teks Kode Apps Script (Collapsible) */}
                      {isCodePreviewOpen && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                            <span>Google Apps Script (~600 Baris)</span>
                            <span>Ctrl+A untuk salin seluruhnya</span>
                          </div>
                          <div className="relative">
                            <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-[10.5px] leading-relaxed max-h-56 overflow-y-auto overflow-x-auto border border-slate-800 select-all">
                              {APPS_SCRIPT_SAMPLE_CODE}
                            </pre>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {spreadsheetConfig?.lastSyncedAt 
              ? `Sinkron: ${new Date(spreadsheetConfig.lastSyncedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` 
              : 'Siap sinkronisasi'}
          </span>
          <button
            onClick={onClose}
            className="h-8.5 px-4 rounded-lg font-semibold text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};

