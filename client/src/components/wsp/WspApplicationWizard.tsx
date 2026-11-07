import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, Loader2, Printer, Send, Upload } from 'lucide-react';
import ApplicationStatusTracker from '../ApplicationStatusTracker';
import OfficialWspForms, { printOfficialForms } from './OfficialWspForms';
import {
    CIVIL_STATUSES,
    MEDICAL_CONDITIONS,
    OCCUPATIONS,
    OPTIONAL_REQUIREMENTS,
    RELIGIONS,
    REQUIREMENTS,
    SEX_OPTIONS,
    YEAR_LEVELS,
    buildApplicationPayload,
    emptyDetails,
    emptySibling,
    groupedAmount,
    readPhotoDataUrl,
    sheetName,
    sheetReligion,
    type OfficialFormDetails,
    type OfficialIdentity,
    type RequirementKey,
} from './officialForm';

type FormPdf = {
    filename?: string;
    data?: string;
};

type Receipt = {
    tracking_code?: string;
    tracker?: Record<string, unknown>;
    form_pdf?: FormPdf;
};

type WspApplicationWizardProps = {
    onSubmit: (payload: FormData) => Promise<Receipt | void>;
    onFinished?: () => void;
    onDraftChange?: (dirty: boolean) => void;
    onPhaseChange?: (phase: 'form' | 'done') => void;
};

const STEPS = [
    'Personal information',
    'Parents or guardian',
    'Brothers, sisters, and school',
    'Scholarship and health',
    'Requirements',
    'Printed signatures',
    'Review',
];

const inputClass = 'mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-600/10';
const labelClass = 'block text-sm font-semibold text-slate-700';
const hintClass = 'mt-1.5 block text-xs font-medium text-slate-500';

const filled = (value: string) => value.trim() !== '';

const downloadFormPdf = (pdf?: FormPdf) => {
    if (!pdf?.data) return;
    const binary = atob(pdf.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = pdf.filename || 'completed-forms.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const applicationStarted = (
    identity: OfficialIdentity,
    details: OfficialFormDetails,
    files: Partial<Record<RequirementKey, File>>,
) => {
    if (Object.values(identity).some((value) => String(value).trim() !== '')) return true;
    if (Object.keys(files).length > 0) return true;
    const blank = emptyDetails();
    return (Object.keys(details) as (keyof OfficialFormDetails)[]).some(
        (key) => JSON.stringify(details[key]) !== JSON.stringify(blank[key]),
    );
};
const heightValue = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 3);
    if (numbers.length <= 1) return numbers;
    return `${numbers[0]}'${numbers.slice(1)}`;
};

const typedWrong = (value: string, kind: 'number' | 'letter', label: string) => {
    if (kind === 'number' && /\D/.test(value)) return `${label} accepts numbers only.`;
    if (kind === 'letter' && /\d/.test(value)) return `${label} accepts letters only.`;
    return '';
};

const familyError = (details: OfficialFormDetails) => {
    if (details.sibling_employed_at_fcu !== 'Yes' && details.sibling_employed_at_fcu !== 'No') {
        return 'Answer Yes or No if a brother or sister is a work student at FCU.';
    }
    if (details.sibling_employed_at_fcu === 'Yes') {
        const count = Number(details.employed_sibling_count);
        const names = details.employed_siblings.map((row) => row.name.trim()).filter(Boolean);
        const unique = new Set(names.map((name) => name.toLowerCase()));
        if (!Number.isInteger(count) || count < 1 || count > 12 || names.length !== count || unique.size !== names.length) {
            return 'State how many brothers or sisters are work students, then name each one.';
        }
    }
    if (details.has_non_working_siblings !== 'Yes' && details.has_non_working_siblings !== 'No') {
        return 'Question 4 still needs an answer. List siblings who are not work students, or answer that there are none.';
    }
    if (details.has_non_working_siblings === 'Yes') {
        const rows = details.siblings.filter((row) => filled(row.name) && filled(row.age) && filled(row.school_or_work));
        if (rows.length === 0) {
            return 'List each brother or sister who is not a work student at FCU, including age and school or workplace.';
        }
        const employed = new Set(
            (details.sibling_employed_at_fcu === 'Yes' ? details.employed_siblings : [])
                .map((row) => row.name.trim().toLowerCase())
                .filter(Boolean),
        );
        if (rows.some((row) => employed.has(row.name.trim().toLowerCase()))) {
            return 'Question 4 is only for brothers and sisters who are not work students at the university.';
        }
    }
    return '';
};

