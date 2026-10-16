import React, { useState } from 'react';
import { 
  Users, 
  Syringe, 
  Droplets, 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp,
  ShieldAlert,
  Info,
  Package,
  Calendar,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { PatientRecord } from '../types/dialysis';
import { getEffectivePatientRecommendation } from '../services/clinicalRules';

interface DashboardStatsProps {
  patients: PatientRecord[];
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ patients }) => {
  const [showLogistics, setShowLogistics] = useState(false);
  const totalPatients = patients.length;

  // Pasien transfusi
  const rawatInap2Bag = patients.filter((p) => getEffectivePatientRecommendation(p).category === 'TRANSFUSI_2_RAWAT_INAP');
  const transfusi1Bag = patients.filter((p) => getEffectivePatientRecommendation(p).category === 'TRANSFUSI_1_KANTONG');
  const totalBagsPrNeeded = (rawatInap2Bag.length * 2) + transfusi1Bag.length;

  // Pasien EPO
  const epo4x = patients.filter((p) => getEffectivePatientRecommendation(p).category === 'EPO_4X_2000');
  const epo1x = patients.filter((p) => getEffectivePatientRecommendation(p).category === 'EPO_1X_2000');
  const totalEpoVialsNeeded = patients.reduce((sum, p) => sum + (getEffectivePatientRecommendation(p).totalEpoVials || 0), 0);

  // Hitung berapa dosis yang sudah diberikan (dari rekaman harian & mingguan)
  let administeredDoses = 0;
  patients.forEach((p) => {
    let countInDaily = 0;
    if (p.dailyRecords) {
      Object.values(p.dailyRecords).forEach((r) => {
        if (r.status === 'Diberikan') countInDaily++;
      });
    }
    let countInWeeks = 0;
    ['week1', 'week2', 'week3', 'week4'].forEach((w) => {
      if ((p.weeks as any)[w]?.status === 'Diberikan') {
        countInWeeks++;
      }
    });
    administeredDoses += Math.max(countInDaily, countInWeeks);
  });

  const holdEpo = patients.filter((p) => getEffectivePatientRecommendation(p).category === 'HOLD_EVALUASI');
  const pendingHbPatients = patients.filter((p) => getEffectivePatientRecommendation(p).category === 'MENUNGGU_HASIL_LAB');

  const progressPercent = totalEpoVialsNeeded > 0 
    ? Math.round((administeredDoses / totalEpoVialsNeeded) * 100) 
    : 0;

  return (
    <div className="space-y-4">
      {/* Alert Jika Ada Pasien Belum Input Hasil Hb */}
      {pendingHbPatients.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4" />
            </span>
            <span>
              <strong>Perhatian:</strong> Terdapat <strong>{pendingHbPatients.length}</strong> pasien dengan hasil lab belum diinputkan (terdeteksi nilai <strong>Hb: 0</strong> / Menunggu Lab). Terapi EPO ditunda sampai hasil lab tersedia.
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 whitespace-nowrap">
            {pendingHbPatients.length} Pasien Hb: 0
          </span>
        </div>
      )}

      {/* Quick Protocol Reference Banner */}
      <div className="bg-gradient-to-r from-rose-900 via-rose-800 to-slate-900 text-white rounded-xl p-3 sm:p-3.5 shadow-xs border border-rose-800/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5 pb-2.5 border-b border-rose-700/40">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-rose-700 text-rose-100 shrink-0">
              <Info className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-xs font-semibold tracking-wide uppercase text-rose-100">
              Protokol Klinis Hemodialisa Berdasarkan Hb Awal Bulan
            </h2>
          </div>
          <span className="text-[11px] text-rose-200/90">
            Target Klinis Hb: <strong className="text-amber-300 font-mono">10.0 – 12.0 g/dL</strong>
          </span>
        </div>

        {/* 5 Guideline Columns (Equal Proportional Heights & Alignments) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          {/* Rule 1 */}
          <div className="bg-slate-900/50 backdrop-blur-xs rounded-lg p-2.5 border border-white/10 border-l-4 border-l-rose-500 flex flex-col justify-between hover:bg-slate-900/70 transition">
            <div>
              <div className="flex items-center justify-between font-bold text-rose-300 text-xs">
                <span>1. Hb &lt; 5.9</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-500/30 text-rose-200">PRC 2</span>
              </div>
              <p className="mt-1 font-semibold text-white text-xs leading-snug">Transfusi Protokol 2</p>
            </div>
            <p className="mt-1 text-[11px] text-rose-200/80 leading-tight">2 Bag via Rawat Inap segera</p>
          </div>

          {/* Rule 2 */}
          <div className="bg-slate-900/50 backdrop-blur-xs rounded-lg p-2.5 border border-white/10 border-l-4 border-l-amber-500 flex flex-col justify-between hover:bg-slate-900/70 transition">
            <div>
              <div className="flex items-center justify-between font-bold text-amber-300 text-xs">
                <span>2. Hb 6.0 – 6.9</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/30 text-amber-200">PRC 1</span>
              </div>
              <p className="mt-1 font-semibold text-white text-xs leading-snug">Transfusi Protokol 1</p>
            </div>
            <p className="mt-1 text-[11px] text-amber-200/80 leading-tight">1 Bag PRC saat sesi HD</p>
          </div>

          {/* Rule 3 */}
          <div className="bg-slate-900/50 backdrop-blur-xs rounded-lg p-2.5 border border-white/10 border-l-4 border-l-rose-400 flex flex-col justify-between hover:bg-slate-900/70 transition">
            <div>
              <div className="flex items-center justify-between font-bold text-rose-300 text-xs">
                <span>3. Hb 7.0 – 8.9</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-500/30 text-rose-200">2000 x 4</span>
              </div>
              <p className="mt-1 font-semibold text-white text-xs leading-snug">Terapi EPO 4x 2000 IU</p>
            </div>
            <p className="mt-1 text-[11px] text-rose-200/80 leading-tight">HD 1x & 1x/2mgg: Sesi Awal HD</p>
          </div>

          {/* Rule 4 */}
          <div className="bg-slate-900/50 backdrop-blur-xs rounded-lg p-2.5 border border-white/10 border-l-4 border-l-emerald-400 flex flex-col justify-between hover:bg-slate-900/70 transition">
            <div>
              <div className="flex items-center justify-between font-bold text-emerald-300 text-xs">
                <span>4. Hb 9.0 – 12.0</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-500/30 text-emerald-200">2000 x 1</span>
              </div>
              <p className="mt-1 font-semibold text-white text-xs leading-snug">Terapi EPO 1x 2000 IU</p>
            </div>
            <p className="mt-1 text-[11px] text-emerald-200/80 leading-tight">HD 1x & 1x/2mgg: Sesi Awal HD</p>
          </div>

          {/* Rule 5 */}
          <div className="bg-slate-900/50 backdrop-blur-xs rounded-lg p-2.5 border border-white/10 border-l-4 border-l-purple-400 flex flex-col justify-between hover:bg-slate-900/70 transition">
            <div>
              <div className="flex items-center justify-between font-bold text-purple-300 text-xs">
                <span>5. Hb &gt; 12.00</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-500/30 text-purple-200">Tanpa EPO</span>
              </div>
              <p className="mt-1 font-semibold text-white text-xs leading-snug">Tanpa Terapi EPO</p>
            </div>
            <p className="mt-1 text-[11px] text-purple-200/80 leading-tight">Kadar Hb di atas 12.00 g/dL</p>
          </div>
        </div>
      </div>

      {/* KPI Cards (Clean Proportional Heights & Alignments) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Pasien */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Pasien HD</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white leading-none">{totalPatients}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">pasien</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800">
            Shift Pagi & Siang
          </div>
        </div>

        {/* Kebutuhan Transfusi PRC */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Kebutuhan PRC</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 flex items-center justify-center">
              <Droplets className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400 leading-none">{totalBagsPrNeeded}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">kantong</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-rose-700 dark:text-rose-400 font-semibold">{rawatInap2Bag.length} ranap</span>
            <span>{transfusi1Bag.length} saat HD</span>
          </div>
        </div>

        {/* Kebutuhan Ampul EPO */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Kebutuhan EPO 2000 IU</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center justify-center">
              <Syringe className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-300 leading-none">{totalEpoVialsNeeded}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">vial ({totalEpoVialsNeeded * 2000} IU)</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 truncate">
            <span>{epo4x.length} (4x)</span>
            <span>·</span>
            <span>{epo1x.length} (1x)</span>
            <span>·</span>
            <span className="text-rose-700 dark:text-rose-300 font-medium">{holdEpo.length} tanpa EPO</span>
          </div>
        </div>

        {/* Realisasi Pemberian EPO */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Realisasi EPO</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 leading-none">
              {administeredDoses}/{totalEpoVialsNeeded}
            </span>
            <span className="text-xs font-semibold text-emerald-600 font-mono">({progressPercent}%)</span>
          </div>
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(progressPercent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Rincian Logistik Farmasi & Bank Darah (BDRS) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowLogistics(!showLogistics)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-850 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <Package className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                <span>Perencanaan Logistik Depo Farmasi &amp; Bank Darah (BDRS)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-extrabold bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200">
                  {totalEpoVialsNeeded} Vial EPO • {totalBagsPrNeeded} Bag PRC
                </span>
              </span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Estimasi alokasi kebutuhan ampul EPO per minggu dan rincian kantong darah
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold">
            <span>{showLogistics ? 'Tutup' : 'Lihat Rincian'}</span>
            {showLogistics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {showLogistics && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/40 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs animate-in fade-in duration-150">
            {/* Estimasi Kebutuhan EPO Mingguan */}
            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between text-[11px] pb-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <Syringe className="w-3.5 h-3.5 text-teal-600" />
                  <span>Estimasi Pengeluaran EPO per Minggu</span>
                </span>
                <span className="text-teal-700 dark:text-teal-300 font-mono font-bold">Total: {totalEpoVialsNeeded} vial</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-500 font-semibold">Minggu 1</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-0.5">{epo4x.length}</div>
                  <div className="text-[9px] text-slate-400">vial</div>
                </div>
                <div className="p-1.5 rounded bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                  <div className="text-[10px] text-teal-800 dark:text-teal-300 font-bold">Minggu 2 ⭐</div>
                  <div className="text-sm font-bold text-teal-800 dark:text-teal-200 font-mono mt-0.5">{epo4x.length + epo1x.length}</div>
                  <div className="text-[9px] text-teal-600 dark:text-teal-400">+EPO 1x</div>
                </div>
                <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-500 font-semibold">Minggu 3</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-0.5">{epo4x.length}</div>
                  <div className="text-[9px] text-slate-400">vial</div>
                </div>
                <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                  <div className="text-[10px] text-slate-500 font-semibold">Minggu 4</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-0.5">{epo4x.length}</div>
                  <div className="text-[9px] text-slate-400">vial</div>
                </div>
              </div>
              <p className="text-[9.5px] text-slate-500 italic">
                *Minggu 2 mengakomodasi tambahan terapi EPO 1x (Maintenance Hb 9.0–12.0 g/dL).
              </p>
            </div>

            {/* Estimasi Permintaan Darah BDRS */}
            <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between text-[11px] pb-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-rose-600" />
                  <span>Kebutuhan Darah PRC (Koordinasi BDRS / Farmasi)</span>
                </span>
                <span className="text-rose-700 dark:text-rose-400 font-mono font-bold">Total: {totalBagsPrNeeded} bag</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-rose-950 dark:text-rose-200 text-xs">Rawat Inap Segera</div>
                    <div className="text-[10px] text-rose-700 dark:text-rose-300">Hb &lt; 5.9 (2 Bag/pasien)</div>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold font-mono text-rose-800 dark:text-rose-200 leading-none">
                      {rawatInap2Bag.length * 2}
                    </span>
                    <span className="text-[10px] block text-rose-600">bag ({rawatInap2Bag.length} ps)</span>
                  </div>
                </div>
                <div className="p-2 rounded bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-amber-950 dark:text-amber-200 text-xs">Transfusi Sesi HD</div>
                    <div className="text-[10px] text-amber-700 dark:text-amber-300">Hb 6.0–6.9 (1 Bag/pasien)</div>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold font-mono text-amber-800 dark:text-amber-200 leading-none">
                      {transfusi1Bag.length}
                    </span>
                    <span className="text-[10px] block text-amber-600">bag ({transfusi1Bag.length} ps)</span>
                  </div>
                </div>
              </div>
              <p className="text-[9.5px] text-slate-500 italic">
                *Dapat digunakan sebagai acuan awal permintaan kantong darah PRC ke Unit Transfusi Darah (UTD).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
