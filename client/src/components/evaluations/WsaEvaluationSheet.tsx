import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CAMPUS_LETTERHEAD, OFFICIAL_FORM_META } from '../../constants/campusDocuments';
import type { EvaluationStandard } from '../../services/evaluationService';

export type EvaluationSheetData = {
    department: string;
    semesterSchoolYear: string;
    evaluatedOnLabel: string;
    studentName: string;
    standards: EvaluationStandard[];
    ratings: Record<string, string>;
    ratingLabels: string[];
    comments: string;
    recommendation: string;
    recommendations: string[];
    evaluatedBy: string;
    attestedBy: string;
    intro: string;
    legend: string;
};

const FORM = OFFICIAL_FORM_META.evaluation;

export function printEvaluationSheet(root?: Element | null) {
    const source = root ?? document.querySelector('.wef-offscreen.wsa-eval-print-root');
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
    const page = source.querySelector('.wef-page')?.outerHTML ?? source.innerHTML;
    const seal = `${window.location.origin}${CAMPUS_LETTERHEAD.sealSrc}`;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${FORM.formName}</title><style>
        @page { size: 8.5in 13in; margin: 0.4in; }
        html, body { margin: 0; padding: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        ${style}
        .wef-offscreen { position: static !important; left: auto !important; width: auto !important; overflow: visible !important; }
        .wef-page { width: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
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

const PAGE_WIDTH = 8.5 * 96;
const PAGE_HEIGHT = 13 * 96;

/** Fits the 8.5 × 13 sheet inside the column and keeps the printed proportions. */
export function EvaluationPreviewFrame({ children }: { children: ReactNode }) {
    const frameRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return undefined;
        const fit = () => {
            const available = Math.max(frame.clientWidth - 24, 280);
            setScale(Math.min(1, available / PAGE_WIDTH));
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={frameRef} className="max-h-[82vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-3">
            <div style={{ width: PAGE_WIDTH * scale, height: PAGE_HEIGHT * scale, margin: '0 auto' }}>
                <div style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

const Box = ({ on }: { on: boolean }) => <span className={`wef-box${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>;

const WsaEvaluationSheet = ({ data, preview = false }: { data: EvaluationSheetData; preview?: boolean }) => (
    <div className={`wsa-eval-print-root wef-preview ${preview ? '' : 'wef-offscreen'}`} aria-hidden={!preview}>
        <style>{`
            .wef-offscreen { position: absolute; left: -10000px; top: 0; width: 8.5in; overflow: hidden; pointer-events: none; }
            .wef-preview, .wef-page { color: #000; font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.3; box-sizing: border-box; }
            .wef-page { width: 8.5in; min-height: 13in; margin: 0 auto; padding: 0.4in; background: #fff; border: 1px solid #cbd5e1; box-shadow: 0 12px 32px rgba(15,23,42,.12); }
            .wef-head, .wef-table { width: 100%; border-collapse: collapse; }
            .wef-table { table-layout: fixed; }
            .wef-head td, .wef-table th, .wef-table td { border: 1px solid #000; vertical-align: middle; }
            .wef-head td { padding: 2px 5px; }
            .wef-seal { width: 68px; text-align: center; }
            .wef-seal img { width: 58px; height: 58px; object-fit: contain; }
            .wef-univ { text-align: center; font-size: 15px; }
            .wef-univ strong { font-size: 17px; letter-spacing: .02em; }
            .wef-label { width: 22%; font-size: 13px; }
            .wef-center { text-align: center; }
            .wef-meta { width: auto; border-collapse: collapse; margin-top: 8px; }
            .wef-meta td { padding: 2px 0; font-size: 14px; vertical-align: bottom; }
            .wef-meta td:first-child { white-space: nowrap; padding-right: 8px; }
            .wef-rule { display: inline-block; min-width: 180px; border-bottom: 1px solid #000; padding: 0 4px; font-weight: 700; }
            .wef-intro { margin: 8px 0 4px; text-align: justify; font-size: 14px; }
            .wef-legend { margin: 0 0 8px; font-size: 13px; }
            .wef-student { margin: 12px 0 14px; }
            .wef-student .wef-rule { margin-left: 18px; min-width: 240px; }
            .wef-table th, .wef-table td { padding: 3px 4px; font-size: 13px; }
            .wef-table th { text-align: center; font-weight: 700; }
            .wef-table th:first-child, .wef-table td.std { width: 45%; text-align: left; }
            .wef-table th:not(:first-child), .wef-table td.mark { width: 11%; text-align: center; }
            .wef-table td.mark { height: 1px; }
            .wef-mark { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
            .wef-box { display: inline-flex; width: 14px; height: 14px; border: 1px solid #000; align-items: center; justify-content: center; font-size: 11px; line-height: 1; font-weight: 700; flex: 0 0 14px; }
            .wef-comments { margin-top: 12px; }
            .wef-rec { margin-top: 28px; display: flex; align-items: center; flex-wrap: wrap; }
            .wef-rec strong { margin-right: 14px; }
            .wef-sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 40px; }
            .wef-comments .lines {
                position: relative;
                margin-top: 2px;
            }
            .wef-comments .lines span {
                position: relative;
                z-index: 1;
                display: block;
                margin: 0;
                padding: 0;
                border: 0;
                width: 100%;
                font-size: 14px;
                line-height: 22px;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                background: none;
            }
            .wef-comments .lines::after {
                content: "";
                position: absolute;
                left: 0;
                right: 0;
                top: 21px;
                bottom: 0;
                background-image: repeating-linear-gradient(
                    to bottom,
                    #000 0,
                    #000 1px,
                    transparent 1px,
                    transparent 22px
                );
                background-size: 100% 22px;
                background-repeat: repeat-y;
                pointer-events: none;
            }
            .wef-rec-item { display: inline-flex; align-items: center; gap: 3px; margin-right: 14px; }
            .wef-sig { text-align: center; }
            .wef-sig-name { font-weight: 700; text-transform: uppercase; min-height: 1.2em; letter-spacing: .03em; margin: 14px 18px 0; }
            .wef-sig-line { border-bottom: 1px solid #000; height: 0; margin: 2px 18px 4px; }
            .wef-sig small { display: block; font-size: 12.5px; font-style: italic; }
        `}</style>
        <div className="wef-page">
            <table className="wef-head">
                <tbody>
                    <tr>
                        <td className="wef-seal" rowSpan={4}>
                            <img src={CAMPUS_LETTERHEAD.sealSrc} alt="Filamer Christian University seal" />
                        </td>
                        <td className="wef-univ" colSpan={4}>
                            <strong>{CAMPUS_LETTERHEAD.universityName}</strong>
                            <br />
                            {CAMPUS_LETTERHEAD.addressNoZip}
                        </td>
                    </tr>
                    <tr>
                        <td className="wef-label">Form Name:</td>
                        <td className="wef-center">
                            <strong>{FORM.formName}</strong>
                        </td>
                        <td colSpan={2}>
                            Effectivity:
                            <br />
                            {FORM.effectivity}
                        </td>
                    </tr>
                    <tr>
                        <td className="wef-label">
                            Form No:
                            <br />
                            {FORM.formNo}
                        </td>
                        <td className="wef-center">
                            <strong>EDUCATIONAL ORGANIZATION<br />MANAGEMENT SYSTEM</strong>
                        </td>
                        <td colSpan={2}>
                            Issuing Office:
                            <br />
                            {FORM.issuingOffice}
                        </td>
                    </tr>
                    <tr>
                        <td className="wef-label">Revision No. {FORM.revisionNo}</td>
                        <td className="wef-center">
                            <strong>{CAMPUS_LETTERHEAD.isoStandard}</strong>
                        </td>
                        <td className="wef-center">Page No.</td>
                        <td className="wef-center">1 of 1</td>
                    </tr>
                </tbody>
            </table>

            <table className="wef-meta">
                <tbody>
                    <tr>
                        <td>OFFICE/ DEPARTMENT:</td>
                        <td><span className="wef-rule">{data.department || '\u00a0'}</span></td>
                    </tr>
                    <tr>
                        <td>SEMESTER/ SCHOOL YEAR:</td>
                        <td><span className="wef-rule">{data.semesterSchoolYear || '\u00a0'}</span></td>
                    </tr>
                    <tr>
                        <td>DATE OF EVALUATION:</td>
                        <td><span className="wef-rule">{data.evaluatedOnLabel || '\u00a0'}</span></td>
                    </tr>
                </tbody>
            </table>

            <p className="wef-intro">{data.intro}</p>
            <p className="wef-legend">{data.legend}</p>

            <p className="wef-student">
                <strong>STUDENT ASSISTANT’S NAME:</strong>
                <span className="wef-rule">{data.studentName || '\u00a0'}</span>
            </p>

            <table className="wef-table">
                <thead>
                    <tr>
                        <th>Performance Standards</th>
                        {data.ratingLabels.map((label) => (
                            <th key={label}>{label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.standards.map((standard) => (
                        <tr key={standard.id}>
                            <td className="std">{standard.text}</td>
                            {data.ratingLabels.map((label) => (
                                <td key={label} className="mark">
                                    <span className="wef-mark">
                                        <Box on={data.ratings[standard.id] === label} />
                                    </span>
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="wef-comments">
                <strong>SUPERVISOR’S COMMENTS:</strong>
                <div className="lines"><span>{data.comments.replace(/[ \t]+\n/g, '\n').replace(/\s+$/u, '') || '\u00a0'}</span></div>
            </div>

            <p className="wef-rec">
                <strong>RECOMMENDATION/S (PLS. CHECK):</strong>{' '}
                {data.recommendations.map((item) => (
                    <span key={item} className="wef-rec-item">
                        <Box on={data.recommendation === item} />
                        {item}
                    </span>
                ))}
            </p>

            <div className="wef-sigs">
                <div className="wef-sig">
                    <div>Evaluated by:</div>
                    <div className="wef-sig-name">{data.evaluatedBy || '\u00a0'}</div>
                    <div className="wef-sig-line" />
                    <small>Name and Signature of Immediate Supervisor</small>
                </div>
                <div className="wef-sig">
                    <div>Attested by:</div>
                    <div className="wef-sig-name">{data.attestedBy || '\u00a0'}</div>
                    <div className="wef-sig-line" />
                    <small>Name &amp; Signature of Office/Unit/Department Head</small>
                </div>
            </div>
        </div>
    </div>
);

export default WsaEvaluationSheet;
