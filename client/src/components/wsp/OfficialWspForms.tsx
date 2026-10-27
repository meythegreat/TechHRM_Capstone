import { CAMPUS_LETTERHEAD, OFFICIAL_FORM_META } from '../../constants/campusDocuments';
import { displayDate, safeImage, sheetName, type OfficialFormDetails, type OfficialIdentity } from './officialForm';

type OfficialWspFormsProps = {
    identity: OfficialIdentity;
    details: OfficialFormDetails;
};

const text = (value?: string | number | null) => String(value ?? '').trim();

const Tick = ({ on }: { on: boolean }) => (
    <span className="tick">
        {on ? <span style={{ transform: 'translateY(-1px)', display: 'block' }}>✓</span> : ''}
    </span>
);

const Rule = ({ value, className = '' }: { value?: string | number | null; className?: string }) => (
    <span className={`rule ${className}`}>{text(value) || '\u00a0'}</span>
);

const Jobs = ({ selected, other }: { selected?: string; other?: string }) => {
    const mark = (label: string) => (
        <span className="job"><Tick on={selected === label} />{label === 'Others' ? 'Others:' : label}</span>
    );
    return (
        <div className="jobs">
            <p className="line"><span>Occupation:</span></p>
            <div className="job-grid">
                <span>{mark('Farmer')}</span>
                <span>{mark('Fisherman')}</span>
                <span>{mark('Retired')}</span>
                <span>{mark('Private Employee')}</span>
                <span>{mark('Unemployed')}</span>
                <span style={{ display: 'flex' }}>
                    {mark('Others')}
                    <Rule value={selected === 'Others' ? other : ''} className="rule-other" />
                </span>
            </div>
        </div>
    );
};

type FormHeadProps = {
    formNameLines: readonly string[];
    formNo: string;
    effectivity: string;
    revisionNo?: string;
};

const FormHead = ({
    formNameLines,
    formNo,
    effectivity,
    revisionNo = '1',
}: FormHeadProps) => (
    <table className="head">
        <tbody>
            <tr>
                <td className="seal" rowSpan={4}>
                    <img src={CAMPUS_LETTERHEAD.sealSrc} alt="Filamer Christian University seal" />
                </td>
                <td className="univ" colSpan={4}>
                    <strong>{CAMPUS_LETTERHEAD.universityName}</strong>
                    <br />
                    {CAMPUS_LETTERHEAD.address}
                </td>
            </tr>
            <tr>
                <td className="label">Form Name:</td>
                <td className="sheet">
                    <strong>
                        {formNameLines.map((line, index) => (
                            <span key={line}>
                                {index > 0 ? <br /> : null}
                                {line}
                            </span>
                        ))}
                    </strong>
                </td>
                <td className="office" rowSpan={2} colSpan={2}>
                    <div>Effectivity:<br />{effectivity}</div>
                    <div className="office-gap">Issuing Office:<br />{CAMPUS_LETTERHEAD.issuingOffice}</div>
                </td>
            </tr>
            <tr>
                <td className="label">Form No:<br />{formNo}</td>
                <td className="sheet">
                    <strong>EDUCATIONAL ORGANIZATION<br />MANAGEMENT SYSTEM</strong>
                </td>
            </tr>
            <tr>
                <td className="label">Revision No. {revisionNo}</td>
                <td className="sheet"><strong>{CAMPUS_LETTERHEAD.isoStandard}</strong></td>
                <td className="page-cell">Page No.</td>
                <td className="page-cell">1 of 1</td>
            </tr>
        </tbody>
    </table>
);

