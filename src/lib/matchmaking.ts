import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  runTransaction,
} from "firebase/firestore";
import { QuestionItem } from "@/app/questions";

export interface PublicMatchProfile {
  id: string; // Menggunakan Google Auth UID
  name: string;
  email: string;
  photoURL?: string;
  gender: "Laki-laki" | "Perempuan";
  age: number;
  city: string;
  bio: string;
  questions: QuestionItem[];
  answers: Record<string, "iya" | "kayanya" | "engga">;
  iyaCount: number;
  kayanyaCount: number;
  isAvailable: boolean;
  isUpgraded?: boolean; // Status VIP permanen setelah bayar Rp10.000
  upgradedAt?: number;
  updatedAt: number;
}

export interface MatchThread {
  id: string;
  participants: string[];
  participantDetails: Record<
    string,
    { name: string; gender: "Laki-laki" | "Perempuan"; age: number; city: string }
  >;
  roomCode: string;
  lastMessage?: string;
  lastMessageAt?: number;
  lastSenderId?: string;
  createdAt: number;
}

export interface DirectMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}

export function detectContactLeak(text: string): string | null {
  if (!text) return null;
  const phoneRegex = /(\+62|62|08)[0-9\s\-]{7,14}/;
  const igWaRegex = /(ig\s*:|instagram|wa\s*:|whatsapp|line\s*:|tele\s*:|@[a-z0-9._]{3,})/i;
  if (phoneRegex.test(text)) {
    return "Dilarang mencantumkan nomor HP/WA di profil sebelum Match!";
  }
  if (igWaRegex.test(text)) {
    return "Dilarang mencantumkan username IG/sosmed di profil!";
  }
  return null;
}

export function buildProfileId(
  emailOrUid: string,
  gender: "Laki-laki" | "Perempuan"
): string {
  return emailOrUid.replace(/[^a-zA-Z0-9_-]/g, "_") || `${gender}_${Date.now()}`;
}

export function buildThreadId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

export async function publishToMatchmakingPool(
  profile: PublicMatchProfile
): Promise<void> {
  if (!db) throw new Error("Database belum siap");
  const ref = doc(db, "match_profiles", profile.id);
  const existing = await getDoc(ref);
  const keepUpgraded = existing.exists()
    ? Boolean(existing.data().isUpgraded)
    : Boolean(profile.isUpgraded);

  await setDoc(
    ref,
    {
      ...profile,
      isUpgraded: keepUpgraded,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function ensureMatchThread(params: {
  userA: PublicMatchProfile;
  userB: PublicMatchProfile;
  roomCode: string;
}): Promise<string> {
  if (!db) throw new Error("Database belum siap");
  const threadId = buildThreadId(params.userA.id, params.userB.id);
  const threadRef = doc(db, "match_threads", threadId);

  await setDoc(
    threadRef,
    {
      id: threadId,
      participants: [params.userA.id, params.userB.id],
      participantDetails: {
        [params.userA.id]: {
          name: params.userA.name,
          gender: params.userA.gender,
          age: params.userA.age,
          city: params.userA.city,
        },
        [params.userB.id]: {
          name: params.userB.name,
          gender: params.userB.gender,
          age: params.userB.age,
          city: params.userB.city,
        },
      },
      roomCode: params.roomCode,
      createdAt: Date.now(),
    },
    { merge: true }
  );

  return threadId;
}

export async function sendLikeAndCheckMatch<TDeckCard>(params: {
  me: PublicMatchProfile;
  target: PublicMatchProfile;
  buildDecks: (
    male: PublicMatchProfile,
    female: PublicMatchProfile
  ) => { p1Deck: TDeckCard[]; p2Deck: TDeckCard[] };
}): Promise<{ matched: boolean; roomCode?: string }> {
  if (!db) throw new Error("Database belum siap");

  const forwardId = `${params.me.id}__${params.target.id}`;
  const reverseId = `${params.target.id}__${params.me.id}`;
  const reverseRef = doc(db, "match_swipes", reverseId);
  const forwardRef = doc(db, "match_swipes", forwardId);

  const reverseSnap = await getDoc(reverseRef);

  if (reverseSnap.exists()) {
    const roomCode = "KAWIN-" + Math.floor(100 + Math.random() * 899);
    const maleProfile =
      params.me.gender === "Laki-laki" ? params.me : params.target;
    const femaleProfile =
      params.me.gender === "Perempuan" ? params.me : params.target;
    const { p1Deck, p2Deck } = params.buildDecks(maleProfile, femaleProfile);

    await runTransaction(db, async (tx) => {
      const roomRef = doc(db, "rooms", roomCode);
      tx.set(roomRef, {
        code: roomCode,
        player1: maleProfile,
        player2: femaleProfile,
        p1Deck,
        p2Deck,
        status: "playing",
        isMatchmakingRoom: true,
        round: 1,
        battery: 50,
        c1: { status: "dilemma" },
        c2: { status: "dilemma" },
        history: [],
        stats: {
          terimaMantap: 0,
          menyesal: 0,
          kompromiSepakat: 0,
          deadlockOrAfk: 0,
        },
        updatedAt: Date.now(),
      });

      tx.set(forwardRef, {
        fromId: params.me.id,
        fromName: params.me.name,
        toId: params.target.id,
        status: "matched",
        roomCode,
        maleInitiatorName: maleProfile.name,
        updatedAt: Date.now(),
      });

      tx.update(reverseRef, {
        status: "matched",
        roomCode,
        maleInitiatorName: maleProfile.name,
        updatedAt: Date.now(),
      });
    });

    await ensureMatchThread({
      userA: params.me,
      userB: params.target,
      roomCode,
    });

    return { matched: true, roomCode };
  }

  await setDoc(forwardRef, {
    fromId: params.me.id,
    fromName: params.me.name,
    toId: params.target.id,
    status: "liked",
    updatedAt: Date.now(),
  });

  return { matched: false };
}

export async function upgradeUserAccountInDb(userId: string): Promise<void> {
  if (!db) throw new Error("Database belum siap");
  const profileRef = doc(db, "match_profiles", userId);
  await setDoc(
    profileRef,
    {
      isUpgraded: true,
      upgradedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function unlockRoomChatInDb(
  roomCode: string,
  unlockedBy: string
): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, "rooms", roomCode), {
    chatUnlocked: true,
    unlockedBy,
    updatedAt: Date.now(),
  });
}
