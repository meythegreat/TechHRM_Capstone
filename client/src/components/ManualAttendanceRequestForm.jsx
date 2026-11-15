import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus, Trash2, WifiOff } from 'lucide-react';
import { manualAttendanceRequestService } from '../services/manualAttendanceRequestService';

const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const emptyShift = () => ({ date: todayIso(), time_in: '08:00', time_out: '12:00' });

const statusTone = (status) => {
  if (status === 'Pending') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'Approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const formatShift = (shift) => {
  const [y, m, d] = String(shift.date || '').split('-').map(Number);
  const label = y
    ? new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : shift.date;
  return `${label} · ${shift.time_in}–${shift.time_out}`;
};

/**
 * Working-student form: request manual DTR credit when the office had no internet.
 * Submits when the device is online again; hours appear on DTR only after supervisor approval.
 */
const ManualAttendanceRequestForm = ({ onToast }) => {
  const [shifts, setShifts] = useState([emptyShift()]);
  const [reason, setReason] = useState('Office had no internet; submitted for supervisor approval.');
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await manualAttendanceRequestService.mine();
      setRows(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateShift = (index, key, value) => {
    setShifts((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (shifts.length === 0) return;
    setSaving(true);
    try {
      const res = await manualAttendanceRequestService.submit({
        reason: reason.trim() || undefined,
        shifts: shifts.map((shift) => ({
          date: shift.date,
          time_in: shift.time_in,
          time_out: shift.time_out,
        })),
      });
      onToast?.(res.message || 'Request submitted.', 'success');
      setShifts([emptyShift()]);
      await load();
    } catch (err) {
      onToast?.(err?.response?.data?.message || 'Could not submit the offline attendance request.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id) => {
    try {
      const res = await manualAttendanceRequestService.cancel(id);
      onToast?.(res.message || 'Request cancelled.', 'success');
      await load();
    } catch (err) {
      onToast?.(err?.response?.data?.message || 'Could not cancel that request.', 'error');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-start gap-3">
        <WifiOff className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Offline manual attendance</h3>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Use this when your office had no internet and you could not clock in with a passcode or QR.
            Submit when you are back online. Your supervisor must approve before hours appear on your DTR.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="p-6 space-y-5">
        {shifts.map((shift, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Date</label>
              <input
                type="date"
                required
                max={todayIso()}
                value={shift.date}
                onChange={(e) => updateShift(index, 'date', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Time in</label>
              <input
                type="time"
                required
                value={shift.time_in}
                onChange={(e) => updateShift(index, 'time_in', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Time out</label>
              <input
                type="time"
                required
                value={shift.time_out}
                onChange={(e) => updateShift(index, 'time_out', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="flex gap-2">
              {shifts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShifts((current) => current.filter((_, i) => i !== index))}
                  className="h-10.5 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label={`Remove shift ${index + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              {index === shifts.length - 1 && shifts.length < 10 && (
                <button
                  type="button"
                  onClick={() => setShifts((current) => [...current, emptyShift()])}
                  className="h-10.5 flex-1 inline-flex items-center justify-center gap-1.5 px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-4 h-4" /> Add shift
                </button>
              )}
            </div>
          </div>
        ))}

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-xl"
        >
          <ClipboardList className="w-4 h-4" />
          {saving ? 'Submitting…' : 'Submit for supervisor approval'}
        </button>
      </form>

      <div className="border-t border-slate-100 px-6 py-5">
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Your requests</h4>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No offline attendance requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${statusTone(row.status)}`}>
                    {row.status}
                  </span>
                  {row.status === 'Pending' && (
                    <button
                      type="button"
                      onClick={() => cancel(row.id)}
                      className="text-xs font-bold text-slate-500 hover:text-red-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-700">{row.reason}</p>
                <ul className="mt-2 space-y-1">
                  {(row.shifts || []).map((shift) => (
                    <li key={shift.id || `${shift.date}-${shift.time_in}`} className="text-xs font-mono text-slate-600">
                      {formatShift(shift)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ManualAttendanceRequestForm;
