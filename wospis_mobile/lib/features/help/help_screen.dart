import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';
import 'help_topics.dart';

class HelpScreen extends StatefulWidget {
  const HelpScreen({super.key});

  @override
  State<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends State<HelpScreen> {
  final _query = TextEditingController();
  String? _openId;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final role = context.watch<AuthProvider>().userRole ?? 'Student';
    final needle = _query.text.trim().toLowerCase();
    final topics = helpTopics.where((topic) {
      if (!helpTopicMatches(topic, role)) return false;
      if (needle.isEmpty) return true;
      final haystack = [topic.title, topic.summary, topic.about, ...topic.steps, ...topic.tips].join(' ').toLowerCase();
      return haystack.contains(needle);
    }).toList();
    return PageBody(
      children: [
        const SectionTitle('Help'),
        Text('Learn what each feature does and how to use it as a $role.'),
        const SizedBox(height: 12),
        TextField(
          controller: _query,
          decoration: const InputDecoration(labelText: 'Search help', prefixIcon: Icon(Icons.search)),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        if (topics.isEmpty) const EmptyNote('No topics found. Try schedule, QR, or password.'),
        for (final topic in topics)
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ExpansionTile(
              key: ValueKey('${topic.id}-$needle'),
              initiallyExpanded: _openId == topic.id,
              onExpansionChanged: (open) => setState(() => _openId = open ? topic.id : null),
              title: Text(topic.title, style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(topic.summary),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              children: [
                Align(alignment: Alignment.centerLeft, child: Text(topic.about, style: const TextStyle(height: 1.4))),
                const SizedBox(height: 12),
                const Align(alignment: Alignment.centerLeft, child: Text('How to use it', style: TextStyle(fontWeight: FontWeight.w800, color: kMuted))),
                const SizedBox(height: 6),
                for (var i = 0; i < topic.steps.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${i + 1}. ', style: const TextStyle(fontWeight: FontWeight.w800, color: kBlue)),
                        Expanded(child: Text(topic.steps[i], style: const TextStyle(height: 1.35))),
                      ],
                    ),
                  ),
                if (topic.tips.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Align(alignment: Alignment.centerLeft, child: Text('Good to know', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFB45309)))),
                  for (final tip in topic.tips)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Align(alignment: Alignment.centerLeft, child: Text('• $tip', style: const TextStyle(height: 1.35))),
                    ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}
