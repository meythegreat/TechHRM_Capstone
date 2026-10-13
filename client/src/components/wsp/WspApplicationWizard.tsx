import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Printer, Send } from 'lucide-react';
import ApplicationStatusTracker from '../ApplicationStatusTracker';
import OfficialWspForms, { printOfficialForms } from './OfficialWspForms';
import {
    CIVIL_STATUSES,
    MEDICAL_CONDITIONS,
    OCCUPATIONS,
    OPTIONAL_REQUIREMENTS,
    REQUIREMENTS,
    SEX_OPTIONS,
    YEAR_LEVELS,
    buildApplicationPayload,
    emptyDetails,
    emptySibling,
    readPhotoDataUrl,
    sheetName,
    type OfficialFormDetails,
    type OfficialIdentity,
    type RequirementKey,
} from './officialForm';

type Receipt = {
    tracking_code?: string;
    tracker?: Record<string, unknown>;
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

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10';
const labelClass = 'block text-sm font-semibold text-slate-700 mb-1.5';

const filled = (value: string) => value.trim() !== '';

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
        if (!filled(details.religion) || !filled(identity.age) || !details.sex || !details.civil_status) return 'Complete religion, age, sex, and civil status.';
        if (Number(identity.age) < 16) return 'Age must be 16 or older.';
        if (!filled(details.home_address) || !filled(details.cell_number) || !filled(details.email)) return 'Enter the home address, cellphone number, and email.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) return 'Enter a valid email address.';
        if (!details.date_of_birth || !filled(details.place_of_birth) || !filled(details.height) || !filled(details.weight)) {
            return 'Enter the date of birth, place of birth, height, and weight.';
        }
    }
    if (step === 1) {
        if (!filled(details.parent_name) || !details.parent_status || !filled(details.parent_tel) || !details.parent_occupation || !filled(details.parent_income)) {
            return 'Complete the father or mother section.';
        }
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

    useEffect(() => {
        const dirty = Boolean(
            identity.first_name || identity.last_name || details.email || details.home_address || Object.keys(files).length,
        );
        onDraftChange?.(dirty && !receipt);
    }, [identity, details.email, details.home_address, files, receipt, onDraftChange]);

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
        const count = Math.min(12, Math.max(0, Number(value.replace(/[^\d]/g, '')) || 0));
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
                        Both forms were sent to the WSPO coordinator in the layout of the official information sheet and parents consent. Print them on long coupon paper (8.5 × 13 inches), then sign the blank signature lines by hand.
                    </p>
                    {receipt.tracking_code && (
                        <p className="mt-4 font-mono text-2xl font-semibold text-indigo-700">{receipt.tracking_code}</p>
                    )}
                    <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                        <button type="button" onClick={printOfficialForms} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold">
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
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-8">
            <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Step {step + 1} of {STEPS.length}</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">{STEPS[step]}</h2>
                <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-indigo-600" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
                </div>
            </div>

            {error && <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

            {step === 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className={labelClass}>Last name<input className={inputClass} value={identity.last_name} onChange={(event) => setIdentity({ ...identity, last_name: event.target.value })} /></label>
                    <label className={labelClass}>First name<input className={inputClass} value={identity.first_name} onChange={(event) => setIdentity({ ...identity, first_name: event.target.value })} /></label>
                    <label className={labelClass}>Middle name<input className={inputClass} value={identity.middle_name} onChange={(event) => setIdentity({ ...identity, middle_name: event.target.value })} /></label>
                    <label className={labelClass}>Religion<input className={inputClass} value={details.religion} onChange={(event) => patch({ religion: event.target.value })} /></label>
                    <label className={labelClass}>Age<input className={inputClass} inputMode="numeric" value={identity.age} onChange={(event) => setIdentity({ ...identity, age: event.target.value.replace(/[^\d]/g, '') })} /></label>
                    <div><p className={labelClass}>Sex</p><Choice value={details.sex} options={SEX_OPTIONS} onChange={(sex) => patch({ sex })} /></div>
                    <div className="sm:col-span-2"><p className={labelClass}>Civil status</p><Choice value={details.civil_status} options={CIVIL_STATUSES} onChange={(civil_status) => patch({ civil_status })} /></div>
                    <label className="sm:col-span-2"><span className={labelClass}>Home address</span><input className={inputClass} value={details.home_address} onChange={(event) => patch({ home_address: event.target.value })} /></label>
                    <label className={labelClass}>Cellphone number<input className={inputClass} value={details.cell_number} onChange={(event) => patch({ cell_number: event.target.value })} /></label>
                    <label className={labelClass}>Telephone number<input className={inputClass} value={details.tel_number} onChange={(event) => patch({ tel_number: event.target.value })} /></label>
                    <label className={labelClass}>Email<input className={inputClass} type="email" value={details.email} onChange={(event) => patch({ email: event.target.value })} /></label>
                    <label className={labelClass}>Date of birth<input className={inputClass} type="date" value={details.date_of_birth} onChange={(event) => patch({ date_of_birth: event.target.value })} /></label>
                    <label className={labelClass}>Place of birth<input className={inputClass} value={details.place_of_birth} onChange={(event) => patch({ place_of_birth: event.target.value })} /></label>
                    <label className={labelClass}>Height<input className={inputClass} value={details.height} onChange={(event) => patch({ height: event.target.value })} /></label>
                    <label className={labelClass}>Weight<input className={inputClass} value={details.weight} onChange={(event) => patch({ weight: event.target.value })} /></label>
                </div>
            )}

            {step === 1 && (
                <div className="space-y-4">
                    <label className={labelClass}>Name of father / mother<input className={inputClass} value={details.parent_name} onChange={(event) => patch({ parent_name: event.target.value })} /></label>
                    <div><p className={labelClass}>Living or deceased</p><Choice value={details.parent_status} options={['Living', 'Deceased']} onChange={(parent_status) => patch({ parent_status })} /></div>
                    <label className={labelClass}>Telephone number<input className={inputClass} value={details.parent_tel} onChange={(event) => patch({ parent_tel: event.target.value })} /></label>
                    <div><p className={labelClass}>Occupation</p><Choice value={details.parent_occupation} options={OCCUPATIONS} onChange={(parent_occupation) => patch({ parent_occupation })} /></div>
                    {details.parent_occupation === 'Others' && <label className={labelClass}>Other occupation<input className={inputClass} value={details.parent_occupation_other} onChange={(event) => patch({ parent_occupation_other: event.target.value })} /></label>}
                    <label className={labelClass}>Approximate monthly income<input className={inputClass} value={details.parent_income} onChange={(event) => patch({ parent_income: event.target.value })} /></label>
                    {details.parent_status === 'Deceased' && (
                        <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
                            <p className="text-sm font-semibold text-slate-800">Guardian, because the parents are deceased</p>
                            <label className={labelClass}>Guardian name<input className={inputClass} value={details.guardian_name} onChange={(event) => patch({ guardian_name: event.target.value })} /></label>
                            <label className={labelClass}>Telephone number<input className={inputClass} value={details.guardian_tel} onChange={(event) => patch({ guardian_tel: event.target.value })} /></label>
                            <div><p className={labelClass}>Occupation</p><Choice value={details.guardian_occupation} options={OCCUPATIONS} onChange={(guardian_occupation) => patch({ guardian_occupation })} /></div>
                            {details.guardian_occupation === 'Others' && <label className={labelClass}>Other occupation<input className={inputClass} value={details.guardian_occupation_other} onChange={(event) => patch({ guardian_occupation_other: event.target.value })} /></label>}
                            <label className={labelClass}>Approximate monthly income<input className={inputClass} value={details.guardian_income} onChange={(event) => patch({ guardian_income: event.target.value })} /></label>
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
                                <label className={labelClass}>How many?<input className={inputClass} inputMode="numeric" value={details.employed_sibling_count} onChange={(event) => setEmployedCount(event.target.value)} /></label>
                                {details.employed_siblings.map((row, index) => (
                                    <label key={`employed-${index}`} className={labelClass}>
                                        Name {index + 1}
                                        <input
                                            className={inputClass}
                                            value={row.name}
                                            onChange={(event) => {
                                                const employed_siblings = details.employed_siblings.map((item, itemIndex) => itemIndex === index ? { name: event.target.value } : item);
                                                patch({ employed_siblings });
                                            }}
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
                                <label className={labelClass}>Name<input className={inputClass} value={row.name} onChange={(event) => patch({ siblings: details.siblings.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /></label>
                                <label className={labelClass}>Age<input className={inputClass} value={row.age} onChange={(event) => patch({ siblings: details.siblings.map((item, itemIndex) => itemIndex === index ? { ...item, age: event.target.value } : item) })} /></label>
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
                    {details.medical_conditions.includes('Others') && <label className={labelClass}>Other condition<input className={inputClass} value={details.medical_other} onChange={(event) => patch({ medical_other: event.target.value })} /></label>}
                    <label className={labelClass}>2 x 2 I.D. picture
                        <input className="mt-1 block w-full text-sm" type="file" accept="image/jpeg,image/png" onChange={(event) => onPhoto(event.target.files?.[0])} />
                    </label>
                    {details.photo && <img src={details.photo} alt="2 x 2 preview" className="w-24 h-24 object-cover rounded-lg border border-slate-200" />}
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
                        <label key={requirement.key} className="block rounded-2xl border border-slate-200 p-4">
                            <span className="block text-sm font-semibold text-slate-900">{requirement.label}</span>
                            <span className="block text-xs text-slate-500 mt-1">{requirement.hint}</span>
                            {requirement.key === 'id_picture' && files.id_picture ? (
                                <span className="mt-2 block text-sm font-bold text-emerald-700">Photo attached: {files.id_picture.name}</span>
                            ) : null}
                            <input
                                className="mt-2 block w-full text-sm"
                                type="file"
                                accept={requirement.key === 'id_picture' ? 'image/jpeg,image/png' : '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'}
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 4 * 1024 * 1024) {
                                        setError('Each file must be under 4MB.');
                                        return;
                                    }
                                    setFiles((current) => ({ ...current, [requirement.key]: file }));
                                    if (requirement.key === 'id_picture') onPhoto(file);
                                }}
                            />
                            {files[requirement.key] && requirement.key !== 'id_picture' && <span className="mt-1 block text-xs font-bold text-indigo-700">{files[requirement.key]?.name}</span>}
                        </label>
                    ))}
                    {OPTIONAL_REQUIREMENTS.map((requirement) => (
                        <label key={requirement.key} className="block rounded-2xl border border-dashed border-slate-300 p-4">
                            <span className="block text-sm font-semibold text-slate-900">{requirement.label} <span className="font-bold text-slate-400">Optional</span></span>
                            <span className="block text-xs text-slate-500 mt-1">{requirement.hint}</span>
                            <input
                                className="mt-2 block w-full text-sm"
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 4 * 1024 * 1024) {
                                        setError('Each file must be under 4MB.');
                                        return;
                                    }
                                    setFiles((current) => ({ ...current, [requirement.key]: file }));
                                    setError('');
                                }}
                            />
                            {files[requirement.key] && <span className="mt-1 block text-xs font-bold text-indigo-700">{files[requirement.key]?.name}</span>}
                        </label>
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
                    <p><span className="font-bold">Program:</span> {details.degree_program} · {details.year_level}</p>
                    <p><span className="font-bold">Work-student siblings:</span> {details.sibling_employed_at_fcu === 'Yes' ? `${details.employed_sibling_count} — ${details.employed_siblings.map((row) => row.name).join(', ')}` : 'No'}</p>
                    <p><span className="font-bold">Other siblings:</span> {details.has_non_working_siblings === 'Yes' ? details.siblings.filter((row) => row.name.trim()).map((row) => row.name).join(', ') : 'None'}</p>
                    <p><span className="font-bold">Good moral certificate:</span> {details.will_pass_good_moral === 'Yes' ? 'Will pass one' : details.will_pass_good_moral === 'No' ? 'Will not pass one' : 'Not answered'}</p>
                    <p><span className="font-bold">Medical certificate:</span> {files.medical_certificate ? 'Attached' : 'Not attached'}</p>
                    <p><span className="font-bold">Required documents:</span> {REQUIREMENTS.filter((requirement) => files[requirement.key]).length} of {REQUIREMENTS.length} attached</p>
                    <p>Submitting sends the personal information sheet and the parents consent to the WSPO coordinator, then opens both forms for printing on long coupon.</p>
                </div>
            )}

            <div className="mt-8 flex items-center justify-between gap-3">
                <button type="button" onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-100 text-slate-800 font-bold disabled:opacity-40">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                {step < STEPS.length - 1 ? (
                    <button type="button" onClick={goNext} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold">
                        Next <ArrowRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button type="button" onClick={submit} disabled={loading} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit application
                    </button>
                )}
            </div>
        </div>
    );
};

export default WspApplicationWizard;
