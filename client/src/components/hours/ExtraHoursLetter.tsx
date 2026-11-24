import { CAMPUS_LETTERHEAD, CAMPUS_OFFICERS } from '../../constants/campusDocuments';
import { EXTRA_HOURS_LETTER, EXTRA_HOURS_SIGNATORIES } from './extraHoursSignatories';

export type ExtraHoursLetterData = {
    date?: string;
    department?: string;
    supervisorName?: string;
    supervisorTitle?: string;
    coordinatorName?: string;
    presidentName?: string;
    studentNames?: string[];
    periodLabel?: string;
    dutyDescription?: string;
    weeklyHours?: number;
};

const text = (value?: string | number | null) => String(value ?? '').trim();

const displayName = (value?: string | number | null) => {
    const name = text(value);
    return name ? name.toUpperCase() : '';
};

/** Keep a single leading title if the caller already added MR./MS. */
const studentDisplayName = (value?: string | number | null) => {
    const name = text(value);
    if (!name) return '';
    const match = name.match(/^(mr|ms|mrs|miss)\.?\s+(.+)$/i);
    if (!match) return name.toUpperCase();
    const title = match[1].toLowerCase() === 'mr' ? 'MR.' : 'MS.';
    const rest = match[2].replace(/^(mr|ms|mrs|miss)\.?\s+/i, '').trim();
    return `${title} ${rest.toUpperCase()}`;
};

const joinNamesBold = (names: string[]) => {
    const cleaned = names.map((name) => text(name)).filter(Boolean);
    if (cleaned.length === 0) {
        return <strong>________________</strong>;
    }

    const bold = (name: string, key: string) => <strong key={key}>{name}</strong>;

    if (cleaned.length === 1) return bold(cleaned[0], '0');
    if (cleaned.length === 2) {
        return <>{bold(cleaned[0], '0')} and {bold(cleaned[1], '1')}</>;
    }

    return (
        <>
            {cleaned.slice(0, -1).map((name, index) => (
                <span key={index}>
                    {bold(name, String(index))}
                    {index < cleaned.length - 2 ? ', ' : ''}
                </span>
            ))}
            {', and '}
            {bold(cleaned[cleaned.length - 1], String(cleaned.length - 1))}
        </>
    );
};

