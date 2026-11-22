/**
 * Marks data tables so the mobile stylesheet can turn each row into a card.
 * Desktop layout is unchanged: the card rules live under max-width 767px.
 * Column roles come from the header text, so each table keeps a layout that
 * matches its own columns (name first, times intact, actions at the bottom).
 */

export type ColumnRole =
    | 'select'
    | 'actions'
    | 'primary'
    | 'lead'
    | 'day'
    | 'metric'
    | 'badge'
    | 'status'
    | 'detail'
    | 'field';

const PRIMARY = /^(student|student worker|student details|applicant|account details|name|administrator)$/i;
const ACTIONS = /^(actions?|verification actions?|approval status)$/i;
const DAY = /^day$/i;
const BADGE = /^(type|role & access|action type)$/i;
const STATUS = /^(status|method|outcome)$/i;
const DETAIL =
    /^(details|detail|duty|duty details|shift details|task description|description|document info|technical details|department details)$/i;
const METRIC =
    /^(time|time in|time out|timed in|logged in|logged out|hours|date|when|dtr|janitorial|deduction|special|daily cleaning|general meeting|grand total|period|verified hours|equivalent amount|age|students|supervisors|abbreviation|documents|log id)$/i;

export function normalizeHeader(label: string): string {
    return label.replace(/\s+/g, ' ').trim();
}

export function columnRole(label: string, options?: { hasCheckbox?: boolean }): ColumnRole {
    const text = normalizeHeader(label);
    if (options?.hasCheckbox && (text === '' || /^select\b/i.test(text))) return 'select';
    if (ACTIONS.test(text)) return 'actions';
    if (PRIMARY.test(text)) return 'primary';
    if (DAY.test(text)) return 'day';
    if (BADGE.test(text)) return 'badge';
    if (STATUS.test(text)) return 'status';
    if (DETAIL.test(text)) return 'detail';
    if (METRIC.test(text) || /₱|hours|hrs|\btotal\b|\bsum\b/i.test(text)) return 'metric';
    if (options?.hasCheckbox) return 'select';
    return 'field';
}

export function assignColumnRoles(headers: { label: string; hasCheckbox?: boolean }[]): ColumnRole[] {
    const roles = headers.map((header) => columnRole(header.label, header));
    if (!roles.some((role) => role === 'primary' || role === 'lead')) {
        const index = roles.findIndex((role) => role !== 'select' && role !== 'actions');
        if (index >= 0) roles[index] = 'lead';
    }
    return roles;
}

/** Short visible name for an icon-only row action. */
export function shortActionLabel(hint: string): string | null {
    const text = hint.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const folded = text.toLowerCase();
    if (folded.includes('reject') || folded.includes('decline')) return 'Reject';
    if (folded.includes('verify') || folded.includes('approv') || folded.includes('accept')) return 'Approve';
    if (folded.includes('view')) return 'View';
    if (folded.includes('edit') || folded.includes('update')) return 'Edit';
    if (folded.includes('delete') || folded.includes('remove')) return 'Delete';
    if (text.length <= 16) return text;
    return null;
}

export function actionTone(label: string): 'edit' | 'delete' | 'view' | 'approve' | 'reject' | 'neutral' {
    switch (label) {
        case 'Edit':
            return 'edit';
        case 'Delete':
            return 'delete';
        case 'View':
            return 'view';
        case 'Approve':
            return 'approve';
        case 'Reject':
            return 'reject';
        default:
            return 'neutral';
    }
}

function headerLabel(cell: HTMLTableCellElement): string {
    const copy = cell.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('input, button, svg').forEach((node) => node.remove());
    return normalizeHeader(copy.textContent || '');
}

function visibleControlText(control: HTMLElement): string {
    const copy = control.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('svg').forEach((node) => node.remove());
    return normalizeHeader(copy.textContent || '');
}

function setAttr(element: Element, name: string, value: string | null) {
    if (value === null) {
        if (element.hasAttribute(name)) element.removeAttribute(name);
        return;
    }
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function tagActionButtons(cell: HTMLTableCellElement) {
    cell.querySelectorAll('button, a').forEach((node) => {
        const control = node as HTMLElement;
        if (visibleControlText(control)) {
            setAttr(control, 'data-short-label', null);
            setAttr(control, 'data-action-tone', null);
            return;
        }
        const hint = control.getAttribute('aria-label') || control.getAttribute('title') || '';
        const label = shortActionLabel(hint);
        if (!label) return;
        setAttr(control, 'data-short-label', label);
        setAttr(control, 'data-action-tone', actionTone(label));
        if (!control.getAttribute('aria-label')) setAttr(control, 'aria-label', hint || label);
    });
}

function annotateTable(table: HTMLTableElement) {
    const headerRow = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!headerRow) return;

    const headers = Array.from(headerRow.cells);
    const labels = headers.map(headerLabel);
    const roles = assignColumnRoles(
        headers.map((cell, index) => ({
            label: labels[index],
            hasCheckbox: Boolean(cell.querySelector('input[type="checkbox"]')),
        })),
    );

    headers.forEach((cell, index) => {
        setAttr(cell, 'data-col', roles[index]);
        setAttr(cell, 'data-label', labels[index] || null);
    });

    Array.from(table.tBodies).forEach((body) => {
        Array.from(body.rows).forEach((row) => {
            const cells = Array.from(row.cells);
            if (cells.length === 1 && cells[0].colSpan > 1) {
                setAttr(cells[0], 'data-col', 'span');
                setAttr(cells[0], 'data-label', null);
                return;
            }

            cells.forEach((cell, index) => {
                const role = roles[index] || 'field';
                const label = labels[index] || '';
                const plain = normalizeHeader(cell.textContent || '');
                const idleAction = role === 'actions' && (plain === '' || plain === '—' || plain === '-') && !cell.querySelector('button, a, input');
                setAttr(cell, 'data-col', idleAction ? 'empty' : role);
                setAttr(cell, 'data-label', label || null);
                setAttr(cell, 'data-emphasis', /grand total|equivalent amount|^sum\b/i.test(label) ? 'true' : null);
                setAttr(
                    cell,
                    'data-keep-line',
                    /^(date|time|time in|time out|timed in|logged in|logged out|when|hours)$/i.test(label) ? 'true' : null,
                );
                if (role === 'actions') tagActionButtons(cell);
            });
        });
    });
}

export function annotateResponsiveTables(root: ParentNode = document) {
    root.querySelectorAll('table.app-data-table').forEach((table) => {
        if (table instanceof HTMLTableElement) annotateTable(table);
    });
}

function mutationTouchesDataTable(mutations: MutationRecord[]): boolean {
    return mutations.some((mutation) => {
        const target = mutation.target;
        if (target instanceof Element && target.closest('table.app-data-table')) return true;
        return Array.from(mutation.addedNodes).some((node) => {
            if (!(node instanceof Element)) return false;
            return node.matches('table.app-data-table') || Boolean(node.querySelector('table.app-data-table'));
        });
    });
}

export function startResponsiveTables() {
    if (typeof document === 'undefined') return;
    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
            queued = false;
            annotateResponsiveTables(document);
        });
    };

    const observer = new MutationObserver((mutations) => {
        if (mutationTouchesDataTable(mutations)) schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
}
