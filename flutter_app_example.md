# Flutter 앱 예시 코드

Flutter 앱에서 `flutter_callkit_incoming` 패키지를 사용하여 서버에서 오는 통화를 처리하는 방법에 대한 예시 코드입니다.

## 필요한 패키지 설치

```yaml
# pubspec.yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_callkit_incoming: ^2.0.0+1
  firebase_core: ^2.24.2
  firebase_messaging: ^14.7.10
  http: ^1.1.0
  uuid: ^4.2.2
```

## 메인 앱 설정

```dart
// lib/main.dart
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

// Firebase 백그라운드 메시지 핸들러
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();

  final data = message.data;
  if (data['type'] == 'call_incoming') {
    await showCallkitIncoming(data);
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  // FCM 백그라운드 핸들러 등록
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Callkit Demo',
      theme: ThemeData(
        primarySwatch: Colors.blue,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({Key? key}) : super(key: key);

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final TextEditingController _timeController = TextEditingController();
  String? _fcmToken;

  @override
  void initState() {
    super.initState();
    _initCallKit();
    _setupFirebaseMessaging();
    _getFcmToken();
  }

  // CallKit 초기화
  Future<void> _initCallKit() async {
    // CallKit 이벤트 리스너 설정
    FlutterCallkitIncoming.onEvent.listen((event) {
      switch (event!.name) {
        case CallEvent.ACTION_CALL_INCOMING:
          // 수신 통화 처리
          break;
        case CallEvent.ACTION_CALL_ACCEPT:
          // 통화 수락 처리
          break;
        case CallEvent.ACTION_CALL_DECLINE:
          // 통화 거절 처리
          break;
        case CallEvent.ACTION_CALL_ENDED:
          // 통화 종료 처리
          break;
      }
    });
  }

  // Firebase 메시징 설정
  Future<void> _setupFirebaseMessaging() async {
    // 포그라운드 메시지 핸들러
    FirebaseMessaging.onMessage.listen((RemoteMessage message) async {
      final data = message.data;
      if (data['type'] == 'call_incoming') {
        await showCallkitIncoming(data);
      }
    });

    // 앱이 백그라운드에서 열릴 때 메시지 핸들러
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('메시지 클릭: ${message.data}');
    });

    // 알림 권한 요청
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
  }

  // FCM 토큰 가져오기
  Future<void> _getFcmToken() async {
    final token = await FirebaseMessaging.instance.getToken();
    setState(() {
      _fcmToken = token;
    });
    print('FCM 토큰: $_fcmToken');
  }

  // 서버에 통화 예약 요청
  Future<void> _scheduleCall() async {
    if (_fcmToken == null || _timeController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('FCM 토큰과 예약 시간을 확인해주세요')),
      );
      return;
    }

    try {
      final response = await http.post(
        Uri.parse('http://10.0.2.2:3000/calls/schedule'), // 에뮬레이터에서 로컬 서버 접근
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'scheduledTime': _timeController.text, // ISO 형식 (예: 2023-06-01T14:30:00+09:00)
          'deviceToken': _fcmToken,
          'callerName': '테스트 발신자',
          'callerAvatar': 'https://picsum.photos/200',
          'callPurpose': '테스트 통화',
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('통화가 성공적으로 예약되었습니다')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('통화 예약 실패: ${response.body}')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('통화 예약 오류: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('통화 예약 데모'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('FCM 토큰: ${_fcmToken ?? "로딩 중..."}'),
            const SizedBox(height: 20),
            TextField(
              controller: _timeController,
              decoration: const InputDecoration(
                labelText: '예약 시간 (ISO 형식)',
                hintText: '2023-06-01T14:30:00+09:00',
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _scheduleCall,
              child: const Text('통화 예약'),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                // 현재 시간으로부터 10초 후의 시간을 설정
                final now = DateTime.now().add(const Duration(seconds: 10));
                _timeController.text = now.toIso8601String();
              },
              child: const Text('10초 후로 설정'),
            ),
          ],
        ),
      ),
    );
  }
}

// CallKit 수신 통화 표시
Future<void> showCallkitIncoming(Map<String, dynamic> data) async {
  final callId = data['id'] ?? const Uuid().v4();
  final callData = <String, dynamic>{
    'id': callId,
    'nameCaller': data['caller_name'] ?? '알 수 없음',
    'appName': 'Flutter Callkit Demo',
    'avatar': data['caller_avatar'] ?? 'https://picsum.photos/200',
    'handle': data['call_purpose'] ?? '수신 통화',
    'type': 0, // 음성 통화
    'duration': 30000, // 30초
    'textAccept': '수락',
    'textDecline': '거절',
    'textMissedCall': '부재중 전화',
    'textCallback': '콜백',
    'extra': <String, dynamic>{
      'callId': callId,
    },
    'headers': <String, dynamic>{},
    'android': <String, dynamic>{
      'isCustomNotification': true,
      'isShowLogo': false,
      'ringtonePath': 'system_ringtone_default',
      'backgroundColor': '#0955fa',
      'backgroundUrl': 'https://picsum.photos/800',
      'actionColor': '#4CAF50',
    },
    'ios': <String, dynamic>{
      'iconName': 'CallKitLogo',
      'handleType': 'generic',
      'supportsVideo': false,
      'maximumCallGroups': 1,
      'maximumCallsPerCallGroup': 1,
      'audioSessionMode': 'default',
      'audioSessionActive': true,
      'audioSessionPreferredSampleRate': 44100.0,
      'audioSessionPreferredIOBufferDuration': 0.005,
      'supportsDTMF': true,
      'supportsHolding': true,
      'supportsGrouping': false,
      'supportsUngrouping': false,
      'ringtonePath': 'system_ringtone_default',
    },
  };

  await FlutterCallkitIncoming.showCallkitIncoming(callData);
}
```

## iOS 설정

### Info.plist에 추가 (ios/Runner/Info.plist)

```xml
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
    <string>voip</string>
</array>
<key>NSCameraUsageDescription</key>
<string>카메라 접근 권한이 필요합니다</string>
<key>NSMicrophoneUsageDescription</key>
<string>마이크 접근 권한이 필요합니다</string>
```

## Android 설정

### AndroidManifest.xml에 추가 (android/app/src/main/AndroidManifest.xml)

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

    <application
        android:label="callkit_demo"
        android:icon="@mipmap/ic_launcher">

        <!-- 기존 설정 -->

        <!-- FCM 서비스 -->
        <service
            android:name="io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

        <!-- FCM 백그라운드 서비스 -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="high_importance_channel" />
    </application>
</manifest>
```

## 사용 방법

1. Flutter 앱을 실행하면 FCM 토큰이 생성됩니다.
2. 예약 시간을 ISO 형식으로 입력하거나 "10초 후로 설정" 버튼을 클릭합니다.
3. "통화 예약" 버튼을 클릭하여 서버에 예약 요청을 보냅니다.
4. 예약된 시간에 서버는 FCM을 통해 푸시 알림을 보내고, 앱은 CallKit UI를 표시합니다.
5. 사용자는 통화를 수락하거나 거절할 수 있습니다.
