import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BookOpen, ChevronDown, Search, CircleHelp, Lightbulb, ListOrdered } from 'lucide-react';

type HelpAudience = 'Student' | 'Supervisor' | 'WSPO Staff' | 'Super Admin' | 'all';

interface HelpTopic {
    id: string;
    title: string;
    summary: string;
    about: string;
    audience: HelpAudience[];
    steps: string[];
    tips?: string[];
}

const HELP_TOPICS: HelpTopic[] = [
    {
        id: 'student-dashboard',
        title: 'Dashboard',
        summary: 'Your home page after you sign in.',
        about:
            'The Dashboard shows a quick summary of your work-study progress. You can see your office, hours progress, performance, open disciplinary items, supervisors, upcoming shifts, and a calendar of work and class days.',
        audience: ['Student'],
        steps: [
            'Click Dashboard in the left menu.',
            'Check your hours progress and how close you are to the required hours.',
            'Review this week and this month against the 20/25 weekly and 100 monthly limits. Ask your supervisor for an Extra Hours letter if you need up to 25 hours/week.',
            'Look at your assigned office and supervisor names.',
            'Use the calendar to move between months and select a day to see your work or class lists. Days with classes or work are highlighted, and today\'s schedule stays at the top. Click the calendar header to collapse or expand it.',
            'Check Upcoming Shifts so you know when to report for duty.',
            'Use the left menu when you need Attendance, Schedule, Requirements, or other pages.',
        ],
        tips: [
            'This page is for viewing only. You cannot edit records here.',
            'The page refreshes on its own, so new updates can appear without reloading.',
        ],
    },
    {
        id: 'student-attendance',
        title: 'Attendance / DTR',
        summary: 'Clock in and clock out for your duty.',
        about:
            'Attendance / DTR is where you record your daily time. You can clock in and out using a supervisor passcode or a live QR code. If you have more than one shift in the morning or afternoon, clock out of the current shift before the next one. Each shift is recorded on the DTR. You can also preview your DTR and check recent logs with statuses like Accepted, Rejected, Pending, or Timed in.',
        audience: ['Student'],
        steps: [
            'Click Attendance / DTR in the left menu.',
            'Choose Passcode or QR at the top of the page.',
            'Ask your supervisor for the current passcode, or scan the QR code they show.',
            'Click Clock In when your duty starts.',
            'Click Clock Out when your duty ends.',
            'Open DTR Preview to review your recorded times.',
            'Check Recent Logs to see if each entry was accepted or still pending.',
        ],
        tips: [
            'You can usually clock in starting 30 minutes before your shift begins.',
            'If you are already timed in, clock out first before starting another duty.',
            'Some special activities (like cleaning, devotionals, or assemblies) may use their own QR and add hours when you are on time.',
            'If you have no work schedule yet, follow the attendance rules set by WSPO.',
            'You may work up to 20 hours per week by default. Past 20 hours needs administrator approval (up to 25). The monthly maximum is 100 hours.',
        ],
    },
    {
        id: 'student-hours',
        title: 'Hours Rendered',
        summary: 'See how many hours you have worked this month.',
        about:
            'Hours Rendered shows your monthly duty summary. It includes your DTR hours, duty deductions, special or activity hours, and an estimated peso amount. It also reflects weekly and monthly hour limits: 20 hours/week by default, up to 25 with administrator approval, and 100 hours/month maximum.',
        audience: ['Student'],
        steps: [
            'Click Hours Rendered in the left menu.',
            'Pick the month you want to check.',
            'Read the grand total and the estimated amount shown.',
            'Review the breakdown cells such as DTR hours, deductions, cleaning, and meetings.',
            'Scroll the activity hours list to see each activity and its status.',
            'Check the week and month limit counters so you know how many hours you can still add.',
        ],
        tips: [
            'This page is view-only. You cannot change the numbers yourself.',
            'A common formula is: DTR hours minus deductions, plus approved activity hours.',
            'Tell your supervisor if a day or total looks wrong.',
            'If you need more than 20 hours in a week, request an extension from your Dashboard before you hit the limit.',
        ],
    },
    {
        id: 'student-hour-limits',
        title: 'Weekly and monthly hour limits',
        summary: 'How many hours you may work each week and month.',
        about:
            'Working students may work up to 20 hours per week without special approval. With an approved Extra Hours letter, you may work up to 25 hours per week for the covered period. No student may exceed 100 hours in a calendar month. The system blocks new clock-ins and caps credited hours when these limits are reached.',
        audience: ['Student'],
        steps: [
            'Open Dashboard to see your current week and month hour usage.',
            'Work normally while you stay at or under 20 hours for the week.',
            'If you need up to 25 hours/week, ask your supervisor to prepare an Extra Hours letter.',
            'After WSPO records the signed letter, you may work up to 25 hours each week during the approved period, or until you reach 100 hours for the month.',
        ],
        tips: [
            'Extra Hours is a wet-signed permission letter (different from Extra Service, which is for specific dates or events).',
            'Monthly 100 hours is a hard maximum and cannot be extended.',
            'Clock-out may credit fewer hours than your shift length if you are about to exceed a limit.',
        ],
    },
    {
        id: 'student-schedule',
        title: 'My Schedule',
        summary: 'See your work and class schedule, and request changes.',
        about:
            'My Schedule lists your assigned work shifts and class blocks. Students cannot edit schedules directly. If a work shift is wrong, you can request an edit and wait for approval.',
        audience: ['Student'],
        steps: [
            'Click My Schedule in the left menu.',
            'Review each work shift: day, time, duty type, office, and supervisor.',
            'Review your class schedule for subject, room, and instructor when shown.',
            'If a work shift needs a change, click Request Edit.',
            'Choose the shift, write a short reason, then submit the request.',
            'Watch for a pending badge while staff reviews your request.',
        ],
        tips: [
            'Request Edit is only available when you already have work shifts.',
            'Class schedules are usually managed by WSPO, not by students.',
            'Keep following your current schedule until the request is approved.',
        ],
    },
    {
        id: 'student-requirements',
        title: 'Requirements',
        summary: 'Upload the documents needed for the program.',
        about:
            'Requirements is where you submit documents for verification. Common types include Medical Clearance, Parents Consent, Copy of Grades, Certificate of Enrollment, and Good Moral Character. Each upload shows a status so you know what is still pending.',
        audience: ['Student'],
        steps: [
            'Click Requirements in the left menu.',
            'Choose the document type from the list.',
            'Select a clear PDF, JPG, or PNG file from your device.',
            'Click Upload Document.',
            'Check the list below to see if the file is pending, verified, or rejected.',
            'Open the file from the list if you want to double-check what you uploaded.',
            'If a file is rejected, read the remarks, fix the problem, and upload again.',
        ],
        tips: [
            'Use a clear, readable scan or photo.',
            'The page shows whether you are Fully Compliant or still Pending.',
            'Keep uploading until every required document is verified.',
        ],
    },
    {
        id: 'student-disciplinary',
        title: 'Disciplinary Records',
        summary: 'View notes about your duty conduct and file an appeal when allowed.',
        about:
            'Disciplinary Records (also called Disciplinary Board) shows infractions or penalties linked to your account. When a record allows it, you can file an appeal with a short explanation.',
        audience: ['Student'],
        steps: [
            'Click Disciplinary Records in the left menu.',
            'Read each record, including the date, remarks, and status.',
            'If File Appeal is available, open it and write a clear note.',
            'Submit the appeal, or cancel if you change your mind.',
            'Ask your supervisor or WSPO staff if you need more explanation.',
        ],
        tips: [
            'You can appeal only when the record allows it (for example, when it is Active or Resolved and has no previous appeal notes).',
            'Pending penalties may not be ready for appeal yet.',
        ],
    },
    {
        id: 'student-application',
        title: 'Application Status',
        summary: 'Track your work-study application from start to assignment.',
        about:
            'Application Status shows where your application is in the process. Stages usually move from Received to Interview, Training, For Result, Approved, and Assigned. If your application is rejected, the page can show the reason.',
        audience: ['Student'],
        steps: [
            'Click Application Status in the left menu.',
            'Follow the stage timeline to see your current step.',
            'Check for an interview schedule if one has been set.',
            'If the application was rejected, read the reason carefully.',
            'Complete any missing requirements in the Requirements page if staff asked for documents.',
        ],
        tips: [
            'This page is for viewing progress. You cannot move the stage yourself.',
            'If something looks stuck, contact WSPO staff for an update.',
        ],
    },
    {
        id: 'student-settings',
        title: 'Settings',
        summary: 'Update your photo or password.',
        about:
            'Settings lets you manage your profile photo and password. Your name, student ID, course, office, and supervisor are shown for reference and usually cannot be edited here.',
        audience: ['Student'],
        steps: [
            'Click Settings in the left menu.',
            'To change your photo, upload an image, crop it, then save. You can also remove the current photo.',
            'Review your locked profile details to confirm they are correct.',
            'To change your password, enter your current password, then enter the new password twice.',
            'Use show/hide if you want to check what you typed.',
            'Save your changes and wait for the success message.',
        ],
        tips: [
            'Profile photos should be JPG or PNG and not larger than 2MB.',
            'New passwords must be at least 6 characters.',
            'If your name, course, or office is wrong, ask WSPO staff to update it.',
        ],
    },
    {
        id: 'staff-dashboard',
        title: 'Dashboard',
        summary: 'A quick overview of students, offices, and items that need attention.',
        about:
            'The staff Dashboard is your starting point. Supervisors and WSPO staff see a workspace overview with active students, pending items, hours, calendars, and student cards. Super Admins see a wider campus command view with enrolled and active student summaries.',
        audience: ['Supervisor', 'WSPO Staff', 'Super Admin'],
        steps: [
            'Click Dashboard in the left menu.',
            'Review the summary cards for active students, pending approvals, and hours.',
            'Open cards or modals (like Active Now) when you need more detail.',
            'Use the organization calendar to check work and class days.',
            'Open a student card when you need a closer look at that student.',
            'Use the left menu to jump into Timesheets, Schedules, Attendance Hub, or other tools.',
        ],
        tips: [
            'WSPO staff may see a shortcut to Applications for new sign-ups.',
            'Most dashboard items are for monitoring. Actual approvals happen in other pages.',
        ],
    },
    {
        id: 'staff-timesheets',
        title: 'Timesheets',
        summary: 'Review and manage student daily time records.',
        about:
            'Timesheets shows student attendance logs. Supervisors and WSPO staff can review pending entries, accept or reject them, print monthly DTRs, and process Extra Hours letters that raise the weekly cap from 20 to 25. Super Admins can browse and filter records, but usually cannot approve or reject from this page.',
        audience: ['Supervisor', 'WSPO Staff', 'Super Admin'],
        steps: [
            'Click Timesheets in the left menu.',
            'Use the date controls (previous, next, Today, or jump) to find the day you need.',
            'Filter or search by student, department, or office when available.',
            'For pending logs, click Accept if the time is correct, or Reject if it is not.',
            'Review Extra Hours near the top. Supervisors Save & Print the letter, collect wet signatures, then upload the signed scan. WSPO records Approve 25 or Decline.',
            'Open a student monthly DTR when you need to review or print the full sheet.',
            'Use Manual Timesheet Override to add or edit time in and time out, including a date that has no DTR yet. Each shift is saved as its own row.',
            'WSPO or Super Admin users can also manage holidays and class breaks when that tool is shown.',
        ],
        tips: [
            'Supervisors usually handle students in their own department.',
            'WSPO staff can add or edit DTR times for any working student, even when that day has no recorded time yet.',
            'Super Admin timesheet views are mostly read-only.',
            'Students are limited to 20 hours/week unless you approve an extension. 100 hours/month is a hard stop.',
        ],
    },
    {
        id: 'staff-schedules',
        title: 'Schedules',
        summary: 'Manage work shifts, class schedules, and schedule requests.',
        about:
            'Schedules (Schedule Master) is where work and class blocks are managed. WSPO coordinators or secretaries can set the semester, assign shifts, and process requests. Supervisors can view their department schedules and send staffing requests, including Extra Service requests that require a system-generated approval letter with wet signatures. Super Admins can review schedules with filters.',
        audience: ['Supervisor', 'WSPO Staff', 'Super Admin'],
        steps: [
            'Click Schedules in the left menu.',
            'Make sure a semester is set before adding or assigning schedules.',
            'Use filters (name, day, department, date/time) to find the right records.',
            'Add a class or assign a work shift when your role allows it.',
            'Edit or remove a schedule if the day or time needs correction.',
            'Review student edit requests and approve or reject them with a note.',
            'Supervisors can submit a staffing request when more student workers are needed.',
            'For Extra Service / Special Request duty, use Save & Print Approval Letter (this stores a draft), collect wet signatures, then upload the signed scan and transmit to send it to WSPO.',
        ],
        tips: [
            'Assign and Add controls stay disabled until a semester is set.',
            'Not every WSPO office title can edit schedules—usually coordinator or secretary roles.',
            'Super Admin access on this page is mostly for reviewing, not editing.',
            'Extra Service letters need signatures from the supervisor, WSPO Coordinator, Guidance Committee Chair, VP-Administration, VP-Finance, and the University President.',
        ],
    },
    {
        id: 'staff-attendance-hub',
        title: 'Attendance Hub',
        summary: 'Show passcodes or QR codes so students can clock in.',
        about:
            'Attendance Hub is the live attendance tool. Supervisors and WSPO staff can show a rotating passcode or QR code for students. They can also watch for unusual activity. Super Admins see an audit-style login table instead of generating codes.',
        audience: ['Supervisor', 'WSPO Staff', 'Super Admin'],
        steps: [
            'Click Attendance Hub in the left menu.',
            'Switch between Passcode and QR depending on how students will clock in.',
            'Show the current code or QR to students who are ready to time in.',
            'Copy the passcode if you need to share it quickly, or expand the QR for easier scanning.',
            'Check the anomaly count if the page flags unusual attendance activity.',
            'The WSPO coordinator assigns groups for every activity. Choose one leader from any year level first, then add members by year. A group can mix years. That leader can open the QR code and passcode for their own year level only.',
            'Super Admins can browse the login and logout table and move through pages of records.',
        ],
        tips: [
            'Passcodes and QR codes are usually limited to your department or office scope.',
            'Super Admins cannot generate student clock-in codes from this page.',
            'Ask students to clock out before starting a new duty session.',
        ],
    },
    {
        id: 'staff-compliance',
        title: 'Compliance',
        summary: 'Report, review, and resolve student infractions.',
        about:
            'Compliance (Infraction Manager) tracks disciplinary cases. Supervisors can report infractions for students in their departments. The WSPO coordinator can see and select every registered working student. WSPO staff can issue penalties, decide pending cases, and handle appeals. Super Admins can view and filter records but usually cannot file or resolve cases here.',
        audience: ['Supervisor', 'WSPO Staff', 'Super Admin'],
        steps: [
            'Click Compliance in the left menu.',
            'Use the Offenses, Performance, or Year-end Awards tabs when they appear.',
            'Supervisors: click Report Infraction, choose the student, and write a clear note.',
            'WSPO staff: issue an infraction with the correct penalty, or decide a pending report.',
            'Resolve a case, keep a penalty, dismiss it, or decide an appeal when those actions are available.',
            'Super Admins: search or filter by name, department, or offense to review history.',
        ],
        tips: [
            'Offenses are Late (minor, supervisor-dependent), Absent (major), and AWOL (major).',
            '3 consecutive Assembly & General Cleaning absences automatically suspend for 1 semester.',
            '3 department replacements automatically suspend the student.',
            'Keep notes factual and easy to understand.',
            'Supervisor reports may wait for WSPO coordinator decision when the penalty is still Pending.',
            'Super Admin use of this page is mostly for monitoring.',
        ],
    },
    {
        id: 'staff-document-review',
        title: 'Document Review',
        summary: 'View student documents that have already been verified.',
        about:
            'Document Review shows verified student requirement files. In the current system, this page is available to Super Admins and is mainly used to open and check documents that are already verified.',
        audience: ['Super Admin'],
        steps: [
            'Click Document Review in the left menu.',
            'Browse the list of verified documents, newest first.',
            'Open a file securely when you need to inspect it.',
            'Use pagination to move through older documents.',
        ],
        tips: [
            'This page focuses on verified documents.',
            'If a student still needs to submit files, they do that from the student Requirements page.',
        ],
    },
    {
        id: 'staff-applications',
        title: 'Applications',
        summary: 'Review new work-study applicants and move them through the process.',
        about:
            'Applications (Applicant Sign-ups) is the hiring pipeline. WSPO staff can review applicants, schedule interviews, advance stages, decline applications, and finalize placement. Super Admins can view website applications and documents, but cannot move stages or place students.',
        audience: ['WSPO Staff', 'Super Admin'],
        steps: [
            'Click Applications in the left menu.',
            'Search for an applicant, or hide older approved records if the list is long.',
            'Open an applicant card to read details and documents.',
            'Move the application through stages such as Interview, Training, For Result, and Approved.',
            'Schedule an interview time when the applicant reaches that stage.',
            'Decline with a clear reason if the applicant will not continue.',
            'When approved, finalize placement by creating the account and assigning an office.',
            'Use the rejected or deleted archive if you need to review older cases.',
        ],
        tips: [
            'Typical flow: Pending → Interview → Training → For Result → Approved → Assigned.',
            'You can undo a queued stage move if you change your mind before it finishes.',
            'Super Admin access here is for viewing, not processing.',
        ],
    },
    {
        id: 'staff-users',
        title: 'User Management',
        summary: 'Create, edit, or remove system accounts.',
        about:
            'User Management lets WSPO staff and Super Admins maintain accounts for students and staff. You can add users, search and filter the list, edit profiles, reset passwords, and delete accounts when needed.',
        audience: ['WSPO Staff', 'Super Admin'],
        steps: [
            'Click User Management in the left menu.',
            'Use search, role filter, and office/department filter to find an account.',
            'Click Add User, fill in the required fields, then save.',
            'Copy the new credentials when the system shows them, and share them securely.',
            'Open Edit to update profile details or reset a password.',
            'Delete an account only when you are sure it should be removed.',
        ],
        tips: [
            'Student accounts need complete profile fields such as student ID, course, year level, and assigned office.',
            'Some accounts can only be changed by a Super Admin.',
            'Deleting a user is permanent, so double-check before confirming.',
        ],
    },
    {
        id: 'staff-offices',
        title: 'Offices',
        summary: 'View office assignments and manage the office list.',
        about:
            'Offices (Office Directory) shows each office with student and supervisor counts. Clicking an office opens a breakdown of who is assigned there. WSPO staff can add and edit offices. Super Admins can also delete an office that is not in use.',
        audience: ['WSPO Staff', 'Super Admin'],
        steps: [
            'Click Offices in the left menu.',
            'Search for an office by name.',
            'Click an office to see its supervisors, students, and related requests.',
            'WSPO staff and Super Admins can add a new office with a name and abbreviation.',
            'WSPO staff and Super Admins can edit an office inline, then save or cancel.',
            'Super Admins can delete an office only when it is not in use.',
        ],
        tips: [
            'WSPO staff can add and edit offices. Deleting an office stays with the Super Admin.',
            'Do not delete an office that still has users assigned.',
        ],
    },
    {
        id: 'staff-analytics',
        title: 'Reports & Analytics',
        summary: 'View program totals and export reports.',
        about:
            'Reports & Analytics shows system summary cards and department workload charts. Use it when you need a quick picture of program activity or when you need to export a report for meetings or records.',
        audience: ['WSPO Staff', 'Super Admin'],
        steps: [
            'Click Reports & Analytics in the left menu.',
            'Review the summary cards and department workload chart.',
            'Click Export CSV if you need a spreadsheet copy.',
            'Click Save PDF if you need a printable report.',
            'Reload the page if the charts fail to load.',
        ],
        tips: [
            'This page is for reporting only. It does not edit student records.',
            'If a number looks unusual, confirm it in Timesheets or Hours Rendered.',
        ],
    },
    {
        id: 'staff-hours-rendered',
        title: 'Hours Rendered',
        summary: 'Review monthly duty hours, rates, and activity records.',
        about:
            'Staff Hours Rendered shows monthly student hour totals, year-level breakdowns, activity details, and Extra Hours requests. Students may work 20 hours/week by default, up to 25 with a signed Extra Hours letter, and at most 100 hours/month. WSPO staff can manage activities and attendance corrections. Super Admins can review the board in read-only mode.',
        audience: ['WSPO Staff', 'Super Admin'],
        steps: [
            'Click Hours Rendered in the left menu.',
            'Pick the month you want to review.',
            'Check the hourly rate used for peso estimates. Only a Super Admin can change it.',
            'Review Extra Hours letters and approve or decline permission to work up to 25 hours/week for the covered period.',
            'Review the year-level breakdown and print a summary when needed.',
            'Expand activity rows to inspect details.',
            'When your role allows it, mark attendance, correct times, remove an activity, or mark unmarked students absent.',
        ],
        tips: [
            'Super Admin access is read-only on this board, except the hourly rate.',
            'Only a Super Admin can change the hourly rate. Other roles see the saved rate.',
            'Activity tools may depend on your office permissions.',
            'Share hour reports only through approved channels.',
            'Adding activity hours that would push a student past weekly or monthly limits is blocked.',
        ],
    },
    {
        id: 'staff-audit',
        title: 'Audit Trail',
        summary: 'Check login history and important system actions.',
        about:
            'Audit Trail is a history log of important actions in the system, including authentication and admin activity. Use it when you need to investigate what happened, who did it, and when.',
        audience: ['WSPO Staff', 'Super Admin'],
        steps: [
            'Click Audit Trail in the left menu.',
            'Search by admin or account name if you know who to check.',
            'Filter by action category, such as authentication or other system actions.',
            'Open a log breakdown for more detail.',
            'Open any linked document if the log points to one.',
            'Use pagination to move through older records.',
        ],
        tips: [
            'Logs cannot be edited or deleted from this page.',
            'Treat audit information as private operational data.',
        ],
    },
    {
        id: 'staff-settings',
        title: 'Profile Settings',
        summary: 'Update your name, phone number, photo, or password.',
        about:
            'Profile Settings is your personal account page as a staff user. Unlike the student settings page, you can usually edit your name and phone number here, plus your photo and password.',
        audience: ['Supervisor', 'WSPO Staff', 'Super Admin'],
        steps: [
            'Click Profile Settings in the left menu, or click your photo at the top right.',
            'Update your name or phone number.',
            'Upload, crop, or remove your profile photo.',
            'Leave the password fields blank if you do not want to change your password.',
            'To change your password, enter your current password, then enter the new password twice.',
            'Click Save Profile and wait for the success message.',
        ],
        tips: [
            'Saving profile details and changing your password can be done on the same page.',
            'If save fails, check that required fields are filled and try again.',
        ],
    },
    {
        id: 'shared-password',
        title: 'Password & first login',
        summary: 'How to sign in safely and reset your password.',
        about:
            'TechHRM may ask you to change your password the first time you sign in. This protects your account. You can also reset a forgotten password from the login page without needing someone to open the system for you.',
        audience: ['all'],
        steps: [
            'Sign in with the username and temporary password given to you.',
            'If the system asks for a new password, create one that only you know.',
            'Enter the new password carefully, then confirm it.',
            'After saving, continue into your Dashboard or the page you need.',
            'If you forget your password later, click Forgot Password on the login page and follow the email instructions.',
        ],
        tips: [
            'Never share your username or password with anyone.',
            'Choose a password you do not use on other websites.',
            'Sign out when you finish using a shared computer.',
        ],
    },
];

