import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
    FileText, 
    Calculator, 
    Wallet, 
    Clock, 
    X, 
    Activity,
    ShieldCheck,
    Trash2
} from 'lucide-react';
import { financialService } from '../services/financialService';

interface FinancialRecordItem {
  id: number;
  user_id: number;
  period_start: string;
  period_end: string;
  total_hours_rendered: number;
  penalty_deductions: number;
  equivalent_total_amount: number;
  status: 'Draft' | 'Approved' | 'Locked' | 'Forwarded to Finance';
  student?: {
    name: string;
  };
}

const ASSESSMENT_STATUSES = ['Draft', 'Approved', 'Locked', 'Forwarded to Finance'] as const;

const formatCoverageDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
};

export const FinancialManagement: React.FC = () => {
  const [records, setRecords] = useState<FinancialRecordItem[]>([]);
  const [stats, setStats] = useState({ total_equivalent_value: 0, pending_drafts: 0 });
  const [showCompute, setShowCompute] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isComputing, setIsComputing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const fetchRecords = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
        const res = await financialService.getRecords();
        setRecords(res.records.data || []);
        setStats(res.stats || { total_equivalent_value: 0, pending_drafts: 0 });
    } catch (error) {
        console.error("Failed to fetch assessment records", error);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleCompute = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsComputing(true);
    const formData = new FormData(e.currentTarget);
    
    try {
        const result = await financialService.computePeriod({
          period_start: formData.get('start') as string,
          period_end: formData.get('end') as string,
          hourly_rate: parseFloat(formData.get('rate') as string),
        });
        setShowCompute(false);
        setNotice(result?.assessed > 0
          ? `Recorded hours rendered for ${result.assessed} student${result.assessed === 1 ? '' : 's'} in this period.`
          : (result?.message || 'No verified duty hours were found in that period.'));
        fetchRecords();
    } catch (error) {
        console.error("Failed to compute work hours", error);
        setNotice('Computation failed. Check the period and try again.');
    } finally {
        setIsComputing(false);
    }
  };

  const handleStatusChange = async (record: FinancialRecordItem, status: string) => {
    if (status === record.status) return;
    setBusyId(record.id);
    try {
      await financialService.updateAdjustments(record.id, {
        status,
        adjustment_reason: `Status set to ${status}`,
      });
      setNotice(`${record.student?.name || 'Student'} is now ${status}.`);
      fetchRecords(true);
    } catch (error) {
      console.error('Failed to update assessment status', error);
      setNotice('Could not update that status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (record: FinancialRecordItem) => {
    const name = record.student?.name || 'this student';
    const period = `${formatCoverageDate(record.period_start)} to ${formatCoverageDate(record.period_end)}`;
    if (!window.confirm(`Cancel the ${period} coverage for ${name}?`)) return;

    setBusyId(record.id);
    try {
      await financialService.cancelRecord(record.id);
      setNotice(`Cancelled the ${period} coverage for ${name}.`);
      fetchRecords(true);
    } catch (error) {
      console.error('Failed to cancel assessment', error);
      setNotice('Could not cancel that coverage.');
    } finally {
      setBusyId(null);
    }
  };

  // STRICT TYPESCRIPT VARIANTS
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };

  const rowVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
      
      {/* DARK THEME HEADER - ASSESSMENT COMMAND CENTER */}
      <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
      >
          {/* Glowing Orbs */}
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

          <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Reporting & Compliance</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  Hours Rendered
              </h1>
              <p className="mt-2 text-slate-400 font-medium max-w-md">
                  Calculate equivalent values for rendered hours to be forwarded as a verified report to the Finance Office.
              </p>
          </div>

          <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
              <div className="flex flex-col text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Quick Action</span>
                  <span className="text-sm font-medium text-slate-300">Run Period Calculation</span>
              </div>
              <button 
                  onClick={() => setShowCompute(true)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-blue-900/50 flex items-center gap-2"
              >
                  <Calculator className="w-4 h-4" /> Compute Hours
              </button>
          </div>
      </motion.div>

      {notice && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold rounded-2xl px-5 py-3">
          {notice}
        </div>
      )}

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-emerald-300 transition-colors"
        >
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Equivalent Amount</p>
                    <h3 className="text-4xl font-black text-slate-900">
                        ₱{stats.total_equivalent_value?.toFixed(2) || '0.00'}
                    </h3>
                </div>
                <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                    <Wallet className="w-6 h-6" />
                </div>
            </div>
            <p className="text-sm text-slate-500 mt-4 font-medium">Estimated valuation of all verified student hours.</p>
        </motion.div>

        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-amber-300 transition-colors"
        >
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pending Drafts</p>
                    <h3 className="text-4xl font-black text-slate-900">{stats.pending_drafts || 0}</h3>
                </div>
                <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
                    <Clock className="w-6 h-6" />
                </div>
            </div>
            <p className="text-sm text-slate-500 mt-4 font-medium">Hours rendered awaiting final review before forwarding.</p>
        </motion.div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[400px]">
          
          {isLoading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                      <span className="text-sm font-bold text-blue-700 animate-pulse">Loading hours rendered...</span>
                  </div>
              </div>
          )}

          <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200">
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Student Profile</th>
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Coverage Period</th>
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Verified Hours</th>
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Equivalent Amount</th>
                          <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right">Status</th>
                      </tr>
                  </thead>
                  <motion.tbody 
                      variants={containerVariants}
                      initial="hidden"
                      animate={!isLoading ? "show" : "hidden"}
                      className="divide-y divide-slate-100"
                  >
                      {!isLoading && records.length === 0 ? (
                          <tr>
                              <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                  <p className="text-base font-semibold text-slate-600">No hours rendered yet</p>
                                  <p className="text-sm font-medium">Click "Compute Hours" to record hours rendered for a period.</p>
                              </td>
                          </tr>
                      ) : (
                          Object.values(records.reduce<Record<number, FinancialRecordItem[]>>((groups, record) => {
                              const key = record.user_id;
                              groups[key] = groups[key] || [];
                              groups[key].push(record);
                              return groups;
                          }, {})).map((coverages) => (
                              coverages.map((r, index) => (
                              <motion.tr variants={rowVariants} key={r.id} className="hover:bg-slate-50 transition-colors group">
                                  {index === 0 && (
                                  <td className="px-6 py-5 align-top border-t border-slate-100" rowSpan={coverages.length}>
                                      <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black shrink-0 border border-blue-100 shadow-inner">
                                              {(r.student?.name || '?').charAt(0)}
                                          </div>
                                          <p className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                              {r.student?.name || 'Unknown Student'}
                                          </p>
                                      </div>
                                  </td>
                                  )}
                                  
                                  <td className="px-6 py-5 align-top border-t border-slate-100">
                                      <div className="text-sm font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded-lg inline-block">
                                          {formatCoverageDate(r.period_start)} <span className="text-slate-400 mx-1">→</span> {formatCoverageDate(r.period_end)}
                                      </div>
                                  </td>

                                  <td className="px-6 py-5 align-top">
                                      <span className="text-lg font-black text-slate-900">{r.total_hours_rendered}</span>
                                      <span className="text-xs font-bold text-slate-400 ml-1">hrs</span>
                                  </td>

                                  <td className="px-6 py-5 align-top">
                                      <div className="flex flex-col gap-1">
                                          <div className="text-lg font-black text-emerald-600">
                                              ₱{Number(r.equivalent_total_amount).toFixed(2)}
                                          </div>
                                          {Number(r.penalty_deductions) > 0 && (
                                              <div className="text-[10px] font-bold text-red-600 uppercase tracking-widest">
                                                  -₱{Number(r.penalty_deductions).toFixed(2)} Penalty
                                              </div>
                                          )}
                                      </div>
                                  </td>

                                  <td className="px-6 py-5 align-top">
                                      <div className="flex items-center justify-end gap-2">
                                          <select
                                              value={r.status}
                                              disabled={busyId === r.id}
                                              onChange={(event) => handleStatusChange(r, event.target.value)}
                                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide border border-slate-200 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                                          >
                                              {ASSESSMENT_STATUSES.map((status) => (
                                                  <option key={status} value={status}>{status}</option>
                                              ))}
                                          </select>
                                          <button
                                              type="button"
                                              disabled={busyId === r.id}
                                              onClick={() => handleCancel(r)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                          >
                                              <Trash2 className="w-3.5 h-3.5" />
                                              Cancel
                                          </button>
                                      </div>
                                  </td>
                              </motion.tr>
                              ))
                          ))
                      )}
                  </motion.tbody>
              </table>
          </div>
      </div>

      {/* COMPUTE OVERLAY MODAL */}
      <AnimatePresence>
        {showCompute && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-auto"
            >
              <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-600" /> 
                  Compute Work Hours
                </h3>
                <button onClick={() => setShowCompute(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCompute} className="p-6 sm:p-8 space-y-6">
                
                <p className="text-xs text-slate-500 font-medium">
                    Select a date range to automatically aggregate verified attendance logs and calculate their equivalent total values.
                </p>

                <div className="grid grid-cols-2 gap-5">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Period Start</label>
                        <input 
                            name="start" 
                            type="date" 
                            required 
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all cursor-pointer" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Period End</label>
                        <input 
                            name="end" 
                            type="date" 
                            required 
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all cursor-pointer" 
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Hourly Rate Equivalent (₱)</label>
                    <input
                        name="rate"
                        type="number"
                        defaultValue="28" // Standard minimum or specific rate
                        step="0.5"
                        required
                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                    />
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setShowCompute(false)} 
                    className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isComputing}
                    className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isComputing ? 'Processing...' : <><ShieldCheck className="w-4 h-4"/> Run Computation</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
