<?php

namespace App\Services;

use App\Models\Application;
use Dompdf\Dompdf;
use Dompdf\Options;

class CompletedApplicationForm
{
    public function pdf(Application $application): string
    {
        $options = new Options;
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'DejaVu Sans');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($this->html($application));
        $dompdf->setPaper('legal', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    public function filename(Application $application): string
    {
        $code = preg_replace('/[^A-Za-z0-9\-]/', '', (string) $application->tracking_code) ?: 'application';

        return $code.'-completed-forms.pdf';
    }

    private function html(Application $application): string
    {
        $details = is_array($application->form_details) ? $application->form_details : [];
        $name = $this->sheetName($application);
        $photo = $this->photo($details['photo'] ?? null);
        $siblings = $this->siblings($details);
        $conditions = is_array($details['medical_conditions'] ?? null) ? $details['medical_conditions'] : [];
        $employed = $this->employedSiblings($details);

        $rows = [
            'Tracking code' => (string) $application->tracking_code,
            'Email' => (string) $application->email,
            'Name' => $name,
            'Age' => (string) ($application->age ?? ''),
            'Sex' => (string) ($details['sex'] ?? ''),
            'Civil status' => (string) ($details['civil_status'] ?? ''),
            'Religion' => (string) ($details['religion'] ?? ''),
            'Cell number' => (string) ($details['cell_number'] ?? ''),
            'Home address' => (string) ($details['home_address'] ?? $application->address ?? ''),
            'Telephone' => (string) ($details['tel_number'] ?? ''),
            'Date of birth' => (string) ($details['date_of_birth'] ?? ''),
            'Place of birth' => (string) ($details['place_of_birth'] ?? ''),
            'Height' => (string) ($details['height'] ?? ''),
            'Weight' => (string) ($details['weight'] ?? ''),
            'Father / mother' => trim((string) ($details['parent_name'] ?? '').' '.($details['parent_status'] ?? '')),
            'Parent telephone' => (string) ($details['parent_tel'] ?? ''),
            'Parent occupation' => $this->occupation($details['parent_occupation'] ?? '', $details['parent_occupation_other'] ?? ''),
            'Parent monthly income' => (string) ($details['parent_income'] ?? ''),
            'Guardian' => (string) ($details['guardian_name'] ?? ''),
            'Guardian telephone' => (string) ($details['guardian_tel'] ?? ''),
            'Guardian occupation' => ($details['parent_status'] ?? '') === 'Deceased'
                ? $this->occupation($details['guardian_occupation'] ?? '', $details['guardian_occupation_other'] ?? '')
                : '',
            'Brother or sister employed as a work student at FCU' => $employed,
            'Technical qualification' => (string) ($details['technical_qualification'] ?? ''),
            'Work experience' => (string) ($details['work_experience'] ?? ''),
            'School last attended' => (string) ($details['school_last_attended'] ?? ''),
            'School address' => (string) ($details['school_address'] ?? ''),
            'Degree and year level' => trim(implode(', ', array_filter([
                (string) ($details['degree_program'] ?? $application->course ?? ''),
                (string) ($details['year_level'] ?? $application->year_level ?? ''),
            ]))),
            'Active scholarship' => ($details['has_scholarship'] ?? '') === 'Yes'
                ? 'Yes — '.(string) ($details['scholarship_details'] ?? '')
                : (string) ($details['has_scholarship'] ?? ''),
            'Member of 4Ps' => (string) ($details['is_4ps'] ?? ''),
            'Medical conditions' => $this->conditions($conditions, (string) ($details['medical_other'] ?? '')),
            'Certificate of good moral' => (string) ($details['will_pass_good_moral'] ?? ''),
            'Medical certificate' => ! empty($details['medical_certificate_attached']) ? 'Attached' : 'Not attached',
        ];

        $body = '';
        if ($photo !== '') {
            $body .= '<p><img src="'.$photo.'" alt="2 x 2 picture" style="width:140px;height:140px;object-fit:cover;border:1px solid #000;"></p>';
        }
        $body .= '<table>'.$this->tableRows($rows).'</table>';
        $body .= '<h2>Brothers and sisters</h2><table><tr><th>Name</th><th>Age</th><th>School or work</th></tr>';
        foreach ($siblings as $row) {
            $body .= '<tr><td>'.$this->e($row['name']).'</td><td>'.$this->e($row['age']).'</td><td>'.$this->e($row['school_or_work']).'</td></tr>';
        }
        $body .= '</table>';
        $body .= '<p>Signature lines for the father, mother or guardian, and the applicant are left blank. Sign them by hand on the printed copy.</p>';

        $child = trim((string) ($details['consent_child_name'] ?? '')) ?: $name;
        $consent = '<p>Date _______________</p>'
            .'<p><strong>TO WHOM IT MAY CONCERN:</strong></p>'
            .'<p>I hereby give my permission for my son/daughter, <strong>'.$this->e($child).'</strong>, to join and be a member of the Work Study Program Organization of Filamer Christian University, Inc.</p>'
            .'<p>I also allow him/her to render duty hours during his/her vacant time, in accordance with the guidelines and schedule set by the Program.</p>'
            .'<p>Thank you.</p>'
            .'<p>SIGNED: ________________________________<br>Name and signature of parent or guardian</p>'
            .'<p>Signature lines stay blank on this copy and are signed by hand after printing.</p>';

        return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
            .'body{font-family:DejaVu Sans,sans-serif;font-size:12px;color:#000;}'
            .'h1{font-size:16px;text-align:center;margin:0;}h2{font-size:13px;margin:16px 0 6px;}'
            .'p.meta,p.note{text-align:center;margin:2px 0 12px;}'
            .'table{width:100%;border-collapse:collapse;margin-top:8px;}td,th{border:1px solid #000;padding:4px 6px;vertical-align:top;}'
            .'td.label{width:38%;font-weight:bold;background:#f4f7ff;}'
            .'</style></head><body>'
            .'<h1>FILAMER CHRISTIAN UNIVERSITY</h1>'
            .'<p class="meta">FCU-EOMS-WP-012 · Personal Information Sheet</p>'
            .'<p class="note">Completed application form. Effectivity November 24, 2025.</p>'
            .$body
            .'<div style="page-break-before:always;"></div>'
            .'<h1>FILAMER CHRISTIAN UNIVERSITY</h1>'
            .'<p class="meta">FCU-EOMS-WP-012 · Parents Consent</p>'
            .'<h2>Form for parents (guardian’s) permission and agreement</h2>'
            .$consent
            .'</body></html>';
    }

    /**
     * @param  array<string, string>  $rows
     */
    private function tableRows(array $rows): string
    {
        $html = '';
        foreach ($rows as $label => $value) {
            $html .= '<tr><td class="label">'.$this->e($label).'</td><td>'.$this->e($value).'</td></tr>';
        }

        return $html;
    }

    /**
     * @param  array<string, mixed>  $details
     * @return list<array{name: string, age: string, school_or_work: string}>
     */
    private function siblings(array $details): array
    {
        if (($details['has_non_working_siblings'] ?? '') === 'No') {
            return [['name' => 'None', 'age' => '', 'school_or_work' => '']];
        }

        $rows = is_array($details['siblings'] ?? null) ? $details['siblings'] : [];
        $clean = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $clean[] = [
                'name' => $name,
                'age' => (string) ($row['age'] ?? ''),
                'school_or_work' => (string) ($row['school_or_work'] ?? ''),
            ];
        }

        return $clean === [] ? [['name' => '', 'age' => '', 'school_or_work' => '']] : $clean;
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function employedSiblings(array $details): string
    {
        if (($details['sibling_employed_at_fcu'] ?? '') !== 'Yes') {
            return (string) ($details['sibling_employed_at_fcu'] ?? '');
        }

        $names = [];
        foreach ($details['employed_siblings'] ?? [] as $row) {
            if (is_array($row) && trim((string) ($row['name'] ?? '')) !== '') {
                $names[] = trim((string) $row['name']);
            }
        }

        return 'Yes — '.count($names).($names === [] ? '' : ' — '.implode(', ', $names));
    }

    /**
     * @param  list<mixed>  $conditions
     */
    private function conditions(array $conditions, string $other): string
    {
        $labels = [];
        foreach ($conditions as $condition) {
            $label = trim((string) $condition);
            if ($label === '') {
                continue;
            }
            $labels[] = $label === 'Others' && $other !== '' ? 'Others: '.$other : $label;
        }

        return implode(', ', $labels);
    }

    private function occupation(string $selected, string $other): string
    {
        if ($selected === 'Others' && trim($other) !== '') {
            return 'Others: '.trim($other);
        }

        return $selected;
    }

    private function sheetName(Application $application): string
    {
        $given = trim(implode(' ', array_filter([
            trim((string) $application->first_name),
            trim((string) $application->middle_name),
        ])));

        return implode(', ', array_filter([
            trim((string) $application->last_name),
            $given,
        ]));
    }

    private function photo(mixed $value): string
    {
        if (! is_string($value) || ! str_starts_with($value, 'data:image/')) {
            return '';
        }
        if (strlen($value) > 500000) {
            return '';
        }
        if (! preg_match('#^data:image/(jpeg|jpg|png);base64,#i', $value)) {
            return '';
        }

        return $value;
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }
}
