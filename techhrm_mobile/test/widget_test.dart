import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:techhrm_mobile/core/theme_controller.dart';
import 'package:techhrm_mobile/features/auth/auth_provider.dart';
import 'package:techhrm_mobile/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Sign-in screen is the signed-out home', (WidgetTester tester) async {
    const channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async => null);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => ThemeController()),
          ChangeNotifierProvider(create: (_) => AuthProvider()),
        ],
        child: const TechHRMApp(),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('TechHRM'), findsWidgets);
    expect(find.text('Sign In to Dashboard'), findsOneWidget);
  });
}
