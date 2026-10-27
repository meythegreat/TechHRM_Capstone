/** Shared branding and officer titles for all printable campus documents. */

export const CAMPUS_LETTERHEAD = {
    universityName: 'FILAMER CHRISTIAN UNIVERSITY, INC.',
    universityNamePlain: 'Filamer Christian University, Inc.',
    /** Full postal line used on narrative letters and ISO form headers. */
    address: 'Roxas Avenue, Roxas City, Capiz, Philippines 5800',
    /** Address without ZIP (legacy ISO samples); prefer `address` for new work. */
    addressNoZip: 'Roxas Avenue, Roxas City, Capiz, Philippines',
    cityLine: 'Roxas Avenue, Roxas City',
    phoneWeb: 'Tel. Nos: (036) 6212-317, 6212-318 · www.filamer.edu.ph',
    sealSrc: '/fcu-seal.jpg',
    logoSrc: '/fcu.jpg',
    wspoLogoSrc: '/logo.jpg',
    issuingOffice: 'WORK STUDY PROGRAM OFFICE',
    wspoOrgName: 'Work Study Program Organization',
    isoStandard: 'ISO 21001:2025',
    eomsLabel: 'EDUCATIONAL ORGANIZATION\nMANAGEMENT SYSTEM',
} as const;

/** Fixed wet-signature officers (names and official titles stay in sync across letters). */
export const CAMPUS_OFFICERS = {
    president: {
        name: 'GEORGE O. CORTEL, MBA, Ph.D.',
        title: 'University President',
        salutationShort: 'Dr. Cortel',
    },
    vpAdmin: {
        name: 'EXEQUIEL A. CALIMUTAN, MAT',
        title: 'OIC, VP-Administration',
    },
    vpFinance: {
        name: 'ESTHER S. ARCEÑO, CPA, MPA',
        title: 'VP-Finance',
    },
    wspCommitteeChair: {
        name: 'PHOEBE F. SANTIAGO, LPT, MAEd, RGC',
        title: 'Director, Guidance & Counselling Center',
    },
    wspoCoordinator: {
        title: 'Coordinator, Work Study Program',
        /** Short label used in reports / through-lines. */
        shortTitle: 'WSPO Coordinator',
    },
    wspoSecretary: {
        title: 'WSPO Secretary',
    },
} as const;

export const OFFICIAL_FORM_META = {
    personalInformation: {
        formNo: 'FCU-EOMS-WP-012',
        formNameLines: ['PERSONAL INFORMATION', 'SHEET'] as const,
        effectivity: 'November 24, 2025',
        revisionNo: '1',
    },
    parentsConsent: {
        /** No separate EOMS number is published; printed with the WP-012 packet. */
        formNo: 'FCU-EOMS-WP-012',
        formNameLines: ['PARENTS CONSENT'] as const,
        effectivity: 'November 24, 2025',
        revisionNo: '1',
    },
    extraService: {
        formNo: 'FCU-EOMS-WP-001-F',
        formName: 'WSA EXTRA SERVICE REQUEST',
        revisionNo: '1',
        effectivity: 'October 1, 2025',
    },
} as const;
