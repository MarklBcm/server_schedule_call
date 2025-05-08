import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';

/**
 * Firebase 초기화 함수
 *
 * 실제 프로덕션 환경에서는 환경 변수나 별도의 설정 파일에서 서비스 계정 정보를 불러와야 합니다.
 */
export function initializeFirebaseApp(): void {
  // 이미 초기화되었는지 확인
  if (admin.apps.length > 0) {
    return;
  }

  try {
    // 여기서는 예시로 직접 설정을 입력하지만, 실제로는 환경 변수를 사용해야 합니다.
    // 아래 정보는 Firebase 콘솔에서 서비스 계정 키를 다운로드하여 얻을 수 있습니다.

    // 환경 변수가 설정되어 있는지 확인
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_CLIENT_EMAIL
    ) {
      console.warn(
        'Firebase 환경 변수가 설정되지 않았습니다. 테스트 모드로 실행합니다.',
      );

      // 테스트 모드: 실제 Firebase 초기화 없이 진행
      return;
    }

    // 개발 환경에서는 서비스 계정 JSON 파일을 직접 사용하는 것이 더 안정적입니다.
    // 환경 변수 대신 JSON 파일이 있는지 확인하고 있으면 사용합니다.
    try {
      // 서비스 계정 JSON 파일이 있는 경우
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      if (serviceAccountPath) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
        console.log('Firebase 초기화 완료 (서비스 계정 파일 사용)');
        return;
      }
    } catch (error) {
      console.warn(
        '서비스 계정 파일을 찾을 수 없습니다. 환경 변수를 사용합니다.',
      );
    }

    // 환경 변수에서 비공개 키를 가져옵니다.
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    const serviceAccount: ServiceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('Firebase 초기화 완료 (환경 변수 사용)');
  } catch (error) {
    console.error('Firebase 초기화 실패:', error);
    console.warn(
      'Firebase 초기화에 실패했지만, 애플리케이션은 계속 실행됩니다.',
    );
  }
}
