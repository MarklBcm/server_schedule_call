# 통화 응답 처리 기능 가이드

## 개요

사용자가 전화를 받았는지, 거절했는지, 놓쳤는지를 추적하고 로그를 기록하는 기능입니다.

## 주요 기능

### 1. 통화 응답 상태 처리

- ✅ **수락 (answered)**: 사용자가 통화를 수락한 경우
- ❌ **거절 (declined)**: 사용자가 통화를 거절한 경우
- ⏰ **놓침 (missed)**: 사용자가 응답하지 않은 경우 (60초 후 자동 처리)

### 2. 자동 타임아웃 처리

- 통화 알림 발송 후 60초 동안 응답이 없으면 자동으로 **"놓침"** 상태로 처리
- 사용자가 응답하면 타임아웃이 자동으로 취소됨

### 3. 상세 로깅

- 응답 상태별로 이모지와 함께 구분된 로그 기록
- KST(한국 표준시) 기준으로 시간 표시
- 회원 번호, 통화 ID, 플랫폼 정보 포함

## API 엔드포인트

### 1. 통화 응답 처리

```http
POST /calls/response
Content-Type: application/json

{
  "uuid": "12345678-1234-1234-1234-123456789abc",
  "status": "answered",
  "responseTime": "2024-01-15T09:30:00Z",
  "additionalInfo": "빠른 응답"
}
```

**응답 상태 (status) 값:**

- `answered`: 수락
- `declined`: 거절
- `missed`: 놓침

### 2. 통화 응답 통계 조회

```http
GET /calls/stats
GET /calls/stats?memberSeq=123
```

**응답 예시:**

```json
{
  "totalCalls": 50,
  "answered": 35,
  "declined": 10,
  "missed": 3,
  "noResponse": 2,
  "answerRate": "90.0%"
}
```

### 3. 통화 응답 이력 조회

```http
GET /calls/history/123
```

**응답 예시:**

```json
[
  {
    "uuid": "12345678-1234-1234-1234-123456789abc",
    "scheduledTime": "2024. 1. 15. 오전 9:00:00",
    "responseStatus": "answered",
    "responseTime": "2024. 1. 15. 오전 9:00:15",
    "callerName": "홍길동",
    "platform": "ios"
  }
]
```

## 로그 예시

### 통화 수락 로그

```
[CallsService] 📞 ✅ [통화 수락] 회원 123, 통화 ID: abc-123, 플랫폼: ios, 응답 시간: 2024. 01. 15. 09:00:15
```

### 통화 거절 로그

```
[CallsService] 📞 ❌ [통화 거절] 회원 123, 통화 ID: abc-123, 플랫폼: android, 응답 시간: 2024. 01. 15. 09:00:10, 추가 정보: 회의 중
```

### 통화 놓침 로그 (자동 처리)

```
[CallsService] 📞 ⏰ [통화 놓침] 회원 123, 통화 ID: abc-123, 플랫폼: ios, 응답 시간: 2024. 01. 15. 09:01:00, 추가 정보: 응답 시간 초과 (자동 처리)
```

## 클라이언트 구현 가이드

### iOS (Swift) 예시

```swift
// 통화 수락 시
func reportCallAnswered(uuid: String) {
    let requestBody = [
        "uuid": uuid,
        "status": "answered",
        "responseTime": ISO8601DateFormatter().string(from: Date())
    ]

    // API 호출
    sendCallResponse(requestBody)
}

// 통화 거절 시
func reportCallDeclined(uuid: String) {
    let requestBody = [
        "uuid": uuid,
        "status": "declined",
        "responseTime": ISO8601DateFormatter().string(from: Date()),
        "additionalInfo": "사용자가 거절함"
    ]

    // API 호출
    sendCallResponse(requestBody)
}
```

### Android (Kotlin) 예시

```kotlin
// 통화 수락 시
fun reportCallAnswered(uuid: String) {
    val requestBody = mapOf(
        "uuid" to uuid,
        "status" to "answered",
        "responseTime" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())
    )

    // API 호출
    sendCallResponse(requestBody)
}

// 통화 거절 시
fun reportCallDeclined(uuid: String) {
    val requestBody = mapOf(
        "uuid" to uuid,
        "status" to "declined",
        "responseTime" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date()),
        "additionalInfo" to "사용자가 거절함"
    )

    // API 호출
    sendCallResponse(requestBody)
}
```

## 주의사항

1. **UUID 필수**: 통화 응답 처리 시 정확한 UUID가 필요합니다.
2. **타임아웃 관리**: 60초 후 자동으로 missed 처리되므로, 클라이언트는 이 시간 내에 응답을 전송해야 합니다.
3. **중복 응답**: 같은 통화에 대해 여러 번 응답이 오면, 마지막 응답으로 덮어씌워집니다.
4. **시간대**: 모든 로그는 KST(UTC+9) 기준으로 기록됩니다.

## 모니터링 및 분석

### 통화 품질 분석 지표

- **응답률**: (수락 + 거절) / 전체 통화
- **수락률**: 수락 / 전체 통화
- **놓침률**: 놓침 / 전체 통화
- **평균 응답 시간**: 통화 발송부터 응답까지의 시간

이 기능을 통해 사용자의 통화 패턴을 분석하고, 서비스 품질을 개선할 수 있습니다.
