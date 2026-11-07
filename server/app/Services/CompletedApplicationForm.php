<?php

namespace App\Services;

use App\Models\Application;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Carbon;

/**
 * Printable FCU-EOMS-WP-012 packet: the personal information sheet and the parents consent.
 * Layout follows the official forms the applicant prints on long coupon.
 */
class CompletedApplicationForm
{
    public function pdf(Application $application): string
    {
        $options = new Options;
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'DejaVu Serif');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml($this->html($application));
        $dompdf->setPaper([0, 0, 612, 936], 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    public function filename(Application $application): string
    {
        $code = preg_replace('/[^A-Za-z0-9\-]/', '', (string) $application->tracking_code) ?: 'application';

        return $code.'-completed-forms.pdf';
    }

    public function html(Application $application): string
    {
        $details = is_array($application->form_details) ? $application->form_details : [];
        $name = $this->sheetName($application);
        $child = trim((string) ($details['consent_child_name'] ?? '')) ?: $name;

        return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
            .$this->css()
            .'</style></head><body>'
            .$this->informationSheet($application, $details, $name)
            .'<div class="break"></div>'
            .$this->parentsConsent($child)
            .'</body></html>';
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function informationSheet(Application $application, array $details, string $name): string
    {
        $conditions = is_array($details['medical_conditions'] ?? null) ? $details['medical_conditions'] : [];
        $degree = trim(implode(', ', array_filter([
            (string) ($details['degree_program'] ?? $application->course ?? ''),
            (string) ($details['year_level'] ?? $application->year_level ?? ''),
        ])));
        $sex = (string) ($details['sex'] ?? $application->gender ?? '');
        $address = (string) ($details['home_address'] ?? $application->address ?? '');
        $cell = (string) ($details['cell_number'] ?? $application->contact_number ?? '');
        $deceased = ($details['parent_status'] ?? '') === 'Deceased';
        $goodMoral = match ((string) ($details['will_pass_good_moral'] ?? '')) {
            'Yes' => ' Will pass.',
            'No' => ' Will not pass.',
            default => '',
        };
        $medicalNote = ! empty($details['medical_certificate_attached']) ? ' — attached' : '';

        return '<div class="form">'
            .$this->formHead(['PERSONAL INFORMATION', 'SHEET'])
            .'<p class="banner">INFORMATION SHEET</p>'
            .'<table class="intro"><tr>'
            .'<td class="intro-copy"><p>INSTRUCTIONS: Please read and understand all questions carefully before providing your responses. After doing so, accomplish this form accurately and neatly in your own handwriting. Kindly use ink and ensure that all entries are legible. For items with corresponding options, please indicate your answer by placing a check mark in the appropriate box.</p>'
            .'<p class="answer-all"><u>Answer all questions.</u> <span>A dash or a line is not an answer.</span></p></td>'
            .'<td class="photo">'.$this->photoHtml($details['photo'] ?? null).'</td>'
            .'</tr></table>'
            .$this->line([
                ['1. Name', $name, 'grow'],
                ['Religion', $this->religion($details), 'mid'],
            ])
            .'<p class="hint">(Last name &nbsp;&nbsp;&nbsp; First name &nbsp;&nbsp;&nbsp; Middle Name.)</p>'
            .$this->line([
                ['Age', (string) ($application->age ?? ''), 'short'],
                ['Sex', $sex, 'short'],
                ['Civil Status', (string) ($details['civil_status'] ?? ''), 'grow'],
                ['Cel. no.', $cell, 'mid'],
            ], true)
            .$this->line([['Home Address', $address, 'grow']], true)
            .$this->line([
                ['Tel no.', (string) ($details['tel_number'] ?? ''), 'mid'],
                ['Date of Birth', $this->displayDate((string) ($details['date_of_birth'] ?? '')), 'grow'],
                ['Place of Birth', (string) ($details['place_of_birth'] ?? ''), 'grow'],
            ], true)
            .$this->line([
                ['Height', (string) ($details['height'] ?? ''), 'short'],
                ['Weight', (string) ($details['weight'] ?? ''), 'short'],
            ], true)
            .$this->parentLine($details)
            .$this->line([['Tel No.', (string) ($details['parent_tel'] ?? ''), 'mid']], true)
            .$this->jobs((string) ($details['parent_occupation'] ?? ''), (string) ($details['parent_occupation_other'] ?? ''))
            .$this->line([['Approximate Monthly Income', $this->pesos((string) ($details['parent_income'] ?? '')), 'mid']])
            .$this->line([['Name of Guardian (if parents are deceased)', (string) ($details['guardian_name'] ?? ''), 'grow']], false, '4px')
            .$this->line([['Tel No.', (string) ($details['guardian_tel'] ?? ''), 'mid']], true)
            .$this->jobs(
                $deceased ? (string) ($details['guardian_occupation'] ?? '') : '',
                (string) ($details['guardian_occupation_other'] ?? '')
            )
            .$this->line([['Approximate Monthly Income', $deceased ? $this->pesos((string) ($details['guardian_income'] ?? '')) : '', 'mid']])
            .'<p class="q">3. Do you have any brother or sister employed as a work student at FCU?</p>'
            .$this->line([['', $this->employedSiblings($details), 'grow']], true)
            .'<p class="q">4. Name of all brother(s) / sister(s)</p>'
            .$this->siblingTable($details)
            .'<p class="q">5. State your special or technical qualification for work (typing, computer, lettering, etc.)</p>'
            .$this->line([['', (string) ($details['technical_qualification'] ?? ''), 'grow']], true)
            .'<p class="q">State any work experience outside of the university</p>'
            .$this->line([['', (string) ($details['work_experience'] ?? ''), 'grow']], true)
            .'<p class="q">6. School last attended</p>'
            .$this->line([['', (string) ($details['school_last_attended'] ?? ''), 'grow']], true)
            .$this->line([['Address of the school last attended', (string) ($details['school_address'] ?? ''), 'grow']], true)
            .$this->line([['Degree and program you plan to pursue at FCU', $degree, 'grow']], true)
            .'<table class="split"><tr><td>'
            .'<p class="q">7. Do you have any active scholarship</p>'
            .'<p class="stack">'.$this->tick(($details['has_scholarship'] ?? '') === 'Yes').' Yes</p>'
            .'<p class="stack">'.$this->tick(($details['has_scholarship'] ?? '') === 'No').' No</p>'
            .$this->line([['If Yes please specify:', ($details['has_scholarship'] ?? '') === 'Yes' ? (string) ($details['scholarship_details'] ?? '') : '', 'grow']])
            .'</td><td>'
            .'<p class="q">8. Are you a member of 4Ps</p>'
            .'<p class="stack">'.$this->tick(($details['is_4ps'] ?? '') === 'Yes').' Yes</p>'
            .'<p class="stack">'.$this->tick(($details['is_4ps'] ?? '') === 'No').' No</p>'
            .'</td></tr></table>'
            .'<p class="q">9. Do you have any medical conditions</p>'
            .$this->medical($conditions, (string) ($details['medical_other'] ?? ''))
            .'<p class="q">10. Submit the following <strong>requirements</strong> together with this application:</p>'
            .'<ol class="req" type="a">'
            .'<li>Application letter address<div class="addr">address to <strong>MR. N-GEY C. FRANCO</strong><br>WSP Coordinator<br>Filamer Christian University, Inc.</div></li>'
            .'<li>Certificate of Good Moral Character from the Principal or Guidance Counselor.'.$this->e($goodMoral).'</li>'
            .'<li>Copy of report card or copy of grades</li>'
            .'<li>Copy of Birth Certificate</li>'
            .'<li>Medical Certificate'.$this->e($medicalNote).'</li>'
            .'<li>2 X 2 I.D. Picture</li>'
            .'<li>Copy of Certificate of Indigency</li>'
            .'<li>Long white folder with fastener</li>'
            .'</ol>'
            .'<p class="q">11. Signature of Parents/Guardian</p>'
            .'<table class="signs"><tr>'
            .'<td><div class="gap"></div><div class="sign"></div><div class="cap">Father’s Name &amp; Signature</div></td>'
            .'<td><div class="gap"></div><div class="sign"></div><div class="cap">Mother’s Name &amp; Signature</div></td>'
            .'<td><div class="gap"></div><div class="sign"></div><div class="cap">Guardian’s Name &amp; Signature<div class="note">(if parents are deceased)</div></div></td>'
            .'</tr></table>'
            .'<p class="cert">I hereby certify that all the foregoing information is true and correct and shall hold myself liable for any falsehood or misrepresentation in so far as my application for Work Study Program at Filamer Christian University, Inc. is concerned.</p>'
            .'<table class="pair"><tr>'
            .'<td><div class="gap"></div><div class="sign"></div><div class="cap">Date</div></td>'
            .'<td><div class="gap"></div><div class="sign"></div><div class="cap">Signature of applicant</div></td>'
            .'</tr></table>'
            .'<p class="important">IMPORTANT: NON-COMPLETION of the requirements for this application may serve as sufficient grounds for rejecting your application.</p>'
            .'<div class="cut"></div>'
            .'</div>';
    }

    private function parentsConsent(string $child): string
    {
        return '<div class="form">'
            .$this->formHead(['PARENTS CONSENT'])
            .'<p class="consent-title">PARENTS CONSENT</p>'
            .'<p class="consent-sub">FORM FOR PARENTS (GUARDIAN’S) PERMISSION AND AGREEMENT</p>'
            .'<p class="date-right">Date '.$this->inlineRule('', '160px').'</p>'
            .'<p class="letter"><strong>TO WHOM IT MAY CONCERN:</strong></p>'
            .'<p class="letter">I hereby give my permission for my son/daughter, '.$this->inlineRule($child, '220px').', to join and be a member of the Work Study Program Organization of the Filamer Christian University, Inc.</p>'
            .'<p class="letter">I also allow him/her to render duty hours during his/her vacant time, in accordance with the guidelines and schedule set by the Program.</p>'
            .'<p class="letter">Thank you.</p>'
            .'<table class="consent-signs"><tr>'
            .'<td><div class="date-line"></div><div class="cap">(Date)</div></td>'
            .'<td><div class="signed">SIGNED: <span class="signed-line"></span></div><div class="cap under">Name &amp; Signature of Parent or Guardian</div></td>'
            .'</tr></table>'
            .'<p class="foot">* To be signed by parents / guardians of minors and those aged 21 years-up if they are still under their parents’ or guardians’ care and support.</p>'
            .'</div>';
    }

    /**
     * @param  list<string>  $nameLines
     */
    private function formHead(array $nameLines): string
    {
        $name = '';
        foreach ($nameLines as $index => $line) {
            if ($index > 0) {
                $name .= '<br>';
            }
            $name .= $this->e($line);
        }
        $seal = $this->seal();
        $sealHtml = $seal === ''
            ? ''
            : '<img src="'.$seal.'" alt="Filamer Christian University seal">';

        return '<table class="head"><tr>'
            .'<td class="seal" rowspan="4">'.$sealHtml.'</td>'
            .'<td class="univ" colspan="4"><strong>FILAMER CHRISTIAN UNIVERSITY, INC.</strong><br>Roxas Avenue, Roxas City, Capiz, Philippines 5800</td>'
            .'</tr><tr>'
            .'<td class="label">Form Name:</td>'
            .'<td class="sheet"><strong>'.$name.'</strong></td>'
            .'<td class="office" rowspan="2" colspan="2"><div>Effectivity:<br>November 24, 2025</div><div class="office-gap">Issuing Office:<br>WORK STUDY PROGRAM OFFICE</div></td>'
            .'</tr><tr>'
            .'<td class="label">Form No:<br>FCU-EOMS-WP-012</td>'
            .'<td class="sheet"><strong>EDUCATIONAL ORGANIZATION<br>MANAGEMENT SYSTEM</strong></td>'
            .'</tr><tr>'
            .'<td class="label">Revision No. 1</td>'
            .'<td class="sheet"><strong>ISO 21001:2025</strong></td>'
            .'<td class="page-no">Page No.</td>'
            .'<td class="page-no">1 of 1</td>'
            .'</tr></table>';
    }

    /**
     * @param  list<array{0: string, 1: string, 2: string}>  $fields
     */
    private function line(array $fields, bool $indent = false, string $spaceBefore = '0'): string
    {
        $cells = '';
        foreach ($fields as [$label, $value, $width]) {
            $labelHtml = $label === '' ? '' : '<td class="lab">'.$this->e($label).'</td>';
            $cells .= $labelHtml.'<td class="val '.$width.'">'.$this->e($value).'&nbsp;</td>';
        }
        $class = $indent ? 'fields indent' : 'fields';
        $style = $spaceBefore === '0' ? '' : ' style="margin-top:'.$spaceBefore.'"';

        return '<table class="'.$class.'"'.$style.'><tr>'.$cells.'</tr></table>';
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function parentLine(array $details): string
    {
        return '<table class="fields" style="margin-top:4px"><tr>'
            .'<td class="lab">2. Name of Father/ Mother</td>'
            .'<td class="val grow">'.$this->e((string) ($details['parent_name'] ?? '')).'&nbsp;</td>'
            .'<td class="checks">'.$this->tick(($details['parent_status'] ?? '') === 'Living').' Living &nbsp; '.$this->tick(($details['parent_status'] ?? '') === 'Deceased').' Deceased</td>'
            .'</tr></table>';
    }

    private function jobs(string $selected, string $other): string
    {
        $labels = ['Farmer', 'Fisherman', 'Retired', 'Private Employee', 'Unemployed', 'Others'];
        $cells = [];
        foreach ($labels as $label) {
            if ($label === 'Others') {
                $cells[] = '<td>'.$this->tick($selected === 'Others').' Others: <span class="rule">'.$this->e($selected === 'Others' ? $other : '').'&nbsp;</span></td>';
            } else {
                $cells[] = '<td>'.$this->tick($selected === $label).' '.$this->e($label).'</td>';
            }
        }

        return '<p class="occ">Occupation:</p><table class="jobs"><tr>'.$cells[0].$cells[1].$cells[2].'</tr><tr>'.$cells[3].$cells[4].$cells[5].'</tr></table>';
    }

    /**
     * @param  array<string, mixed>  $details
     */
    private function siblingTable(array $details): string
    {
        if (($details['has_non_working_siblings'] ?? '') === 'No') {
            $rows = [['name' => 'None', 'age' => '', 'school_or_work' => '']];
        } else {
            $rows = [];
            foreach (is_array($details['siblings'] ?? null) ? $details['siblings'] : [] as $row) {
                if (! is_array($row) || trim((string) ($row['name'] ?? '')) === '') {
                    continue;
                }
                $rows[] = [
                    'name' => (string) $row['name'],
                    'age' => (string) ($row['age'] ?? ''),
                    'school_or_work' => (string) ($row['school_or_work'] ?? ''),
                ];
            }
        }
        $body = '';
        for ($index = 0; $index < 5; $index++) {
            $row = $rows[$index] ?? ['name' => '', 'age' => '', 'school_or_work' => ''];
            $body .= '<tr><td>'.$this->e($row['name']).'&nbsp;</td><td class="age">'.$this->e($row['age']).'&nbsp;</td><td>'.$this->e($row['school_or_work']).'&nbsp;</td></tr>';
        }

        return '<table class="sib"><tr>'
            .'<th class="name">Name of all brother(s) / sister(s)</th><th>Age</th><th class="work">School where they are studying/Place of Work</th>'
            .'</tr>'.$body.'</table>';
    }

    /**
     * @param  list<mixed>  $conditions
     */
    private function medical(array $conditions, string $other): string
    {
        $has = function (string $label) use ($conditions): bool {
            foreach ($conditions as $condition) {
                if ((string) $condition === $label) {
                    return true;
                }
            }

            return false;
        };

        return '<table class="med"><tr><td>'
            .'<p>'.$this->tick($has('None')).' None</p>'
            .'<p>'.$this->tick($has('Allergies')).' Allergies</p>'
            .'<p>'.$this->tick($has('Hypertension')).' Hypertension</p>'
            .'<p>'.$this->tick($has('Asthma')).' Asthma</p>'
            .'<p>'.$this->tick($has('Mental Health Condition')).' Mental Health Condition</p>'
            .'</td><td>'
            .'<p>'.$this->tick($has('Visual Impairment')).' Visual Impairment</p>'
            .'<p>'.$this->tick($has('Others')).' Others (please specify): <span class="rule">'.$this->e($has('Others') ? $other : '').'&nbsp;</span></p>'
            .'</td></tr></table>';
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

    private function tick(bool $on): string
    {
        return '<table class="box"><tr><td>'.($on ? '&#10003;' : '&nbsp;').'</td></tr></table>';
    }

    private function inlineRule(string $value, string $width): string
    {
        return '<span class="rule" style="width:'.$width.'">'.$this->e($value).'&nbsp;</span>';
    }

    private function photoHtml(mixed $value): string
    {
        $photo = $this->photo($value);
        if ($photo === '') {
            return '2 x 2 Picture';
        }

        return '<img src="'.$photo.'" alt="2 x 2 picture">';
    }

    private function seal(): string
    {
        $path = dirname(base_path()).'/client/public/fcu-seal.jpg';
        if (! is_file($path)) {
            return '';
        }
        $bytes = file_get_contents($path);
        if ($bytes === false || $bytes === '') {
            return '';
        }

        return 'data:image/jpeg;base64,'.base64_encode($bytes);
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

    private function displayDate(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        try {
            return Carbon::parse($value)->format('F j, Y');
        } catch (\Throwable) {
            return $value;
        }
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

    private function pesos(string $amount): string
    {
        $digits = preg_replace('/\D/', '', trim($amount)) ?? '';

        return $digits === '' ? '' : '₱'.number_format((int) $digits);
    }

    private function religion(array $details): string
    {
        $religion = trim((string) ($details['religion'] ?? ''));
        $other = trim((string) ($details['religion_other'] ?? ''));
        if ($religion === 'Others' && $other !== '') {
            return $other;
        }

        return $religion;
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }

    private function css(): string
    {
        return <<<'CSS'
            @page { size: 8.5in 13in; margin: 0.26in 0.34in; }
            body { font-family: "DejaVu Serif", serif; font-size: 12px; color: #000; line-height: 1.25; }
            .break { page-break-before: always; }
            table { border-collapse: collapse; }
            .head { width: 100%; margin-bottom: 6px; }
            .head td { border: 1px solid #000; padding: 1px 4px; vertical-align: middle; }
            .seal { width: 58px; text-align: center; }
            .seal img { width: 48px; height: 48px; }
            .univ { text-align: center; font-size: 13px; line-height: 1.25; }
            .univ strong { font-size: 14px; }
            .sheet { text-align: center; font-size: 12px; line-height: 1.2; }
            .label { width: 22%; font-size: 12px; }
            .office { width: 28%; font-size: 11px; line-height: 1.25; }
            .office-gap { margin-top: 6px; }
            .page-no { text-align: center; white-space: nowrap; width: 1%; font-size: 12px; }
            .banner { text-align: center; font-style: italic; font-size: 13px; margin: 4px 0; }
            .intro { width: 100%; margin-bottom: 6px; }
            .intro td { vertical-align: top; }
            .intro-copy { padding-right: 10px; }
            .intro p { margin: 0 0 2px; text-align: justify; }
            .answer-all { font-weight: bold; margin-top: 2px; }
            .answer-all span { font-weight: normal; }
            .photo { width: 2in; height: 2in; border: 1px solid #000; text-align: center; vertical-align: middle; font-size: 12px; }
            .photo img { width: 2in; height: 2in; }
            .fields { width: 100%; margin: 0; }
            .fields td { vertical-align: bottom; padding: 0 2px; }
            .indent td.lab:first-child { padding-left: 14px; }
            .lab { white-space: nowrap; width: 1%; }
            .val { border-bottom: 1px solid #000; }
            .short { width: 12%; }
            .mid { width: 22%; }
            .grow { width: auto; }
            .checks { white-space: nowrap; width: 1%; padding-left: 8px; }
            .hint { margin: 0 0 1px 48px; font-size: 11px; font-style: italic; }
            .occ { margin: 1px 0 0; }
            .jobs { width: 98%; margin: 0 0 1px 8px; }
            .jobs td { width: 33%; padding: 0 3px; }
            .q { margin: 2px 0 0; }
            .sib { width: 100%; margin: 1px 0 1px; }
            .sib th, .sib td { border-bottom: 1px solid #000; height: 14px; padding: 0 3px; font-weight: normal; line-height: 1.15; }
            .sib th { text-align: center; font-size: 12px; }
            .sib th.name, .sib td:first-child { width: 46%; text-align: left; }
            .sib th.work { text-align: left; }
            .sib td.age { width: 12%; text-align: center; }
            .split { width: 100%; margin-top: 2px; }
            .split td { width: 50%; vertical-align: top; }
            .stack { margin: 1px 0; }
            .box { display: inline-table; vertical-align: middle; border-collapse: collapse; margin-right: 3px; }
            .box td { width: 14px; height: 14px; border: 1px solid #000; text-align: center; font-family: DejaVu Sans, sans-serif; font-size: 12px; line-height: 12px; padding: 0; }
            .rule { display: inline-block; border-bottom: 1px solid #000; min-height: 12px; }
            .med { width: 98%; border: 1px solid #000; margin: 2px 0 2px 8px; }
            .med td { width: 50%; vertical-align: top; padding: 1px 6px; }
            .med p { margin: 0; }
            .req { margin: 1px 0 2px 22px; padding: 0; }
            .req li { margin: 0; }
            .addr { margin-left: 16px; }
            .signs { width: 100%; margin-top: 10px; }
            .signs td { width: 33%; text-align: center; vertical-align: top; }
            .gap { height: 28px; }
            .sign { border-top: 1px solid #000; margin: 0 8px; }
            .cap { font-size: 12px; margin-top: 2px; }
            .note { font-size: 11px; font-style: italic; }
            .cert { margin: 2px 0; text-align: justify; }
            .pair { width: 80%; margin: 2px auto 0; }
            .pair td { width: 50%; text-align: center; }
            .important { font-weight: bold; margin: 2px 0 0; font-size: 12px; }
            .cut { border-top: 1px dashed #000; margin-top: 2px; }
            .consent-title { text-align: center; font-weight: bold; font-size: 14px; margin: 18px 0 2px; }
            .consent-sub { text-align: center; margin: 0 0 18px; font-size: 12px; }
            .date-right { text-align: right; margin: 8px 0 16px; }
            .letter { margin: 10px 0; text-align: justify; line-height: 1.45; }
            .consent-signs { width: 100%; margin-top: 48px; }
            .consent-signs td { vertical-align: bottom; text-align: center; }
            .consent-signs td:first-child { width: 38%; }
            .date-line { width: 70%; margin: 0 auto; border-bottom: 1px solid #000; height: 28px; }
            .signed { text-align: left; }
            .signed-line { display: inline-block; width: 220px; border-bottom: 1px solid #000; height: 28px; }
            .under { margin-left: 58px; text-align: left; }
            .foot { margin-top: 48px; font-size: 12px; font-weight: bold; }
        CSS;
    }
}
