import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { QuestionItem } from "@/app/questions";

export interface PublicMatchProfile {
  id: string;
  name: string;
  email: string;
  gender: "Laki-laki" | "Perempuan";
  age: number;
  city: string;
  bio: string;
  questions: QuestionItem[];
  answers: Record<string, "iya" | "kayanya" | "engga">;
  iyaCount: number;
  kayanyaCount: number;
  isAvailable: boolean;
  updatedAt: number;
}

// Mencegah user menyelipkan IG/WA/No HP di Nama atau Bio sebelum sawer Rp10.000
export function detectContactLeak(text: string): string | null {
  const clean = text.trim();
  if (!clean) return null;

  if (clean.includes("@")) {
    return "Simbol '@' dilarang sebelum Match & Unlock!";
  }

  const socialKeywordRegex =
    /\b(ig|insta|instagram|wa|whatsapp|line|tele|telegram|tiktok|dm|japri|vc|call)\b/i;
  if (socialKeywordRegex.test(clean)) {
    return "Dilarang mencantumkan username/aplikasi sosmed (IG/WA/dll) di profil!";
  }

  const phoneRegex = /(\+62|62|08)[0-9\s\-]{6,}|[0-9]{7,}/;
  if (phoneRegex.test(clean)) {
    return "Dilarang mencantumkan nomor HP atau deretan angka kontak!";
  }

  const urlRegex = /(https?:\/\/|www\.|\.com|\.id|\.net|\.me)/i;
  if (urlRegex.test(clean)) {
    return "Dilarang mencantumkan tautan/link di profil!";
  }

  return null;
}

export function buildProfileId(email: string, gender: string): string {
  const safeEmail = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
  const gCode = gender === "Laki-laki" ? "M" : "F";
  return `${gCode}_${safeEmail}`;
}

export async function publishToMatchmakingPool(
  profile: PublicMatchProfile
): Promise<void> {
  if (!db) throw new Error("Firebase belum siap");
  const ref = doc(db, "match_profiles", profile.id);
  await setDoc(ref, profile, { merge: true });
}

export async function sendLikeAndCheckMatch<TDeck>(params: {
  me: PublicMatchProfile;
  target: PublicMatchProfile;
  buildDecks: (
    maleProfile: PublicMatchProfile,
    femaleProfile: PublicMatchProfile
  ) => { p1Deck: TDeck[]; p2Deck: TDeck[] };
}): Promise<{ matched: boolean; roomCode?: string }> {
  if (!db) throw new Error("Firebase belum siap");
  const { me, target, buildDecks } = params;

  const mySwipeId = `${me.id}__${target.id}`;
  const reverseSwipeId = `${target.id}__${me.id}`;

  const mySwipeRef = doc(db, "match_swipes", mySwipeId);
  const reverseSwipeRef = doc(db, "match_swipes", reverseSwipeId);

  const reverseSnap = await getDoc(reverseSwipeRef);

  // Jika lawan jenis sudah menyukai duluan -> MUTUAL MATCH!
  if (reverseSnap.exists()) {
    const reverseData = reverseSnap.data();
    if (reverseData.status === "matched" && reverseData.roomCode) {
      return { matched: true, roomCode: reverseData.roomCode };
    }

    const roomCode = "KAWIN-" + Math.floor(100 + Math.random() * 899);
    // Cowok otomatis menjadi player1 (pengirim kode undangan)
    const malePlayer = me.gender === "Laki-laki" ? me : target;
    const femalePlayer = me.gender === "Perempuan" ? me : target;
    const { p1Deck, p2Deck } = buildDecks(malePlayer, femalePlayer);

    const roomRef = doc(db, "rooms", roomCode);

    await runTransaction(db, async (tx) => {
      tx.set(roomRef, {
        code: roomCode,
        player1: malePlayer,
        player2: femalePlayer,
        p1Deck,
        p2Deck,
        status: "playing",
        isMatchmakingRoom: true,
        chatUnlocked: false,
        unlockPrice: 10000,
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

      tx.set(mySwipeRef, {
        fromId: me.id,
        toId: target.id,
        fromName: me.name,
        toName: target.name,
        status: "matched",
        roomCode,
        maleInitiatorName: malePlayer.name,
        createdAt: Date.now(),
      });

      tx.update(reverseSwipeRef, {
        status: "matched",
        roomCode,
        maleInitiatorName: malePlayer.name,
        matchedAt: Date.now(),
      });
    });

    return { matched: true, roomCode };
  }

  // Belum mutual -> simpan ketertarikan & tunggu lawan jenis membalas
  await setDoc(mySwipeRef, {
    fromId: me.id,
    toId: target.id,
    fromName: me.name,
    toName: target.name,
    status: "liked",
    createdAt: Date.now(),
  });

  return { matched: false };
}

export async function unlockRoomChatInDb(
  roomCode: string,
  paidByName: string
): Promise<void> {
  if (!db) throw new Error("Firebase belum siap");
  const roomRef = doc(db, "rooms", roomCode);
  await updateDoc(roomRef, {
    chatUnlocked: true,
    unlockedBy: paidByName,
    unlockedAt: Date.now(),
  });
}
