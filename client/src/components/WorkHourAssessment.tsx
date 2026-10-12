import React, { useState, useEffect } from 'react';
import { Calculator } from 'lucide-react';
import { financialService } from '../services/financialService';
import { bindPopup } from '../utils/popupDismiss';

export const WorkHourAssessment = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [stats, setStats] = useState({ total_equivalent_value: 0, pending_drafts: 0 });
  const [showCompute, setShowCompute] = useState(false);
  const [isComputing, setIsComputing] = useState(false);

  const fetchRecords = async () => {
    try {
      const res = await financialService.getRecords();
      setRecords(res.records.data || []);
      setStats(res.stats || { total_equivalent_value: 0, pending_drafts: 0 });
    } catch (error) {
      console.error("Failed to fetch records", error);
    }
  };

  useEffect(() => { fetchRecords(); }, []);

  const handleCompute = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsComputing(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      await financialService.computePeriod({
        period_start: formData.get('start') as string,
        period_end: formData.get('end') as string,
        hourly_rate: parseFloat(formData.get('rate') as string),
      });
      setShowCompute(false);
      fetchRecords();
    } catch (error) {
      console.error("Failed to compute hours", error);
    } finally {
      setIsComputing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Hours Rendered</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">Calculate equivalent values for rendered hours to forward to the Finance Office.</p>
        </div>
        <button onClick={() => setShowCompute(true)} className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2">
          <Calculator className="w-4 h-4" /> Compute Hours
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Equivalent Value</p>
          <h3 className="text-4xl font-semibold text-slate-900 mt-2">₱{stats.total_equivalent_value?.toFixed(2)}</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Drafts</p>
          <h3 className="text-4xl font-semibold text-slate-900 mt-2">{stats.pending_drafts}</h3>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Student</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Period</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Verified Hours</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Equivalent Amount</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No hours rendered yet. Click Compute Hours to begin.</td></tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-6 py-5 font-bold text-slate-900">{r.student?.name}</td>
                  <td className="px-6 py-5 text-sm">{r.period_start} → {r.period_end}</td>
                  <td className="px-6 py-5 font-semibold text-slate-900">{r.total_hours_rendered} hrs</td>
                  <td className="px-6 py-5">
                    <div className="font-semibold text-emerald-600">₱{Number(r.equivalent_total_amount).toFixed(2)}</div>
                  </td>
                  <td className="px-6 py-5 text-sm font-bold text-slate-600">{r.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCompute && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" {...bindPopup(() => setShowCompute(false))}>
          <form onSubmit={handleCompute} className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md space-y-6">
            <h3 className="text-xl font-semibold text-slate-900">Compute Work Hours</h3>
            <input name="start" type="date" required className="w-full p-3 bg-slate-50 border rounded-xl" />
            <input name="end" type="date" required className="w-full p-3 bg-slate-50 border rounded-xl" />
            <input name="rate" type="number" defaultValue="28" step="0.5" required className="w-full p-3 bg-slate-50 border rounded-xl" placeholder="Hourly Rate" />
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowCompute(false)} className="px-5 py-2 font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancel</button>
              <button type="submit" disabled={isComputing} className="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50">
                {isComputing ? 'Processing...' : 'Run Computation'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
