import { CAMPUS_LETTERHEAD, CAMPUS_OFFICERS, OFFICIAL_FORM_META } from '../../constants/campusDocuments';

/** Fixed wet-signature block for WSA Extra Service Request (FCU-EOMS-WP-001-F). */

export const EXTRA_SERVICE_SIGNATORIES = {
    noted: [
        {
            name: '',
            title: CAMPUS_OFFICERS.wspoCoordinator.title,
            role: 'Noted',
        },
        {
            name: CAMPUS_OFFICERS.wspCommitteeChair.name,
            title: CAMPUS_OFFICERS.wspCommitteeChair.title,
            role: 'Committee Chair',
        },
    ],
    recommended: [
        {
            name: CAMPUS_OFFICERS.vpAdmin.name,
            title: CAMPUS_OFFICERS.vpAdmin.title,
        },
        {
            name: CAMPUS_OFFICERS.vpFinance.name,
            title: CAMPUS_OFFICERS.vpFinance.title,
        },
    ],
    approved: {
        name: CAMPUS_OFFICERS.president.name,
        title: CAMPUS_OFFICERS.president.title,
    },
} as const;

export const EXTRA_SERVICE_FORM = {
    formNo: OFFICIAL_FORM_META.extraService.formNo,
    formName: OFFICIAL_FORM_META.extraService.formName,
    revisionNo: OFFICIAL_FORM_META.extraService.revisionNo,
    effectivity: OFFICIAL_FORM_META.extraService.effectivity,
    issuingOffice: CAMPUS_LETTERHEAD.issuingOffice,
} as const;
