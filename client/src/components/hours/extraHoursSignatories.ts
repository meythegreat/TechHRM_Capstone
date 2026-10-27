import { CAMPUS_OFFICERS } from '../../constants/campusDocuments';

/** Fixed wet-signature block for Extra Hours (20 → 25 hrs/week) permission letters. */

export const EXTRA_HOURS_SIGNATORIES = {
    notedVpAdmin: {
        name: CAMPUS_OFFICERS.vpAdmin.name,
        title: CAMPUS_OFFICERS.vpAdmin.title,
        role: 'Noted',
    },
    endorsed: {
        name: '',
        title: CAMPUS_OFFICERS.wspoCoordinator.title,
        role: 'Endorsed',
    },
    notedCommittee: {
        name: CAMPUS_OFFICERS.wspCommitteeChair.name,
        title: CAMPUS_OFFICERS.wspCommitteeChair.title,
        role: 'Noted',
    },
    recommending: {
        name: CAMPUS_OFFICERS.vpFinance.name,
        title: CAMPUS_OFFICERS.vpFinance.title,
        role: 'Recommending Approval',
    },
    approved: {
        name: CAMPUS_OFFICERS.president.name,
        title: CAMPUS_OFFICERS.president.title,
        role: 'Approved',
    },
} as const;

export const EXTRA_HOURS_LETTER = {
    weeklyHours: 25,
    salutation: 'Christian Greetings!',
} as const;
