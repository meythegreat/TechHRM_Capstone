import { CAMPUS_LETTERHEAD } from '../../constants/campusDocuments';
import { EXTRA_SERVICE_FORM, EXTRA_SERVICE_SIGNATORIES } from './extraServiceSignatories';

export type ExtraServiceLetterData = {
    date?: string;
    department?: string;
    supervisorName?: string;
    coordinatorName?: string;
    eventTitle?: string;
    reason?: string;
    dutyPeriod?: string;
    quantity?: number;
    genderSummary?: string;
};

const text = (value?: string | number | null) => String(value ?? '').trim();

/** Match fixed signatories (ALL CAPS) for wet-signature printed names. */
const displayName = (value?: string | number | null) => {
    const name = text(value);
    return name ? name.toUpperCase() : '';
};

const Rule = ({ value, className = '' }: { value?: string | number | null; className?: string }) => (
    <span className={`esr-rule ${className}`}>{text(value) || '\u00a0'}</span>
);

export function printExtraServiceLetter() {
    const source = document.querySelector('.extra-service-print-root');
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
    const page = source.querySelector('.esr-page')?.outerHTML ?? source.innerHTML;
    const seal = `${window.location.origin}${CAMPUS_LETTERHEAD.sealSrc}`;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${EXTRA_SERVICE_FORM.formName}</title><style>
        @page { size: letter; margin: 0.5in; }
        html, body { margin: 0; padding: 0; background: #fff; color: #000; }
        ${style}
        .esr-offscreen { position: static !important; left: auto !important; width: auto !important; overflow: visible !important; pointer-events: auto !important; }
        .esr-preview .esr-page, .esr-page {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
        }
        .esr-head { margin-bottom: 8px !important; }
        .esr-date-row { margin-bottom: 8px !important; }
        .esr-grid { gap: 10px 22px !important; margin-bottom: 4px !important; }
        .esr-field { margin-bottom: 8px !important; }
        .esr-rule.multi { min-height: 2.6em !important; background-size: 100% 1.2em !important; }
        .esr-sig-block { margin-top: 10px !important; padding: 0 !important; }
        .esr-sig-row { gap: 18px !important; margin-top: 10px !important; }
        .esr-sig-line { min-height: 20px !important; margin: 0 0.12in 2px !important; }
        .esr-section-label { margin: 8px 0 0 !important; }
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

type WsaExtraServiceLetterProps = {
    data: ExtraServiceLetterData;
    /** Hide on screen when embedded only for print; show preview when true. */
    preview?: boolean;
};

const WsaExtraServiceLetter = ({ data, preview = false }: WsaExtraServiceLetterProps) => {
    const purpose = [data.eventTitle, data.reason].filter((part) => text(part)).join(' — ');
    const period = text(data.dutyPeriod);
    const supervisorDisplay = displayName(data.supervisorName);
    const coordinatorDisplay = displayName(data.coordinatorName);
    const slotNote = [
        data.quantity ? `${data.quantity} working student${data.quantity === 1 ? '' : 's'}` : '',
        data.genderSummary || '',
    ].filter(Boolean).join(' · ');

    return (
        <div className={`extra-service-print-root esr-preview ${preview ? '' : 'esr-offscreen'}`} aria-hidden={!preview}>
            <style>{`
                .esr-offscreen { position: absolute; left: -10000px; top: 0; width: 8.5in; overflow: hidden; pointer-events: none; }
                .esr-preview, .esr-page { color: #000; font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.32; box-sizing: border-box; }
                .esr-preview .esr-page {
                    width: 8.5in; min-height: 11in; max-width: 8.5in; margin: 0 auto;
                    padding: 0.5in; background: #fff; border: 1px solid #e2e8f0;
                    box-shadow: 0 8px 24px rgba(15,23,42,.08);
                }
                .esr-head { width: 100%; border-collapse: collapse; margin: 0 0 10px; }
                .esr-head td { border: 1px solid #000; padding: 3px 6px; vertical-align: middle; }
                .esr-seal { width: 74px; text-align: center; }
                .esr-seal img { width: 64px; height: 64px; object-fit: contain; }
                .esr-univ { text-align: center; font-size: 14.5px; line-height: 1.25; padding-top: 5px; padding-bottom: 5px; }
                .esr-univ strong { font-size: 16px; font-weight: 900; letter-spacing: .02em; }
                .esr-sheet { text-align: center; font-size: 13.5px; line-height: 1.2; }
                .esr-label { font-size: 12.5px; width: 22%; }
                .esr-office { font-size: 12.5px; line-height: 1.25; vertical-align: middle; width: 28%; }
                .esr-office-gap { margin-top: 6px; }
                .esr-page-cell { text-align: center; white-space: nowrap; width: 1px; font-size: 12.5px; }
                .esr-title { text-align: center; font-weight: 900; font-size: 15px; letter-spacing: .04em; margin: 10px 0 8px; text-transform: uppercase; }
                .esr-date-row { display: flex; justify-content: flex-end; margin: 0 0 10px; gap: 8px; align-items: flex-end; font-size: 14px; }
                .esr-date-row .esr-rule { min-width: 170px; }
                .esr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin: 0 0 4px; }
                .esr-field { margin-bottom: 10px; }
                .esr-field strong { display: block; margin-bottom: 3px; font-size: 13px; }
                .esr-rule { display: block; border-bottom: 1px solid #000; min-height: 1.3em; padding: 0 2px 1px; font-size: 14px; }
                .esr-rule.multi { min-height: 2.8em; border-bottom: none; background-image: repeating-linear-gradient(transparent, transparent calc(1.2em - 1px), #000 calc(1.2em - 1px), #000 1.2em); background-size: 100% 1.2em; white-space: pre-wrap; padding-bottom: 2px; }
                .esr-hint { font-size: 12px; font-style: italic; color: #333; margin: 3px 0 0; }
                .esr-sig-block { margin-top: 14px; padding: 0; }
                .esr-sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 12px; }
                .esr-sig-row.single { grid-template-columns: 1fr; max-width: 58%; margin-left: auto; margin-right: auto; }
                .esr-sig { text-align: center; }
                .esr-sig-line { border-bottom: 1px solid #000; min-height: 22px; margin: 0 0.15in 3px; }
                .esr-sig-name { font-weight: 700; font-size: 13.5px; }
                .esr-sig-title { font-size: 12px; }
                .esr-section-label { font-weight: 700; font-size: 12.5px; margin: 12px 0 0; text-align: center; text-transform: uppercase; letter-spacing: .03em; }
            `}</style>

            <div className="esr-page">
                <table className="esr-head">
                    <tbody>
                        <tr>
                            <td className="esr-seal" rowSpan={4}>
                                <img src={CAMPUS_LETTERHEAD.sealSrc} alt="Filamer Christian University seal" />
                            </td>
                            <td className="esr-univ" colSpan={4}>
                                <strong>{CAMPUS_LETTERHEAD.universityName}</strong>
                                <br />
                                {CAMPUS_LETTERHEAD.address}
                            </td>
                        </tr>
                        <tr>
                            <td className="esr-label">Form Name:</td>
                            <td className="esr-sheet">
                                <strong>{EXTRA_SERVICE_FORM.formName}</strong>
                            </td>
                            <td className="esr-office" rowSpan={2} colSpan={2}>
                                <div>Effectivity:<br />{EXTRA_SERVICE_FORM.effectivity}</div>
                                <div className="esr-office-gap">Issuing Office:<br />{EXTRA_SERVICE_FORM.issuingOffice}</div>
                            </td>
                        </tr>
                        <tr>
                            <td className="esr-label">Form No:<br />{EXTRA_SERVICE_FORM.formNo}</td>
                            <td className="esr-sheet">
                                <strong>EDUCATIONAL ORGANIZATION<br />MANAGEMENT SYSTEM</strong>
                            </td>
                        </tr>
                        <tr>
                            <td className="esr-label">Revision No. {EXTRA_SERVICE_FORM.revisionNo}</td>
                            <td className="esr-sheet"><strong>{CAMPUS_LETTERHEAD.isoStandard}</strong></td>
                            <td className="esr-page-cell">Page No.</td>
                            <td className="esr-page-cell">1 of 1</td>
                        </tr>
                    </tbody>
                </table>

                <div className="esr-date-row">
                    <strong>Date:</strong>
                    <Rule value={data.date} className="" />
                </div>

                <div className="esr-grid">
                    <div>
                        <div className="esr-field">
                            <strong>Requesting Unit/Department:</strong>
                            <Rule value={data.department} />
                        </div>
                        <div className="esr-field">
                            <strong>Requesting Supervisor/Head:</strong>
                            <Rule value={supervisorDisplay} />
                        </div>
                        <div className="esr-field">
                            <strong>Purpose of Request:</strong>
                            <Rule value={purpose} className="multi" />
                        </div>
                    </div>
                    <div>
                        <div className="esr-field">
                            <strong>(Name/s of WSA/s):</strong>
                            <Rule value="" className="multi" />
                            <p className="esr-hint">To be assigned by WSPO{slotNote ? ` — ${slotNote}` : ''}.</p>
                        </div>
                        <div className="esr-field">
                            <strong>Period of Duty (Date and Number of Hours/Day):</strong>
                            <Rule value={period} className="multi" />
                        </div>
                    </div>
                </div>

                <div className="esr-sig-block">
                    <div className="esr-sig-row">
                        <div className="esr-sig">
                            <div className="esr-sig-line" />
                            <div className="esr-sig-name">{supervisorDisplay || '\u00a0'}</div>
                            <div className="esr-sig-title">Requested by: Supervisor (Department)</div>
                            <div className="esr-sig-title">(Signature over Printed Name)</div>
                        </div>
                        <div className="esr-sig">
                            <div className="esr-sig-line" />
                            <div className="esr-sig-name">{coordinatorDisplay || '\u00a0'}</div>
                            <div className="esr-sig-title">{EXTRA_SERVICE_SIGNATORIES.noted[0].title}</div>
                            <div className="esr-sig-title">Noted / Favorably Endorsed by</div>
                        </div>
                    </div>

                    <div className="esr-section-label">Noted — Committee Chair</div>
                    <div className="esr-sig-row single">
                        <div className="esr-sig">
                            <div className="esr-sig-line" />
                            <div className="esr-sig-name">{EXTRA_SERVICE_SIGNATORIES.noted[1].name}</div>
                            <div className="esr-sig-title">{EXTRA_SERVICE_SIGNATORIES.noted[1].title}</div>
                        </div>
                    </div>

                    <div className="esr-section-label">Recommending Approval</div>
                    <div className="esr-sig-row">
                        {EXTRA_SERVICE_SIGNATORIES.recommended.map((person) => (
                            <div className="esr-sig" key={person.name}>
                                <div className="esr-sig-line" />
                                <div className="esr-sig-name">{person.name}</div>
                                <div className="esr-sig-title">{person.title}</div>
                            </div>
                        ))}
                    </div>

                    <div className="esr-section-label">Approved</div>
                    <div className="esr-sig-row single">
                        <div className="esr-sig">
                            <div className="esr-sig-line" />
                            <div className="esr-sig-name">{EXTRA_SERVICE_SIGNATORIES.approved.name}</div>
                            <div className="esr-sig-title">{EXTRA_SERVICE_SIGNATORIES.approved.title}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WsaExtraServiceLetter;
