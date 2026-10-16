import React, { useRef } from 'react';
import { X, Printer, Download, FileText, CheckCircle2, Droplet, Syringe, Sparkles } from 'lucide-react';
import { PatientRecord, isSelectiveHbCandidate } from '../types/dialysis';

interface PrintReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: PatientRecord[];
  selectedMonth: string;
  onSwitchToEpoSchedule?: () => void;
}

// Daftar catatan klinis demo yang telah dihapus sesuai arahan
const isRemovedNote = (note?: string): boolean => {
  if (!note) return true;
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

export const PrintReportModal: React.FC<PrintReportModalProps> = ({
  isOpen,
  onClose,
  patients,
  selectedMonth,
  onSwitchToEpoSchedule,
}) => {
  if (!isOpen) return null;

  // Format tanggal periode
  const [yearStr, monthStr] = selectedMonth.split('-');
  const dateObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  const formattedMonth = dateObj.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // Helper pengelompokan protokol klinis presisi
  const getPatientCategory = (p: PatientRecord) => {
    if (typeof p.hbValue !== 'number' || isNaN(p.hbValue) || p.hbValue <= 0) {
      return 'MENUNGGU_HASIL_LAB';
    }
    if (p.hbValue < 5.95) return 'TRANSFUSI_2_RAWAT_INAP';
    if (p.hbValue < 6.95) return 'TRANSFUSI_1_KANTONG';
    if (p.hbValue < 8.95) return 'EPO_4X_2000';
    if (p.hbValue <= 12.00) return 'EPO_1X_2000';
    return 'HOLD_EVALUASI';
  };

  // Ringkasan per protokol klinis
  const ranap2Bag = patients.filter((p) => getPatientCategory(p) === 'TRANSFUSI_2_RAWAT_INAP');
  const transfusi1Bag = patients.filter((p) => getPatientCategory(p) === 'TRANSFUSI_1_KANTONG');
  const epo4x = patients.filter((p) => getPatientCategory(p) === 'EPO_4X_2000');
  const epo1x = patients.filter((p) => getPatientCategory(p) === 'EPO_1X_2000');
  const hold = patients.filter((p) => getPatientCategory(p) === 'HOLD_EVALUASI');
  const pendingLab = patients.filter((p) => getPatientCategory(p) === 'MENUNGGU_HASIL_LAB');
  const selectiveHbPatients = patients.filter((p) => isSelectiveHbCandidate(p));

  const totalPrBags = (ranap2Bag.length * 2) + transfusi1Bag.length;
  const totalEpoVials = patients.reduce((sum, p) => sum + (p.recommendation.totalEpoVials || 0), 0);

  // Susunan Rekapitulasi Berdasarkan Protokol Klinis Hemodialisa Berdasarkan Hb Awal Bulan
  const protocolGroups = [
    {
      id: 'proto-1',
      order: 1,
      title: '1. Protokol Klinis HB kurang dari 5.9 mg/dl',
      subtitle: 'Transfusi 2 Kantong PRC via Rawat Inap',
      headerClass: 'bg-rose-100 dark:bg-rose-950/70 text-rose-950 dark:text-rose-100 border-rose-300 dark:border-rose-800',
      badgeClass: 'bg-rose-200 dark:bg-rose-900 text-rose-950 dark:text-rose-100 border border-rose-400',
      printClass: 'protocol-1',
      patients: ranap2Bag,
      summary: `${ranap2Bag.length} Pasien (${ranap2Bag.length * 2} Bag PRC Rawat Inap)`,
    },
    {
      id: 'proto-2',
      order: 2,
      title: '2. Protokol Klinis HB 6.0 – 6.9 mg/dl',
      subtitle: 'Transfusi 1 Kantong PRC saat HD',
      headerClass: 'bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-100 border-amber-300 dark:border-amber-800',
      badgeClass: 'bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-100 border border-amber-400',
      printClass: 'protocol-2',
      patients: transfusi1Bag,
      summary: `${transfusi1Bag.length} Pasien (${transfusi1Bag.length} Bag PRC)`,
    },
    {
      id: 'proto-3',
      order: 3,
      title: '3. Protokol Klinis HB 7.0 – 8.9 mg/dl',
      subtitle: 'Terapi EPO 4x 2000 IU / 2x 2000 IU (Dosis Penuh)',
      headerClass: 'bg-blue-100 dark:bg-blue-950/70 text-blue-950 dark:text-blue-100 border-blue-300 dark:border-blue-800',
      badgeClass: 'bg-blue-200 dark:bg-blue-900 text-blue-950 dark:text-blue-100 border border-blue-400',
      printClass: 'protocol-3',
      patients: epo4x,
      summary: `${epo4x.length} Pasien (${epo4x.reduce((acc, p) => acc + (p.recommendation.totalEpoVials || 0), 0)} Ampul EPO)`,
    },
    {
      id: 'proto-4',
      order: 4,
      title: '4. Protokol Klinis HB 9.0 – 12.0 mg/dl',
      subtitle: 'Terapi EPO 1x 2000 IU (Maintenance / Pemeliharaan)',
      headerClass: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-950 dark:text-emerald-100 border-emerald-300 dark:border-emerald-800',
      badgeClass: 'bg-emerald-200 dark:bg-emerald-900 text-emerald-950 dark:text-emerald-100 border border-emerald-400',
      printClass: 'protocol-4',
      patients: epo1x,
      summary: `${epo1x.length} Pasien (${epo1x.length} Ampul EPO)`,
    },
    {
      id: 'proto-5',
      order: 5,
      title: '5. Protokol Klinis HB lebih dari 12.00 mg/dl',
      subtitle: 'Tidak Mendapatkan Terapi EPO (Hold / Evaluasi Klinis DPJP)',
      headerClass: 'bg-purple-100 dark:bg-purple-950/70 text-purple-950 dark:text-purple-100 border-purple-300 dark:border-purple-800',
      badgeClass: 'bg-purple-200 dark:bg-purple-900 text-purple-950 dark:text-purple-100 border border-purple-400',
      printClass: 'protocol-5',
      patients: hold,
      summary: `${hold.length} Pasien (Tanpa Terapi EPO)`,
    },
  ];

  if (pendingLab.length > 0) {
    protocolGroups.push({
      id: 'proto-0',
      order: 6,
      title: '6. Hasil Lab Belum Diinputkan (Hb: 0 / Menunggu Lab)',
      subtitle: 'Terapi EPO Ditunda Menunggu Konfirmasi Lab DPJP',
      headerClass: 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700',
      badgeClass: 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-400',
      printClass: 'protocol-0',
      patients: pendingLab,
      summary: `${pendingLab.length} Pasien (Menunggu Lab)`,
    });
  }

  const reportAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (err) {
      console.warn('Gagal memicu window.print():', err);
      handleDownloadHtml();
    }
  };

  const handleDownloadHtml = () => {
    if (!reportAreaRef.current) return;
    const content = reportAreaRef.current.innerHTML;
    const htmlDoc = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Rekapitulasi Alokasi EPO & Transfusi HD - ${formattedMonth}</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 20px; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
    .header h2 { font-size: 16px; margin: 0 0 4px 0; font-weight: 800; text-transform: uppercase; }
    .header h3 { font-size: 13px; margin: 0 0 4px 0; color: #be123c; font-weight: 700; text-transform: uppercase; }
    .header p { font-size: 10px; color: #64748b; margin: 0; }
    .summary-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; margin-bottom: 14px; font-size: 11px; }
    .summary-item span { font-size: 9px; color: #64748b; display: block; }
    .summary-item p { font-weight: 700; margin: 2px 0 0 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 6px; }
    th { background-color: #f1f5f9; font-weight: 700; text-align: left; }
    th.text-center, td.text-center { text-align: center; }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }
    .protocol-header { font-weight: 800; font-size: 11px; }
    .protocol-1 { background-color: #ffe4e6 !important; color: #881337 !important; }
    .protocol-2 { background-color: #fef3c7 !important; color: #78350f !important; }
    .protocol-3 { background-color: #dbeafe !important; color: #1e3a8a !important; }
    .protocol-4 { background-color: #d1fae5 !important; color: #064e3b !important; }
    .protocol-5 { background-color: #f3e8ff !important; color: #581c87 !important; }
    .protocol-0 { background-color: #f1f5f9 !important; color: #334155 !important; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 30px; text-align: center; font-size: 10px; page-break-inside: avoid; }
    .sig-line { border-bottom: 1px solid #94a3b8; margin: 45px 30px 6px; }
    @media print {
      body { padding: 0; }
      .summary-grid { background: transparent; }
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rekapitulasi-EPO-HD-${selectedMonth}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="print-modal-container fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-slate-900/60 backdrop-blur-xs print:p-0 print:bg-white print:static print:z-auto">
      <div className="print-modal-card bg-white dark:bg-slate-900 rounded-xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-1 flex flex-col max-h-[88vh] print:max-h-none print:h-auto print:overflow-visible print:border-none print:shadow-none print:m-0 print:w-full">
        
        {/* Header - Not printed (Pinned) */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-700 text-white flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4 text-rose-100" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                Pratinjau Rekapitulasi Alokasi EPO & Transfusi HD
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Dokumen resmi untuk Depo Farmasi, Ruang HD, dan DPJP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onSwitchToEpoSchedule && (
              <button
                type="button"
                onClick={onSwitchToEpoSchedule}
                className="h-8.5 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-lg text-teal-800 dark:text-teal-200 bg-teal-100 hover:bg-teal-200 dark:bg-teal-950 dark:hover:bg-teal-900 border border-teal-300 dark:border-teal-700 transition cursor-pointer"
                title="Buka tabel jadwal pemberian EPO per shift & hari"
              >
                <Syringe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>Jadwal EPO per Shift</span>
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="h-8.5 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold rounded-lg text-white bg-rose-700 hover:bg-rose-800 active:bg-rose-900 shadow-xs transition cursor-pointer"
              title="Cetak langsung atau simpan sebagai file PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area (Compact & Scrollable) */}
        <div 
          ref={reportAreaRef}
          id="printable-report-area"
          className="print-modal-scrollable p-4 sm:p-5 overflow-y-auto print:p-0 print:overflow-visible bg-white text-slate-900 dark:bg-slate-900 dark:text-white text-xs flex-1 print:text-black print:bg-white"
        >
          
          {/* Hospital Header / Kop Surat */}
          <div className="border-b-2 border-slate-900 dark:border-slate-100 pb-2 mb-3 text-center">
            <h2 className="text-sm sm:text-base font-extrabold tracking-wide">
              Unit Dialisis RS Happy Land Medical Centre Yogyakarta
            </h2>
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              REKAPITULASI ALOKASI ERITROPOIETIN & RENCANA TRANSFUSI DARAH PASIEN HD
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              Periode Evaluasi Hb Awal Bulan: <strong>{formattedMonth}</strong> • Dicetak: {new Date().toLocaleDateString('id-ID', { dateStyle: 'medium' })}
            </p>
          </div>

          {/* Ringkasan Kebutuhan Farmasi & Bank Darah Berdasarkan Protokol Klinis */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-3 p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-xs">
            <div>
              <span className="text-[10px] text-slate-500">Total Pasien:</span>
              <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">{patients.length} Pasien</p>
              <span className="text-[9px] text-slate-400">Total HD</span>
            </div>
            <div>
              <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold">1. Hb &lt; 5.9 (Ranap):</span>
              <p className="font-bold text-xs sm:text-sm text-rose-600 dark:text-rose-400">{ranap2Bag.length} Pasien</p>
              <span className="text-[9px] text-rose-500 font-semibold">{ranap2Bag.length * 2} Bag PRC</span>
            </div>
            <div>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">2. Hb 6.0–6.9 (HD):</span>
              <p className="font-bold text-xs sm:text-sm text-amber-600 dark:text-amber-400">{transfusi1Bag.length} Pasien</p>
              <span className="text-[9px] text-amber-600 font-semibold">{transfusi1Bag.length} Bag PRC</span>
            </div>
            <div>
              <span className="text-[10px] text-blue-700 dark:text-blue-400 font-bold">3. Hb 7.0–8.9 (EPO):</span>
              <p className="font-bold text-xs sm:text-sm text-blue-600 dark:text-blue-400">{epo4x.length} Pasien</p>
              <span className="text-[9px] text-blue-500 font-semibold">{epo4x.reduce((acc, p) => acc + (p.recommendation.totalEpoVials || 0), 0)} Ampul EPO</span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">4. Hb 9.0–12.0 (Maint):</span>
              <p className="font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400">{epo1x.length} Pasien</p>
              <span className="text-[9px] text-emerald-500 font-semibold">{epo1x.length} Ampul EPO</span>
            </div>
            <div>
              <span className="text-[10px] text-purple-700 dark:text-purple-400 font-bold">5. Hb &gt; 12.00 (Hold):</span>
              <p className="font-bold text-xs sm:text-sm text-purple-600 dark:text-purple-400">{hold.length} Pasien</p>
              <span className="text-[9px] text-purple-500 font-semibold">Tanpa Terapi EPO</span>
            </div>
          </div>

          {/* Patient Detail Table Grouped by Clinical Protocol */}
          <table className="w-full border-collapse border border-slate-300 dark:border-slate-700 text-[10px] mb-4">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-center w-7">No</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-left">No. RM</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-left">Nama Pasien</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-left">Jadwal HD</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-center">Hb</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-left">Rekomendasi Klinis</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-center w-10">M1</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-center w-10">M2</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-center w-10">M3</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-center w-10">M4</th>
                <th className="border border-slate-300 dark:border-slate-700 p-1 text-left">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let runningNo = 0;
                return protocolGroups.map((group) => (
                  <React.Fragment key={group.id}>
                    {/* Header Baris Kategori Protokol Klinis */}
                    <tr className={`${group.headerClass} ${group.printClass} font-bold border-y-2`}>
                      <td colSpan={11} className="p-1.5 pl-2 text-[10.5px]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-[11px] tracking-tight">{group.title}</span>
                            <span className="text-[9.5px] font-normal opacity-90">— {group.subtitle}</span>
                          </div>
                          <span className={`text-[9.5px] px-2 py-0.5 rounded font-black ${group.badgeClass}`}>
                            {group.summary}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {/* Baris Data Pasien pada Protokol Terkait */}
                    {group.patients.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-1 text-center text-slate-400 italic text-[9px] bg-slate-50/40 dark:bg-slate-900/20">
                          Nihil (0 Pasien)
                        </td>
                      </tr>
                    ) : (
                      group.patients.map((p) => {
                        runningNo++;
                        return (
                          <tr key={`${p.id || p.noRm}-${runningNo}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="border border-slate-300 dark:border-slate-700 p-1 text-center font-mono">
                              {runningNo}
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1 font-mono font-semibold">
                              {p.noRm}
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1 font-bold">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span>{p.name}</span>
                                {isSelectiveHbCandidate(p) && (
                                  <span className="px-1 py-0.2 rounded text-[7.5px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    ⭐ Cek Pilihan
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1">
                              <div>{p.scheduleDay}</div>
                              {p.hdFrequency && (
                                <span className="text-[9px] text-slate-500 font-medium">
                                  {p.hdFrequency.includes('1 kali') ? '1x/mgg' : '2x/mgg'}
                                </span>
                              )}
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1 text-center font-bold font-mono">
                              {p.hbValue > 0 ? p.hbValue.toFixed(1) : '0.0'}
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1">
                              <span className="font-semibold">{p.recommendation.title}</span>
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1 text-center">
                              {p.weeks?.week1?.status === 'Tidak Ada Jadwal' ? '-' : p.weeks?.week1?.status}
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1 text-center">
                              {p.weeks?.week2?.status === 'Tidak Ada Jadwal' ? '-' : p.weeks?.week2?.status}
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1 text-center">
                              {p.weeks?.week3?.status === 'Tidak Ada Jadwal' ? '-' : p.weeks?.week3?.status}
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1 text-center">
                              {p.weeks?.week4?.status === 'Tidak Ada Jadwal' ? '-' : p.weeks?.week4?.status}
                            </td>
                            <td className="border border-slate-300 dark:border-slate-700 p-1 text-slate-500">
                              {(!p.clinicalNotes || isRemovedNote(p.clinicalNotes)) ? '-' : p.clinicalNotes}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </React.Fragment>
                ));
              })()}
            </tbody>
          </table>

          {/* Lembar Tanda Tangan Resmi */}
          <div className="grid grid-cols-3 gap-4 pt-3 text-center text-[10px] break-inside-avoid">
            <div>
              <p className="text-slate-500 mb-6">Disiapkan Oleh (Perawat HD):</p>
              <div className="border-b border-slate-400 mx-6"></div>
              <p className="font-bold mt-1">( ............................................ )</p>
              <p className="text-[9px] text-slate-500">NIP / Perawat Penanggung Jawab</p>
            </div>
            <div>
              <p className="text-slate-500 mb-6">Petugas Depo Farmasi:</p>
              <div className="border-b border-slate-400 mx-6"></div>
              <p className="font-bold mt-1">( ............................................ )</p>
              <p className="text-[9px] text-slate-500">Apoteker / Farmasi Klinis</p>
            </div>
            <div>
              <p className="text-slate-500 mb-6">Mengetahui (Dokter DPJP):</p>
              <div className="border-b border-slate-400 mx-6"></div>
              <p className="font-bold mt-1">dr. Sp.PD-KGH</p>
              <p className="text-[9px] text-slate-500">SIP: ............................................</p>
            </div>
          </div>

        </div>

        {/* Modal Bottom Footer (Pinned) */}
        <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between print:hidden shrink-0">
          <span className="text-[10px] text-slate-500">
            Total {patients.length} Pasien • {totalEpoVials} ampul EPO
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-1.5 rounded-md font-semibold text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 transition cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
              title="Unduh laporan dalam format dokumen HTML mandiri (bisa dibuka di browser dan langsung disimpan PDF)"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Unduh File (.html)</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-md font-bold text-xs text-white bg-rose-700 hover:bg-rose-800 active:bg-rose-900 shadow-xs transition cursor-pointer inline-flex items-center gap-1.5"
              title="Buka dialog cetak browser atau Simpan sebagai PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Simpan PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md font-medium text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
