<?php

namespace Tests\Unit;

use App\Models\RenderedHourEvent;
use App\Support\AssignmentLabel;
use Tests\TestCase;

class AssignmentAndMeetingPointsTest extends TestCase
{
    public function test_assignment_uses_the_acronym_then_the_specific_area(): void
    {
        $this->assertSame(
            'CCS - Laboratory',
            AssignmentLabel::format('College of Computer Studies', 'Laboratory')
        );
        $this->assertSame(
            'CCS - Laboratory',
            AssignmentLabel::format('College of Computer Studies (CCS)', 'Laboratory')
        );
        $this->assertSame(
            'Director of Libraries',
            AssignmentLabel::format('Director of Libraries', null)
        );
    }

    public function test_group_attendance_awards_meeting_hours_only_when_on_time(): void
    {
        $assembly = new RenderedHourEvent([
            'kind' => RenderedHourEvent::ASSEMBLY,
            'hours' => 5,
        ]);
        $devotional = new RenderedHourEvent([
            'kind' => RenderedHourEvent::DEVOTIONAL,
            'hours' => 1,
        ]);

        $this->assertSame(5.0, $assembly->deltaFor('on_time'));
        $this->assertSame(0.0, $assembly->deltaFor('late'));
        $this->assertSame(0.0, $assembly->deltaFor('absent'));
        $this->assertSame(1.0, $devotional->deltaFor('on_time'));
        $this->assertSame(0.0, $devotional->deltaFor('absent'));
    }
}
