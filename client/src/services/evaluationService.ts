import axios from 'axios';

export type EvaluationStandard = { id: string; text: string };

export type EvaluationStudent = {
    id: number;
    name: string;
    student_id_number?: string | null;
    assigned_office?: string | null;
};

export type EvaluationMeta = {
    can_file: boolean;
    can_review: boolean;
    can_decide: boolean;
    user_id: number;
    departments: string[];
    semester: string | null;
    school_year: string | null;
    semester_school_year: string | null;
    evaluated_on: string;
    evaluated_on_label: string;
    standards: EvaluationStandard[];
    ratings: string[];
    recommendations: string[];
    intro: string;
    legend: string;
};

export type EvaluationRow = {
    id: number;
    department: string;
    semester_label: string;
    school_year: string;
    semester_school_year: string;
    evaluated_on: string;
    evaluated_on_label: string;
    ratings: Record<string, string>;
    comments: string | null;
    recommendation: string;
    evaluated_by_name: string;
    attested_by_name: string;
    evaluated_signature_path: string | null;
    evaluated_signature_name: string | null;
    attested_signature_path: string | null;
    attested_signature_name: string | null;
    status: string;
    decision_note: string | null;
    submitted_by: string | null;
    submitted_by_id: number;
    reviewed_by: string | null;
    student: EvaluationStudent | null;
};

export type EvaluationPayload = {
    department: string;
    studentId: number;
    ratings: Record<string, string>;
    comments: string;
    recommendation: string;
    evaluatedBy: string;
    attestedBy: string;
    signedForm?: File | null;
    asDraft?: boolean;
};

const formData = (payload: EvaluationPayload) => {
    const body = new FormData();
    body.append('department', payload.department);
    body.append('student_id', String(payload.studentId));
    body.append('ratings', JSON.stringify(payload.ratings));
    body.append('comments', payload.comments);
    body.append('recommendation', payload.recommendation);
    body.append('evaluated_by_name', payload.evaluatedBy);
    body.append('attested_by_name', payload.attestedBy);
    if (payload.asDraft) body.append('as_draft', '1');
    if (payload.signedForm) body.append('signature_proof', payload.signedForm);
    return body;
};

export const evaluationService = {
    meta: () => axios.get<EvaluationMeta>('/api/evaluations/meta').then((response) => response.data),
    list: () => axios.get<{ evaluations: EvaluationRow[] }>('/api/evaluations').then((response) => response.data.evaluations),
    candidates: (department: string) =>
        axios
            .get<{ students: EvaluationStudent[] }>('/api/evaluations/candidates', { params: { department } })
            .then((response) => response.data.students),
    create: (payload: EvaluationPayload) => axios.post('/api/evaluations', formData(payload)),
    saveDraft: (id: number, payload: EvaluationPayload) => axios.post(`/api/evaluations/${id}/draft`, formData(payload)),
    finalize: (id: number, payload: EvaluationPayload) => axios.post(`/api/evaluations/${id}/finalize`, formData(payload)),
    remove: (id: number) => axios.delete(`/api/evaluations/${id}`),
    decide: (id: number, status: 'Approved' | 'Rejected', decisionNote: string) =>
        axios.patch(`/api/evaluations/${id}`, { status, decision_note: decisionNote }),
};

export function evaluationError(error: unknown, fallback: string) {
    const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
    const first = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
    return first || data?.message || fallback;
}
