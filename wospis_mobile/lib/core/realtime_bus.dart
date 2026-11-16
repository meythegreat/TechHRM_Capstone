import 'package:flutter/foundation.dart';

/// Same-session refresh signal used by the web app's realtime event.
class RealtimeBus extends ChangeNotifier {
  void ping() => notifyListeners();
}