export function printOfficialForms() {
    const source = document.querySelector('.official-print-root');
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
    const pages = Array.from(source.querySelectorAll('.fcu-page')).map((page) => page.outerHTML).join('');
    const seal = `${window.location.origin}${CAMPUS_LETTERHEAD.sealSrc}`;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>WSP forms</title><style>
        @page { size: 8.5in 13in; margin: 0.45in; }
        html, body { margin: 0; padding: 0; background: #fff; color: #000; }
        ${style}
        .fcu-preview .fcu-page, .fcu-page { max-width: none; margin: 0; padding: 0; border: 0; box-shadow: none; break-after: page; page-break-after: always; }
        .fcu-page:last-child { break-after: auto; page-break-after: auto; }
    </style></head><body>${pages.replaceAll(`src="${CAMPUS_LETTERHEAD.sealSrc}"`, `src="${seal}"`)}</body></html>`);
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

const OfficialWspForms = ({ identity, details }: OfficialWspFormsProps) => {
    const employed = details.sibling_employed_at_fcu === 'Yes'
        ? (details.employed_siblings || []).map((row) => row.name.trim()).filter(Boolean)
        : [];
    const employedAnswer = details.sibling_employed_at_fcu === 'Yes'
        ? `Yes — ${employed.length} — ${employed.join(', ')}`
        : details.sibling_employed_at_fcu === 'No' ? 'No' : '';
    const siblings = details.has_non_working_siblings === 'No'
        ? [{ name: 'None', age: '', school_or_work: '' }]
        : (details.siblings || []).filter((row) => row.name.trim());
    const rows = Array.from({ length: 5 }, (_, index) => siblings[index] || { name: '', age: '', school_or_work: '' });
    const conditions = details.medical_conditions || [];
    const child = text(details.consent_child_name) || sheetName(identity);

    return (
        <div className="official-print-root fcu-preview">
            <style>{`
                .fcu-preview, .fcu-page { color: #000; font-family: "Times New Roman", Times, serif; font-size: 14px; line-height: 1.3; }
                .fcu-preview .fcu-page { max-width: 760px; margin: 0 auto 28px; padding: 14px 16px 18px; background: #fff; border: 1px solid #e2e8f0; box-shadow: 0 8px 24px rgba(15,23,42,.08); box-sizing: border-box; }
                .head { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
                .head td { border: 1px solid #000; padding: 3px 6px; vertical-align: middle; }
                .seal { width: 78px; text-align: center; }
                .seal img { width: 68px; height: 68px; object-fit: contain; }
                .univ { text-align: center; font-size: 15px; line-height: 1.25; padding-top: 6px; padding-bottom: 6px; }
                .univ strong { font-size: 16px; font-weight: 900; letter-spacing: .02em; }
                .sheet { text-align: center; font-size: 14px; line-height: 1.2; }
                .label { font-size: 14px; width: 22%; }
                .office { font-size: 13px; line-height: 1.25; vertical-align: middle; width: 28%; }
                .office-gap { margin-top: 8px; }
                .page-cell { text-align: center; white-space: nowrap; width: 1px; font-size: 14px; }
                .banner { text-align: center; font-style: italic; font-size: 15px; font-weight: normal; margin: 12px 0; }
                .intro { display: grid; grid-template-columns: minmax(0, 1fr) 2in; gap: 16px; align-items: start; margin-bottom: 12px; }
                .intro p { margin: 0 0 6px; text-align: justify; }
                .photo { width: 2in; height: 2in; border: 1px solid #000; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 14px; overflow: hidden; }
                .photo img { width: 2in; height: 2in; object-fit: cover; }
                .line { display: flex; align-items: flex-end; gap: 6px; margin: 4px 0; }
                .line .grow { flex: 1; }
                .rule { border-bottom: 1px solid #000; min-height: 20px; padding: 0 4px; overflow-wrap: anywhere; }
                .rule-name { flex: 1; }
                .rule-short { width: 72px; flex: none; }
                .rule-mid { width: 120px; flex: none; }
                .rule-other { flex: 1; min-width: 140px; margin-left: 2px; }
                .hint { display: flex; gap: 8px; font-size: 12px; font-style: italic; margin: -2px 0 6px 52px; text-align: center; }
                .hint-last { flex: 1.2; text-align: left; padding-left: 10px; }
                .hint-first { flex: 1.5; text-align: center; }
                .hint-mid { flex: 1; text-align: right; padding-right: 20px; }
                .tick { display: inline-flex; width: 16px; height: 16px; border: 1px solid #000; align-items: center; justify-content: center; font-size: 14px; line-height: 1; margin-right: 5px; flex: none; }
                .job { display: inline-flex; align-items: center; }
                .jobs { margin: 2px 0 6px 0; }
                .job-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; padding-left: 12px; margin-top: 2px; }
                .sib { width: 100%; border-collapse: collapse; margin: 4px 0 12px; }
                .sib td, .sib th { border-bottom: 1px solid #000; height: 20px; padding: 0 4px; }
                .sib th { font-weight: normal; text-align: center; font-size: 14px; border-bottom: 1px solid #000; }
                .q { margin: 12px 0 4px; }
                .q-no { font-weight: 700; }
                .yn { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 4px 0 2px; }
                .yn p { margin: 2px 0; }
                .stack { display: flex; align-items: center; margin: 2px 0; }
                .med { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 4px 0 4px 16px; padding: 8px 12px; border: 1px solid #000; }
                .med p { margin: 3px 0; display: flex; align-items: center; gap: 4px; }
                .req { margin: 6px 0 8px 22px; padding: 0; }
                .req li { margin: 2px 0; padding-left: 4px; }
                .addr { margin-left: 18px; display: block; }
                .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 18px; text-align: center; }
                .sign-line { border-top: 1px solid #000; margin: 28px 10px 0; }
                .sign-cap { font-size: 14px; margin-top: 4px; }
                .sign-note { font-size: 12px; font-style: italic; }
                .cert { margin: 16px 0; text-align: justify; }
                .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; text-align: center; margin-top: 16px; padding: 0 40px; }
                .important { font-weight: 700; margin-top: 16px; font-size: 14px; }
                .cut { border-top: 1px dashed #000; margin-top: 20px; padding-bottom: 10px; }
                .consent-title { text-align: center; font-weight: 900; font-size: 16px; margin: 16px 0 4px; letter-spacing: .02em; }
                .consent-sub { text-align: center; margin: 0 0 24px; font-size: 14px; }
                .date-right { text-align: right; margin: 8px 0 24px; }
                .date-right .rule { display: inline-block; width: 180px; }
                .letter p { margin: 12px 0; text-align: justify; line-height: 1.4; }
                .consent-signs { display: grid; grid-template-columns: 1fr 1.5fr; gap: 48px; margin-top: 36px; align-items: end; }
                .signed { text-align: center; }
                .signed-row { display: flex; align-items: flex-end; gap: 8px; }
                .signed-label { flex: none; line-height: 1; padding-bottom: 1px; }
                .signed-line { flex: 1; border-bottom: 1px solid #000; }
                .signed-under { margin-left: 72px; }
                .date-line { width: 70%; margin: 0 auto; border-bottom: 1px solid #000; }
                .foot { margin-top: 40px; font-size: 14px; font-weight: bold; }
                
                /* Custom spacing for text inputs to mimic physical blanks */
                .blank-input { display: inline-flex; align-items: flex-end; }
            `}</style>

            {/* PAGE 1 */}
            <article className="fcu-page">
                <FormHead
                    formNameLines={OFFICIAL_FORM_META.personalInformation.formNameLines}
                    formNo={OFFICIAL_FORM_META.personalInformation.formNo}
                    effectivity={OFFICIAL_FORM_META.personalInformation.effectivity}
                    revisionNo={OFFICIAL_FORM_META.personalInformation.revisionNo}
                />
                <p className="banner">INFORMATION SHEET</p>
                
                <div className="intro">
                    <div>
                        <p>INSTRUCTIONS: Please read and understand all questions carefully before providing your responses. After doing so, accomplish this form accurately and neatly in your own handwriting. Kindly use ink and ensure that all entries are legible. For items with corresponding options, please indicate your answer by placing a check mark (✓) in the appropriate box.</p>
                        <p style={{ fontWeight: 900, textDecoration: 'underline', marginTop: '12px' }}>Answer all questions. <span style={{ fontWeight: 'normal', textDecoration: 'none' }}>A dash or a line is not an answer.</span></p>
                    </div>
                    <div>
                        <div className="photo">
                            {safeImage(details.photo) ? <img src={safeImage(details.photo)} alt="2 x 2 picture" /> : <span>2 x 2 Picture</span>}
                        </div>
                    </div>
                </div>

                <div className="line">
                    <span>1. Name</span>
                    <Rule value={sheetName(identity)} className="rule-name" />
                    <span>Religion</span>
                    <Rule value={details.religion} className="rule-mid" />
                </div>
                <div className="hint">
                    <span className="hint-last">(Last name</span>
                    <span className="hint-first">First name</span>
                    <span className="hint-mid">Middle Name.)</span>
                </div>
                
                <div className="line" style={{ paddingLeft: '16px' }}>
                    <span>Age</span><Rule value={identity.age} className="rule-short" />
                    <span>Sex</span><Rule value={details.sex} className="rule-short" />
                    <span>Civil Status</span><Rule value={details.civil_status} className="grow" />
                    <span>Cel. no.</span><Rule value={details.cell_number} className="rule-mid" />
                </div>
                <div className="line" style={{ paddingLeft: '16px' }}>
                    <span>Home Address</span><Rule value={details.home_address} className="grow" />
                </div>
                <div className="line" style={{ paddingLeft: '16px' }}>
                    <span>Tel no.</span><Rule value={details.tel_number} className="rule-mid" />
                    <span>Date of Birth</span><Rule value={displayDate(details.date_of_birth)} className="grow" />
                    <span>Place of Birth</span><Rule value={details.place_of_birth} className="grow" />
                </div>
                <div className="line" style={{ paddingLeft: '16px' }}>
                    <span>Height</span><Rule value={details.height} className="rule-short" />
                    <span>Weight</span><Rule value={details.weight} className="rule-short" />
                </div>

                <div className="line" style={{ marginTop: '16px' }}>
                    <span>2. Name of Father/ Mother</span>
                    <Rule value={details.parent_name} className="grow" />
                    <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className="job"><Tick on={details.parent_status === 'Living'} />Living</span>
                        <span className="job"><Tick on={details.parent_status === 'Deceased'} />Deceased</span>
                    </span>
                </div>
                <div className="line" style={{ paddingLeft: '16px' }}>
                    <span>Tel No.</span><Rule value={details.parent_tel} className="rule-mid" />
                </div>
                <Jobs selected={details.parent_occupation} other={details.parent_occupation_other} />
                <div className="line">
                    <span>Approximate Monthly Income</span><Rule value={details.parent_income} className="rule-mid" />
                </div>

                <div className="line" style={{ marginTop: '12px' }}>
                    <span>Name of Guardian (if parents are deceased)</span>
                    <Rule value={details.guardian_name} className="grow" />
                </div>
                <div className="line" style={{ paddingLeft: '16px' }}>
                    <span>Tel No.</span><Rule value={details.guardian_tel} className="rule-mid" />
                </div>
                <Jobs selected={details.parent_status === 'Deceased' ? details.guardian_occupation : ''} other={details.guardian_occupation_other} />
                <div className="line">
                    <span>Approximate Monthly Income</span><Rule value={details.parent_status === 'Deceased' ? details.guardian_income : ''} className="rule-mid" />
                </div>

                <p className="q">3. Do you have any brother or sister employed as a work student at FCU?</p>
                <div className="line" style={{ paddingLeft: '16px' }}><Rule value={employedAnswer} className="grow" /></div>

                <p className="q">4. Name of all brother(s) / sister(s)</p>
                <table className="sib">
                    <thead>
                        <tr>
                            <th style={{ width: '46%', textAlign: 'left' }}>Name of all brother(s) / sister(s)</th>
                            <th style={{ width: '12%' }}>Age</th>
                            <th style={{ textAlign: 'left' }}>School where they are studying/Place of Work</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr key={index}><td>{row.name}</td><td style={{ textAlign: 'center' }}>{row.age}</td><td>{row.school_or_work}</td></tr>
                        ))}
                    </tbody>
                </table>

                <p className="q" style={{ lineHeight: '2' }}>
                    5. State your special or technical qualification for work (typing, computer, lettering, etc.) 
                    <Rule value={details.technical_qualification} className="grow" style={{ display: 'inline-block', width: '50%', marginBottom: '-4px' }} />. 
                    State any work experience outside of the university 
                    <Rule value={details.work_experience} className="grow" style={{ display: 'inline-block', width: '70%', marginBottom: '-4px' }} />.
                </p>

                <p className="q" style={{ marginTop: '16px' }}>6. School last attended</p>
                <div className="line" style={{ paddingLeft: '16px' }}><Rule value={details.school_last_attended} className="grow" /></div>
                <div className="line" style={{ paddingLeft: '16px' }}>
                    <span>Address of the school last attended</span><Rule value={details.school_address} className="grow" />
                </div>
                <div className="line" style={{ paddingLeft: '16px' }}>
                    <span>Degree and program you plan to pursue at FCU</span>
                    <Rule value={[details.degree_program, details.year_level].filter(Boolean).join(', ')} className="grow" />
                </div>

                <p className="q"><span className="q-no">7.</span> Do you have any active scholarship</p>
                <div className="yn">
                    <div>
                        <p className="stack"><Tick on={details.has_scholarship === 'Yes'} />Yes</p>
                        <p className="stack"><Tick on={details.has_scholarship === 'No'} />No</p>
                        <div className="line">
                            <span>If Yes please specify:</span>
                            <Rule value={details.has_scholarship === 'Yes' ? details.scholarship_details : ''} className="grow" />
                        </div>
                    </div>
                    <div>
                        <p className="q" style={{ marginTop: 0 }}><span className="q-no">8.</span> Are you a member of 4Ps</p>
                        <p className="stack"><Tick on={details.is_4ps === 'Yes'} />Yes</p>
                        <p className="stack"><Tick on={details.is_4ps === 'No'} />No</p>
                    </div>
                </div>

                <p className="q"><span className="q-no">9.</span> Do you have any medical conditions</p>
                <div className="med">
                    <div>
                        <p><Tick on={conditions.includes('None')} />None</p>
                        <p><Tick on={conditions.includes('Allergies')} />Allergies</p>
                        <p><Tick on={conditions.includes('Hypertension')} />Hypertension</p>
                        <p><Tick on={conditions.includes('Asthma')} />Asthma</p>
                        <p><Tick on={conditions.includes('Mental Health Condition')} />Mental Health Condition</p>
                    </div>
                    <div>
                        <p><Tick on={conditions.includes('Visual Impairment')} />Visual Impairment</p>
                        <p style={{ display: 'flex' }}>
                            <Tick on={conditions.includes('Others')} />
                            <span>Others (please specify):</span> 
                            <Rule value={conditions.includes('Others') ? details.medical_other : ''} className="grow" style={{ marginLeft: '4px' }} />
                        </p>
                    </div>
                </div>

                <p className="q"><span className="q-no">10.</span> Submit the following <strong>requirements</strong> together with this application:</p>
                <ol className="req" type="a">
                    <li>
                        Application letter address
                        <span className="addr">
                            address to <strong>MR. N-GEY C. FRANCO</strong><br />
                            WSP Coordinator<br />
                            {CAMPUS_LETTERHEAD.universityNamePlain}
                        </span>
                    </li>
                    <li>Certificate of Good Moral Character from the Principal or Guidance Counselor.{details.will_pass_good_moral === 'Yes' ? ' Will pass.' : details.will_pass_good_moral === 'No' ? ' Will not pass.' : ''}</li>
                    <li>Copy of report card or copy of grades</li>
                    <li>Copy of Birth Certificate</li>
                    <li>Medical Certificate{details.medical_certificate_attached ? ' — attached' : ''}</li>
                    <li>2 X 2 I.D. Picture</li>
                    <li>Copy of Certificate of Indigency</li>
                    <li>Long white folder with fastener</li>
                </ol>

                <p className="q"><span className="q-no">11.</span> Signature of Parents/Guardian</p>
                <div className="signs">
                    <div>
                        <div className="sign-line" />
                        <div className="sign-cap">Father’s Name &amp; Signature</div>
                    </div>
                    <div>
                        <div className="sign-line" />
                        <div className="sign-cap">Mother’s Name &amp; Signature</div>
                    </div>
                    <div>
                        <div className="sign-line" />
                        <div className="sign-cap">
                            Guardian’s Name &amp; Signature
                            <div className="sign-note">(if parents are deceased)</div>
                        </div>
                    </div>
                </div>
                
                <p className="cert">
                    I hereby certify that all the foregoing information is true and correct and shall hold myself liable for any falsehood or misrepresentation in so far as my application for Work Study Program at {CAMPUS_LETTERHEAD.universityNamePlain} is concerned.
                </p>
                
                <div className="pair">
                    <div>
                        <div className="sign-line" />
                        <div className="sign-cap">Date</div>
                    </div>
                    <div>
                        <div className="sign-line" />
                        <div className="sign-cap">Signature of applicant</div>
                    </div>
                </div>
                
                <p className="important">IMPORTANT: NON-COMPLETION of the requirements for this application may serve as sufficient grounds for rejecting your application.</p>
                
                <div className="cut" />
            </article>

            {/* PAGE 3 */}
            <article className="fcu-page">
                <FormHead
                    formNameLines={OFFICIAL_FORM_META.parentsConsent.formNameLines}
                    formNo={OFFICIAL_FORM_META.parentsConsent.formNo}
                    effectivity={OFFICIAL_FORM_META.parentsConsent.effectivity}
                    revisionNo={OFFICIAL_FORM_META.parentsConsent.revisionNo}
                />
                
                <p className="consent-title">PARENTS CONSENT</p>
                <p className="consent-sub">FORM FOR PARENTS (GUARDIAN’S) PERMISSION AND AGREEMENT</p>
                
                <p className="date-right">Date <Rule value="" /></p>
                
                <div className="letter">
                    <p><strong>TO WHOM IT MAY CONCERN:</strong></p>
                    <p>
                        I hereby give my permission for my son/daughter, <Rule value={child} style={{ display: 'inline-block', width: '300px' }} />, 
                        to join and be a member of the Work Study Program Organization of the {CAMPUS_LETTERHEAD.universityNamePlain}.
                    </p>
                    <p>
                        I also allow him/her to render duty hours during his/her vacant time, in accordance with the guidelines and schedule set by the Program.
                    </p>
                    <p>Thank you.</p>
                </div>
                
                <div className="consent-signs">
                    <div className="signed">
                        <div className="date-line" />
                        <div className="sign-cap">(Date)</div>
                    </div>
                    <div className="signed">
                        <div className="signed-row">
                            <span className="signed-label">SIGNED:</span>
                            <span className="signed-line" />
                        </div>
                        <div className="sign-cap signed-under">Name &amp; Signature of Parent or Guardian</div>
                    </div>
                </div>
                
                <p className="foot">* To be signed by parents / guardians of minors and those aged 21 years-up if they are still under their parents’ or guardians’ care and support.</p>
            </article>
        </div>
    );
};

export default OfficialWspForms;