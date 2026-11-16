import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/json_util.dart';
import '../../core/photo_stamp.dart';
import '../../core/widgets/common.dart';
import '../auth/auth_provider.dart';

const _religions = [
  'Roman Catholic',
  'Iglesia ni Cristo',
  'Islam',
  'Protestant',
  'Baptist',
  'Born Again Christian',
  'Seventh-day Adventist',
  'Iglesia Filipina Independiente',
  "Jehovah's Witnesses",
  'Buddhism',
  'Others',
];
const _occupations = ['Farmer', 'Fisherman', 'Retired', 'Private Employee', 'Unemployed', 'Others'];
const _medical = ['None', 'Visual Impairment', 'Allergies', 'Hypertension', 'Asthma', 'Mental Health Condition', 'Others'];
const _documents = [
  ('application_letter', 'Application letter', true),
  ('report_card', 'Copy of report card or grades', true),
  ('birth_certificate', 'Copy of Birth Certificate', true),
  ('id_picture', '2 x 2 I.D. picture (JPG or PNG)', true),
  ('indigency', 'Copy of Certificate of Indigency', true),
  ('medical_certificate', 'Medical Certificate (optional)', false),
];

class ApplicationWizardScreen extends StatefulWidget {
  const ApplicationWizardScreen({super.key});

  @override
  State<ApplicationWizardScreen> createState() => _ApplicationWizardScreenState();
}

class _ApplicationWizardScreenState extends State<ApplicationWizardScreen> {
  final _fields = <String, TextEditingController>{};
  int _step = 0;
  String _sex = 'Male';
  String _civil = 'Single';
  String _religion = 'Roman Catholic';
  String _parentStatus = 'Living';
  String _parentJob = 'Farmer';
  String _guardianJob = 'Farmer';
  String _year = '1st Year';
  String _employed = 'No';
  String _otherSiblings = 'No';
  String _scholarship = 'No';
  String _goodMoral = 'Yes';
  String _fourPs = 'No';
  bool _folder = false;
  bool _signPrinted = false;
  final _conditions = <String>{'None'};
  String? _photoPath;
  final _files = <String, String>{};
  bool _busy = false;

  TextEditingController _box(String key) => _fields.putIfAbsent(key, TextEditingController.new);