const validateStep = (
    step: number,
    identity: OfficialIdentity,
    details: OfficialFormDetails,
    files: Partial<Record<RequirementKey, File>>,
) => {
    if (step === 0) {
        if (!filled(identity.last_name) || !filled(identity.first_name)) return 'Enter the last name and first name.';
        if (!details.religion || !filled(identity.age) || !details.sex || !details.civil_status) return 'Complete religion, age, sex, and civil status.';
        if (details.religion === 'Others' && !filled(details.religion_other)) return 'Enter the religion.';
        if (Number(identity.age) < 16) return 'Age must be 16 or older.';
        if (!filled(details.home_address) || !filled(details.cell_number) || !filled(details.email)) return 'Enter the home address, cellphone number, and email.';
        if (details.cell_number.length > 11 || details.tel_number.length > 11) return 'Phone numbers are limited to 11 digits.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) return 'Enter a valid email address.';
        if (!details.date_of_birth || !filled(details.place_of_birth)) return 'Enter the date of birth and place of birth.';
        if (!/^\d'\d{1,2}$/.test(details.height)) return 'Enter height as feet and inches, for example 5\'2.';
        if (!/^\d{1,3}$/.test(details.weight)) return 'Enter weight in kilograms using numbers only.';
    }
    if (step === 1) {
        if (!filled(details.parent_name) || !details.parent_status || !filled(details.parent_tel) || !details.parent_occupation || !filled(details.parent_income)) {
            return 'Complete the father or mother section.';
        }
        if (details.parent_tel.length > 11 || details.guardian_tel.length > 11) return 'Phone numbers are limited to 11 digits.';
        if (details.parent_occupation === 'Others' && !filled(details.parent_occupation_other)) return 'Specify the parent occupation.';
        if (details.parent_status === 'Deceased') {
            if (!filled(details.guardian_name) || !filled(details.guardian_tel) || !details.guardian_occupation || !filled(details.guardian_income)) {
                return 'Complete the guardian section because the parents are deceased.';
            }
            if (details.guardian_occupation === 'Others' && !filled(details.guardian_occupation_other)) return 'Specify the guardian occupation.';
        }
    }
    if (step === 2) {
        const siblingMessage = familyError(details);
        if (siblingMessage) return siblingMessage;
        if (!filled(details.technical_qualification) || !filled(details.work_experience)) return 'State the technical qualification and any work experience. Write None if there is none.';
        if (!filled(details.school_last_attended) || !filled(details.school_address) || !filled(details.degree_program) || !details.year_level) {
            return 'Complete the last school, its address, the FCU program, and the year level.';
        }
    }
    if (step === 3) {
        if (!details.has_scholarship || !details.is_4ps) return 'Answer the scholarship and 4Ps questions.';
        if (details.has_scholarship === 'Yes' && !filled(details.scholarship_details)) return 'Specify the scholarship.';
        if (details.medical_conditions.length === 0) return 'Select a medical condition, or None.';
        if (details.medical_conditions.includes('Others') && !filled(details.medical_other)) return 'Specify the other medical condition.';
        if (!details.photo || !files.id_picture) return 'Attach a 2 x 2 I.D. picture.';
    }
    if (step === 4) {
        const missing = REQUIREMENTS.find((requirement) => !files[requirement.key]);
        if (missing) return `Attach the ${missing.label}.`;
        if (details.will_pass_good_moral !== 'Yes' && details.will_pass_good_moral !== 'No') {
            return 'Answer whether you will pass a Certificate of Good Moral Character. This depends on the school you came from.';
        }
        if (!details.folder_acknowledged) return 'Confirm that the long white folder with fastener will be submitted.';
    }
    if (step === 5) {
        if (!details.will_sign_printed_copy) return 'Confirm that the signature lines will be signed by hand on the printed copy.';
    }
    return '';
};

const FileDrop = ({
    label,
    hint,
    fileName,
    accept,
    optional,
    preview,
    onPick,
}: {
    label: string;
    hint: string;
    fileName?: string;
    accept: string;
    optional?: boolean;
    preview?: string;
    onPick: (file?: File) => void;
}) => (
    <label className={`group flex cursor-pointer items-center gap-4 rounded-3xl border-2 border-dashed p-4 transition ${fileName ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'}`}>
        {preview ? (
            <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-white" />
        ) : (
            <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${fileName ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'}`}>
                <Upload className="h-5 w-5" />
            </span>
        )}
        <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                {label}
                {optional ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Optional</span> : null}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">{hint}</span>
            <span className={`mt-2 block truncate text-sm font-bold ${fileName ? 'text-emerald-700' : 'text-indigo-700'}`}>
                {fileName || 'Choose a file'}
            </span>
        </span>
        <input className="sr-only" type="file" accept={accept} onChange={(event) => onPick(event.target.files?.[0])} />
    </label>
);

const Choice = ({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) => (
    <div className="flex flex-wrap gap-2">
        {options.map((option) => (
            <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${value === option ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'}`}
            >
                {option}
            </button>
        ))}
    </div>
);

const WspApplicationWizard = ({ onSubmit, onFinished, onDraftChange, onPhaseChange }: WspApplicationWizardProps) => {
    const [step, setStep] = useState(0);
    const [identity, setIdentity] = useState<OfficialIdentity>({ first_name: '', middle_name: '', last_name: '', age: '' });
    const [details, setDetails] = useState<OfficialFormDetails>(emptyDetails);
    const [files, setFiles] = useState<Partial<Record<RequirementKey, File>>>({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [receipt, setReceipt] = useState<Receipt | null>(null);

    const patch = (values: Partial<OfficialFormDetails>) => setDetails((current) => ({ ...current, ...values }));

    const keepNumber = (raw: string, label: string, max: number, apply: (value: string) => void, phone = false) => {
        const wrong = typedWrong(raw, 'number', label);
        if (wrong) {
            setError(wrong);
            return;
        }
        const numeric = raw.replace(/\D/g, '');
        if (phone && numeric.length > 11) {
            apply(numeric.slice(0, 16));
            setError('Phone numbers are limited to 11 digits.');
            return;
        }
        if (!phone && numeric.length > max) {
            apply(numeric.slice(0, max + 1));
            setError(`${label} is limited to ${max} digits.`);
            return;
        }
        setError('');
        apply(numeric);
    };

    const keepLetters = (raw: string, label: string, apply: (value: string) => void) => {
        const wrong = typedWrong(raw, 'letter', label);
        if (wrong) {
            setError(wrong);
            return;
        }
        setError('');
        apply(raw);
    };

    const keepHeight = (raw: string) => {
        if (/[^0-9']/.test(raw)) {
            setError('Height accepts numbers only.');
            return;
        }
        setError('');
        patch({ height: heightValue(raw) });
    };

    useEffect(() => {
        onDraftChange?.(applicationStarted(identity, details, files) && !receipt);
    }, [identity, details, files, receipt, onDraftChange]);

    useEffect(() => {
        if (!applicationStarted(identity, details, files) || receipt) return undefined;
        const warnBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, [identity, details, files, receipt]);

    useEffect(() => {
        onPhaseChange?.(receipt ? 'done' : 'form');
    }, [receipt, onPhaseChange]);

    const setEmployedAnswer = (answer: string) => {
        if (answer === 'No') {
            patch({ sibling_employed_at_fcu: 'No', employed_sibling_count: '', employed_siblings: [] });
            return;
        }
        patch({ sibling_employed_at_fcu: 'Yes' });
    };

    const setEmployedCount = (value: string) => {
        if (/\D/.test(value)) {
            setError('How many accepts numbers only.');
            return;
        }
        setError('');
        const count = Math.min(12, Math.max(0, Number(value.replace(/\D/g, '')) || 0));
        const next = Array.from({ length: count }, (_, index) => details.employed_siblings[index] || { name: '' });
        patch({ employed_sibling_count: count ? String(count) : '', employed_siblings: next });
    };

    const toggleCondition = (condition: string) => {
        if (condition === 'None') {
            patch({ medical_conditions: details.medical_conditions.includes('None') ? [] : ['None'], medical_other: '' });
            return;
        }
        const next = details.medical_conditions.filter((item) => item !== 'None');
        patch({
            medical_conditions: next.includes(condition) ? next.filter((item) => item !== condition) : [...next, condition],
            medical_other: condition === 'Others' && next.includes('Others') ? '' : details.medical_other,
        });
    };

    const onPhoto = async (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) {
            setError('The 2 x 2 picture must be a JPG or PNG under 4MB.');
            return;
        }
        try {
            const photo = await readPhotoDataUrl(file);
            patch({ photo });
            setFiles((current) => ({ ...current, id_picture: file }));
            setError('');
        } catch {
            setError('The 2 x 2 picture could not be read. Use a JPG or PNG.');
        }
    };

    const goNext = () => {
        const message = validateStep(step, identity, details, files);
        if (message) {
            setError(message);
            return;
        }
        if (/accepts numbers only|accepts letters only|limited to \d+ digits/.test(error)) {
            return;
        }
        setError('');
        setStep((current) => current + 1);
    };

    const submit = async () => {
        for (let index = 0; index < STEPS.length - 1; index += 1) {
            const message = validateStep(index, identity, details, files);
            if (message) {
                setStep(index);
                setError(message);
                return;
            }
        }
        setLoading(true);
        setError('');
        try {
            const response = await onSubmit(buildApplicationPayload(identity, details, files));
            setReceipt(response || {});
            downloadFormPdf(response?.form_pdf);
        } catch (err: unknown) {
            const errorData = (err as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
            const validationError = Object.values(errorData?.data?.errors || {}).flat()[0];
            const oversized = errorData?.status === 413;
            setError(oversized
                ? 'The attached files are too large. Use PDF, JPG, or PNG files under 4MB each.'
                : errorData?.data?.message || validationError || 'The application could not be submitted. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (receipt) {
        return (
            <div className="space-y-6">
                <div className="bg-white rounded-3xl border border-emerald-100 p-6 sm:p-8 text-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                    <h2 className="mt-4 text-2xl font-semibold text-slate-900">Application submitted</h2>
                    <p className="mt-2 text-sm text-slate-600 max-w-xl mx-auto">
                        Both forms were sent to the WSPO coordinator. Your copy downloaded as a PDF. Print it on long coupon paper (8.5 × 13 inches), then sign the blank signature lines by hand.
                    </p>
                    {receipt.tracking_code && (
                        <p className="mt-4 font-mono text-2xl font-semibold text-indigo-700">{receipt.tracking_code}</p>
                    )}
                    <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                        <button type="button" onClick={() => downloadFormPdf(receipt.form_pdf)} disabled={!receipt.form_pdf?.data} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-40">
                            <Download className="w-4 h-4" /> Download forms
                        </button>
                        <button type="button" onClick={printOfficialForms} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-indigo-700 font-bold border border-indigo-200">
                            <Printer className="w-4 h-4" /> Print both forms
                        </button>
                        {onFinished && (
                            <button type="button" onClick={onFinished} className="px-5 py-3 rounded-xl bg-slate-100 text-slate-800 font-bold">
                                Done
                            </button>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto bg-slate-200/70 rounded-3xl p-4">
                    <OfficialWspForms
                        identity={{ ...identity, email: details.email, tracking_code: receipt.tracking_code, submitted_at: new Date().toISOString() }}
                        details={details}
                    />
                </div>
                {receipt.tracker && <ApplicationStatusTracker application={receipt.tracker} />}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 px-5 py-6 text-white sm:px-8">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-100">Step {step + 1} of {STEPS.length}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{STEPS[step]}</h2>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
                </div>
            </div>
            <div className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
                {STEPS.map((name, index) => (
                    <span
                        key={name}
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${index === step ? 'bg-indigo-600 text-white' : index < step ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}
                    >
                        {index + 1}. {name}
                    </span>
                ))}
            </div>

            <div className="px-5 py-6 sm:px-8">
            {error && <p className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

            {step === 0 && (
                <div className="space-y-6">
                    <section className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-700">Name</h3>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className={labelClass}>Last name<input className={inputClass} placeholder="Cruz" value={identity.last_name} onChange={(event) => keepLetters(event.target.value, 'Last name', (last_name) => setIdentity({ ...identity, last_name }))} /></label>
                            <label className={labelClass}>First name<input className={inputClass} placeholder="Ana" value={identity.first_name} onChange={(event) => keepLetters(event.target.value, 'First name', (first_name) => setIdentity({ ...identity, first_name }))} /></label>
                            <label className={labelClass}>Middle name<input className={inputClass} placeholder="Marie" value={identity.middle_name} onChange={(event) => keepLetters(event.target.value, 'Middle name', (middle_name) => setIdentity({ ...identity, middle_name }))} /></label>
                            <label className={labelClass}>
                                Religion
                                <select className={inputClass} value={details.religion} onChange={(event) => patch({ religion: event.target.value, religion_other: event.target.value === 'Others' ? details.religion_other : '' })}>
                                    <option value="">Select a religion</option>
                                    {RELIGIONS.map((religion) => <option key={religion} value={religion}>{religion}</option>)}
                                </select>
                            </label>
                            {details.religion === 'Others' && (
                                <label className={`${labelClass} sm:col-span-2`}>
                                    Other religion
                                    <input className={inputClass} placeholder="Enter your religion" value={details.religion_other} onChange={(event) => keepLetters(event.target.value, 'Religion', (religion_other) => patch({ religion_other }))} />
                                </label>
                            )}
                        </div>
                    </section>
                    <section className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-700">Personal details</h3>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className={labelClass}>Age<input className={inputClass} inputMode="numeric" placeholder="19" value={identity.age} onChange={(event) => keepNumber(event.target.value, 'Age', 2, (age) => setIdentity({ ...identity, age }))} /></label>
                            <div><p className={labelClass}>Sex</p><div className="mt-1.5"><Choice value={details.sex} options={SEX_OPTIONS} onChange={(sex) => patch({ sex })} /></div></div>
                            <div className="sm:col-span-2"><p className={labelClass}>Civil status</p><div className="mt-1.5"><Choice value={details.civil_status} options={CIVIL_STATUSES} onChange={(civil_status) => patch({ civil_status })} /></div></div>
                            <label className={labelClass}>
                                Height
                                <input className={inputClass} inputMode="numeric" placeholder="5'2" value={details.height} onChange={(event) => keepHeight(event.target.value)} />
                                <span className={hintClass}>Feet and inches, written as n&apos;n. Numbers only.</span>
                            </label>
                            <label className={labelClass}>
                                Weight
                                <input className={inputClass} inputMode="numeric" placeholder="50" value={details.weight} onChange={(event) => keepNumber(event.target.value, 'Weight', 3, (weight) => patch({ weight }))} />
                                <span className={hintClass}>Kilograms. Numbers only.</span>
                            </label>
                            <label className={labelClass}>Date of birth<input className={inputClass} type="date" value={details.date_of_birth} onChange={(event) => patch({ date_of_birth: event.target.value })} /></label>
                            <label className={labelClass}>Place of birth<input className={inputClass} placeholder="Roxas City" value={details.place_of_birth} onChange={(event) => keepLetters(event.target.value, 'Place of birth', (place_of_birth) => patch({ place_of_birth }))} /></label>
                        </div>
                    </section>
                    <section className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                        <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-700">Contact</h3>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="sm:col-span-2"><span className={labelClass}>Home address</span><input className={inputClass} placeholder="Street, barangay, city" value={details.home_address} onChange={(event) => patch({ home_address: event.target.value })} /></label>
                            <label className={labelClass}>Cellphone number<input className={inputClass} inputMode="numeric" placeholder="09171234567" value={details.cell_number} onChange={(event) => keepNumber(event.target.value, 'Cellphone number', 11, (cell_number) => patch({ cell_number }), true)} /></label>
                            <label className={labelClass}>Telephone number<input className={inputClass} inputMode="numeric" placeholder="0366212317" value={details.tel_number} onChange={(event) => keepNumber(event.target.value, 'Telephone number', 11, (tel_number) => patch({ tel_number }), true)} /></label>
                            <label className="sm:col-span-2"><span className={labelClass}>Email</span><input className={inputClass} type="email" placeholder="name@school.edu" value={details.email} onChange={(event) => patch({ email: event.target.value })} /></label>
                        </div>
                    </section>
                </div>
            )}

            {step === 1 && (
                <div className="space-y-4">
                    <label className={labelClass}>Name of father / mother<input className={inputClass} value={details.parent_name} onChange={(event) => keepLetters(event.target.value, 'Parent name', (parent_name) => patch({ parent_name }))} /></label>
                    <div><p className={labelClass}>Living or deceased</p><Choice value={details.parent_status} options={['Living', 'Deceased']} onChange={(parent_status) => patch({ parent_status })} /></div>
                    <label className={labelClass}>Telephone number<input className={inputClass} inputMode="numeric" placeholder="09170001111" value={details.parent_tel} onChange={(event) => keepNumber(event.target.value, 'Telephone number', 11, (parent_tel) => patch({ parent_tel }), true)} /></label>
                    <div><p className={labelClass}>Occupation</p><Choice value={details.parent_occupation} options={OCCUPATIONS} onChange={(parent_occupation) => patch({ parent_occupation })} /></div>
                    {details.parent_occupation === 'Others' && <label className={labelClass}>Other occupation<input className={inputClass} value={details.parent_occupation_other} onChange={(event) => keepLetters(event.target.value, 'Occupation', (parent_occupation_other) => patch({ parent_occupation_other }))} /></label>}
                    <label className={labelClass}>
                        Approximate monthly income
                        <span className="relative mt-1.5 block">
                            <span className="pointer-events-none absolute top-0 left-4 flex h-full items-center text-sm font-bold text-slate-500">₱</span>
                            <input className={`${inputClass} pl-9`} style={{ marginTop: 0 }} inputMode="numeric" placeholder="15,000" value={groupedAmount(details.parent_income)} onChange={(event) => keepNumber(event.target.value.replace(/,/g, ''), 'Monthly income', 9, (parent_income) => patch({ parent_income }))} />
                        </span>
                    </label>
                    {details.parent_status === 'Deceased' && (
                        <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
                            <p className="text-sm font-semibold text-slate-800">Guardian, because the parents are deceased</p>
                            <label className={labelClass}>Guardian name<input className={inputClass} value={details.guardian_name} onChange={(event) => keepLetters(event.target.value, 'Guardian name', (guardian_name) => patch({ guardian_name }))} /></label>
                            <label className={labelClass}>Telephone number<input className={inputClass} inputMode="numeric" placeholder="09170001111" value={details.guardian_tel} onChange={(event) => keepNumber(event.target.value, 'Telephone number', 11, (guardian_tel) => patch({ guardian_tel }), true)} /></label>
                            <div><p className={labelClass}>Occupation</p><Choice value={details.guardian_occupation} options={OCCUPATIONS} onChange={(guardian_occupation) => patch({ guardian_occupation })} /></div>
                            {details.guardian_occupation === 'Others' && <label className={labelClass}>Other occupation<input className={inputClass} value={details.guardian_occupation_other} onChange={(event) => keepLetters(event.target.value, 'Occupation', (guardian_occupation_other) => patch({ guardian_occupation_other }))} /></label>}
                            <label className={labelClass}>
                                Approximate monthly income
                                <span className="relative mt-1.5 block">
                                    <span className="pointer-events-none absolute top-0 left-4 flex h-full items-center text-sm font-bold text-slate-500">₱</span>
                                    <input className={`${inputClass} pl-9`} style={{ marginTop: 0 }} inputMode="numeric" placeholder="15,000" value={groupedAmount(details.guardian_income)} onChange={(event) => keepNumber(event.target.value.replace(/,/g, ''), 'Monthly income', 9, (guardian_income) => patch({ guardian_income }))} />
                                </span>
                            </label>
                        </div>
                    )}
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                        <p className="text-sm font-semibold text-slate-900">3. Do you have any brother or sister employed as a work student at FCU?</p>
                        <p className="text-sm text-slate-500">Answer Yes or No. If Yes, state how many and name them. If No, continue to the next question.</p>
                        <Choice value={details.sibling_employed_at_fcu} options={['Yes', 'No']} onChange={setEmployedAnswer} />
                        {details.sibling_employed_at_fcu === 'Yes' && (
                            <div className="space-y-3 pt-2">
                                <label className={labelClass}>How many?<input className={inputClass} inputMode="numeric" placeholder="1" value={details.employed_sibling_count} onChange={(event) => setEmployedCount(event.target.value)} /></label>
                                {details.employed_siblings.map((row, index) => (
                                    <label key={`employed-${index}`} className={labelClass}>
                                        Name {index + 1}
                                        <input
                                            className={inputClass}
                                            value={row.name}
                                            onChange={(event) => keepLetters(event.target.value, 'Sibling name', (name) => {
                                                const employed_siblings = details.employed_siblings.map((item, itemIndex) => itemIndex === index ? { name } : item);
                                                patch({ employed_siblings });
                                            })}
                                        />
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                        <p className="text-sm font-semibold text-slate-900">4. Name of all brothers / sisters</p>
                        <p className="text-sm text-slate-500">List only brothers and sisters who are not work students at the university. This question still needs an answer.</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={() => patch({
                                    has_non_working_siblings: 'Yes',
                                    siblings: details.siblings.length === 0 ? [emptySibling()] : details.siblings,
                                })}
                                className={`px-4 py-2 rounded-xl text-sm font-bold border text-left ${details.has_non_working_siblings === 'Yes' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'}`}
                            >
                                Yes, list siblings who are not work students
                            </button>
                            <button
                                type="button"
                                onClick={() => patch({ has_non_working_siblings: 'No' })}
                                className={`px-4 py-2 rounded-xl text-sm font-bold border text-left ${details.has_non_working_siblings === 'No' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'}`}
                            >
                                No other siblings to list
                            </button>
                        </div>
                        {details.has_non_working_siblings === 'Yes' && details.siblings.map((row, index) => (
                            <div key={`sibling-${index}`} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <label className={labelClass}>Name<input className={inputClass} value={row.name} onChange={(event) => keepLetters(event.target.value, 'Sibling name', (name) => patch({ siblings: details.siblings.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item) }))} /></label>
                                <label className={labelClass}>Age<input className={inputClass} inputMode="numeric" placeholder="16" value={row.age} onChange={(event) => keepNumber(event.target.value, 'Age', 3, (age) => patch({ siblings: details.siblings.map((item, itemIndex) => itemIndex === index ? { ...item, age } : item) }))} /></label>
                                <label className={labelClass}>School or workplace<input className={inputClass} value={row.school_or_work} onChange={(event) => patch({ siblings: details.siblings.map((item, itemIndex) => itemIndex === index ? { ...item, school_or_work: event.target.value } : item) })} /></label>
                            </div>
                        ))}
                        {details.has_non_working_siblings === 'Yes' && details.siblings.length < 6 && (
                            <button type="button" onClick={() => patch({ siblings: [...details.siblings, emptySibling()] })} className="text-sm font-bold text-indigo-700">Add another sibling</button>
                        )}
                    </div>

                    <label className={labelClass}>Special or technical qualification<input className={inputClass} value={details.technical_qualification} onChange={(event) => patch({ technical_qualification: event.target.value })} /></label>
                    <label className={labelClass}>Work experience outside the university<input className={inputClass} value={details.work_experience} onChange={(event) => patch({ work_experience: event.target.value })} /></label>
                    <label className={labelClass}>School last attended<input className={inputClass} value={details.school_last_attended} onChange={(event) => patch({ school_last_attended: event.target.value })} /></label>
                    <label className={labelClass}>Address of the school last attended<input className={inputClass} value={details.school_address} onChange={(event) => patch({ school_address: event.target.value })} /></label>
                    <label className={labelClass}>Degree and program at FCU<input className={inputClass} value={details.degree_program} onChange={(event) => patch({ degree_program: event.target.value })} /></label>
                    <div><p className={labelClass}>Year level</p><Choice value={details.year_level} options={YEAR_LEVELS} onChange={(year_level) => patch({ year_level })} /></div>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-4">
                    <div><p className={labelClass}>Do you have any active scholarship?</p><Choice value={details.has_scholarship} options={['Yes', 'No']} onChange={(has_scholarship) => patch({ has_scholarship })} /></div>
                    {details.has_scholarship === 'Yes' && <label className={labelClass}>Specify the scholarship<input className={inputClass} value={details.scholarship_details} onChange={(event) => patch({ scholarship_details: event.target.value })} /></label>}
                    <div><p className={labelClass}>Are you a member of 4Ps?</p><Choice value={details.is_4ps} options={['Yes', 'No']} onChange={(is_4ps) => patch({ is_4ps })} /></div>
                    <div>
                        <p className={labelClass}>Medical conditions</p>
                        <div className="flex flex-wrap gap-2">
                            {MEDICAL_CONDITIONS.map((condition) => (
                                <button key={condition} type="button" onClick={() => toggleCondition(condition)} className={`px-3 py-2 rounded-xl text-sm font-bold border ${details.medical_conditions.includes(condition) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200'}`}>{condition}</button>
                            ))}
                        </div>
                    </div>
                    {details.medical_conditions.includes('Others') && <label className={labelClass}>Other condition<input className={inputClass} value={details.medical_other} onChange={(event) => keepLetters(event.target.value, 'Medical condition', (medical_other) => patch({ medical_other }))} /></label>}
                    <FileDrop
                        label="2 x 2 I.D. picture"
                        hint="JPG or PNG. This photo is placed on the information sheet."
                        fileName={files.id_picture?.name}
                        accept="image/jpeg,image/png"
                        preview={details.photo}
                        onPick={onPhoto}
                    />
                </div>
            )}

            {step === 4 && (
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">Submit these with the application. The letter is addressed to Mr. N-Gey C. Franco, WSP Coordinator, Filamer Christian University, Inc.</p>
                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                        <p className="text-sm font-semibold text-slate-900">Will you pass a Certificate of Good Moral Character?</p>
                        <p className="text-sm text-slate-500">This depends on the school you came from. Answer Yes if that school will issue one, or No if it will not.</p>
                        <Choice value={details.will_pass_good_moral} options={['Yes', 'No']} onChange={(will_pass_good_moral) => patch({ will_pass_good_moral })} />
                    </div>
                    {REQUIREMENTS.map((requirement) => (
                        <FileDrop
                            key={requirement.key}
                            label={requirement.label}
                            hint={requirement.hint}
                            fileName={files[requirement.key]?.name}
                            accept={requirement.key === 'id_picture' ? 'image/jpeg,image/png' : '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'}
                            preview={requirement.key === 'id_picture' ? details.photo : undefined}
                            onPick={(file) => {
                                if (!file) return;
                                if (file.size > 4 * 1024 * 1024) {
                                    setError('Each file must be under 4MB.');
                                    return;
                                }
                                setFiles((current) => ({ ...current, [requirement.key]: file }));
                                setError('');
                                if (requirement.key === 'id_picture') onPhoto(file);
                            }}
                        />
                    ))}
                    {OPTIONAL_REQUIREMENTS.map((requirement) => (
                        <FileDrop
                            key={requirement.key}
                            label={requirement.label}
                            hint={requirement.hint}
                            fileName={files[requirement.key]?.name}
                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                            optional
                            onPick={(file) => {
                                if (!file) return;
                                if (file.size > 4 * 1024 * 1024) {
                                    setError('Each file must be under 4MB.');
                                    return;
                                }
                                setFiles((current) => ({ ...current, [requirement.key]: file }));
                                setError('');
                            }}
                        />
                    ))}
                    <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
                        <input type="checkbox" className="mt-1" checked={details.folder_acknowledged} onChange={(event) => patch({ folder_acknowledged: event.target.checked })} />
                        I will submit a long white folder with fastener together with the printed forms.
                    </label>
                </div>
            )}

            {step === 5 && (
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 leading-relaxed">
                        The personal information sheet and the parents consent are sent to the coordinator for printing. Signature lines stay blank on that copy. After the printed forms are received, the applicant, the father and mother or the guardian, and the parent or guardian sign them by hand.
                    </p>
                    <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
                        <input type="checkbox" className="mt-1" checked={details.will_sign_printed_copy} onChange={(event) => patch({ will_sign_printed_copy: event.target.checked })} />
                        The signature lines will be filled in by hand on the printed copy.
                    </label>
                </div>
            )}

            {step === 6 && (
                <div className="space-y-3 text-sm text-slate-700">
                    <p><span className="font-bold">Applicant:</span> {sheetName(identity)}, {identity.age}, {details.sex}</p>
                    <p><span className="font-bold">Religion:</span> {sheetReligion(details) || 'Not selected'}</p>
                    <p><span className="font-bold">Program:</span> {details.degree_program} · {details.year_level}</p>
                    <p><span className="font-bold">Work-student siblings:</span> {details.sibling_employed_at_fcu === 'Yes' ? `${details.employed_sibling_count} — ${details.employed_siblings.map((row) => row.name).join(', ')}` : 'No'}</p>
                    <p><span className="font-bold">Other siblings:</span> {details.has_non_working_siblings === 'Yes' ? details.siblings.filter((row) => row.name.trim()).map((row) => row.name).join(', ') : 'None'}</p>
                    <p><span className="font-bold">Good moral certificate:</span> {details.will_pass_good_moral === 'Yes' ? 'Will pass one' : details.will_pass_good_moral === 'No' ? 'Will not pass one' : 'Not answered'}</p>
                    <p><span className="font-bold">Medical certificate:</span> {files.medical_certificate ? 'Attached' : 'Not attached'}</p>
                    <p><span className="font-bold">Required documents:</span> {REQUIREMENTS.filter((requirement) => files[requirement.key]).length} of {REQUIREMENTS.length} attached</p>
                    <p>Submitting sends the personal information sheet and the parents consent to the WSPO coordinator, then opens both forms for printing on long coupon.</p>
                </div>
            )}

            </div>

            <div className="space-y-3 border-t border-slate-100 px-5 py-5 sm:px-8">
                {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
                <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-800 disabled:opacity-40">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                {step < STEPS.length - 1 ? (
                    <button type="button" onClick={goNext} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-indigo-600/20">
                        Next <ArrowRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button type="button" onClick={submit} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit application
                    </button>
                )}
                </div>
            </div>
        </div>
    );
};

export default WspApplicationWizard;
