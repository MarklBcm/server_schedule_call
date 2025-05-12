import * as admin from 'firebase-admin';
import * as fs from 'fs';

/**
 * Firebase 초기화 함수
 *
 * 서비스 계정 JSON 파일을 사용하여 Firebase를 초기화합니다.
 */
export function initializeFirebaseApp(): void {
  // 이미 초기화되었는지 확인
  if (admin.apps.length > 0) {
    return;
  }

  try {
    // 서비스 계정 JSON 파일 경로 확인
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!serviceAccountPath) {
      console.warn(
        'FIREBASE_SERVICE_ACCOUNT_PATH 환경 변수가 설정되지 않았습니다. Firebase 기능이 제한됩니다.',
      );
      return;
    }

    try {
      // 서비스 계정 JSON 파일 로드 및 초기화
      const serviceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, 'utf8'),
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log('Firebase 초기화 완료 (서비스 계정 파일 사용)');
    } catch (error) {
      console.error(
        `서비스 계정 파일(${serviceAccountPath})을 로드할 수 없습니다:`,
        error,
      );
      console.warn(
        'Firebase 초기화에 실패했지만, 애플리케이션은 계속 실행됩니다.',
      );
    }
  } catch (error) {
    console.error('Firebase 초기화 실패:', error);
    console.warn(
      'Firebase 초기화에 실패했지만, 애플리케이션은 계속 실행됩니다.',
    );
  }
}
