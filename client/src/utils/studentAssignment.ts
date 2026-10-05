const DEPARTMENT_GROUPS: string[][] = [
    ['CCS', 'College of Computer Studies', 'College of Computer Studies (CCS)', 'CCS Office'],
    ['CBA', 'College of Business and Accountancy', 'College of Business Administration', 'Business Office'],
    ['CHTM', 'College of Hotel and Tourism Management', 'College of Hospitality and Tourism Management'],
    ['CCJE', 'College of Criminal Justice Education'],
    ['COE', 'College of Engineering', 'College of Electronic Engineering'],
    ['CON', 'College of Nursing'],
    ['CTE', 'College of Teacher Education'],
    ['CAS', 'College of Arts and Sciences'],
    ['GS', 'Graduate School'],
    ['SHS', 'Senior High School Department', 'High School'],
    ['JHS', 'Junior High School Department'],
    ['ES', 'Elementary Department', 'Kindergarten/Elementary'],
    ['PS', 'Pre-School Department'],
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const groupFor = (value: string) => {
    const key = normalize(value);
    return DEPARTMENT_GROUPS.find((group) => group.some((name) => normalize(name) === key)) ?? null;
};

export type HomeDepartment = {
    shortName: string;
    fullName: string;
};

/** Home college when it is a different department from the assigned office. */
export function homeDepartment(course?: string | null, assignedOffice?: string | null): HomeDepartment | null {
    const home = (course || '').trim();
    const office = (assignedOffice || '').trim();
    if (!home || !office) return null;

    const homeGroup = groupFor(home);
    const officeGroup = groupFor(office);
    if (!homeGroup || !officeGroup || homeGroup === officeGroup) return null;

    return { shortName: homeGroup[0], fullName: home };
}

export function formatYearLevel(yearLevel?: string | number | null): string | null {
    const raw = String(yearLevel ?? '').trim();
    if (!raw || raw === 'N/A' || raw === 'Not Assigned') return null;
    if (/year/i.test(raw) || /^yr\b/i.test(raw)) return raw;
    return `Yr ${raw}`;
}

export function withHomeDepartmentNote(
    label: string,
    course?: string | null,
    assignedOffice?: string | null,
    yearLevel?: string | number | null,
): string {
    const year = formatYearLevel(yearLevel);
    const withYear = year ? `${label} · ${year}` : label;
    const home = homeDepartment(course, assignedOffice);
    return home ? `${withYear} · From ${home.shortName}` : withYear;
}
