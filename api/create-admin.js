import admin from 'firebase-admin';

const getFirebaseAdminApp = () => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 없습니다.');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
};

const getBearerToken = (authorizationHeader = '') => {
  if (!authorizationHeader.startsWith('Bearer ')) return '';

  return authorizationHeader.slice('Bearer '.length).trim();
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      message: '허용되지 않은 요청 방식입니다.',
    });
  }

  try {
    getFirebaseAdminApp();

    const auth = admin.auth();
    const db = admin.firestore();

    const {
      adminLoginId,
      password,
      organizationName,
      userName,
      email,
      phone,
      setupToken,
    } = req.body || {};

    if (!adminLoginId || !password || !organizationName || !userName || !email) {
      return res.status(400).json({
        ok: false,
        message: '관리자 ID, 비밀번호, 조직명, 사용자명, 이메일주소는 필수입니다.',
      });
    }

    const adminProfilesSnapshot = await db
      .collection('adminProfiles')
      .limit(1)
      .get();

    const isFirstAdmin = adminProfilesSnapshot.empty;

    if (isFirstAdmin) {
      if (!process.env.FIRST_ADMIN_SETUP_TOKEN) {
        return res.status(500).json({
          ok: false,
          message: 'FIRST_ADMIN_SETUP_TOKEN 환경변수가 없습니다.',
        });
      }

      if (setupToken !== process.env.FIRST_ADMIN_SETUP_TOKEN) {
        return res.status(403).json({
          ok: false,
          message: '최초 관리자 등록 토큰이 일치하지 않습니다.',
        });
      }
    } else {
      const idToken = getBearerToken(req.headers.authorization || '');

      if (!idToken) {
        return res.status(401).json({
          ok: false,
          message: '관리자 인증 토큰이 없습니다.',
        });
      }

      const decodedToken = await auth.verifyIdToken(idToken);

      if (!decodedToken.admin) {
        return res.status(403).json({
          ok: false,
          message: '관리자 권한이 없습니다.',
        });
      }
    }

    const existingUser = await auth
      .getUserByEmail(email)
      .catch(() => null);

    if (existingUser) {
      return res.status(409).json({
        ok: false,
        message: '이미 Firebase Authentication에 등록된 이메일입니다.',
      });
    }

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: userName,
      disabled: false,
    });

    await auth.setCustomUserClaims(userRecord.uid, {
      admin: true,
    });

    const now = new Date().toISOString();

    const adminProfile = {
      uid: userRecord.uid,
      adminLoginId,
      organizationName,
      userName,
      email,
      phone: phone || '',
      role: 'admin',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('adminProfiles').doc(userRecord.uid).set(adminProfile);

    return res.status(200).json({
      ok: true,
      adminProfile,
    });
  } catch (error) {
    console.error('create-admin error:', error);

    return res.status(500).json({
      ok: false,
      message: error.message || '관리자 생성 중 오류가 발생했습니다.',
    });
  }
}