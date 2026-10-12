import React, { useState, useEffect } from 'react';
import { FileText, Clock, CheckCircle2, TrendingUp } from 'lucide-react';
import { financialService } from '../services/financialService';
import { REALTIME_EVENT } from '../utils/realtime';

export const StudentCompensationView: React.FC = () => {
  const [data, setData] = useState<{
    history: any[];
    current_cycle: {
      cycle_name: string;
      hours_rendered: number;
      hourly_rate: number;
      estimated_gross: number;
      approved_shifts_count: number;
    };
    lifetime_equivalent_value: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = (silent = false) => {
      if (!silent) setLoading(true);
      financialService
        .getStudentCompensation()
        .then((res) => {
          if (active) setData(res);
        })
        .catch((err) => console.error('Failed to load hours rendered:', err))
        .finally(() => {
          if (active && !silent) setLoading(false);
        });
    };
    load();
    const refresh = () => load(true);
    const interval = setInterval(refresh, 5000);
    window.addEventListener(REALTIME_EVENT, refresh);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener(REALTIME_EVENT, refresh);
    };
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading hours rendered...</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-500">Hours rendered could not be loaded.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between text-sm font-medium text-slate-500">
            <span>Estimated equivalent ({data?.current_cycle.cycle_name})</span>
            <FileText className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">₱{data?.current_cycle.estimated_gross.toFixed(2)}</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {data?.current_cycle.hours_rendered} hours logged @ ₱{data?.current_cycle.hourly_rate}/hr equivalent
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase">
            <span>Total Equivalent</span>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-3">
            ₱{data?.lifetime_equivalent_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-emerald-600 mt-2 font-medium">Verified and forwarded to Finance</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-semibold uppercase">
            <span>Approved Duty Shifts</span>
            <CheckCircle2 className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-3">{data?.current_cycle.approved_shifts_count}</p>
          <p className="text-xs text-gray-400 mt-2">Verified shifts for this cycle</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">Period Summary</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Summary of verified rendered hours, allowances, and penalty deductions.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold border-b border-gray-100">
              <tr>
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4">Hours Rendered</th>
                <th className="py-3 px-4">Estimated Gross</th>
                <th className="py-3 px-4">Allowances</th>
                <th className="py-3 px-4">Penalty Deductions</th>
                <th className="py-3 px-4">Equivalent Amount</th>
                <th className="py-3 px-4">Report Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {data?.history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-gray-400">
                    No finalized hours rendered yet.
                  </td>
                </tr>
              ) : (
                data?.history.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition">
                    <td className="py-3.5 px-4 text-xs font-medium text-gray-900">
                      {item.period_start} to {item.period_end}
                    </td>
                    <td className="py-3.5 px-4 font-semibold">{item.total_hours_rendered}h</td>
                    <td className="py-3.5 px-4 font-medium">₱{item.estimated_gross_amount.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-emerald-600 font-medium">+₱{item.allowances.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-rose-600 font-medium">-₱{item.penalty_deductions.toFixed(2)}</td>
                    <td className="py-3.5 px-4 font-bold text-gray-900">₱{item.equivalent_total_amount.toFixed(2)}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          item.status === 'Forwarded to Finance'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : item.status === 'Approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