  @override
  void dispose() {
    for (final controller in _fields.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Apply · step ${_step + 1} of 4')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(_stepTitle, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(_stepHint, style: const TextStyle(color: kMuted, height: 1.4)),
          const SizedBox(height: 16),
          ..._stepBody(),
          const SizedBox(height: 16),
          Row(children: [
            if (_step > 0) Expanded(child: OutlinedButton(onPressed: _busy ? null : () => setState(() => _step -= 1), child: const Text('Back'))),
            if (_step > 0) const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                onPressed: _busy ? null : (_step == 3 ? _submit : _next),
                child: Text(_busy ? 'Sending…' : (_step == 3 ? 'Submit application' : 'Continue')),
              ),
            ),
          ]),
        ],
      ),
    );
  }

  String get _stepTitle => const ['Personal information', 'Family', 'School and health', 'Photo and documents'][_step];
  String get _stepHint => const [
        'This becomes the official personal information sheet.',
        'Parents, guardian, and brothers or sisters.',
        'School history, work, scholarship, and medical notes.',
        'The 2 x 2 photo is placed on the sheet. Attach the five required files. Signature lines stay blank for the printed copy.',
      ][_step];

  List<Widget> _stepBody() {
    switch (_step) {
      case 0:
        return [
          _text('first_name', 'First name'),
          _text('middle_name', 'Middle name'),
          _text('last_name', 'Last name'),
          _text('email', 'Email', keyboard: TextInputType.emailAddress),
          _text('age', 'Age', keyboard: TextInputType.number),
          _choice('Sex', _sex, const ['Male', 'Female'], (value) => _sex = value),
          _choice('Civil status', _civil, const ['Single', 'Married', 'Widowed', 'Separated'], (value) => _civil = value),
          _choice('Religion', _religion, _religions, (value) => _religion = value),
          if (_religion == 'Others') _text('religion_other', 'Specify religion'),
          _text('address', 'Home address'),
          _text('cell', 'Cell number (digits only)', keyboard: TextInputType.phone),
          _text('tel', 'Telephone (optional)', keyboard: TextInputType.phone),
          _text('birth', 'Date of birth (YYYY-MM-DD)'),
          _text('birth_place', 'Place of birth'),
          _text('height', "Height (example 5'6)"),
          _text('weight', 'Weight in kg', keyboard: TextInputType.number),
        ];
      case 1:
        return [
          _text('parent_name', 'Father / mother name'),
          _choice('Parent status', _parentStatus, const ['Living', 'Deceased'], (value) => _parentStatus = value),
          _text('parent_tel', 'Parent phone', keyboard: TextInputType.phone),
          _choice('Parent occupation', _parentJob, _occupations, (value) => _parentJob = value),
          if (_parentJob == 'Others') _text('parent_job_other', 'Specify occupation'),
          _text('parent_income', 'Parent monthly income', keyboard: TextInputType.number),
          if (_parentStatus == 'Deceased') ...[
            _text('guardian_name', 'Guardian name'),
            _text('guardian_tel', 'Guardian phone', keyboard: TextInputType.phone),
            _choice('Guardian occupation', _guardianJob, _occupations, (value) => _guardianJob = value),
            _text('guardian_income', 'Guardian monthly income', keyboard: TextInputType.number),
          ],
          _choice('Brother or sister is a work student at FCU?', _employed, const ['Yes', 'No'], (value) => _employed = value),
          if (_employed == 'Yes') ...[
            _text('employed_count', 'How many', keyboard: TextInputType.number),
            _text('employed_names', 'Names, separated by commas'),
          ],
          _choice('Brothers or sisters who are not work students?', _otherSiblings, const ['Yes', 'No'], (value) => _otherSiblings = value),
          if (_otherSiblings == 'Yes') _text('sibling_rows', 'Name | age | school or work, one per line'),
        ];
      case 2:
        return [
          _text('school', 'School last attended'),
          _text('school_address', 'School address'),
          _text('course', 'Degree program'),
          _choice('Year level', _year, const ['1st Year', '2nd Year', '3rd Year', '4th Year'], (value) => _year = value),
          _text('technical', 'Technical qualification'),
          _text('work', 'Work experience'),
          _choice('Has a scholarship?', _scholarship, const ['Yes', 'No'], (value) => _scholarship = value),
          if (_scholarship == 'Yes') _text('scholarship', 'Scholarship details'),
          _choice('4Ps beneficiary?', _fourPs, const ['Yes', 'No'], (value) => _fourPs = value),
          _choice('Will pass Good Moral?', _goodMoral, const ['Yes', 'No'], (value) => _goodMoral = value),
          const Text('Medical conditions', style: TextStyle(fontWeight: FontWeight.w800)),
          for (final item in _medical)
            CheckboxListTile(
              value: _conditions.contains(item),
              title: Text(item),
              onChanged: (checked) => setState(() {
                if (item == 'None') {
                  _conditions
                    ..clear()
                    ..add('None');
                } else {
                  _conditions.remove('None');
                  if (checked == true) {
                    _conditions.add(item);
                  } else {
                    _conditions.remove(item);
                  }
                  if (_conditions.isEmpty) _conditions.add('None');
                }
              }),
            ),
          if (_conditions.contains('Others')) _text('medical_other', 'Specify the medical condition'),
        ];
      default:
        return [
          OutlinedButton.icon(
            onPressed: () async {
              final shot = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
              final file = shot ?? await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
              if (file == null) return;
              setState(() => _photoPath = file.path);
            },
            icon: const Icon(Icons.photo_camera_outlined),
            label: Text(_photoPath == null ? 'Take or choose the 2 x 2 photo' : 'Photo selected'),
          ),
          const SizedBox(height: 8),
          for (final doc in _documents)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(doc.$2),
              subtitle: Text(_files[doc.$1] == null ? (doc.$3 ? 'Required' : 'Optional') : 'Attached'),
              trailing: IconButton(
                icon: const Icon(Icons.attach_file),
                onPressed: () async {
                  final picked = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: doc.$1 == 'id_picture' ? ['jpg', 'jpeg', 'png'] : ['pdf', 'jpg', 'jpeg', 'png']);
                  final path = picked?.path;
                  if (path == null) return;
                  setState(() => _files[doc.$1] = path);
                },
              ),
            ),
          CheckboxListTile(
            value: _folder,
            title: const Text('I will submit a long white folder with fastener together with the printed forms.'),
            onChanged: (value) => setState(() => _folder = value ?? false),
          ),
          CheckboxListTile(
            value: _signPrinted,
            title: const Text('The signature lines will be filled in by hand on the printed copy.'),
            onChanged: (value) => setState(() => _signPrinted = value ?? false),
          ),
        ];
    }
  }

  Widget _text(String key, String label, {TextInputType? keyboard}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(controller: _box(key), decoration: InputDecoration(labelText: label), keyboardType: keyboard),
    );
  }

  Widget _choice(String label, String current, List<String> options, void Function(String) apply) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: DropdownButtonFormField<String>(
        initialValue: current,
        decoration: InputDecoration(labelText: label),
        items: options.map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
        onChanged: (value) => setState(() => apply(value ?? current)),
      ),
    );
  }

  void _next() {
    final error = _validateStep();
    if (error != null) {
      toast(context, error, error: true);
      return;
    }
    setState(() => _step += 1);
  }

  String? _validateStep() {
    String need(String key, String label) {
      if (_box(key).text.trim().isEmpty) return '$label is required.';
      return '';
    }

    if (_step == 0) {
      for (final pair in [('first_name', 'First name'), ('last_name', 'Last name'), ('email', 'Email'), ('age', 'Age'), ('address', 'Address'), ('cell', 'Cell number'), ('birth', 'Date of birth'), ('birth_place', 'Place of birth'), ('height', 'Height'), ('weight', 'Weight')]) {
        final message = need(pair.$1, pair.$2);
        if (message.isNotEmpty) return message;
      }
      if (!RegExp(r"^\d'\d{1,2}$").hasMatch(_box('height').text.trim())) return "Height must look like 5'6.";
      if (!RegExp(r'^\d{7,11}$').hasMatch(_box('cell').text.trim())) return 'Cell number must be 7 to 11 digits.';
    }
    if (_step == 1) {
      for (final pair in [('parent_name', 'Parent name'), ('parent_tel', 'Parent phone'), ('parent_income', 'Parent income')]) {
        final message = need(pair.$1, pair.$2);
        if (message.isNotEmpty) return message;
      }
      if (_parentStatus == 'Deceased') {
        for (final pair in [('guardian_name', 'Guardian name'), ('guardian_tel', 'Guardian phone'), ('guardian_income', 'Guardian income')]) {
          final message = need(pair.$1, pair.$2);
          if (message.isNotEmpty) return message;
        }
      }
    }
    if (_step == 2) {
      for (final pair in [('school', 'School'), ('school_address', 'School address'), ('course', 'Degree program'), ('technical', 'Technical qualification'), ('work', 'Work experience')]) {
        final message = need(pair.$1, pair.$2);
        if (message.isNotEmpty) return message;
      }
      if (_scholarship == 'Yes' && _box('scholarship').text.trim().isEmpty) return 'Specify the scholarship.';
      if (_conditions.contains('Others') && _box('medical_other').text.trim().isEmpty) return 'Specify the medical condition.';
    }
    return null;
  }

  Future<void> _submit() async {
    if (_photoPath == null) {
      toast(context, 'Add the 2 x 2 photo.', error: true);
      return;
    }
    for (final doc in _documents.where((row) => row.$3)) {
      if (_files[doc.$1] == null) {
        toast(context, 'Attach ${doc.$2}.', error: true);
        return;
      }
    }
    if (!_folder || !_signPrinted) {
      toast(context, 'Confirm the folder and the hand-signed printed copy.', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final photoBytes = await File(_photoPath!).readAsBytes();
      final photo = jpegDataUrl(photoBytes);
      final name = [_box('first_name').text, _box('middle_name').text, _box('last_name').text].where((part) => part.trim().isNotEmpty).join(' ').trim();
      final employed = _employed == 'Yes'
          ? _box('employed_names').text.split(',').map((item) => item.trim()).where((item) => item.isNotEmpty).map((item) => {'name': item}).toList()
          : <Map<String, String>>[];
      final siblings = <Map<String, String>>[];
      if (_otherSiblings == 'Yes') {
        for (final line in _box('sibling_rows').text.split('\n')) {
          final parts = line.split('|').map((item) => item.trim()).toList();
          if (parts.length < 3 || parts.any((part) => part.isEmpty)) continue;
          siblings.add({'name': parts[0], 'age': parts[1], 'school_or_work': parts.sublist(2).join(' | ')});
        }
      }
      final details = {
        'religion': _religion,
        'religion_other': _box('religion_other').text.trim(),
        'civil_status': _civil,
        'tel_number': _box('tel').text.trim(),
        'date_of_birth': _box('birth').text.trim(),
        'place_of_birth': _box('birth_place').text.trim(),
        'height': _box('height').text.trim(),
        'weight': _box('weight').text.trim(),
        'sex': _sex,
        'parent_name': _box('parent_name').text.trim(),
        'parent_status': _parentStatus,
        'parent_tel': _box('parent_tel').text.trim(),
        'parent_occupation': _parentJob,
        'parent_occupation_other': _box('parent_job_other').text.trim(),
        'parent_income': _box('parent_income').text.trim(),
        'guardian_name': _box('guardian_name').text.trim(),
        'guardian_tel': _box('guardian_tel').text.trim(),
        'guardian_occupation': _parentStatus == 'Deceased' ? _guardianJob : '',
        'guardian_occupation_other': '',
        'guardian_income': _box('guardian_income').text.trim(),
        'sibling_employed_at_fcu': _employed,
        'employed_sibling_count': _employed == 'Yes' ? int.tryParse(_box('employed_count').text.trim()) : null,
        'employed_siblings': employed,
        'has_non_working_siblings': _otherSiblings,
        'siblings': siblings,
        'technical_qualification': _box('technical').text.trim(),
        'work_experience': _box('work').text.trim(),
        'school_last_attended': _box('school').text.trim(),
        'school_address': _box('school_address').text.trim(),
        'degree_program': _box('course').text.trim(),
        'year_level': _year,
        'has_scholarship': _scholarship,
        'scholarship_details': _box('scholarship').text.trim(),
        'is_4ps': _fourPs,
        'medical_conditions': _conditions.toList(),
        'medical_other': _box('medical_other').text.trim(),
        'will_pass_good_moral': _goodMoral,
        'medical_certificate_attached': _files.containsKey('medical_certificate'),
        'folder_acknowledged': true,
        'will_sign_printed_copy': true,
        'consent_child_name': name,
        'photo': photo,
        'email': _box('email').text.trim(),
        'home_address': _box('address').text.trim(),
        'cell_number': _box('cell').text.trim(),
        'applicant_signature': '',
        'father_signature': '',
        'mother_signature': '',
        'guardian_signature': '',
        'consent_signature': '',
        'certification_date': '',
        'consent_date': '',
        'consent_signed_date': '',
      };
      final fields = <String, String>{
        'first_name': _box('first_name').text.trim(),
        'middle_name': _box('middle_name').text.trim(),
        'last_name': _box('last_name').text.trim(),
        'email': _box('email').text.trim(),
        'age': _box('age').text.trim(),
        'gender': _sex,
        'address': _box('address').text.trim(),
        'contact_number': _box('cell').text.trim(),
        'year_level': _year,
        'course': _box('course').text.trim(),
        'form_details': jsonEncode(details),
      };
      final files = <http.MultipartFile>[];
      var index = 0;
      for (final doc in _documents) {
        final path = _files[doc.$1];
        if (path == null) continue;
        fields['document_keys[$index]'] = doc.$1;
        files.add(await http.MultipartFile.fromPath('documents[$index]', path));
        index += 1;
      }
      final api = context.read<AuthProvider>().api;
      final data = await api.upload('/apply', fields: fields, files: files);
      if (!mounted) return;
      final payload = asMap(data);
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Application submitted'),
          content: Text('${textOf(payload['message'], 'Both forms were sent to the WSPO coordinator.')}\n\nTracking code: ${textOf(payload['tracking_code'])}\n\nSave this code. You can track the application from the sign-in screen. Signature lines stay blank until the printed copy is signed by hand.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done'))],
        ),
      );
      if (mounted) Navigator.pop(context);
    } on ApiException catch (error) {
      if (mounted) toast(context, error.message, error: true);
    } catch (error) {
      if (mounted) toast(context, errorText(error), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
