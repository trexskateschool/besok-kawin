"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { QuestionItem, build20QuestionsForProfile } from "./questions";
import { db, isFirebaseReady, auth, googleProvider } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  PublicMatchProfile,
  detectContactLeak,
  buildProfileId,
  publishToMatchmakingPool,
  sendLikeAndCheckMatch,
} from "@/lib/matchmaking";
import ProfileDashboard from "@/components/ProfileDashboard";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PlayerProfile {
  name: string;
  email: string;
  gender: "Laki-laki" | "Perempuan";
  age: number;
  city?: string;
  bio?: string;
  questions: QuestionItem[];
  answers: Record<string, "iya" | "kayanya" | "engga">;
  emoji?: string;
  tier?: "young" | "mid" | "mature";
  vibe?: string;
  reactAccept?: string;
  reactReject?: string;
}

interface DeckCard extends QuestionItem {
  isWildcard: boolean;
  sourceOwner: string;
  roundNum: number;
  responderKey: "player1" | "player2";
}

interface CardRoundState {
  status: "dilemma" | "negotiating" | "resolved";
  responderChoice?: number;
  ownerChoice?: number;
  delta?: number;
  outcomeLabel?: string;
  statType?: "terimaMantap" | "menyesal" | "kompromiSepakat" | "deadlockOrAfk";
}

interface HistoryItem {
  round: number;
  category: string;
  isWildcard: boolean;
  problem: string;
  outcomeLabel: string;
  delta: number;
  type: "good" | "neutral" | "bad";
}

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

type ScreenType =
  | "register"
  | "quiz"
  | "bursa"
  | "mode"
  | "game"
  | "ending"
  | "profile";

function getBotPersonaConfig(
  botGender: "Laki-laki" | "Perempuan",
  botAge: number
) {
  const isFemale = botGender === "Perempuan";
  if (botAge <= 23) {
    return {
      name: isFemale ? "Keisya" : "Arkan",
      age: botAge,
      gender: botGender,
      tier: "young" as const,
      emoji: isFemale ? "👧" : "🧑",
      vibe: "Gen-Z Dramatis & Baperan",
      bio: "Ekspresif, butuh validasi tinggi, gampang overthinking kalau chat dibales singkat.",
      reactAccept:
        "Wah seriusan kamu nerima sifatku yang itu? Jangan cuma manis di awal doang ya!",
      reactReject:
        "Tuh kan! Pasti ujung-ujungnya kamu nggak ngertiin aku. Yaudah coba cari jalan tengahnya gimana!",
    };
  } else if (botAge <= 33) {
    return {
      name: isFemale ? "Nadya" : "Bagas",
      age: botAge,
      gender: botGender,
      tier: "mid" as const,
      emoji: isFemale ? "👩" : "👨",
      vibe: "Quarter-Life Realistis",
      bio: "Mikirin karier, stabilitas finansial, dan kesiapan rumah tangga. Suka diskusi objektif.",
      reactAccept:
        "Oke, aku hargai kejujuranmu nerima itu. Tapi pastiin kamu sanggup nanggung efek sampingnya ya.",
      reactReject:
        "Fair enough, emang nggak semua hal harus diiyain. Ayo kita negosiasi kompromi yang masuk akal buat berdua.",
    };
  } else {
    return {
      name: isFemale ? "Laras" : "Dimas",
      age: botAge,
      gender: botGender,
      tier: "mature" as const,
      emoji: isFemale ? "👩‍💼" : "👨‍💼",
      vibe: "Senior Pragmatis & To-The-Point",
      bio: "Anti-drama, fokus ketenangan hidup, proteksi aset, dan komitmen konkret.",
      reactAccept:
        "Bagus. Dalam pernikahan memang butuh kesiapan mental nerima kekurangan pasangan tanpa drama.",
      reactReject:
        "Saya menghargai ketegasan kamu menolak. Sekarang pilih solusi paling praktis supaya ini nggak jadi masalah di rumah tangga.",
    };
  }
}

function buildDeckFromPartnerProfile(
  partnerProfile: PlayerProfile,
  responderKey: "player1" | "player2",
  maxRounds: number
): DeckCard[] {
  const mainCards: Omit<DeckCard, "roundNum" | "responderKey">[] = [];
  const wildCards: Omit<DeckCard, "roundNum" | "responderKey">[] = [];
  const fallbackCards: Omit<DeckCard, "roundNum" | "responderKey">[] = [];

  partnerProfile.questions.forEach((q) => {
    const ans = partnerProfile.answers[q.id];
    if (ans === "iya") {
      mainCards.push({
        ...q,
        isWildcard: false,
        sourceOwner: partnerProfile.name,
      });
    } else if (ans === "kayanya") {
      wildCards.push({
        ...q,
        isWildcard: true,
        sourceOwner: partnerProfile.name,
      });
    } else {
      fallbackCards.push({
        ...q,
        isWildcard: true,
        sourceOwner: partnerProfile.name,
      });
    }
  });

  const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
  const pool = [
    ...shuffle(mainCards),
    ...shuffle(wildCards),
    ...shuffle(fallbackCards),
  ];

  const result: DeckCard[] = [];
  for (let r = 1; r <= maxRounds; r++) {
    const card = pool[(r - 1) % pool.length];
    result.push({ ...card, roundNum: r, responderKey });
  }
  return result;
}

