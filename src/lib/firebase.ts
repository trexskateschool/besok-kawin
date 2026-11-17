import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  arrayUnion,
  Unsubscribe,
} from 'firebase/firestore';
import {
  GameRoom,
  Gender,
  MatchHistoryItem,
  PlayerAnswer,
  PlayerProfile,
  UserDocument,
} from '@/types/game';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

const app =
  isFirebaseConfigured && !getApps().length
    ? initializeApp(firebaseConfig)
    : getApps()[0];

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

const googleProvider = new GoogleAuthProvider();

export function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email atau password salah.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah terdaftar. Silakan klik Masuk Email.';
    case 'auth/weak-password':
      return 'Password minimal 6 karakter.';
    case 'auth/invalid-email':
      return 'Format email tidak valid.';
    case 'auth/popup-closed-by-user':
      return 'Login Google dibatalkan.';
    default:
      return 'Gagal memproses autentikasi. Periksa koneksi atau konfigurasi Firebase.';
  }
}

export function subscribeToAuth(callback: (user: User | null) => void): Unsubscribe {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle(): Promise<User> {
  if (!auth) throw new Error('Firebase Auth belum dikonfigurasi.');
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  if (!auth) throw new Error('Firebase Auth belum dikonfigurasi.');
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  if (!auth) throw new Error('Firebase Auth belum dikonfigurasi.');
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

export async function logoutAccount(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export async function getUserProfileDoc(uid: string): Promise<UserDocument | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserDocument;
}

export async function upsertUserBasicProfile(
  uid: string,
  data: { email: string; name: string; gender: Gender; age: number }
): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, 'users', uid),
    {
      uid,
      email: data.email,
      name: data.name,
      gender: data.gender,
      age: data.age,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function appendMatchHistory(
  uid: string,
  item: MatchHistoryItem
): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, 'users', uid),
    {
      uid,
      history: arrayUnion(item),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createCoupleRoom(host: PlayerProfile): Promise<GameRoom> {
  const roomCode = generateRoomCode();
  const room: GameRoom = {
    roomCode,
    mode: 'couple',
    status: 'waiting_partner',
    loveBattery: 50,
    consecutiveTimeouts: 0,
    host,
    guest: null,
    deck: [],
    currentTurn: null,
    logs: [],
  };

  if (db) {
    await setDoc(doc(db, 'rooms', roomCode), room);
  }
  return room;
}

export async function joinCoupleRoom(
  roomCode: string,
  guestData: Omit<PlayerProfile, 'answers' | 'isReady'>
): Promise<{ ok: boolean; error?: string; room?: GameRoom }> {
  const normalizedCode = roomCode.trim().toUpperCase();
  if (!db) {
    return {
      ok: false,
      error: 'Firebase belum dikonfigurasi di Environment Variables.',
    };
  }

  const snap = await getDoc(doc(db, 'rooms', normalizedCode));
  if (!snap.exists()) {
    return { ok: false, error: 'Kode undangan tidak ditemukan.' };
  }

  const room = snap.data() as GameRoom;
  if (room.guest) {
    return { ok: false, error: 'Room ini sudah penuh.' };
  }

  if (room.host.gender === guestData.gender) {
    return {
      ok: false,
      error: `Ditolak: Kode ini dibuat oleh ${room.host.gender}. Pasangan wajib lawan jenis.`,
    };
  }

  const guestProfile: PlayerProfile = {
    ...guestData,
    answers: [],
    isReady: false,
  };

  const updatedRoom: GameRoom = {
    ...room,
    guest: guestProfile,
    status: 'answering',
  };

  await updateDoc(doc(db, 'rooms', normalizedCode), {
    guest: guestProfile,
    status: 'answering',
  });

  return { ok: true, room: updatedRoom };
}

export async function submitGuestAnswersAndStart(
  roomCode: string,
  answers: PlayerAnswer[],
  startPayload: Partial<GameRoom>
) {
  if (!db) return;
  await updateDoc(doc(db, 'rooms', roomCode), {
    'guest.answers': answers,
    'guest.isReady': true,
    ...startPayload,
  });
}

export async function syncRoomState(roomCode: string, partial: Partial<GameRoom>) {
  if (!db) return;
  await updateDoc(doc(db, 'rooms', roomCode), partial as Record<string, unknown>);
}

export function subscribeToRoom(
  roomCode: string,
  callback: (room: GameRoom) => void
): Unsubscribe {
  if (!db) return () => {};
  return onSnapshot(doc(db, 'rooms', roomCode), (snap) => {
    if (snap.exists()) {
      callback(snap.data() as GameRoom);
    }
  });
}
