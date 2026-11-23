<?php

namespace App\Http\Controllers;

use App\Services\ShiftClockReminder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class NotificationController extends Controller
{
    // Get all notifications for the logged-in user
    public function index(Request $request)
    {
        app(ShiftClockReminder::class)->dispatchIfDue();

        $notifications = $this->visibleNotifications($request)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($notifications);
    }

    // Mark a specific notification as read
    public function markAsRead(Request $request, $id)
    {
        $notification = $request->user()->notifications()->findOrFail($id);
        $notification->update(['is_read' => true]);

        return response()->json(['message' => 'Marked as read']);
    }

    public function markAllRead(Request $request)
    {
        $request->user()->notifications()->where('is_read', false)->update(['is_read' => true]);

        return response()->json(['message' => 'All notifications marked as read']);
    }

    public function destroy(Request $request, $id)
    {
        $notification = $request->user()->notifications()->findOrFail($id);
        $notification->delete();

        return response()->json(['message' => 'Notification deleted']);
    }

    public function clearAll(Request $request)
    {
        $request->user()->notifications()->delete();

        return response()->json(['message' => 'All notifications cleared']);
    }

    private function visibleNotifications(Request $request)
    {
        $query = $request->user()->notifications();

        if (Schema::hasColumn('notifications', 'bulletin_id') && Schema::hasTable('bulletins')) {
            $query->where(function ($rows) {
                $rows->whereNull('bulletin_id')
                    ->orWhereIn('bulletin_id', function ($active) {
                        $active->select('id')
                            ->from('bulletins')
                            ->where('expires_at', '>', now());
                    });
            });
        }

        return $query;
    }
}