export function printExtraHoursLetter() {
    const source = document.querySelector('.extra-hours-print-root');
    if (!(source instanceof HTMLElement)) return;

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
        frame.remove();
        return;
    }

    const style = source.querySelector('style')?.textContent ?? '';
    const page = source.querySelector('.ehr-page')?.outerHTML ?? source.innerHTML;
    const abs = (src: string) => `${window.location.origin}${src}`;
    const printable = page
        .replaceAll(`src="${CAMPUS_LETTERHEAD.letterheadSheetSrc}"`, `src="${abs(CAMPUS_LETTERHEAD.letterheadSheetSrc)}"`)
        .replaceAll(`src="${CAMPUS_LETTERHEAD.wspoLogoSrc}"`, `src="${abs(CAMPUS_LETTERHEAD.wspoLogoSrc)}"`);
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Extra Hours Request</title><style>
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        ${style}
        .ehr-offscreen { position: static !important; left: auto !important; width: auto !important; overflow: visible !important; pointer-events: auto !important; }
        .ehr-preview .ehr-page, .ehr-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-width: none !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            overflow: hidden !important;
        }
    </style></head><body>${printable}</body></html>`);
    doc.close();

    const finish = () => {
        win.focus();
        win.print();
        win.addEventListener('afterprint', () => frame.remove(), { once: true });
        setTimeout(() => frame.remove(), 2000);
    };
    const images = [...doc.querySelectorAll('img')];
    const pending = images.filter((image) => !image.complete);
    if (pending.length === 0) {
        finish();
    } else {
        let left = pending.length;
        const done = () => {
            left -= 1;
            if (left <= 0) finish();
        };
        pending.forEach((image) => {
            image.addEventListener('load', done, { once: true });
            image.addEventListener('error', done, { once: true });
        });
    }
}

type ExtraHoursLetterProps = {
    data: ExtraHoursLetterData;
    preview?: boolean;
};

const ExtraHoursLetter = ({ data, preview = false }: ExtraHoursLetterProps) => {
    const supervisorDisplay = displayName(data.supervisorName);
    const coordinatorDisplay = displayName(data.coordinatorName) || displayName(EXTRA_HOURS_SIGNATORIES.endorsed.name);
    const presidentDisplay = displayName(data.presidentName) || EXTRA_HOURS_SIGNATORIES.approved.name;
    const salutationName = presidentDisplay.split(',')[0] || CAMPUS_OFFICERS.president.salutationShort;
    const studentLine = joinNamesBold((data.studentNames || []).map(studentDisplayName));
    const department = text(data.department) || '________________';
    const period = text(data.periodLabel) || '________________';
    const duties = text(data.dutyDescription) || '________________';
    const weeklyHours = data.weeklyHours ?? EXTRA_HOURS_LETTER.weeklyHours;
    const studentCount = (data.studentNames || []).filter((name) => text(name)).length;

    return (
        <div className={`extra-hours-print-root ehr-preview ${preview ? '' : 'ehr-offscreen'}`} aria-hidden={!preview}>
            <style>{`
                .ehr-offscreen { position: absolute; left: -10000px; top: 0; width: 8.5in; overflow: hidden; pointer-events: none; }
                .ehr-preview, .ehr-page { color: #111; font-family: "Times New Roman", Times, serif; font-size: 14.5px; line-height: 1.32; box-sizing: border-box; }
                .ehr-preview .ehr-page {
                    position: relative; width: 210mm; height: 297mm; margin: 0 auto; overflow: hidden;
                    background: #fff; border: 1px solid #e2e8f0;
                    box-shadow: 0 8px 24px rgba(15,23,42,.08);
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .ehr-sheet { position: absolute; left: 0; width: 210mm; height: auto; pointer-events: none; }
                .ehr-sheet-top { position: absolute; top: 0; left: 0; width: 210mm; height: 246mm; overflow: hidden; z-index: 0; }
                .ehr-sheet-top .ehr-sheet { top: 0; }
                .ehr-sheet-foot { position: absolute; bottom: 0; left: 0; width: 210mm; height: 22mm; overflow: hidden; z-index: 0; }
                .ehr-sheet-foot .ehr-sheet { bottom: 0; }
                .ehr-dept-logo {
                    position: absolute; z-index: 1; left: 160mm; top: 15.8mm;
                    width: 20.2mm; height: 20.2mm; transform: translate(-50%, -50%);
                    object-fit: cover; border-radius: 50%; background: #fff;
                }
                .ehr-office {
                    position: absolute; z-index: 1; left: 12mm; right: 12mm; top: 25.4mm;
                    text-align: center; font-weight: 700; font-size: 12pt; letter-spacing: .03em;
                    line-height: 1.15; text-transform: uppercase;
                    font-family: "Sitka Banner", "Times New Roman", Times, serif;
                }
                .ehr-content { position: relative; z-index: 1; padding: 42mm 22mm 28mm; }
                .ehr-date { text-align: right; margin-bottom: 10px; }
                .ehr-addr { margin: 0 0 10px; }
                .ehr-addr .name { font-weight: 700; text-transform: uppercase; }
                .ehr-through { margin: 8px 0 10px; }
                .ehr-through .label { font-style: italic; }
                .ehr-salutation { margin: 0 0 10px; }
                .ehr-body p { margin: 0 0 10px; text-align: justify; }
                .ehr-body p.ehr-request { text-indent: 0.5in; text-align: justify; text-align-last: left; }
                .ehr-closing { margin: 12px 0 4px; }
                .ehr-sig { margin-top: 12px; }
                .ehr-sig .line { border-bottom: 1px solid #111; width: 250px; min-height: 12px; margin-bottom: 2px; }
                .ehr-sig .name { font-weight: 700; text-transform: uppercase; }
                .ehr-sig .title { font-size: 13px; }
                .ehr-chain { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; page-break-inside: avoid; }
                .ehr-chain-item { page-break-inside: avoid; }
                .ehr-chain-item .role { font-size: 13px; font-style: italic; margin-bottom: 8px; }
                .ehr-chain-item .line { border-bottom: 1px solid #111; min-height: 11px; margin-bottom: 2px; }
                .ehr-chain-item .name { font-weight: 700; font-size: 13.5px; text-transform: uppercase; }
                .ehr-chain-item .title { font-size: 12.5px; }
                .ehr-chain-item.full { grid-column: 1 / -1; max-width: 50%; margin: 0 auto; text-align: center; }
                .ehr-chain-item.full .line { margin-left: auto; margin-right: auto; width: 70%; }
            `}</style>

            <div className="ehr-page">
                <div className="ehr-sheet-top">
                    <img className="ehr-sheet" src={CAMPUS_LETTERHEAD.letterheadSheetSrc} alt="" />
                </div>
                <div className="ehr-sheet-foot">
                    <img className="ehr-sheet" src={CAMPUS_LETTERHEAD.letterheadSheetSrc} alt="" />
                </div>
                <img className="ehr-dept-logo" src={CAMPUS_LETTERHEAD.wspoLogoSrc} alt="Work Study Program Organization" />
                <div className="ehr-office">{CAMPUS_LETTERHEAD.issuingOffice}</div>
                <div className="ehr-content">
                <div className="ehr-date">{text(data.date) || '\u00a0'}</div>

                <div className="ehr-addr">
                    <div className="name">{presidentDisplay}</div>
                    <div>{CAMPUS_OFFICERS.president.title}</div>
                    <div>{CAMPUS_LETTERHEAD.universityNamePlain}</div>
                </div>

                <div className="ehr-through">
                    <div><span className="label">Through:</span></div>
                    <div className="name" style={{ fontWeight: 700, textTransform: 'uppercase' }}>
                        {coordinatorDisplay || CAMPUS_OFFICERS.wspoCoordinator.title.toUpperCase()}
                    </div>
                    <div>{CAMPUS_OFFICERS.wspoCoordinator.title}</div>
                </div>

                <div className="ehr-salutation">Dear {salutationName}:</div>
                <div className="ehr-body">
                    <p>{EXTRA_HOURS_LETTER.salutation}</p>
                    <p className="ehr-request">
                        May I request the services of {studentLine}, student assistant
                        {studentCount === 1 ? '' : 's'} of the {department}, for the {period}.
                        {' '}They will assist with {duties}. They may render up to <strong>{weeklyHours} hours of duty per week</strong>,
                        reporting to the office during their available hours.
                    </p>
                    <p>Thank you very much!</p>
                </div>

                <div className="ehr-closing">Respectfully,</div>
                <div className="ehr-sig">
                    <div className="line" />
                    <div className="name">{supervisorDisplay || '\u00a0'}</div>
                    <div className="title">{text(data.supervisorTitle) || 'Department Supervisor'}</div>
                </div>

                <div className="ehr-chain">
                    <div className="ehr-chain-item">
                        <div className="role">{EXTRA_HOURS_SIGNATORIES.notedVpAdmin.role}:</div>
                        <div className="line" />
                        <div className="name">{EXTRA_HOURS_SIGNATORIES.notedVpAdmin.name}</div>
                        <div className="title">{EXTRA_HOURS_SIGNATORIES.notedVpAdmin.title}</div>
                    </div>
                    <div className="ehr-chain-item">
                        <div className="role">{EXTRA_HOURS_SIGNATORIES.endorsed.role}:</div>
                        <div className="line" />
                        <div className="name">{coordinatorDisplay || '\u00a0'}</div>
                        <div className="title">{EXTRA_HOURS_SIGNATORIES.endorsed.title}</div>
                    </div>
                    <div className="ehr-chain-item">
                        <div className="role">{EXTRA_HOURS_SIGNATORIES.notedCommittee.role}:</div>
                        <div className="line" />
                        <div className="name">{EXTRA_HOURS_SIGNATORIES.notedCommittee.name}</div>
                        <div className="title">{EXTRA_HOURS_SIGNATORIES.notedCommittee.title}</div>
                    </div>
                    <div className="ehr-chain-item">
                        <div className="role">{EXTRA_HOURS_SIGNATORIES.recommending.role}:</div>
                        <div className="line" />
                        <div className="name">{EXTRA_HOURS_SIGNATORIES.recommending.name}</div>
                        <div className="title">{EXTRA_HOURS_SIGNATORIES.recommending.title}</div>
                    </div>
                    <div className="ehr-chain-item full">
                        <div className="role">{EXTRA_HOURS_SIGNATORIES.approved.role}:</div>
                        <div className="line" />
                        <div className="name">{EXTRA_HOURS_SIGNATORIES.approved.name}</div>
                        <div className="title">{EXTRA_HOURS_SIGNATORIES.approved.title}</div>
                    </div>
                </div>
                </div>
            </div>
        </div>
    );
};

export default ExtraHoursLetter;