function matchesAudience(topic: HelpTopic, role: string): boolean {
    if (topic.audience.includes('all')) return true;
    if (role === 'Super Admin') {
        return (
            topic.audience.includes('Super Admin') ||
            topic.audience.includes('WSPO Staff') ||
            topic.audience.includes('Supervisor')
        );
    }
    if (role === 'WSPO Staff') {
        return topic.audience.includes('WSPO Staff') || topic.audience.includes('Supervisor');
    }
    return topic.audience.includes(role as HelpAudience);
}

interface HelpPageProps {
    userRole?: string | null;
}

const HelpPage = ({ userRole }: HelpPageProps) => {
    const role = userRole || localStorage.getItem('user_role') || 'Student';
    const reduceMotion = useReducedMotion();
    const [query, setQuery] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);

    const topics = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return HELP_TOPICS.filter((topic) => {
            if (!matchesAudience(topic, role)) return false;
            if (!normalized) return true;
            const haystack = [
                topic.title,
                topic.summary,
                topic.about,
                ...topic.steps,
                ...(topic.tips ?? []),
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalized);
        });
    }, [query, role]);

    return (
        <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-8">
            <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35 }}
            >
                <div className="mb-2 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium text-slate-500">Guides</span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Help</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                    Learn what each feature does and how to use it
                    {role ? ` as a ${role}` : ''}. Click a topic to open the full guide.
                </p>
            </motion.div>

            <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search help…"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
            </div>

            <div className="space-y-3">
                {topics.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
                        <CircleHelp className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-3 text-sm font-semibold text-slate-700">No topics found</p>
                        <p className="mt-1 text-sm text-slate-500">Try another word, like “schedule”, “QR”, or “password”.</p>
                    </div>
                ) : (
                    topics.map((topic, index) => {
                        const isOpen = openId === topic.id;
                        return (
                            <motion.div
                                key={topic.id}
                                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.03, 0.24), duration: reduceMotion ? 0 : 0.3 }}
                                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                            >
                                <button
                                    type="button"
                                    onClick={() => setOpenId(isOpen ? null : topic.id)}
                                    className="flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-slate-50/80"
                                    aria-expanded={isOpen}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-base font-semibold text-slate-900">{topic.title}</p>
                                        <p className="mt-1 text-sm text-slate-500">{topic.summary}</p>
                                    </div>
                                    <ChevronDown
                                        className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                <AnimatePresence initial={false}>
                                    {isOpen && (
                                        <motion.div
                                            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                            transition={{ duration: reduceMotion ? 0 : 0.22 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="space-y-5 border-t border-slate-100 px-5 py-5">
                                                <section>
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">What this is</p>
                                                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{topic.about}</p>
                                                </section>

                                                <section>
                                                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                                                        <ListOrdered className="h-3.5 w-3.5" />
                                                        How to use it
                                                    </p>
                                                    <ol className="mt-3 space-y-3">
                                                        {topic.steps.map((step, stepIndex) => (
                                                            <li key={stepIndex} className="flex gap-3 text-sm leading-relaxed text-slate-600">
                                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                                                                    {stepIndex + 1}
                                                                </span>
                                                                <span className="pt-0.5">{step}</span>
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </section>

                                                {topic.tips && topic.tips.length > 0 && (
                                                    <section className="rounded-xl bg-amber-50/80 px-4 py-3">
                                                        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700/80">
                                                            <Lightbulb className="h-3.5 w-3.5" />
                                                            Good to know
                                                        </p>
                                                        <ul className="mt-2 space-y-2">
                                                            {topic.tips.map((tip, tipIndex) => (
                                                                <li key={tipIndex} className="flex gap-2 text-sm leading-relaxed text-amber-950/80">
                                                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/70" />
                                                                    <span>{tip}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </section>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default HelpPage;
