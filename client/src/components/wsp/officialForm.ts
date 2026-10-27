export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
export const SEX_OPTIONS = ['Male', 'Female'];
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'];
export const OCCUPATIONS = ['Farmer', 'Fisherman', 'Retired', 'Private Employee', 'Unemployed', 'Others'];
export const MEDICAL_CONDITIONS = [
    'None',
    'Visual Impairment',
    'Allergies',
    'Hypertension',
    'Asthma',
    'Mental Health Condition',
    'Others',
];

export const REQUIREMENTS = [
    {
        key: 'application_letter',
        label: 'Application letter',
        hint: 'Addressed to Mr. N-Gey C. Franco, WSP Coordinator, Filamer Christian University, Inc.',
    },
    {
        key: 'report_card',
        label: 'Copy of report card or grades',
        hint: 'Latest available copy.',
    },
    {
        key: 'birth_certificate',
        label: 'Copy of Birth Certificate',
        hint: 'PSA or local civil registrar copy.',
    },
    {
        key: 'id_picture',
        label: '2 x 2 I.D. picture',
        hint: 'The same photo placed on the information sheet.',
    },
    {
        key: 'indigency',
        label: 'Copy of Certificate of Indigency',
        hint: 'Issued by the barangay.',
    },
] as const;

export const OPTIONAL_REQUIREMENTS = [
    {
        key: 'medical_certificate',
        label: 'Medical Certificate',
        hint: 'Optional. Attach a current medical certificate if you have one.',
    },
] as const;

export type RequirementKey = (typeof REQUIREMENTS)[number]['key'] | (typeof OPTIONAL_REQUIREMENTS)[number]['key'];

export type SiblingRow = {
    name: string;
    age: string;
    school_or_work: string;
};

export type OfficialFormDetails = {
    religion: string;
    civil_status: string;
    tel_number: string;
    date_of_birth: string;
    place_of_birth: string;
    height: string;
    weight: string;
    sex: string;
    parent_name: string;
    parent_status: string;
    parent_tel: string;
    parent_occupation: string;
    parent_occupation_other: string;
    parent_income: string;
    guardian_name: string;
    guardian_tel: string;
    guardian_occupation: string;
    guardian_occupation_other: string;
    guardian_income: string;
    sibling_employed_at_fcu: string;
    employed_sibling_count: string;
    employed_siblings: { name: string }[];
    has_non_working_siblings: string;
    siblings: SiblingRow[];
    technical_qualification: string;
    work_experience: string;
    school_last_attended: string;
    school_address: string;
    degree_program: string;
    year_level: string;
    has_scholarship: string;
    scholarship_details: string;
    is_4ps: string;
    medical_conditions: string[];
    medical_other: string;
    will_sign_printed_copy: boolean;
    will_pass_good_moral: string;
    medical_certificate_attached: boolean;
    folder_acknowledged: boolean;
    certification_date: string;
    applicant_signature: string;
    father_name: string;
    father_signature: string;
    mother_name: string;
    mother_signature: string;
    guardian_sign_name: string;
    guardian_signature: string;
    consent_date: string;
    consent_child_name: string;
    consent_signed_date: string;
    consent_parent_name: string;
    consent_signature: string;
    photo: string;
    email: string;
    home_address: string;
    cell_number: string;
};

export type OfficialIdentity = {
    first_name: string;
    middle_name: string;
    last_name: string;
    age: string;
    email?: string;
    tracking_code?: string;
    submitted_at?: string;
};

export const emptySibling = (): SiblingRow => ({ name: '', age: '', school_or_work: '' });

export const emptyDetails = (): OfficialFormDetails => ({
    religion: '',
    civil_status: '',
    tel_number: '',
    date_of_birth: '',
    place_of_birth: '',
    height: '',
    weight: '',
    sex: '',
    parent_name: '',
    parent_status: '',
    parent_tel: '',
    parent_occupation: '',
    parent_occupation_other: '',
    parent_income: '',
    guardian_name: '',
    guardian_tel: '',
    guardian_occupation: '',
    guardian_occupation_other: '',
    guardian_income: '',
    sibling_employed_at_fcu: '',
    employed_sibling_count: '',
    employed_siblings: [],
    has_non_working_siblings: '',
    siblings: [emptySibling()],
    technical_qualification: '',
    work_experience: '',
    school_last_attended: '',
    school_address: '',
    degree_program: '',
    year_level: '',
    has_scholarship: '',
    scholarship_details: '',
    is_4ps: '',
    medical_conditions: [],
    medical_other: '',
    will_sign_printed_copy: false,
    will_pass_good_moral: '',
    medical_certificate_attached: false,
    folder_acknowledged: false,
    certification_date: '',
    applicant_signature: '',
    father_name: '',
    father_signature: '',
    mother_name: '',
    mother_signature: '',
    guardian_sign_name: '',
    guardian_signature: '',
    consent_date: '',
    consent_child_name: '',
    consent_signed_date: '',
    consent_parent_name: '',
    consent_signature: '',
    photo: '',
    email: '',
    home_address: '',
    cell_number: '',
});

export const sheetName = (identity: Pick<OfficialIdentity, 'first_name' | 'middle_name' | 'last_name'>) => {
    const given = [identity.first_name, identity.middle_name].map((part) => part.trim()).filter(Boolean).join(' ');
    return [identity.last_name.trim(), given].filter(Boolean).join(', ');
};

export const displayDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

export const safeImage = (value?: string) => (
    value && value.startsWith('data:image/') ? value : ''
);

export async function readPhotoDataUrl(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('Use a JPG or PNG photo.'));
            element.src = url;
        });
        const max = 480;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Use a JPG or PNG photo.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.72);
    } finally {
        URL.revokeObjectURL(url);
    }
}

export function buildApplicationPayload(
    identity: OfficialIdentity,
    details: OfficialFormDetails,
    files: Partial<Record<RequirementKey, File>>,
) {
    const payload = new FormData();
    payload.append('first_name', identity.first_name.trim());
    payload.append('middle_name', identity.middle_name.trim());
    payload.append('last_name', identity.last_name.trim());
    payload.append('email', details.email.trim());
    payload.append('age', identity.age.trim());
    payload.append('gender', details.sex);
    payload.append('address', details.home_address.trim());
    payload.append('contact_number', details.cell_number.trim());
    payload.append('year_level', details.year_level);
    payload.append('course', details.degree_program.trim());
    payload.append('form_details', JSON.stringify({
        ...details,
        email: details.email.trim(),
        home_address: details.home_address.trim(),
        cell_number: details.cell_number.trim(),
        employed_sibling_count: details.sibling_employed_at_fcu === 'Yes' ? Number(details.employed_sibling_count) : null,
        employed_siblings: details.sibling_employed_at_fcu === 'Yes'
            ? details.employed_siblings.map((row) => ({ name: row.name.trim() })).filter((row) => row.name)
            : [],
        siblings: details.has_non_working_siblings === 'Yes'
            ? details.siblings.filter((row) => row.name.trim() || row.age.trim() || row.school_or_work.trim())
            : [],
        medical_certificate_attached: Boolean(files.medical_certificate),
        consent_child_name: sheetName(identity),
        applicant_signature: '',
        father_signature: '',
        mother_signature: '',
        guardian_signature: '',
        consent_signature: '',
        certification_date: '',
        consent_date: '',
        consent_signed_date: '',
    }));
    [...REQUIREMENTS, ...OPTIONAL_REQUIREMENTS].forEach((requirement) => {
        const file = files[requirement.key];
        if (!file) return;
        payload.append('documents[]', file);
        payload.append('document_keys[]', requirement.key);
    });
    return payload;
}
