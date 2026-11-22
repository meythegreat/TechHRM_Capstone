import { Clock } from 'lucide-react';

export default function CoverageHoldNotice() {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="flex items-start gap-3 rounded-[1.75rem] border border-slate-200/90 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Clock className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-extrabold text-slate-900">
            Waiting for the supervisor to be marked absent
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">
            Department tools turn on for today once the supervisor is marked absent. Janitorial final approval stays on the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