export default function BesokKawinGame() {
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  // Google Auth State
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const resetRootScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    const handleFocusOut = () => {
      setTimeout(resetRootScroll, 80);
    };
    resetRootScroll();
    window.addEventListener("focusout", handleFocusOut);
    window.addEventListener("resize", resetRootScroll);
    window.visualViewport?.addEventListener("resize", resetRootScroll);
    return () => {
      window.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("resize", resetRootScroll);
      window.visualViewport?.removeEventListener("resize", resetRootScroll);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent;
    setIsIosDevice(/iPad|iPhone|iPod/.test(ua));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPromptEvent(null);
      setShowInstallGuide(false);
      showToast("✅ Besok Kawin? berhasil terpasang di HP!", "success");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone
    ) {
      setIsAppInstalled(true);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInstallClick = async () => {
    sfxTap();
    if (installPromptEvent) {
      await installPromptEvent.prompt();
      const { outcome } = await installPromptEvent.userChoice;
      if (outcome === "accepted") {
        setIsAppInstalled(true);
        setInstallPromptEvent(null);
        showToast("Menginstal Besok Kawin? ke layar utama...", "success");
      }
      return;
    }
    setShowInstallGuide(true);
  };

  const getOrCreateAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }, []);

  const playTone = (
    freq: number,
    type: OscillatorType = "sine",
    duration = 0.15,
    vol = 0.08,
    delay = 0
  ) => {
    if (!soundEnabled) return;
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + delay + duration
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    } catch {}
  };

  const sfxTap = () => playTone(520, "triangle", 0.08, 0.06);
  const sfxCharge = () => {
    playTone(523.25, "sine", 0.14, 0.09, 0);
    playTone(659.25, "sine", 0.18, 0.09, 0.09);
  };
  const sfxPenalty = () => {
    playTone(220, "sawtooth", 0.18, 0.08, 0);
    playTone(165, "sawtooth", 0.25, 0.08, 0.12);
  };
  const sfxFlip = () => playTone(380, "sine", 0.12, 0.07);
  const sfxWin = () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      playTone(f, "triangle", 0.25, 0.09, i * 0.1)
    );
  };

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const showToast = useCallback(
    (message: string, type: ToastItem["type"] = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    },
    []
  );

  const copyTextSafe = (text: string, successMsg: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(successMsg, "success"))
        .catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  };

  const fallbackCopy = (text: string, successMsg: string) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast(successMsg, "success");
    } catch {
      showToast("Gagal menyalin otomatis.", "warning");
    }
    document.body.removeChild(ta);
  };

  const [screen, setScreen] = useState<ScreenType>("register");

  const goScreen = useCallback((next: ScreenType) => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    setScreen(next);
    if (mainScrollRef.current)
      mainScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Registration & Role State
  const [landingTab, setLandingTab] = useState<"new" | "bursa" | "invite">(
    "new"
  );
  const [inviteCode, setInviteCode] = useState("");
  const [inputJoinCode, setInputJoinCode] = useState("");
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regGender, setRegGender] = useState<"Laki-laki" | "Perempuan">(
    "Laki-laki"
  );
  const [regAge, setRegAge] = useState("");
  const [regCity, setRegCity] = useState("");
  const [regBio, setRegBio] = useState("");
  const [regError, setRegError] = useState<{
    title: string;
    text: string;
    key: number;
  } | null>(null);

  // Matchmaking / Bursa State
  const [myPublicProfile, setMyPublicProfile] =
    useState<PublicMatchProfile | null>(null);
  const [bursaCandidates, setBursaCandidates] = useState<PublicMatchProfile[]>(
    []
  );
  const [bursaCityFilter, setBursaCityFilter] = useState("");
  const [likedTargetIds, setLikedTargetIds] = useState<Record<string, boolean>>(
    {}
  );
  const [incomingLikes, setIncomingLikes] = useState<
    { fromId: string; fromName: string }[]
  >([]);
  const [isLoadingBursa, setIsLoadingBursa] = useState(false);
  const [sendingLikeId, setSendingLikeId] = useState<string | null>(null);
  const [isMatchmakingRoom, setIsMatchmakingRoom] = useState(false);

  const [myRole, setMyRole] = useState<"player1" | "player2">("player1");
  const [player1, setPlayer1] = useState<PlayerProfile | null>(null);
  const [player2, setPlayer2] = useState<PlayerProfile | null>(null);
  const [mode, setMode] = useState<"solo" | "couple">("solo");
  const [quizTarget, setQuizTarget] = useState<"player1" | "player2">(
    "player1"
  );
  const [quizIndex, setQuizIndex] = useState(0);

  const [botAgeSlider, setBotAgeSlider] = useState(25);

  // Gameplay State
  const [battery, setBattery] = useState(50);
  const [deltaPop, setDeltaPop] = useState<{ val: number; key: number } | null>(
    null
  );
  const [shakeHud, setShakeHud] = useState(0);
  const [round, setRound] = useState(1);
  const maxRounds = 8;

  const [soloDeck, setSoloDeck] = useState<DeckCard[]>([]);
  const [p1OnlineDeck, setP1OnlineDeck] = useState<DeckCard[]>([]);
  const [p2OnlineDeck, setP2OnlineDeck] = useState<DeckCard[]>([]);
  const [c1State, setC1State] = useState<CardRoundState>({
    status: "dilemma",
  });
  const [c2State, setC2State] = useState<CardRoundState>({
    status: "dilemma",
  });
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  const [gameStage, setGameStage] = useState<
    "dilemma" | "consequence" | "negotiate"
  >("dilemma");
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerActive, setTimerActive] = useState(false);
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState({
    terimaMantap: 0,
    menyesal: 0,
    kompromiSepakat: 0,
    deadlockOrAfk: 0,
  });
  const [endingReason, setEndingReason] = useState("");

  const prevBatteryRef = useRef(50);
  const lastSummaryIdRef = useRef<number>(0);
  const matchedRoomHandledRef = useRef<string>("");

  // Pantau status Login Google secara permanen
  useEffect(() => {
    if (!auth || !isFirebaseReady) return;
    const unsub = onAuthStateChanged(auth, async (user) => {
      setGoogleUser(user);
      if (user) {
        if (user.email) setRegEmail((prev) => prev || user.email || "");
        if (user.displayName) {
          setRegName((prev) => prev || user.displayName?.split(" ")[0] || "");
        }
        if (db) {
          try {
            const snap = await getDoc(doc(db, "match_profiles", user.uid));
            if (snap.exists()) {
              const existing = snap.data() as PublicMatchProfile;
              setMyPublicProfile(existing);
              setRegName((prev) => prev || existing.name);
              setRegEmail((prev) => prev || existing.email);
              setRegGender(existing.gender);
              setRegAge((prev) => prev || String(existing.age));
              setRegCity((prev) => prev || existing.city || "");
              setRegBio((prev) => prev || existing.bio || "");
            }
          } catch (err) {
            console.error("Gagal memuat profil tersimpan:", err);
          }
        }
      } else {
        setMyPublicProfile(null);
      }
    });
    return () => unsub();
  }, []);

  // Dengarkan perubahan real-time pada profil user
  useEffect(() => {
    if (!myPublicProfile?.id || !isFirebaseReady || !db) return;
    const unsub = onSnapshot(
      doc(db, "match_profiles", myPublicProfile.id),
      (snap) => {
        if (snap.exists()) {
          setMyPublicProfile(snap.data() as PublicMatchProfile);
        }
      }
    );
    return () => unsub();
  }, [myPublicProfile?.id]);

  const handleGoogleLogin = async () => {
    sfxTap();
    if (!auth || !isFirebaseReady) {
      showToast("Firebase Auth belum siap. Cek pengaturan Firebase.", "error");
      return;
    }
    setIsLoggingInGoogle(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      setGoogleUser(user);
      if (user.email) setRegEmail(user.email);
      if (user.displayName && !regName) {
        setRegName(user.displayName.split(" ")[0]);
      }

      if (db) {
        const snap = await getDoc(doc(db, "match_profiles", user.uid));
        if (snap.exists()) {
          const existing = snap.data() as PublicMatchProfile;
          setMyPublicProfile(existing);
          setRegName(existing.name);
          setRegEmail(existing.email);
          setRegGender(existing.gender);
          setRegAge(String(existing.age));
          setRegCity(existing.city || "");
          setRegBio(existing.bio || "");
          showToast(`👋 Selamat datang kembali, ${existing.name}!`, "success");
          goScreen("bursa");
        } else {
          setLandingTab("bursa");
          showToast(
            "✅ Masuk dengan Google berhasil! Lengkapi data & 20 pengakuan untuk masuk Bursa.",
            "success"
          );
        }
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("Google login error:", err);
      showToast(`Gagal masuk dengan Google: ${detail}`, "error");
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleGoogleLogout = async () => {
    sfxTap();
    if (!auth) return;
    await signOut(auth);
    setGoogleUser(null);
    setMyPublicProfile(null);
    showToast("Berhasil keluar dari akun Google.", "info");
    goScreen("register");
  };

  const applyBatteryDelta = (delta: number) => {
    setBattery((prev) => Math.max(0, Math.min(100, prev + delta)));
    if (delta !== 0) {
      setDeltaPop({ val: delta, key: Date.now() + Math.random() });
      if (delta < 0) setShakeHud((prev) => prev + 1);
    }
  };

  useEffect(() => {
    if (screen === "game" && mode === "couple") {
      setGameStage("dilemma");
      setTimerSeconds(60);
      setTimerActive(true);
    }
  }, [round, screen, mode]);

  const myResponderCardState = myRole === "player1" ? c1State : c2State;
  const myOwnedCardState = myRole === "player1" ? c2State : c1State;

  const needsResponderAction =
    mode === "couple" && myResponderCardState.status === "dilemma";
  const needsOwnerCompromiseAction =
    mode === "couple" &&
    !needsResponderAction &&
    myOwnedCardState.status === "negotiating" &&
    myOwnedCardState.ownerChoice === undefined;

  // Turn Timer Effect
  useEffect(() => {
    if (screen !== "game" || !timerActive) return;
    if (
      mode === "couple" &&
      !needsResponderAction &&
      !needsOwnerCompromiseAction
    ) {
      return;
    }

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerActive(false);
          handleTimeoutPenalty();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    screen,
    timerActive,
    round,
    mode,
    needsResponderAction,
    needsOwnerCompromiseAction,
  ]);

  // Load Bursa Candidates
  const fetchBursaCandidates = useCallback(async () => {
    if (!myPublicProfile || !isFirebaseReady || !db) return;
    setIsLoadingBursa(true);
    try {
      const oppositeGender =
        myPublicProfile.gender === "Laki-laki" ? "Perempuan" : "Laki-laki";
      const q = query(
        collection(db, "match_profiles"),
        where("gender", "==", oppositeGender),
        limit(50)
      );
      const snap = await getDocs(q);
      const list: PublicMatchProfile[] = [];
      snap.forEach((docItem) => {
        const d = docItem.data() as PublicMatchProfile;
        if (d.id !== myPublicProfile.id && d.isAvailable !== false) {
          list.push(d);
        }
      });
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setBursaCandidates(list);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("Gagal memuat bursa:", err);
      showToast(`Gagal memuat daftar lawan jenis: ${detail}`, "error");
    } finally {
      setIsLoadingBursa(false);
    }
  }, [myPublicProfile, showToast]);

  useEffect(() => {
    if (screen === "bursa" && myPublicProfile) {
      fetchBursaCandidates();
    }
  }, [screen, myPublicProfile, fetchBursaCandidates]);

  // REAL-TIME LISTENER UNTUK INCOMING LIKES & MUTUAL MATCH
  useEffect(() => {
    if (!myPublicProfile || !isFirebaseReady || !db) return;

    const incomingQuery = query(
      collection(db, "match_swipes"),
      where("toId", "==", myPublicProfile.id)
    );

    const unsubIncoming = onSnapshot(incomingQuery, (snap) => {
      const likes: { fromId: string; fromName: string }[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === "liked") {
          likes.push({ fromId: data.fromId, fromName: data.fromName });
        }
        if (
          data.status === "matched" &&
          data.roomCode &&
          matchedRoomHandledRef.current !== data.roomCode
        ) {
          matchedRoomHandledRef.current = data.roomCode;
          const role: "player1" | "player2" =
            myPublicProfile.gender === "Laki-laki" ? "player1" : "player2";
          setMyRole(role);
          setMode("couple");
          setIsMatchmakingRoom(true);
          setInviteCode(data.roomCode);
          sfxWin();
          showToast(
            `💘 IT'S A MATCH dengan ${data.fromName}! ${
              data.maleInitiatorName || "Si cowok"
            } otomatis ngasih kode ${data.roomCode}. Masuk arena!`,
            "success"
          );
          goScreen("game");
        }
      });
      setIncomingLikes(likes);
    });

    return () => unsubIncoming();
  }, [myPublicProfile, goScreen, showToast]);

  // REAL-TIME LISTENER FIRESTORE ROOM
  useEffect(() => {
    if (!inviteCode || !isFirebaseReady || !db) return;
    if (mode === "solo" && screen === "game") return;

    const roomRef = doc(db, "rooms", inviteCode);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();

      if (data.player1) setPlayer1(data.player1);
      if (data.player2) setPlayer2(data.player2);
      if (data.p1Deck) setP1OnlineDeck(data.p1Deck);
      if (data.p2Deck) setP2OnlineDeck(data.p2Deck);
      if (data.c1) setC1State(data.c1);
      if (data.c2) setC2State(data.c2);
      if (data.history) setHistory(data.history);
      if (data.stats) setStats(data.stats);
      if (data.endingReason) setEndingReason(data.endingReason);
      if (typeof data.isMatchmakingRoom === "boolean") {
        setIsMatchmakingRoom(data.isMatchmakingRoom);
      }

      if (
        data.lastRoundSummary &&
        data.lastRoundSummary.id !== lastSummaryIdRef.current
      ) {
        lastSummaryIdRef.current = data.lastRoundSummary.id;
        showToast(
          data.lastRoundSummary.text,
          data.lastRoundSummary.delta >= 0 ? "success" : "warning"
        );
      }

      if (typeof data.battery === "number") {
        const diff = data.battery - prevBatteryRef.current;
        if (diff !== 0) {
          setDeltaPop({ val: diff, key: Date.now() + Math.random() });
          if (diff < 0) setShakeHud((s) => s + 1);
          prevBatteryRef.current = data.battery;
        }
        setBattery(data.battery);
      }

      if (typeof data.round === "number") {
        setRound(data.round);
      }

      if (
        data.status === "playing" &&
        data.player1 &&
        data.player2 &&
        (screen === "mode" ||
          screen === "bursa" ||
          (screen === "quiz" && myRole === "player2"))
      ) {
        setMode("couple");
        prevBatteryRef.current = data.battery ?? 50;
        setGameStage("dilemma");
        setTimerSeconds(60);
        setTimerActive(true);
        sfxCharge();
        goScreen("game");
      }

      if (data.status === "finished" && screen === "game") {
        setTimerActive(false);
        if ((data.battery ?? 0) >= 80) sfxWin();
        else if ((data.battery ?? 0) >= 45) sfxCharge();
        else sfxPenalty();
        goScreen("ending");
      }
    });

    return () => unsubscribe();
  }, [inviteCode, mode, screen, myRole, goScreen, showToast]);

  // Registration Handler
  const handleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const ageNum = parseInt(regAge, 10);

    if (isNaN(ageNum) || ageNum < 18) {
      sfxPenalty();
      setRegError({
        title:
          "Akses Ditolak! Minimal usia 18 tahun untuk mengurus drama hubungan.",
        text: `Usiamu baru ${
          isNaN(ageNum) ? "belum jelas" : ageNum + " tahun"
        }. Kelarin dulu urusan sekolah/kuliah sebelum uji nyali soal KUA!`,
        key: Date.now(),
      });
      return;
    }

    if (landingTab === "bursa") {
      if (!googleUser) {
        sfxPenalty();
        setRegError({
          title: "Wajib Masuk dengan Google!",
          text: "Klik tombol 'Masuk dengan Google' di atas supaya profil, daftar Match, dan status VIP Rp10.000 kamu tersimpan permanen.",
          key: Date.now(),
        });
        return;
      }

      const nameLeak = detectContactLeak(regName);
      if (nameLeak) {
        sfxPenalty();
        setRegError({
          title: "Nama Panggilan Tidak Valid!",
          text: nameLeak,
          key: Date.now(),
        });
        return;
      }
      const bioLeak = detectContactLeak(regBio);
      if (bioLeak) {
        sfxPenalty();
        setRegError({
          title: "Bio Singkat Terdeteksi Kontak!",
          text: bioLeak,
          key: Date.now(),
        });
        return;
      }
      if (!regCity.trim()) {
        sfxPenalty();
        setRegError({
          title: "Domisili Wajib Diisi!",
          text: "Masukkan kota tempat tinggalmu agar pasangan mabar tahu jarak kalian.",
          key: Date.now(),
        });
        return;
      }
    }

    if (landingTab === "invite") {
      const code = inputJoinCode.trim().toUpperCase();
      if (!code || code.length < 4) {
        sfxPenalty();
        setRegError({
          title: "Kode Undangan Kosong!",
          text: "Masukkan kode undangan yang dikirim pasanganmu.",
          key: Date.now(),
        });
        return;
      }

      if (!isFirebaseReady || !db) {
        sfxPenalty();
        setRegError({
          title: "Database Online Belum Terkonfigurasi",
          text: "Pastikan Firebase di Vercel sudah terpasang.",
          key: Date.now(),
        });
        return;
      }

      setIsCheckingRoom(true);
      try {
        const roomRef = doc(db, "rooms", code);
        const roomSnap = await getDoc(roomRef);

        if (!roomSnap.exists()) {
          sfxPenalty();
          setRegError({
            title: "Kode Undangan Tidak Ditemukan!",
            text: `Room dengan kode ${code} tidak ditemukan atau pasanganmu belum menyelesaikan 20 pertanyaan.`,
            key: Date.now(),
          });
          setIsCheckingRoom(false);
          return;
        }

        const roomData = roomSnap.data();
        const hostProfile: PlayerProfile = roomData.player1;

        if (hostProfile.gender === regGender) {
          sfxPenalty();
          setRegError({
            title:
              "Ditolak! Kode undangan hanya berlaku untuk pasangan lawan jenis.",
            text: `Kode ${code} dibuat oleh ${hostProfile.name} (${hostProfile.gender}).`,
            key: Date.now(),
          });
          setIsCheckingRoom(false);
          return;
        }

        if (roomData.player2 && roomData.status === "playing") {
          sfxPenalty();
          setRegError({
            title: "Room Sudah Penuh!",
            text: `Kode ${code} sudah dipakai pasangan lain yang sedang bermain.`,
            key: Date.now(),
          });
          setIsCheckingRoom(false);
          return;
        }

        sfxTap();
        setRegError(null);
        setMyRole("player2");
        setInviteCode(code);
        setMode("couple");
        setIsMatchmakingRoom(false);
        setPlayer1(hostProfile);
        setPlayer2({
          name: regName.trim(),
          email: regEmail.trim(),
          gender: regGender,
          age: ageNum,
          questions: build20QuestionsForProfile(regGender, ageNum),
          answers: {},
        });
        setQuizTarget("player2");
        setQuizIndex(0);
        setIsCheckingRoom(false);
        goScreen("quiz");
        return;
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        sfxPenalty();
        setRegError({
          title: "Gagal Terhubung ke Server",
          text: `Penyebab: ${detail}`,
          key: Date.now(),
        });
        setIsCheckingRoom(false);
        return;
      }
    }

    sfxTap();
    setRegError(null);
    setMyRole("player1");
    setMode("solo");
    setIsMatchmakingRoom(landingTab === "bursa");
    const generatedCode = "KAWIN-" + Math.floor(100 + Math.random() * 899);
    setInviteCode(generatedCode);
    setPlayer1({
      name: regName.trim(),
      email: regEmail.trim(),
      gender: regGender,
      age: ageNum,
      city: regCity.trim(),
      bio: regBio.trim(),
      questions: build20QuestionsForProfile(regGender, ageNum),
      answers: {},
    });
    setPlayer2(null);
    setQuizTarget("player1");
    setQuizIndex(0);
    goScreen("quiz");
  };

  // Quiz Answer Handler
  const answerQuiz = async (choice: "iya" | "kayanya" | "engga") => {
    sfxTap();
    const activeProfile = quizTarget === "player1" ? player1 : player2;
    if (!activeProfile) return;

    const currentQ = activeProfile.questions[quizIndex];
    const updatedProfile: PlayerProfile = {
      ...activeProfile,
      answers: { ...activeProfile.answers, [currentQ.id]: choice },
    };

    if (quizTarget === "player1") setPlayer1(updatedProfile);
    else setPlayer2(updatedProfile);

    if (quizIndex + 1 < activeProfile.questions.length) {
      setQuizIndex(quizIndex + 1);
    } else {
      await finishQuizPhase(updatedProfile);
    }
  };

  const finishQuizPhase = async (completedProfile: PlayerProfile) => {
    if (landingTab === "bursa" && isFirebaseReady && db) {
      setIsSavingRoom(true);
      try {
        let iyaCount = 0;
        let kayanyaCount = 0;
        completedProfile.questions.forEach((q) => {
          if (completedProfile.answers[q.id] === "iya") iyaCount++;
          else if (completedProfile.answers[q.id] === "kayanya") kayanyaCount++;
        });

        const profileId =
          googleUser?.uid ||
          buildProfileId(completedProfile.email, completedProfile.gender);

        const pubProfile: PublicMatchProfile = {
          id: profileId,
          name: completedProfile.name,
          email: completedProfile.email,
          photoURL: googleUser?.photoURL || "",
          gender: completedProfile.gender,
          age: completedProfile.age,
          city: completedProfile.city || "Indonesia",
          bio:
            completedProfile.bio ||
            "Siap uji kecocokan red flag sebelum ke KUA!",
          questions: completedProfile.questions,
          answers: completedProfile.answers,
          iyaCount,
          kayanyaCount,
          isAvailable: true,
          isUpgraded: Boolean(myPublicProfile?.isUpgraded),
          updatedAt: Date.now(),
        };

        await publishToMatchmakingPool(pubProfile);
        setMyPublicProfile(pubProfile);
        setIsSavingRoom(false);
        showToast(
          "✨ Profilmu sudah tayang di Bursa Mabar! Pilih lawan jenis untuk mulai.",
          "success"
        );
        goScreen("bursa");
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(err);
        setIsSavingRoom(false);
        showToast(`Gagal mempublikasikan ke bursa: ${detail}`, "error");
      }
      return;
    }

    if (myRole === "player2" && player1 && isFirebaseReady && db) {
      setIsSavingRoom(true);
      try {
        const p1Deck = buildDeckFromPartnerProfile(
          completedProfile,
          "player1",
          maxRounds
        );
        const p2Deck = buildDeckFromPartnerProfile(
          player1,
          "player2",
          maxRounds
        );

        const roomRef = doc(db, "rooms", inviteCode);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(roomRef);
          if (!snap.exists()) throw new Error("Room hilang");
          tx.update(roomRef, {
            player2: completedProfile,
            p1Deck,
            p2Deck,
            status: "playing",
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
        });
        setIsSavingRoom(false);
      } catch (err) {
        console.error(err);
        setIsSavingRoom(false);
        showToast(
          "Gagal menyinkronkan data dengan pasangan. Coba ulangi.",
          "error"
        );
      }
      return;
    }

    if (myRole === "player1" && inviteCode && isFirebaseReady && db) {
      setIsSavingRoom(true);
      try {
        const roomRef = doc(db, "rooms", inviteCode);
        await setDoc(roomRef, {
          code: inviteCode,
          player1: completedProfile,
          player2: null,
          status: "waiting",
          isMatchmakingRoom: false,
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
      } catch (err) {
        console.error("Gagal membuat room online:", err);
      } finally {
        setIsSavingRoom(false);
      }
    }

    goScreen("mode");
  };

  const handleSelectCandidate = async (candidate: PublicMatchProfile) => {
    if (!myPublicProfile) return;
    sfxTap();
    setSendingLikeId(candidate.id);
    try {
      const res = await sendLikeAndCheckMatch<DeckCard>({
        me: myPublicProfile,
        target: candidate,
        buildDecks: (maleProfile, femaleProfile) => ({
          p1Deck: buildDeckFromPartnerProfile(
            femaleProfile,
            "player1",
            maxRounds
          ),
          p2Deck: buildDeckFromPartnerProfile(
            maleProfile,
            "player2",
            maxRounds
          ),
        }),
      });

      setLikedTargetIds((prev) => ({ ...prev, [candidate.id]: true }));

      if (res.matched && res.roomCode) {
        matchedRoomHandledRef.current = res.roomCode;
        const role: "player1" | "player2" =
          myPublicProfile.gender === "Laki-laki" ? "player1" : "player2";
        const maleName =
          myPublicProfile.gender === "Laki-laki"
            ? myPublicProfile.name
            : candidate.name;
        setMyRole(role);
        setMode("couple");
        setIsMatchmakingRoom(true);
        setInviteCode(res.roomCode);
        sfxWin();
        showToast(
          `💘 MATCH dengan ${candidate.name}! ${maleName} otomatis ngasih kode ${res.roomCode}!`,
          "success"
        );
        goScreen("game");
      } else {
        showToast(
          `💌 Pilihan terkirim ke ${candidate.name}! Jika dia memilihmu balik, game otomatis dimulai.`,
          "info"
        );
      }
    } catch (err) {
      console.error(err);
      showToast("Gagal mengirim pilihan. Coba lagi.", "error");
    } finally {
      setSendingLikeId(null);
    }
  };

  const startSoloGame = () => {
    const activePlayer: PlayerProfile | null =
      player1 ||
      (myPublicProfile
        ? {
            name: myPublicProfile.name,
            email: myPublicProfile.email,
            gender: myPublicProfile.gender,
            age: myPublicProfile.age,
            city: myPublicProfile.city,
            bio: myPublicProfile.bio,
            questions: myPublicProfile.questions,
            answers: myPublicProfile.answers,
          }
        : null);

    if (!activePlayer) return;
    if (!player1) setPlayer1(activePlayer);

    sfxTap();
    const botGender =
      activePlayer.gender === "Laki-laki" ? "Perempuan" : "Laki-laki";
    const persona = getBotPersonaConfig(botGender, botAgeSlider);
    const botQuestions = build20QuestionsForProfile(botGender, botAgeSlider);
    const botAnswers: PlayerProfile["answers"] = {};
    botQuestions.forEach((q, i) => {
      if (i % 3 === 0 || i % 5 === 0) botAnswers[q.id] = "iya";
      else if (i % 2 === 0) botAnswers[q.id] = "kayanya";
      else botAnswers[q.id] = "engga";
    });

    const botProfile: PlayerProfile = {
      name: persona.name,
      email: "bot@ai.id",
      gender: botGender,
      age: botAgeSlider,
      questions: botQuestions,
      answers: botAnswers,
      emoji: persona.emoji,
      tier: persona.tier,
      vibe: persona.vibe,
      bio: persona.bio,
      reactAccept: persona.reactAccept,
      reactReject: persona.reactReject,
    };

    const generatedSoloDeck = buildDeckFromPartnerProfile(
      botProfile,
      "player1",
      maxRounds
    );

    setMode("solo");
    setIsMatchmakingRoom(false);
    setPlayer2(botProfile);
    setSoloDeck(generatedSoloDeck);
    setBattery(50);
    prevBatteryRef.current = 50;
    setDeltaPop(null);
    setRound(1);
    setConsecutiveTimeouts(0);
    setHistory([]);
    setStats({
      terimaMantap: 0,
      menyesal: 0,
      kompromiSepakat: 0,
      deadlockOrAfk: 0,
    });
    setEndingReason("");
    setGameStage("dilemma");
    setTimerSeconds(60);
    setTimerActive(true);
    goScreen("game");
  };

  const finalizeRoundIfBothResolved = (
    data: Record<string, unknown>,
    c1: CardRoundState,
    c2: CardRoundState
  ) => {
    const p1Deck: DeckCard[] = (data.p1Deck as DeckCard[]) || [];
    const p2Deck: DeckCard[] = (data.p2Deck as DeckCard[]) || [];
    const curRound = (data.round as number) || 1;
    const card1 = p1Deck[curRound - 1];
    const card2 = p2Deck[curRound - 1];

    const roundDelta = (c1.delta ?? 0) + (c2.delta ?? 0);
    const nextBattery = Math.max(
      0,
      Math.min(100, ((data.battery as number) ?? 50) + roundDelta)
    );

    const prevHistory: HistoryItem[] = (data.history as HistoryItem[]) || [];
    const newItems: HistoryItem[] = [
      {
        round: curRound,
        category: card1?.category || "Masalah",
        isWildcard: Boolean(card1?.isWildcard),
        problem: card1?.partnerPrompt || "",
        outcomeLabel: c1.outcomeLabel || "",
        delta: c1.delta ?? 0,
        type:
          (c1.delta ?? 0) > 5
            ? "good"
            : (c1.delta ?? 0) > 0
            ? "neutral"
            : "bad",
      },
      {
        round: curRound,
        category: card2?.category || "Masalah",
        isWildcard: Boolean(card2?.isWildcard),
        problem: card2?.partnerPrompt || "",
        outcomeLabel: c2.outcomeLabel || "",
        delta: c2.delta ?? 0,
        type:
          (c2.delta ?? 0) > 5
            ? "good"
            : (c2.delta ?? 0) > 0
            ? "neutral"
            : "bad",
      },
    ];

    const prevStats = (data.stats as typeof stats) || {
      terimaMantap: 0,
      menyesal: 0,
      kompromiSepakat: 0,
      deadlockOrAfk: 0,
    };
    const updatedStats = { ...prevStats };
    if (c1.statType)
      updatedStats[c1.statType] = (updatedStats[c1.statType] || 0) + 1;
    if (c2.statType)
      updatedStats[c2.statType] = (updatedStats[c2.statType] || 0) + 1;

    const isGameOver = nextBattery <= 0 || curRound >= maxRounds;
    const nextReason =
      nextBattery <= 0
        ? "Baterai Cinta habis menyentuh 0% sebelum ronde selesai!"
        : "";

    const summaryText = `Ronde ${curRound} selesai (${
      roundDelta >= 0 ? `+${roundDelta}%` : `${roundDelta}%`
    }) • ${c1.outcomeLabel} & ${c2.outcomeLabel}`;

    return {
      battery: nextBattery,
      history: [...prevHistory, ...newItems],
      stats: updatedStats,
      round: isGameOver ? curRound : curRound + 1,
      status: isGameOver ? "finished" : "playing",
      endingReason: nextReason,
      c1: isGameOver ? c1 : { status: "dilemma" },
      c2: isGameOver ? c2 : { status: "dilemma" },
      lastRoundSummary: {
        id: Date.now() + Math.random(),
        text: summaryText,
        delta: roundDelta,
      },
      updatedAt: Date.now(),
    };
  };

  const submitOnlineResponderDirect = async (
    delta: number,
    outcomeLabel: string,
    statType: CardRoundState["statType"]
  ) => {
    if (!inviteCode || !isFirebaseReady || !db) return;
    setIsSubmittingDecision(true);
    setTimerActive(false);

    try {
      const roomRef = doc(db, "rooms", inviteCode);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status === "finished") return;

        const c1: CardRoundState = { ...(data.c1 || { status: "dilemma" }) };
        const c2: CardRoundState = { ...(data.c2 || { status: "dilemma" }) };

        const resolvedCard: CardRoundState = {
          status: "resolved",
          delta,
          outcomeLabel,
          statType,
        };

        if (myRole === "player1") Object.assign(c1, resolvedCard);
        else Object.assign(c2, resolvedCard);

        if (c1.status === "resolved" && c2.status === "resolved") {
          tx.update(roomRef, finalizeRoundIfBothResolved(data, c1, c2));
        } else {
          tx.update(roomRef, {
            c1,
            c2,
            updatedAt: Date.now(),
          });
        }
      });
    } catch (err) {
      console.error(err);
      showToast("Gagal mengirim jawaban. Periksa koneksi.", "error");
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const submitOnlineResponderRejectChoice = async (chosenIdx: number) => {
    if (!inviteCode || !isFirebaseReady || !db) return;
    setIsSubmittingDecision(true);
    setTimerActive(false);

    try {
      const roomRef = doc(db, "rooms", inviteCode);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status === "finished") return;

        const c1: CardRoundState = { ...(data.c1 || { status: "dilemma" }) };
        const c2: CardRoundState = { ...(data.c2 || { status: "dilemma" }) };

        const targetCard = myRole === "player1" ? c1 : c2;
        targetCard.status = "negotiating";
        targetCard.responderChoice = chosenIdx;

        tx.update(roomRef, {
          c1,
          c2,
          updatedAt: Date.now(),
        });
      });
      showToast(
        `Opsi ${String.fromCharCode(
          65 + chosenIdx
        )} terkunci! Menunggu pasangan memilih kompromi yang sama...`,
        "info"
      );
    } catch (err) {
      console.error(err);
      showToast("Gagal mengirim pilihan kompromi.", "error");
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const submitOnlineOwnerCompromiseChoice = async (ownerIdx: number) => {
    if (!inviteCode || !isFirebaseReady || !db || !player1 || !player2) return;
    setIsSubmittingDecision(true);
    setTimerActive(false);

    try {
      const roomRef = doc(db, "rooms", inviteCode);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status === "finished") return;

        const c1: CardRoundState = { ...(data.c1 || { status: "dilemma" }) };
        const c2: CardRoundState = { ...(data.c2 || { status: "dilemma" }) };

        const ownedCard = myRole === "player1" ? c2 : c1;
        const responderIdx = ownedCard.responderChoice ?? 0;
        const isTimeout = ownerIdx === -1;
        const isMatch = !isTimeout && responderIdx === ownerIdx;

        const responderName =
          myRole === "player1" ? player2.name : player1.name;
        const ownerName = myRole === "player1" ? player1.name : player2.name;

        ownedCard.ownerChoice = ownerIdx;
        ownedCard.status = "resolved";
        ownedCard.delta = isMatch ? 8 : -10;
        ownedCard.statType = isMatch ? "kompromiSepakat" : "deadlockOrAfk";
        ownedCard.outcomeLabel = isMatch
          ? `💘 Kompromi Match! (Opsi ${String.fromCharCode(65 + ownerIdx)})`
          : isTimeout
          ? `⏱️ Timeout Kompromi (${ownerName})`
          : `💥 Deadlock Kompromi (${responderName}: ${String.fromCharCode(
              65 + responderIdx
            )} vs ${ownerName}: ${String.fromCharCode(65 + ownerIdx)})`;

        if (isMatch) sfxCharge();
        else sfxPenalty();

        if (c1.status === "resolved" && c2.status === "resolved") {
          tx.update(roomRef, finalizeRoundIfBothResolved(data, c1, c2));
        } else {
          tx.update(roomRef, {
            c1,
            c2,
            updatedAt: Date.now(),
          });
        }
      });
    } catch (err) {
      console.error(err);
      showToast("Gagal mengirim pilihan kompromi.", "error");
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const advanceSoloRound = (projectedBattery: number) => {
    if (projectedBattery <= 0) {
      setTimerActive(false);
      setEndingReason(
        "Baterai Cinta habis menyentuh 0% sebelum ronde selesai!"
      );
      sfxPenalty();
      goScreen("ending");
      return;
    }
    if (round >= maxRounds) {
      setTimerActive(false);
      if (projectedBattery >= 80) sfxWin();
      else if (projectedBattery >= 45) sfxCharge();
      else sfxPenalty();
      goScreen("ending");
      return;
    }
    setRound((prev) => prev + 1);
    setGameStage("dilemma");
    setTimerSeconds(60);
    setTimerActive(true);
  };

  const myActiveDeck =
    mode === "solo"
      ? soloDeck
      : myRole === "player1"
      ? p1OnlineDeck
      : p2OnlineDeck;
  const myOwnedDeck = myRole === "player1" ? p2OnlineDeck : p1OnlineDeck;

  const currentCard = myActiveDeck[round - 1];
  const myOwnedCard = myOwnedDeck[round - 1];

  const meProfile =
    mode === "solo" ? player1 : myRole === "player1" ? player1 : player2;
  const partnerProfile =
    mode === "solo" ? player2 : myRole === "player1" ? player2 : player1;

  const handleTimeoutPenalty = async () => {
    sfxPenalty();
    if (!currentCard || !meProfile) return;

    if (mode === "couple") {
      if (needsResponderAction) {
        showToast("⏱️ Waktu habis! Dihitung telat merespons (-10%).", "error");
        await submitOnlineResponderDirect(
          -10,
          `${meProfile.name}: Timeout / Telat Jawab`,
          "deadlockOrAfk"
        );
      } else if (needsOwnerCompromiseAction) {
        showToast("⏱️ Waktu habis memilih kompromi (-10%).", "error");
        await submitOnlineOwnerCompromiseChoice(-1);
      }
      return;
    }

    const nextAfk = consecutiveTimeouts + 1;
    setConsecutiveTimeouts(nextAfk);
    const nextBattery = Math.max(0, Math.min(100, battery - 15));
    applyBatteryDelta(-15);
    setStats((s) => ({ ...s, deadlockOrAfk: s.deadlockOrAfk + 1 }));
    setHistory((h) => [
      ...h,
      {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `Timeout / AFK (${meProfile.name})`,
        delta: -15,
        type: "bad",
      },
    ]);
    showToast(
      "⏱️ Waktu habis / AFK! Dihitung Tolak tanpa kompromi (-15%).",
      "error"
    );

    if (nextAfk >= 3) {
      setTimeout(() => {
        setEndingReason("3x Timeout / Ghosting Berturut-turut!");
        goScreen("ending");
      }, 900);
      return;
    }
    setTimeout(() => advanceSoloRound(nextBattery), 950);
  };

  const chooseAcceptCard = () => {
    sfxFlip();
    setConsecutiveTimeouts(0);
    setGameStage("consequence");
  };

  const chooseRejectCard = () => {
    sfxFlip();
    setConsecutiveTimeouts(0);
    setGameStage("negotiate");
  };

  const resolveConsequence = async (isFirm: boolean) => {
    if (!currentCard || !meProfile) return;

    if (mode === "couple") {
      if (isFirm) {
        sfxCharge();
        showToast("Komitmen terkunci (+8%)!", "success");
        await submitOnlineResponderDirect(
          8,
          `${meProfile.name}: Terima Konsekuensi Mantap`,
          "terimaMantap"
        );
      } else {
        sfxPenalty();
        showToast("Menyesal pilih terima (-10%)!", "error");
        await submitOnlineResponderDirect(
          -10,
          `${meProfile.name}: Menyesal Pilih Terima`,
          "menyesal"
        );
      }
      return;
    }

    setTimerActive(false);
    if (isFirm) {
      sfxCharge();
      const nextBattery = Math.max(0, Math.min(100, battery + 10));
      applyBatteryDelta(10);
      setStats((s) => ({ ...s, terimaMantap: s.terimaMantap + 1 }));
      setHistory((h) => [
        ...h,
        {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `${meProfile.name}: Terima Konsekuensi Mantap`,
          delta: 10,
          type: "good",
        },
      ]);
      showToast("Komitmen penuh! Baterai Cinta +10%", "success");
      setTimeout(() => advanceSoloRound(nextBattery), 800);
    } else {
      sfxPenalty();
      const nextBattery = Math.max(0, Math.min(100, battery - 12));
      applyBatteryDelta(-12);
      setStats((s) => ({ ...s, menyesal: s.menyesal + 1 }));
      setHistory((h) => [
        ...h,
        {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `${meProfile.name}: Menyesal Pilih Terima`,
          delta: -12,
          type: "bad",
        },
      ]);
      showToast("Asal mengiyakan lalu menyesal! Penalti berat -12%", "error");
      setTimeout(() => advanceSoloRound(nextBattery), 800);
    }
  };

  const resolveNegotiation = async (chosenIdx: number) => {
    if (!currentCard || !meProfile || !partnerProfile) return;

    if (mode === "couple") {
      sfxFlip();
      await submitOnlineResponderRejectChoice(chosenIdx);
      return;
    }

    setTimerActive(false);
    const tier = partnerProfile.tier || "mid";
    const botIdx = currentCard.botPref[tier] ?? 0;
    const isAgreed = chosenIdx === botIdx;

    if (isAgreed) {
      sfxCharge();
      const nextBattery = Math.max(0, Math.min(100, battery + 5));
      applyBatteryDelta(5);
      setStats((s) => ({ ...s, kompromiSepakat: s.kompromiSepakat + 1 }));
      setHistory((h) => [
        ...h,
        {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `Tolak → Sepakat Kompromi (${String.fromCharCode(
            65 + chosenIdx
          )})`,
          delta: 5,
          type: "neutral",
        },
      ]);
      showToast(
        `Sepakat sama ${partnerProfile.name} di Opsi ${String.fromCharCode(
          65 + chosenIdx
        )}! Baterai +5%`,
        "success"
      );
      setTimeout(() => advanceSoloRound(nextBattery), 950);
    } else {
      sfxPenalty();
      const nextBattery = Math.max(0, Math.min(100, battery - 15));
      applyBatteryDelta(-15);
      setStats((s) => ({ ...s, deadlockOrAfk: s.deadlockOrAfk + 1 }));
      setHistory((h) => [
        ...h,
        {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `Tolak → Deadlock (Kamu: ${String.fromCharCode(
            65 + chosenIdx
          )}, ${partnerProfile.name}: ${String.fromCharCode(65 + botIdx)})`,
          delta: -15,
          type: "bad",
        },
      ]);
      showToast(
        `Deadlock! Kamu pilih ${String.fromCharCode(65 + chosenIdx)}, ${
          partnerProfile.name
        } maunya ${String.fromCharCode(65 + botIdx)} (-15%)`,
        "error"
      );
      setTimeout(() => advanceSoloRound(nextBattery), 950);
    }
  };

  const endingVerdict =
    battery >= 80
      ? {
          emoji: "💍",
          title: "BESOK KAWIN!",
          subtitle:
            "Red flag kalian berdua ternyata saling mengunci kayak puzzle! Kesiapan mental dan kompromi kalian udah matang. Langsung booking KUA!",
          border: "border-emerald-500/60 shadow-emerald-500/15",
          badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
          titleClass:
            "text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-300 to-amber-300",
        }
      : battery >= 45
      ? {
          emoji: "⏳",
          title: "PACARAN DULU AJA",
          subtitle:
            "Rasa sayang sih ada, tapi masih banyak kompromi yang gantung dan ego yang belum kelar. Pacaran dulu aja sambil benerin komunikasi!",
          border: "border-amber-500/60 shadow-amber-500/10",
          badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
          titleClass: "text-amber-400",
        }
      : {
          emoji: "🚨",
          title: "STOP THE WEDDING",
          subtitle: endingReason
            ? `${endingReason} Terlalu banyak deadlock dan penyesalan. Mending batalin sekarang daripada jadi drama!`
            : "Terlalu banyak penyesalan, deadlock ego, dan bom waktu kebiasaan buruk. Mending stop sekarang sebelum jadi beban seumur hidup!",
          border: "border-red-500/60 shadow-red-500/15",
          badgeBg: "bg-red-500/20 text-red-300 border-red-500/40",
          titleClass: "text-red-500",
        };

  const downloadStoryCardPNG = () => {
    if (!player1 || !player2 || typeof document === "undefined") return;
    sfxTap();

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, 1080, 1920);

    const isWin = battery >= 80;
    const isMid = battery >= 45 && battery < 80;
    const accentColor = isWin ? "#10b981" : isMid ? "#f59e0b" : "#f43f5e";
    const accentGlow = isWin
      ? "rgba(16, 185, 129, 0.22)"
      : isMid
      ? "rgba(245, 158, 11, 0.22)"
      : "rgba(244, 63, 94, 0.25)";

    const grad = ctx.createRadialGradient(540, 620, 60, 540, 620, 760);
    grad.addColorStop(0, accentGlow);
    grad.addColorStop(1, "rgba(9, 13, 22, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1920);

    const roundRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    ctx.fillStyle = "#f43f5e";
    ctx.font = "900 44px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BESOK KAWIN? • 18+", 540, 160);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 28px sans-serif";
    ctx.fillText("HASIL UJI NYALI & RED FLAG PASANGAN", 540, 210);

    roundRect(80, 280, 920, 1180, 48);
    ctx.fillStyle = "rgba(17, 24, 39, 0.94)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = accentColor;
    ctx.stroke();

    ctx.font = "130px sans-serif";
    ctx.fillText(endingVerdict.emoji, 540, 460);

    roundRect(310, 515, 460, 64, 32);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fill();
    ctx.fillStyle = accentColor;
    ctx.font = "800 30px monospace";
    ctx.fillText(`BATERAI CINTA: ${battery}%`, 540, 558);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 66px sans-serif";
    ctx.fillText(endingVerdict.title, 540, 665);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 34px sans-serif";
    ctx.fillText(
      `${player1.name} (${player1.age})  ⚡  ${player2.name} (${player2.age})`,
      540,
      740
    );

    roundRect(150, 795, 780, 44, 22);
    ctx.fillStyle = "#020617";
    ctx.fill();
    if (battery > 0) {
      roundRect(156, 801, Math.max(32, (768 * battery) / 100), 32, 16);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "500 30px sans-serif";
    const words = endingVerdict.subtitle.split(" ");
    let line = "";
    let lineY = 915;
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      if (ctx.measureText(testLine).width > 780 && i > 0) {
        ctx.fillText(line.trim(), 540, lineY);
        line = words[i] + " ";
        lineY += 44;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), 540, lineY);

    const statBoxes = [
      { label: "TERIMA MANTAP", val: `${stats.terimaMantap}x`, color: "#10b981" },
      { label: "NYESEL TERIMA", val: `${stats.menyesal}x`, color: "#f43f5e" },
      { label: "KOMPROMI", val: `${stats.kompromiSepakat}x`, color: "#f59e0b" },
      { label: "DEADLOCK / AFK", val: `${stats.deadlockOrAfk}x`, color: "#ef4444" },
    ];

    statBoxes.forEach((box, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = 140 + col * 410;
      const by = 1140 + row * 135;
      roundRect(bx, by, 390, 115, 24);
      ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = box.color;
      ctx.font = "900 34px monospace";
      ctx.fillText(box.val, bx + 195, by + 54);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 22px sans-serif";
      ctx.fillText(box.label, bx + 195, by + 90);
    });

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 28px sans-serif";
    ctx.fillText("Berani buka borokmu sebelum ke KUA?", 540, 1580);

    ctx.fillStyle = "#f43f5e";
    ctx.font = "800 34px monospace";
    ctx.fillText("besok-kawin.vercel.app", 540, 1635);

    const link = document.createElement("a");
    link.download = `BESOK-KAWIN-${player1.name}-${player2.name}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("📸 Kartu Hasil IG Story berhasil diunduh!", "success");
  };

  const fullResetGame = () => {
    sfxTap();
    setTimerActive(false);
    setInviteCode("");
    setMyRole("player1");
    setMode("solo");
    setIsMatchmakingRoom(false);
    matchedRoomHandledRef.current = "";
    setPlayer1(null);
    setPlayer2(null);
    setC1State({ status: "dilemma" });
    setC2State({ status: "dilemma" });
    setHistory([]);
    setRegError(null);
    if (myPublicProfile) {
      goScreen("bursa");
    } else {
      setLandingTab("new");
      goScreen("register");
    }
  };

  const openProfileOrPrompt = () => {
    sfxTap();
    if (myPublicProfile) {
      goScreen("profile");
    } else {
      setLandingTab("bursa");
      goScreen("register");
      showToast(
        "Isi data & 20 pengakuan di Bursa Mabar dulu untuk membuka Profil & Chat!",
        "info"
      );
    }
  };

  const activeQuizProfile = quizTarget === "player1" ? player1 : player2;
  const activeQuizQuestion = activeQuizProfile?.questions[quizIndex];

  const p1Counts = { iya: 0, kayanya: 0, engga: 0 };
  if (player1) {
    player1.questions.forEach((q) => {
      const ans = player1.answers[q.id];
      if (ans === "iya") p1Counts.iya++;
      else if (ans === "kayanya") p1Counts.kayanya++;
      else p1Counts.engga++;
    });
  }

  const botOppositeGender =
    (player1?.gender || myPublicProfile?.gender) === "Laki-laki"
      ? "Perempuan"
      : "Laki-laki";
  const botPreview = getBotPersonaConfig(botOppositeGender, botAgeSlider);

  const myConfessions =
    meProfile?.questions.filter(
      (q) =>
        meProfile.answers[q.id] === "iya" ||
        meProfile.answers[q.id] === "kayanya"
    ) || [];
  const personalTrap =
    myConfessions.length > 0
      ? myConfessions[round % myConfessions.length]
      : meProfile?.questions[0];

  const filteredCandidates = bursaCandidates.filter((c) => {
    if (!bursaCityFilter.trim()) return true;
    return c.city
      .toLowerCase()
      .includes(bursaCityFilter.trim().toLowerCase());
  });

  void history;

  return (
    <div className="bg-grid-pattern fixed inset-0 overflow-hidden overscroll-none flex flex-col bg-[#090d16] text-slate-50 selection:bg-rose-500 selection:text-white">
      <style>{`
        html, body { position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden; overscroll-behavior: none; }
        .bg-grid-pattern {
          background-image: 
            radial-gradient(circle at 15% 15%, rgba(244, 63, 94, 0.12), transparent 35%),
            radial-gradient(circle at 85% 80%, rgba(16, 185, 129, 0.08), transparent 40%),
            linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 100% 100%, 100% 100%, 28px 28px, 28px 28px;
        }
        @keyframes cardEnter { 0% { opacity: 0; transform: translateY(16px) scale(0.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes cardFlipIn { 0% { opacity: 0; transform: rotateY(-12deg) scale(0.96); } 100% { opacity: 1; transform: rotateY(0deg) scale(1); } }
        @keyframes pulseShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        @keyframes floatUpFade { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-24px); } }
        .animate-card-enter { animation: cardEnter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-card-flip { animation: cardFlipIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-shake { animation: pulseShake 0.35s ease-in-out; }
        .animate-delta { animation: floatUpFade 1.2s ease-out forwards; }
        input[type="range"] { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-runnable-track { height: 8px; border-radius: 999px; background: #1f2937; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; margin-top: -6px;
          background-color: #f43f5e; height: 20px; width: 20px; border-radius: 50%;
          border: 3px solid #fff; box-shadow: 0 0 12px rgba(244, 63, 94, 0.6);
        }
        .btn-tactile { transition: transform 0.12s ease, box-shadow 0.15s ease, background-color 0.15s ease; }
        .btn-tactile:active { transform: scale(0.97); }
      `}</style>

      {/* TOP NAVIGATION BAR */}
      <header
        style={{ paddingTop: "max(0.65rem, env(safe-area-inset-top))" }}
        className="w-full shrink-0 border-b border-slate-800/80 bg-[#090d16]/95 backdrop-blur-md z-40 pb-2.5"
      >
        <div className="max-w-xl mx-auto px-3 sm:px-4 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-extrabold tracking-tight text-xs sm:text-base text-white whitespace-nowrap">
                  BESOK KAWIN?
                </span>
                <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                  18+
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight truncate hidden sm:block">
                Dating & Red Flag Card Game
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {(googleUser || myPublicProfile) && (
              <button
                onClick={openProfileOrPrompt}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center gap-1 border transition btn-tactile shrink-0 ${
                  screen === "profile"
                    ? "bg-amber-500 text-slate-950 border-amber-400"
                    : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40"
                }`}
              >
                <span>{myPublicProfile?.isUpgraded ? "👑" : "👤"}</span>
                <span>Profil & Chat</span>
              </button>
            )}

            {!isAppInstalled && (
              <button
                onClick={handleInstallClick}
                className="px-2 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-extrabold flex items-center gap-1 shadow-lg shadow-rose-500/25 transition btn-tactile shrink-0"
              >
                <span>📲</span>
                <span className="hidden sm:inline">Install</span>
              </button>
            )}

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title="Suara Efek"
              className="p-1.5 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700/70 text-xs"
            >
              {soundEnabled ? "🔊" : "🔈"}
            </button>

            {screen !== "register" && screen !== "profile" && (
              <button
                onClick={fullResetGame}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 whitespace-nowrap"
              >
                Keluar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* INSTALL GUIDE MODAL */}
      {showInstallGuide && (
        <div
          onClick={() => setShowInstallGuide(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-3xl p-5 shadow-2xl animate-card-enter"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📲</span>
                <h3 className="font-extrabold text-white text-sm sm:text-base">
                  Pasang Besok Kawin? di HP
                </h3>
              </div>
              <button
                onClick={() => setShowInstallGuide(false)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {isIosDevice ? (
              <ol className="space-y-2.5 text-xs text-slate-300 mb-4">
                <li className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <strong>1.</strong> Pastikan membuka link ini di{" "}
                  <strong className="text-white">Safari</strong>.
                </li>
                <li className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <strong>2.</strong> Tekan ikon{" "}
                  <strong className="text-rose-400">
                    Share (Kotak Panah Atas)
                  </strong>{" "}
                  di bilah bawah browser.
                </li>
                <li className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <strong>3.</strong> Pilih{" "}
                  <strong className="text-emerald-400">
                    Add to Home Screen (Tambah ke Layar Utama)
                  </strong>
                  .
                </li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-xs text-slate-300 mb-4">
                <li className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <strong>1.</strong> Jika membuka dari WhatsApp/Instagram, ketuk{" "}
                  <strong className="text-amber-400">Titik Tiga (⋮)</strong> lalu
                  pilih <strong className="text-white">Buka di Chrome</strong>.
                </li>
                <li className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <strong>2.</strong> Di Chrome, ketuk{" "}
                  <strong className="text-amber-400">Titik Tiga (⋮)</strong> di
                  pojok kanan atas, lalu pilih{" "}
                  <strong className="text-emerald-400">
                    Install app / Tambahkan ke Layar utama
                  </strong>
                  .
                </li>
              </ol>
            )}

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs btn-tactile"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

      {/* TOASTS */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto px-4 py-3 rounded-2xl border backdrop-blur-md shadow-2xl text-xs font-bold flex items-center gap-2.5 bg-slate-900/95 border-slate-700 text-slate-200 animate-card-enter"
          >
            <span>💬</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* MAIN CONTAINER */}
      <main
        ref={mainScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-none w-full flex flex-col"
      >
        <div className="my-auto w-full max-w-xl mx-auto px-4 py-3 sm:py-4 flex flex-col justify-center">
          {/* ==================== SCREEN 1: REGISTER & GOOGLE LOGIN ==================== */}
          {screen === "register" && (
            <section className="animate-card-enter py-1">
              <div className="text-center mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-1.5">
                  🔥 Uji Nyali Sebelum DP Gedung
                </span>
                <h1 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
                  Buka Borokmu di Depan, <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-pink-500 to-amber-400">
                    Biar Nggak Nyesel di KUA.
                  </span>
                </h1>
              </div>

              {/* BAR LOGIN GOOGLE PERMANEN */}
              <div className="mb-2.5">
                {!googleUser ? (
                  <button
                    type="button"
                    disabled={isLoggingInGoogle}
                    onClick={handleGoogleLogin}
                    className="w-full py-2.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-lg btn-tactile disabled:opacity-60"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                      />
                    </svg>
                    <span>
                      {isLoggingInGoogle
                        ? "Menghubungkan ke Google..."
                        : "Masuk dengan Google (Simpan Profil & VIP)"}
                    </span>
                  </button>
                ) : (
                  <div className="p-2.5 rounded-2xl bg-slate-900/95 border border-emerald-500/40 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-emerald-400 truncate">
                        ✅ {googleUser.email}
                      </p>
                      {myPublicProfile && (
                        <p className="text-[10px] text-slate-400">
                          Profil tersimpan:{" "}
                          <strong className="text-white">
                            {myPublicProfile.name}
                          </strong>{" "}
                          ({myPublicProfile.isUpgraded ? "👑 VIP" : "Gratis"})
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {myPublicProfile && (
                        <button
                          type="button"
                          onClick={() => goScreen("bursa")}
                          className="px-2.5 py-1 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-[11px]"
                        >
                          Bursa →
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleGoogleLogout}
                        className="px-2 py-1 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-[10px] font-bold"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800 mb-2.5">
                <button
                  type="button"
                  onClick={() => {
                    sfxTap();
                    setLandingTab("new");
                    setRegError(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition ${
                    landingTab === "new"
                      ? "bg-rose-500 text-white"
                      : "text-slate-400"
                  }`}
                >
                  Main / Buat Room
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sfxTap();
                    setLandingTab("bursa");
                    setRegError(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition ${
                    landingTab === "bursa"
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-400"
                  }`}
                >
                  💘 Bursa Mabar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sfxTap();
                    setLandingTab("invite");
                    setRegError(null);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] sm:text-xs font-bold transition ${
                    landingTab === "invite"
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-400"
                  }`}
                >
                  Punya Kode?
                </button>
              </div>

              <div className="bg-[#111827]/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 shadow-2xl">
                {landingTab === "bursa" && (
                  <div className="mb-3 p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200">
                    💘 <strong>Mode Cari Pasangan Mabar:</strong> Wajib masuk
                    dengan Google agar profil & chat Match tersimpan permanen.
                    Upgrade VIP Rp10.000 berlaku untuk semua pasangan Match!
                  </div>
                )}

                {landingTab === "invite" && (
                  <div className="mb-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                      Masukkan Kode Undangan Pasangan
                    </label>
                    <input
                      type="text"
                      value={inputJoinCode}
                      onChange={(e) => setInputJoinCode(e.target.value)}
                      placeholder="Contoh: KAWIN-729"
                      maxLength={12}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-sm font-mono font-bold uppercase text-white focus:outline-none"
                    />
                  </div>
                )}

                {regError && (
                  <div className="mb-3 p-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-200 animate-shake">
                    <h3 className="text-xs font-extrabold text-red-400">
                      {regError.title}
                    </h3>
                    <p className="text-[11px] text-red-200/90 mt-0.5">
                      {regError.text}
                    </p>
                  </div>
                )}

                <form onSubmit={handleRegistration} className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Panggilan
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={24}
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Misal: Raka / Nadya"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Email Aktif
                    </label>
                    <input
                      type="email"
                      required
                      readOnly={Boolean(googleUser?.email)}
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none read-only:opacity-75"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Jenis Kelamin
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["Laki-laki", "Perempuan"] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setRegGender(g)}
                            className={`py-2 px-1 rounded-xl border text-xs font-bold transition ${
                              regGender === g
                                ? "border-rose-500 bg-rose-500/15 text-white"
                                : "border-slate-700 bg-slate-950 text-slate-400"
                            }`}
                          >
                            {g === "Laki-laki" ? "👨 Laki" : "👩 Perempuan"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Usia (18+)
                      </label>
                      <input
                        type="number"
                        required
                        min={18}
                        max={80}
                        value={regAge}
                        onChange={(e) => setRegAge(e.target.value)}
                        placeholder="24"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {landingTab === "bursa" && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Domisili / Kota
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={30}
                          value={regCity}
                          onChange={(e) => setRegCity(e.target.value)}
                          placeholder="Misal: Jakarta Selatan / Bandung"
                          className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Bio Singkat (Tanpa IG/WA)
                        </label>
                        <input
                          type="text"
                          maxLength={90}
                          value={regBio}
                          onChange={(e) => setRegBio(e.target.value)}
                          placeholder="Misal: Suka kopi, nyari yang nggak gampang ngilang"
                          className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={isCheckingRoom}
                    className="w-full mt-2 py-3 px-5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-extrabold text-sm shadow-lg shadow-rose-500/25 btn-tactile disabled:opacity-50"
                  >
                    {isCheckingRoom
                      ? "Mengecek Kode Undangan..."
                      : landingTab === "bursa"
                      ? myPublicProfile
                        ? "Perbarui 20 Pengakuan & Masuk Bursa"
                        : "Isi 20 Pengakuan & Masuk Bursa"
                      : landingTab === "new"
                      ? "Lanjut ke 20 Pengakuan"
                      : "Gabung Kode & Isi 20 Pengakuan"}
                  </button>
                </form>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 2: QUIZ ==================== */}
          {screen === "quiz" && activeQuizProfile && activeQuizQuestion && (
            <section className="py-1">
              <div className="mb-2.5">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                    {activeQuizProfile.name} ({quizIndex + 1}/20)
                  </span>
                  {myRole === "player2" && player1 && (
                    <span className="text-[11px] font-semibold text-amber-400">
                      Pasangan: {player1.name}
                    </span>
                  )}
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${((quizIndex + 1) / 20) * 100}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#111827]/95 border border-slate-800 rounded-3xl p-4 shadow-2xl mb-2.5 animate-card-enter">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30 mb-2">
                  {activeQuizQuestion.category}
                </span>
                <blockquote className="text-sm sm:text-base font-bold text-white leading-relaxed">
                  &ldquo;{activeQuizQuestion.statement}&rdquo;
                </blockquote>
              </div>

              {isSavingRoom ? (
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs font-bold text-emerald-400">
                  ⏳ Menyimpan profil & menyinkronkan data...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => answerQuiz("iya")}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-rose-500/15 border-2 border-rose-500/60 text-left flex items-center justify-between btn-tactile"
                  >
                    <span className="text-xs sm:text-sm font-extrabold text-rose-400">
                      🔥 Iya lagi (Masalah Utama)
                    </span>
                  </button>
                  <button
                    onClick={() => answerQuiz("kayanya")}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/50 text-left flex items-center justify-between btn-tactile"
                  >
                    <span className="text-xs sm:text-sm font-extrabold text-amber-400">
                      🤔 Kayanya sih (Wildcard)
                    </span>
                  </button>
                  <button
                    onClick={() => answerQuiz("engga")}
                    className="w-full py-2.5 px-3.5 rounded-2xl bg-slate-800 border-2 border-slate-700 text-left flex items-center justify-between btn-tactile"
                  >
                    <span className="text-xs sm:text-sm font-extrabold text-slate-200">
                      🛡️ Engga (Buang)
                    </span>
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ==================== SCREEN 2B: BURSA LAWAN JENIS ==================== */}
          {screen === "bursa" && myPublicProfile && (
            <section className="animate-card-enter space-y-3 py-1">
              <div className="bg-[#111827]/95 border border-emerald-500/40 rounded-3xl p-4 shadow-xl">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h2 className="text-sm sm:text-base font-extrabold text-white">
                    💘 Bursa Mabar (
                    {myPublicProfile.gender === "Laki-laki"
                      ? "Perempuan"
                      : "Laki-laki"}
                    )
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => goScreen("profile")}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-bold text-amber-300 border border-amber-500/40"
                    >
                      💬 Kotak Masuk
                    </button>
                    <button
                      onClick={fetchBursaCandidates}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300 border border-slate-700"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mb-2.5">
                  Pilih yang bikin kamu penasaran. Jika dia juga memilihmu,
                  kalian langsung <strong>MATCH</strong> dan masuk arena mabar!
                </p>

                {incomingLikes.length > 0 && (
                  <div className="mb-2.5 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200">
                    🔥{" "}
                    <strong>
                      {incomingLikes.map((l) => l.fromName).join(", ")}
                    </strong>{" "}
                    sudah memilihmu! Pilih balik di daftar bawah untuk langsung
                    mabar.
                  </div>
                )}

                <input
                  type="text"
                  value={bursaCityFilter}
                  onChange={(e) => setBursaCityFilter(e.target.value)}
                  placeholder="🔍 Filter berdasarkan kota (misal: Jakarta, Bandung)..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              {isLoadingBursa ? (
                <div className="p-6 rounded-3xl bg-[#111827]/95 border border-slate-800 text-center text-xs text-slate-400">
                  ⏳ Mencari pemain lawan jenis yang siap mabar...
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="p-6 rounded-3xl bg-[#111827]/95 border border-slate-800 text-center space-y-2.5">
                  <p className="text-xs text-slate-300 font-bold">
                    Belum ada pemain lawan jenis yang aktif di kota ini.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Profilmu sudah masuk daftar tunggu. Kamu akan otomatis
                    mendapat notifikasi saat ada yang memilihmu, atau latihan
                    dulu lawan Bot AI.
                  </p>
                  <button
                    onClick={startSoloGame}
                    className="px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 font-extrabold text-xs"
                  >
                    Latihan Lawan Bot AI Sambil Menunggu →
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredCandidates.map((cand) => {
                    const alreadyLiked = Boolean(likedTargetIds[cand.id]);
                    const likedMeBack = incomingLikes.some(
                      (l) => l.fromId === cand.id
                    );

                    return (
                      <div
                        key={cand.id}
                        className={`bg-[#111827]/95 border rounded-3xl p-3.5 shadow-lg transition ${
                          likedMeBack
                            ? "border-rose-500/60"
                            : "border-slate-800"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-extrabold text-white">
                                {cand.gender === "Laki-laki" ? "👨" : "👩"}{" "}
                                {cand.name}, {cand.age}
                              </span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                📍 {cand.city}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">
                              &ldquo;{cand.bio}&rdquo;
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-slate-400">
                              <span className="text-rose-400">
                                🔥 {cand.iyaCount} Red Flag Utama
                              </span>
                              <span>•</span>
                              <span className="text-amber-400">
                                🤔 {cand.kayanyaCount} Wildcard
                              </span>
                            </div>
                          </div>

                          <button
                            disabled={
                              alreadyLiked || sendingLikeId === cand.id
                            }
                            onClick={() => handleSelectCandidate(cand)}
                            className={`px-3 py-2 rounded-xl font-extrabold text-xs shrink-0 btn-tactile ${
                              alreadyLiked
                                ? "bg-slate-800 text-slate-400 border border-slate-700"
                                : likedMeBack
                                ? "bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 shadow-lg"
                                : "bg-emerald-500 hover:bg-emerald-600 text-slate-950"
                            }`}
                          >
                            {sendingLikeId === cand.id
                              ? "..."
                              : alreadyLiked
                              ? "✓ Dipilih"
                              : likedMeBack
                              ? "💘 Balas Match!"
                              : "💚 Pilih Mabar"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ==================== SCREEN 3: LOBBY / MODE ==================== */}
          {screen === "mode" && player1 && (
            <section className="animate-card-enter space-y-3 py-1">
              <div className="bg-[#111827]/95 border-2 border-emerald-500/40 rounded-3xl p-4 shadow-xl text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Menunggu Pasangan Bergabung...</span>
                </div>

                <h2 className="text-base font-extrabold text-white mb-1">
                  Kirim Kode Ini ke Pasanganmu
                </h2>
                <p className="text-xs text-slate-400 mb-3">
                  Begitu pasanganmu memasukkan kode ini dan selesai mengisi 20
                  pertanyaan di HP-nya, kalian berdua akan langsung masuk arena
                  secara bersamaan!
                </p>

                <div className="inline-block font-mono font-extrabold text-2xl px-5 py-2.5 rounded-2xl bg-slate-950 text-emerald-400 border border-emerald-500/40 tracking-widest">
                  {inviteCode}
                </div>

                <button
                  onClick={() =>
                    copyTextSafe(
                      `Ayo uji red flag kita di BESOK KAWIN! Buka https://besok-kawin.vercel.app lalu pilih "Punya Kode?" dan masukkan kode: ${inviteCode}`,
                      "Kode & pesan ajakan berhasil disalin!"
                    )
                  }
                  className="block w-full mt-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 btn-tactile"
                >
                  📋 Salin Kode & Pesan Ajakan
                </button>
              </div>

              <div className="bg-[#111827]/95 border border-slate-800 rounded-3xl p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">
                    Profil Borok {player1.name}:
                  </span>
                  <span className="font-mono text-slate-400">
                    🔥 {p1Counts.iya} | 🤔 {p1Counts.kayanya} | 🛡️{" "}
                    {p1Counts.engga}
                  </span>
                </div>
              </div>

              <div className="bg-[#111827]/95 border border-slate-800 rounded-3xl p-4">
                <h4 className="font-extrabold text-white text-xs sm:text-sm mb-1.5">
                  Atau Latihan Sendiri Lawan Bot AI ({botPreview.name},{" "}
                  {botAgeSlider} thn)
                </h4>
                <input
                  type="range"
                  min={18}
                  max={45}
                  value={botAgeSlider}
                  onChange={(e) =>
                    setBotAgeSlider(parseInt(e.target.value, 10))
                  }
                  className="w-full my-1.5"
                />
                <button
                  onClick={startSoloGame}
                  className="w-full mt-1 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 font-extrabold text-xs btn-tactile"
                >
                  Main Solo Lawan Bot AI →
                </button>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 4: GAMEPLAY ==================== */}
          {screen === "game" &&
            currentCard &&
            meProfile &&
            partnerProfile && (
              <section className="space-y-2.5 py-1">
                <div
                  key={shakeHud}
                  className={`bg-[#111827]/95 border border-slate-800 rounded-3xl p-3 shadow-xl relative ${
                    shakeHud > 0 ? "animate-shake" : ""
                  }`}
                >
                  {deltaPop && (
                    <div
                      key={deltaPop.key}
                      className="absolute right-6 -top-3 pointer-events-none z-30"
                    >
                      <span
                        className={`inline-block font-mono font-extrabold text-sm px-2 py-0.5 rounded-xl shadow-lg animate-delta ${
                          deltaPop.val > 0
                            ? "bg-emerald-500 text-slate-950"
                            : "bg-red-500 text-white"
                        }`}
                      >
                        {deltaPop.val > 0
                          ? `+${deltaPop.val}%`
                          : `${deltaPop.val}%`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-extrabold text-slate-300">
                      🔋 Baterai Cinta Bersama
                    </span>
                    <span
                      className={`font-mono font-extrabold text-base ${
                        battery >= 80
                          ? "text-emerald-400"
                          : battery >= 45
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {battery}%
                    </span>
                  </div>
                  <div className="h-3 bg-slate-950 rounded-lg border border-slate-700 p-0.5">
                    <div
                      className={`h-full rounded transition-all duration-500 bg-gradient-to-r ${
                        battery >= 80
                          ? "from-emerald-500 to-teal-400"
                          : battery >= 45
                          ? "from-amber-500 to-yellow-400"
                          : "from-red-600 to-rose-500"
                      }`}
                      style={{ width: `${battery}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-[11px] text-slate-400">
                    <span>
                      Ronde <strong className="text-rose-400">{round}</strong>/8
                      • HP Kamu:{" "}
                      <strong className="text-white">{meProfile.name}</strong>
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        timerSeconds <= 10 ? "text-red-400 animate-pulse" : ""
                      }`}
                    >
                      ⏱️ {timerSeconds}s
                    </span>
                  </div>
                </div>

                {(mode === "solo" || needsResponderAction) && (
                  <>
                    {gameStage === "dilemma" && (
                      <div className="bg-[#111827]/95 border-2 border-slate-800 rounded-3xl p-4 shadow-2xl animate-card-enter">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            {currentCard.category}
                          </span>
                          <span className="text-[11px] font-semibold text-amber-400">
                            Pengakuan {partnerProfile.name}
                          </span>
                        </div>

                        <p className="text-xs sm:text-base font-bold text-white leading-snug mb-2">
                          &ldquo;{currentCard.partnerPrompt}&rdquo;
                        </p>
                        <p className="text-[11px] text-slate-400 italic mb-3 pl-2.5 border-l-2 border-slate-700">
                          Pengakuan asli {partnerProfile.name}: &ldquo;
                          {currentCard.statement}&rdquo;
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={chooseAcceptCard}
                            className="py-3 px-2 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border-2 border-emerald-500/70 text-center btn-tactile"
                          >
                            <span className="block text-xs sm:text-sm font-extrabold text-emerald-400">
                              💚 TERIMA
                            </span>
                            <span className="block text-[9px] text-slate-400 mt-0.5">
                              Uji Konsekuensi
                            </span>
                          </button>
                          <button
                            onClick={chooseRejectCard}
                            className="py-3 px-2 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border-2 border-rose-500/70 text-center btn-tactile"
                          >
                            <span className="block text-xs sm:text-sm font-extrabold text-rose-400">
                              🛑 TOLAK
                            </span>
                            <span className="block text-[9px] text-slate-400 mt-0.5">
                              Ajak Kompromi
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {gameStage === "consequence" && (
                      <div className="bg-[#111827]/95 border-2 border-amber-500/60 rounded-3xl p-4 shadow-2xl animate-card-flip">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 mb-2">
                          ⚠️ KARTU KONSEKUENSI
                        </span>
                        <p className="text-xs sm:text-sm font-extrabold text-white mb-2.5">
                          &ldquo;{currentCard.consequenceQuestion}&rdquo;
                        </p>
                        {personalTrap && (
                          <p className="text-[11px] text-slate-400 italic mb-3 p-2 rounded-xl bg-slate-950 border border-slate-800">
                            🪞 Cermin dirimu sendiri: &ldquo;
                            {personalTrap.statement}&rdquo;
                          </p>
                        )}
                        <div className="space-y-2">
                          <button
                            disabled={isSubmittingDecision}
                            onClick={() => resolveConsequence(true)}
                            className="w-full py-2.5 px-3 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs flex justify-between btn-tactile disabled:opacity-50"
                          >
                            <span>💪 Tetap Terima Konsekuensinya</span>
                            <span>{mode === "couple" ? "+8%" : "+10%"}</span>
                          </button>
                          <button
                            disabled={isSubmittingDecision}
                            onClick={() => resolveConsequence(false)}
                            className="w-full py-2.5 px-3 rounded-2xl bg-red-600/30 border border-red-500 text-red-200 font-extrabold text-xs flex justify-between btn-tactile disabled:opacity-50"
                          >
                            <span>😰 Ragu / Menyesal Pilih Terima</span>
                            <span>{mode === "couple" ? "-10%" : "-12%"}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {gameStage === "negotiate" && (
                      <div className="bg-[#111827]/95 border-2 border-rose-500/50 rounded-3xl p-4 shadow-2xl animate-card-flip">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-rose-500/20 text-rose-300 mb-2">
                          🤝 PILIH JALAN TENGAH (1/2)
                        </span>
                        <p className="text-xs font-bold text-slate-300 mb-2">
                          Kamu menolak sifat {partnerProfile.name}. Pilih opsi
                          kompromimu — kalau {partnerProfile.name} memilih opsi
                          yang sama, kalian{" "}
                          <strong className="text-emerald-400">
                            MATCH (+8%)
                          </strong>
                          !
                        </p>
                        <div className="space-y-1.5">
                          {currentCard.compromises.map((opt, idx) => (
                            <button
                              key={idx}
                              disabled={isSubmittingDecision}
                              onClick={() => resolveNegotiation(idx)}
                              className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-left flex items-start gap-2 text-[11px] sm:text-xs text-slate-200 btn-tactile disabled:opacity-50"
                            >
                              <span className="font-mono font-bold text-amber-400">
                                {String.fromCharCode(65 + idx)}.
                              </span>
                              <span>{opt}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {mode === "couple" &&
                  needsOwnerCompromiseAction &&
                  myOwnedCard && (
                    <div className="bg-[#111827]/95 border-2 border-amber-500/70 rounded-3xl p-4 shadow-2xl animate-card-flip">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          🚨 {partnerProfile.name.toUpperCase()} MENOLAK
                          MASALAHMU!
                        </span>
                        <span className="text-[10px] font-bold text-emerald-400">
                          Uji Match Kompromi
                        </span>
                      </div>

                      <p className="text-xs font-bold text-white leading-snug mb-1.5">
                        Pengakuanmu: &ldquo;{myOwnedCard.statement}&rdquo;
                      </p>
                      <p className="text-[11px] text-slate-300 mb-3">
                        <strong className="text-amber-300">
                          {partnerProfile.name}
                        </strong>{" "}
                        sudah memilih jalan tengahnya. Pilih solusi kompromi yang
                        sama supaya{" "}
                        <strong className="text-emerald-400">
                          MATCH (+8%)
                        </strong>
                        :
                      </p>

                      <div className="space-y-1.5">
                        {myOwnedCard.compromises.map((opt, idx) => (
                          <button
                            key={idx}
                            disabled={isSubmittingDecision}
                            onClick={() =>
                              submitOnlineOwnerCompromiseChoice(idx)
                            }
                            className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-amber-500/10 border border-slate-700 hover:border-amber-500/60 text-left flex items-start gap-2 text-[11px] sm:text-xs text-slate-200 btn-tactile disabled:opacity-50"
                          >
                            <span className="font-mono font-bold text-amber-400">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            <span>{opt}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                {mode === "couple" &&
                  !needsResponderAction &&
                  !needsOwnerCompromiseAction && (
                    <div className="bg-[#111827]/95 border-2 border-emerald-500/40 rounded-3xl p-6 text-center shadow-2xl animate-card-enter">
                      <div className="text-3xl mb-2 animate-bounce">⏳</div>
                      <h3 className="text-base font-extrabold text-white">
                        Pilihanmu Sudah Terkunci!
                      </h3>
                      <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                        {myResponderCardState.status === "negotiating" &&
                        myResponderCardState.ownerChoice === undefined ? (
                          <>
                            Menunggu{" "}
                            <strong className="text-amber-400">
                              {partnerProfile.name}
                            </strong>{" "}
                            memilih jalan tengah untuk masalahnya yang baru saja
                            kamu tolak...
                          </>
                        ) : (
                          <>
                            Menunggu{" "}
                            <strong className="text-emerald-400">
                              {partnerProfile.name}
                            </strong>{" "}
                            menyelesaikan kartunya di Ronde {round}...
                          </>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-3">
                        Layar akan otomatis lanjut begitu kalian berdua selesai.
                      </p>
                    </div>
                  )}
              </section>
            )}

          {/* ==================== SCREEN 5: ENDING ==================== */}
          {screen === "ending" && player1 && player2 && (
            <section className="animate-card-enter space-y-3 py-1 text-center">
              <div
                className={`bg-[#111827]/95 border-2 rounded-3xl p-4 sm:p-5 shadow-2xl ${endingVerdict.border}`}
              >
                <div className="text-3xl mb-1.5">{endingVerdict.emoji}</div>
                <span
                  className={`inline-block px-3 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase border mb-1 ${endingVerdict.badgeBg}`}
                >
                  BATERAI CINTA AKHIR: {battery}%
                </span>
                <h1
                  className={`text-xl sm:text-3xl font-extrabold ${endingVerdict.titleClass}`}
                >
                  {endingVerdict.title}
                </h1>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  {endingVerdict.subtitle}
                </p>
                <div className="mt-3 pt-2 border-t border-slate-800 text-xs text-slate-400">
                  <strong className="text-white">{player1.name}</strong> ⚡{" "}
                  <strong className="text-rose-400">{player2.name}</strong>
                </div>
              </div>

              {mode === "couple" && isMatchmakingRoom && myPublicProfile && (
                <div className="bg-[#111827]/95 border-2 border-amber-500/60 rounded-3xl p-4 shadow-xl text-center space-y-2">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    💬 RUANG OBROLAN MATCH TERSEDIA
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    Mau Lanjut Ngobrol & Tukeran Kontak?
                  </h3>
                  <p className="text-xs text-slate-300">
                    Buka <strong>Profil & Chat</strong> untuk mengirim pesan ke
                    pasangan Match kamu. Upgrade VIP{" "}
                    <strong>Rp10.000 sekali bayar</strong> berlaku untuk baca &
                    balas pesan ke semua Match tanpa sensor blur!
                  </p>
                  <button
                    onClick={() => goScreen("profile")}
                    className="w-full mt-1 py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-rose-500 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/25 btn-tactile"
                  >
                    👤 Buka Profil & Chat Sekarang →
                  </button>
                </div>
              )}

              <div className="grid grid-cols-4 gap-1.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <span className="block font-mono font-extrabold text-sm text-emerald-400">
                    {stats.terimaMantap}
                  </span>
                  <span className="text-[9px] text-slate-400">Terima</span>
                </div>
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/25">
                  <span className="block font-mono font-extrabold text-sm text-rose-400">
                    {stats.menyesal}
                  </span>
                  <span className="text-[9px] text-slate-400">Nyesel</span>
                </div>
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25">
                  <span className="block font-mono font-extrabold text-sm text-amber-400">
                    {stats.kompromiSepakat}
                  </span>
                  <span className="text-[9px] text-slate-400">Kompromi</span>
                </div>
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/25">
                  <span className="block font-mono font-extrabold text-sm text-red-400">
                    {stats.deadlockOrAfk}
                  </span>
                  <span className="text-[9px] text-slate-400">Gagal/AFK</span>
                </div>
              </div>

              <button
                onClick={downloadStoryCardPNG}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg btn-tactile"
              >
                📸 Unduh Kartu Hasil IG Story (PNG)
              </button>

              <button
                onClick={fullResetGame}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs border border-slate-700 btn-tactile"
              >
                ✨ Kembali ke Bursa / Beranda
              </button>
            </section>
          )}

          {/* ==================== SCREEN 6: DASHBOARD PROFIL & CHAT ==================== */}
          {screen === "profile" && myPublicProfile && (
            <ProfileDashboard
              profile={myPublicProfile}
              onClose={() => goScreen("bursa")}
              onGoBursa={() => goScreen("bursa")}
              showToast={showToast}
            />
          )}
        </div>

        <footer className="w-full pt-2 pb-1 text-center text-[10px] text-slate-600 shrink-0">
          BESOK KAWIN? • Dating & Red Flag Card Game
        </footer>
      </main>
    </div>
  );
}
