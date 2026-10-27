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
    const seal = `${window.location.origin}${CAMPUS_LETTERHEAD.sealSrc}`;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Extra Hours Request</title><style>
        @page { size: letter; margin: 0.5in; }
        html, body { margin: 0; padding: 0; background: #fff; color: #000; }
        ${style}
        .ehr-offscreen { position: static !important; left: auto !important; width: auto !important; overflow: visible !important; pointer-events: auto !important; }
        .ehr-preview .ehr-page, .ehr-page {
            max-width: none !important;
            width: 100% !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
        }
        .ehr-preview, .ehr-page { font-size: 14.5px !important; line-height: 1.35 !important; }
        .ehr-letterhead { gap: 8px !important; padding-bottom: 6px !important; margin-bottom: 8px !important; }
        .ehr-letterhead img { width: 58px !important; height: 58px !important; }
        .ehr-univ strong { font-size: 16px !important; }
        .ehr-univ span { font-size: 12px !important; margin-top: 1px !important; }
        .ehr-office { font-size: 13.5px !important; margin: 6px 0 10px !important; }
        .ehr-date { margin-bottom: 10px !important; }
        .ehr-addr { margin: 0 0 10px !important; }
        .ehr-through { margin: 8px 0 10px !important; }
        .ehr-salutation { margin: 0 0 10px !important; }
        .ehr-body p { margin: 0 0 10px !important; }
        .ehr-closing { margin: 12px 0 6px !important; }
        .ehr-sig { margin-top: 14px !important; }
        .ehr-sig .line { min-height: 12px !important; margin-bottom: 2px !important; }
        .ehr-sig .title { font-size: 13px !important; }
        .ehr-chain { margin-top: 14px !important; gap: 10px 18px !important; }
        .ehr-chain-item .role { font-size: 13px !important; margin-bottom: 10px !important; }
        .ehr-chain-item .line { min-height: 11px !important; margin-bottom: 2px !important; }
        .ehr-chain-item .name { font-size: 13.5px !important; }
        .ehr-chain-item .title { font-size: 12.5px !important; }
        .ehr-chain-item.full { max-width: 50% !important; }
    </style></head><body>${page.replaceAll(`src="${CAMPUS_LETTERHEAD.sealSrc}"`, `src="${seal}"`)}</body></html>`);
    doc.close();

    const finish = () => {
        win.focus();
        win.print();
        win.addEventListener('afterprint', () => frame.remove(), { once: true });
        setTimeout(() => frame.remove(), 2000);
    };
    const image = doc.querySelector('img');
    if (image && !image.complete) {
        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', finish, { once: true });
    } else {
        finish();
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
    const officeHeader = text(data.department)
        ? `OFFICE OF THE ${text(data.department).toUpperCase()}`
        : 'REQUESTING OFFICE';

    return (
        <div className={`extra-hours-print-root ehr-preview ${preview ? '' : 'ehr-offscreen'}`} aria-hidden={!preview}>
            <style>{`
                .ehr-offscreen { position: absolute; left: -10000px; top: 0; width: 8.5in; overflow: hidden; pointer-events: none; }
                .ehr-preview, .ehr-page { color: #111; font-family: "Times New Roman", Times, serif; font-size: 15px; line-height: 1.35; box-sizing: border-box; }
                .ehr-preview .ehr-page {
                    width: 8.5in; min-height: 11in; max-width: 8.5in; margin: 0 auto;
                    padding: 0.5in; background: #fff; border: 1px solid #e2e8f0;
                    box-shadow: 0 8px 24px rgba(15,23,42,.08);
                }
                .ehr-letterhead { display: grid; grid-template-columns: 62px 1fr; gap: 10px; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }
                .ehr-letterhead img { width: 58px; height: 58px; object-fit: contain; }
                .ehr-univ { text-align: center; }
                .ehr-univ strong { display: block; font-size: 16.5px; letter-spacing: .03em; color: #1e3a8a; }
                .ehr-univ span { display: block; font-size: 12.5px; line-height: 1.3; margin-top: 1px; }
                .ehr-office { text-align: center; font-weight: 700; font-size: 14px; letter-spacing: .04em; margin: 8px 0 12px; text-transform: uppercase; }
                .ehr-date { text-align: right; margin-bottom: 12px; }
                .ehr-addr { margin: 0 0 12px; }
                .ehr-addr .name { font-weight: 700; text-transform: uppercase; }
                .ehr-through { margin: 10px 0 12px; }
                .ehr-through .label { font-style: italic; }
                .ehr-salutation { margin: 0 0 12px; }
                .ehr-body p { margin: 0 0 12px; text-align: justify; }
                .ehr-closing { margin: 14px 0 6px; }
                .ehr-sig { margin-top: 16px; }
                .ehr-sig .line { border-bottom: 1px solid #111; width: 250px; min-height: 13px; margin-bottom: 2px; }
                .ehr-sig .name { font-weight: 700; text-transform: uppercase; }
                .ehr-sig .title { font-size: 13.5px; }
                .ehr-chain { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; page-break-inside: avoid; }
                .ehr-chain-item { page-break-inside: avoid; }
                .ehr-chain-item .role { font-size: 13.5px; font-style: italic; margin-bottom: 11px; }
                .ehr-chain-item .line { border-bottom: 1px solid #111; min-height: 12px; margin-bottom: 2px; }
                .ehr-chain-item .name { font-weight: 700; font-size: 14px; text-transform: uppercase; }
                .ehr-chain-item .title { font-size: 13px; }
                .ehr-chain-item.full { grid-column: 1 / -1; max-width: 50%; margin: 0 auto; text-align: center; }
                .ehr-chain-item.full .line { margin-left: auto; margin-right: auto; width: 70%; }
            `}</style>

            <div className="ehr-page">
                <div className="ehr-letterhead">
                    <img src={CAMPUS_LETTERHEAD.sealSrc} alt="Filamer Christian University seal" />
                    <div className="ehr-univ">
                        <strong>{CAMPUS_LETTERHEAD.universityName}</strong>
                        <span>{CAMPUS_LETTERHEAD.address}</span>
                        <span>{CAMPUS_LETTERHEAD.phoneWeb}</span>
                    </div>
                </div>

                <div className="ehr-office">{officeHeader}</div>
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
                    <p>
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
    );
};

export default ExtraHoursLetter;
