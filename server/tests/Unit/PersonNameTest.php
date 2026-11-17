<?php

namespace Tests\Unit;

use App\Support\PersonName;
use Tests\TestCase;

class PersonNameTest extends TestCase
{
    public function test_display_name_keeps_multi_word_surnames_and_real_middle_initial(): void
    {
        $this->assertSame('M.', PersonName::middleInitial('Marie'));
        $this->assertSame('M.', PersonName::middleInitial('m'));
        $this->assertSame('M.', PersonName::middleInitial('M.'));
        $this->assertSame('Quia M. De Felipe', PersonName::displayName('Quia', 'M', 'De Felipe'));
        $this->assertSame('Quia De Felipe', PersonName::displayName('Quia', null, 'De Felipe'));
        $this->assertSame('Mr. Juan C. De la Cruz', PersonName::displayName('Juan', 'Carlos', 'De la Cruz', 'Mr'));
    }

    public function test_parse_keeps_surname_particles_with_the_last_name(): void
    {
        $this->assertSame([
            'prefix' => '',
            'first_name' => 'Quia',
            'middle_initial' => 'M.',
            'last_name' => 'De Felipe',
        ], PersonName::parse('Quia M. De Felipe'));

        $this->assertSame([
            'prefix' => '',
            'first_name' => 'Quia',
            'middle_initial' => '',
            'last_name' => 'De Felipe',
        ], PersonName::parse('Quia De Felipe'));

        $this->assertSame([
            'prefix' => 'Ms.',
            'first_name' => 'Ana',
            'middle_initial' => '',
            'last_name' => 'Del Rosario',
        ], PersonName::parse('Ms. Ana Del Rosario'));

        $this->assertSame([
            'prefix' => '',
            'first_name' => 'Juan',
            'middle_initial' => 'C.',
            'last_name' => 'De la Cruz',
        ], PersonName::parse('Juan Carlos De la Cruz'));

        $this->assertSame([
            'prefix' => '',
            'first_name' => 'Maria',
            'middle_initial' => '',
            'last_name' => 'Dela Cruz',
        ], PersonName::parse('Maria Dela Cruz'));

        $this->assertSame([
            'prefix' => '',
            'first_name' => 'Pieter',
            'middle_initial' => '',
            'last_name' => 'Van Der Berg',
        ], PersonName::parse('Pieter Van Der Berg'));
    }
}
