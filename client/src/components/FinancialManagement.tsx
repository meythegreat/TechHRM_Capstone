import { FileText } from 'lucide-react';
import { HoursRenderedSection } from './hours/HoursRenderedTables';

export function FinancialManagement() {
  const isAudit = localStorage.getItem('user_role') === 'Super Admin';

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
      <div className="print:hidden">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-medium text-slate-500">Reporting & Compliance</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Hours Rendered
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
          DTR hours plus activity hours, grouped by year level for the selected month.
        </p>
      </div>

      <HoursRenderedSection readOnly={isAudit} />
    </div>
  );
}
