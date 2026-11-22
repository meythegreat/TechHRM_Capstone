import { motion } from 'framer-motion';
import { FileText, ShieldCheck, Eye, Sparkles } from 'lucide-react';
import { HoursRenderedSection } from './hours/HoursRenderedTables';

export function FinancialManagement() {
  const isAudit = localStorage.getItem('user_role') === 'Super Admin';

  return (
    <div className="hours-rendered-root mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
      {/* OBSIDIAN REPORTING & COMPLIANCE HERO */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8 print:hidden"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                <FileText className="h-3.5 w-3.5 text-blue-400" />
                Reporting &amp; Compliance
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-300">
                <Sparkles className="h-3 w-3" />
                DTR + Activity Ledger
              </span>
            </div>

            <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Hours Rendered
            </h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
              Review, filter, and print verified DTR and activity hours for any date range.
            </p>
          </div>

          {/* Frosted Access Mode Card */}
          <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                isAudit
                  ? 'bg-purple-500/20 text-purple-300 ring-purple-400/30'
                  : 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30'
              }`}
            >
              {isAudit ? <Eye className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Board Access
              </p>
              <p
                className={`mt-0.5 text-sm font-black ${
                  isAudit ? 'text-purple-200' : 'text-emerald-300'
                }`}
              >
                {isAudit ? 'Read-Only Audit' : 'Full Management'}
              </p>
            </div>
          </div>
        </div>
      </motion.header>

      <HoursRenderedSection readOnly={isAudit} />
    </div>
  );
}