import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus, Trash2, WifiOff } from 'lucide-react';
import { manualAttendanceRequestService } from '../services/manualAttendanceRequestService';
import { janitorialGroupService } from '../services/janitorialGroupService';
import CleaningProofCapture from './CleaningProofCapture';
import { clearOfflineDraft, loadOfflineDraft, saveOfflineDraft } from '../utils/offlineAttendanceDraft';

const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const emptyShift = () => ({
  date: todayIso(),
  time_in: '08:00',
  time_out: '12:00',
  before_photo: null,
  after_photo: null,
  before_captured_at: '',
  after_captured_at: '',
});

const plusFourHours = (time) => {
  const [hour, minute] = String(time || '00:00').split(':').map((part) => Number(part) || 0);
  const total = (hour * 60 + minute + 240) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

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
const TYPE_LABELS = {
  regular: 'Regular offline',
  janitorial: 'Janitorial offline',
  class_hours: 'Class-hours duty',
};

const ManualAttendanceRequestForm = ({ onToast }) => {
  const [requestType, setRequestType] = useState('regular');
  const [shifts, setShifts] = useState([emptyShift()]);
  const [reason, setReason] = useState('Office had no internet; submitted for supervisor approval.');
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draftReady, setDraftReady] = useState(false);

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
    let cancelled = false;
    load();
    Promise.all([
      janitorialGroupService.list().catch(() => []),
      loadOfflineDraft().catch(() => null),
    ]).then(([list, draft]) => {
      if (cancelled) return;
      setGroups(list);
      if (draft?.requestType) setRequestType(draft.requestType);
      if (draft?.reason) setReason(draft.reason);
      if (draft?.groupId) setGroupId(String(draft.groupId));
      else if (list.length === 1) setGroupId(String(list[0].id));
      if (Array.isArray(draft?.shifts) && draft.shifts.length > 0) {
        setShifts(draft.shifts.map((shift) => ({
          ...emptyShift(),
          ...shift,
          before_preview: shift.before_photo ? URL.createObjectURL(shift.before_photo) : '',
          after_preview: shift.after_photo ? URL.createObjectURL(shift.after_photo) : '',
        })));
      }
      setDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!draftReady) return undefined;
    const payload = {
      requestType,
      reason,
      groupId,
      shifts: shifts.map((shift) => ({
        date: shift.date,
        time_in: shift.time_in,
        time_out: shift.time_out,
        before_photo: shift.before_photo || null,
        after_photo: shift.after_photo || null,
        before_captured_at: shift.before_captured_at || '',
        after_captured_at: shift.after_captured_at || '',
      })),
    };
    const timer = window.setTimeout(() => {
      saveOfflineDraft(payload).catch(() => {});
    }, 200);
    return () => {
      window.clearTimeout(timer);
      saveOfflineDraft(payload).catch(() => {});
    };
  }, [draftReady, requestType, reason, groupId, shifts]);

  const updateShift = (index, key, value) => {
    setShifts((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (shifts.length === 0) return;
    if (requestType === 'janitorial' && shifts.some((shift) => !shift.before_photo || !shift.after_photo || !shift.before_captured_at || !shift.after_captured_at)) {
      onToast?.('Enter your time in, and attach the before and after photos with the date and time on each one.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await manualAttendanceRequestService.submit({
        request_type: requestType,
        reason: reason.trim() || undefined,
        shifts: shifts.map((shift) => ({
          date: shift.date,
          time_in: shift.time_in,
          time_out: requestType === 'janitorial' ? plusFourHours(shift.time_in) : shift.time_out,
          janitorial_group_id: requestType === 'janitorial' && groupId ? Number(groupId) : undefined,
          before_photo: requestType === 'janitorial' ? shift.before_photo : undefined,
          after_photo: requestType === 'janitorial' ? shift.after_photo : undefined,
          before_captured_at: requestType === 'janitorial' ? shift.before_captured_at : undefined,
          after_captured_at: requestType === 'janitorial' ? shift.after_captured_at : undefined,
          capture_source: requestType === 'janitorial' ? 'live_camera' : undefined,
        })),
      });
      onToast?.(res.message || 'Request submitted.', 'success');
      setShifts([emptyShift()]);
      await clearOfflineDraft().catch(() => {});
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
    <div id="offline-attendance" className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-start gap-3">
        <WifiOff className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Offline / special attendance requests</h3>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            Regular offline when the office had no internet, janitorial offline when you could not record duty online, or class-hours duty when your
            work time overlaps a class block. Janitorial requests need a time in, then a live camera photo before and after. The date and time are stamped on each photo. Gallery uploads are not accepted. Your janitorial supervisor approves them, and an accepted entry is recorded as exactly 4 hours from time in.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="p-6 space-y-5">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Request type</label>
          <select
            value={requestType}
            onChange={(e) => {
              const next = e.target.value;
              setRequestType(next);
              if (next === 'janitorial') {
                setReason('Janitorial offline duty; office had no internet.');
              } else if (next === 'class_hours') {
                setReason('Duty during class hours; submitted for supervisor approval.');
              } else {
                setReason('Office had no internet; submitted for supervisor approval.');
              }
            }}
            className="w-full max-w-md px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="regular">Regular offline attendance</option>
            <option value="janitorial">Janitorial offline attendance</option>
            <option value="class_hours">Class-hours duty (needs approval)</option>
          </select>
        </div>

        {requestType === 'janitorial' && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Janitorial group</label>
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500">You need a janitorial group assignment before you can submit this request.</p>
            ) : (
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                required
                className="w-full max-w-md px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
              >
                {groups.length > 1 && <option value="">Select a group…</option>}
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.area}{group.name && group.name !== group.area ? ` · ${group.name}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {shifts.map((shift, index) => (
          <div key={index} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
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
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                  {requestType === 'janitorial' ? 'Recorded time out' : 'Time out'}
                </label>
                {requestType === 'janitorial' ? (
                  <p className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
                    {plusFourHours(shift.time_in)}
                    <span className="block text-[11px] font-medium text-slate-500">Exactly 4 hours after time in, once accepted. You can submit even if that clock-out is still later today.</span>
                  </p>
                ) : (
                  <input
                    type="time"
                    required
                    value={shift.time_out}
                    onChange={(e) => updateShift(index, 'time_out', e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
                  />
                )}
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
            {requestType === 'janitorial' && draftReady && (
              <>
              <p className="text-xs text-slate-500">Captured photos stay on this device if you open the dashboard and come back. They are sent when you submit.</p>
              <CleaningProofCapture
                collect
                insecureCamera={typeof window !== 'undefined' && !window.isSecureContext}
                restored={{
                  before: shift.before_photo ? {
                    file: shift.before_photo,
                    capturedAt: shift.before_captured_at,
                    url: shift.before_preview,
                  } : null,
                  after: shift.after_photo ? {
                    file: shift.after_photo,
                    capturedAt: shift.after_captured_at,
                    url: shift.after_preview,
                  } : null,
                }}
                onCollected={(shots) => {
                  setShifts((current) => current.map((row, i) => (i === index ? {
                    ...row,
                    before_photo: shots.before?.file || null,
                    after_photo: shots.after?.file || null,
                    before_captured_at: shots.before?.capturedAt || '',
                    after_captured_at: shots.after?.capturedAt || '',
                    before_preview: shots.before?.url || row.before_preview || '',
                    after_preview: shots.after?.url || row.after_preview || '',
                  } : row)));
                }}
              />
              </>
            )}
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
          disabled={saving || (requestType === 'janitorial' && (!groupId || groups.length === 0))}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${statusTone(row.status)}`}>
                      {row.status}
                    </span>
                    <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-slate-200 bg-white text-slate-600">
                      {TYPE_LABELS[row.request_type] || row.request_type || 'Regular offline'}
                    </span>
                  </div>
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
