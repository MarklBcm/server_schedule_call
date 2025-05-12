<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

# TDT-Call - 예약 통화 서비스

Flutter 앱에서 `flutter_callkit_incoming` 패키지를 사용하여 예약된 시간에 통화를 시작하는 NestJS 기반 서버입니다.

## 기능

- 통화 예약: 앱에서 서버로 예약 시간을 전송하여 통화를 예약합니다.
- 예약 관리: 예약된 통화를 조회, 취소할 수 있습니다.
- 자동 통화 시작: 예약된 시간에 서버에서 Firebase Cloud Messaging(FCM)을 통해 앱으로 통화 알림을 전송합니다.
- 한국 시간대(KST, UTC+9) 지원: 모든 시간 관련 처리는 한국 시간대를 기준으로 합니다.

## 기술 스택

- **백엔드**: NestJS, TypeScript
- **예약 스케줄링**: @nestjs/schedule, cron
- **푸시 알림**: Firebase Admin SDK
- **클라이언트**: Flutter, flutter_callkit_incoming

## 설치 방법

### 사전 요구사항

- Node.js 16 이상
- Yarn 패키지 매니저
- Firebase 프로젝트 및 서비스 계정

### 설치 단계

1. 저장소 클론

```bash
git clone https://github.com/yourusername/tdt-call.git
cd tdt-call
```

2. 의존성 설치

```bash
yarn install
```

3. 환경 변수 설정

```bash
cp env.example .env
```

`.env` 파일을 열고 Firebase 설정 및 기타 환경 변수를 입력합니다.

### 환경 변수 설정

`env.example` 파일을 복사하여 `.env` 파일을 생성하고 필요한 값을 입력하세요:

```bash
cp env.example .env
```

| 변수명                        | 설명                                       | 예시                                                            |
| ----------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| PORT                          | 서버가 실행될 포트                         | 3000                                                            |
| FIREBASE_PROJECT_ID           | Firebase 프로젝트 ID                       | your-project-id                                                 |
| FIREBASE_CLIENT_EMAIL         | Firebase 서비스 계정 이메일                | your-client-email@example.com                                   |
| FIREBASE_PRIVATE_KEY          | Firebase 서비스 계정 프라이빗 키           | "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" |
| FIREBASE_SERVICE_ACCOUNT_PATH | (선택) Firebase 서비스 계정 JSON 파일 경로 | ./firebase-service-account.json                                 |
| IOS_BUNDLE_ID                 | iOS 앱 번들 ID                             | com.example.yourapp                                             |
| APN_KEY_PATH                  | Apple Push Notification 인증 키 파일 경로  | ./AuthKey_XXXXXXXX.p8                                           |
| APN_KEY_ID                    | Apple Developer 계정에서 발급받은 키 ID    | XXXXXXXX                                                        |
| APN_TEAM_ID                   | Apple Developer 계정의 팀 ID               | XXXXXXXXXX                                                      |

**참고**: Firebase 설정은 두 가지 방법 중 하나를 선택할 수 있습니다:

1. `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` 변수 직접 설정
2. `FIREBASE_SERVICE_ACCOUNT_PATH`에 서비스 계정 JSON 파일 경로 지정

### Firebase 설정 방법

1. Firebase 콘솔에서 프로젝트 설정 > 서비스 계정 탭으로 이동합니다.
2. "새 비공개 키 생성" 버튼을 클릭하여 JSON 파일을 다운로드합니다.
3. 다운로드한 JSON 파일을 프로젝트 루트 디렉토리에 `firebase-service-account.json` 이름으로 저장합니다.
4. `.env` 파일에서 `FIREBASE_SERVICE_ACCOUNT_PATH` 변수를 설정합니다:

   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   ```

5. 서버 실행

```bash
# 개발 모드
yarn start:dev

# 프로덕션 모드
yarn build
yarn start:prod
```

## API 엔드포인트

### 통화 예약

```
POST /calls/schedule
```

요청 본문:

```json
{
  "scheduledTime": "2023-06-01T14:30:00+09:00",
  "deviceToken": "FCM_디바이스_토큰",
  "callerName": "발신자 이름",
  "callerAvatar": "https://example.com/avatar.jpg",
  "callPurpose": "통화 목적"
}
```

### 예약된 통화 목록 조회

```
GET /calls
```

### 특정 통화 조회

```
GET /calls/:id
```

### 통화 예약 취소

```
DELETE /calls/:id
```

## Flutter 앱 연동

Flutter 앱에서 이 서버와 연동하는 방법은 `flutter_app_example.md` 파일을 참조하세요.

## 라이센스

MIT

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ yarn install
```

## Running the app

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Test

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
