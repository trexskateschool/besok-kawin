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
  publishToMatchmakingPool,
  sendLikeAndCheckMatch,
} from "@/lib/matchmaking";
import ProfileDashboard from "@/components/ProfileDashboard";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

// Tangkap event install bawaan browser sedini mungkin sebelum React selesai mount
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    window.__deferredInstallPrompt = e as BeforeInstallPromptEvent;
  });
}

interface PlayerProfile {
  name: string;
  email: string;
  gender: "Laki-laki" | "Perempuan";
  age: number;
  city?: string;
  bio?: string;
  photoURL?: string;
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
  | "gate"
  | "onboarding"
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

function toPlayerProfile(pub: PublicMatchProfile): PlayerProfile {
  return {
    name: pub.name,
    email: pub.email,
    gender: pub.gender,
    age: pub.age,
    city: pub.city,
    bio: pub.bio,
    photoURL: pub.photoURL,
    questions: pub.questions,
    answers: pub.answers,
  };
}

export default function BesokKawinGame() {
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(() =>
      typeof window !== "undefined"
        ? window.__deferredInstallPrompt || null
        : null
    );
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  // Google Auth State (Exclusive Gate)
  const [authChecking, setAuthChecking] = useState(true);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);

  // Hapus Vercel Toolbar yang sedang loading dari DOM
  useEffect(() => {
    if (typeof document === "undefined") return;
    const purgeVercelToolbar = () => {
      document
        .querySelectorAll(
          'vercel-live-feedback, #__vercel-toolbar, [data-vercel-toolbar], iframe[src*="vercel.live"]'
        )
        .forEach((el) => el.remove());
    };
    purgeVercelToolbar();
    const observer = new MutationObserver(() => purgeVercelToolbar());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

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

    if (window.__deferredInstallPrompt) {
      setInstallPromptEvent(window.__deferredInstallPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvt = e as BeforeInstallPromptEvent;
      window.__deferredInstallPrompt = promptEvt;
      setInstallPromptEvent(promptEvt);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPromptEvent(null);
      window.__deferredInstallPrompt = null;
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
    const activePrompt =
      installPromptEvent ||
      (typeof window !== "undefined" ? window.__deferredInstallPrompt : null);

    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const { outcome } = await activePrompt.userChoice;
        if (outcome === "accepted") {
          setIsAppInstalled(true);
          setInstallPromptEvent(null);
          window.__deferredInstallPrompt = null;
          showToast("Menginstal Besok Kawin? ke HP...", "success");
        }
        return;
      } catch (err) {
        console.error("Prompt install gagal:", err);
      }
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

  const [screen, setScreen] = useState<ScreenType>("gate");

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

  // Lounge Sub-navigation & Onboarding Form State
  const [loungeTab, setLoungeTab] = useState<"discover" | "private" | "ai">(
    "discover"
  );
  const [inviteCode, setInviteCode] = useState("");
  const [inputJoinCode, setInputJoinCode] = useState("");
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);

  const [regName, setRegName] = useState("");
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
  const [quizDraftProfile, setQuizDraftProfile] =
    useState<PlayerProfile | null>(null);
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

  // Pantau status Login Google secara permanen (Wajib Google)
  useEffect(() => {
    if (!auth || !isFirebaseReady) {
      setAuthChecking(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      setGoogleUser(user);
      if (user) {
        if (user.displayName) {
          setRegName((prev) => prev || user.displayName?.split(" ")[0] || "");
        }
        if (db) {
          try {
            const snap = await getDoc(doc(db, "match_profiles", user.uid));
            if (snap.exists()) {
              const existing = snap.data() as PublicMatchProfile;
              setMyPublicProfile(existing);
              setRegName(existing.name);
              setRegGender(existing.gender);
              setRegAge(String(existing.age));
              setRegCity(existing.city || "");
              setRegBio(existing.bio || "");
              setScreen((curr) =>
                curr === "gate" || curr === "onboarding" ? "bursa" : curr
              );
            } else {
              setMyPublicProfile(null);
              setScreen((curr) => (curr === "gate" ? "onboarding" : curr));
            }
          } catch (err) {
            console.error("Gagal memuat profil tersimpan:", err);
            setScreen((curr) => (curr === "gate" ? "onboarding" : curr));
          }
        }
      } else {
        setMyPublicProfile(null);
        setScreen("gate");
      }
      setAuthChecking(false);
    });
    return () => unsub();
  }, []);

  // Dengarkan perubahan real-time pada profil user (termasuk status VIP setelah bayar)
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
      showToast("Layanan autentikasi belum siap. Periksa konfigurasi.", "error");
      return;
    }
    setIsLoggingInGoogle(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      setGoogleUser(user);
      if (user.displayName && !regName) {
        setRegName(user.displayName.split(" ")[0]);
      }

      if (db) {
        const snap = await getDoc(doc(db, "match_profiles", user.uid));
        if (snap.exists()) {
          const existing = snap.data() as PublicMatchProfile;
          setMyPublicProfile(existing);
          setRegName(existing.name);
          setRegGender(existing.gender);
          setRegAge(String(existing.age));
          setRegCity(existing.city || "");
          setRegBio(existing.bio || "");
          showToast(`✨ Selamat datang kembali, ${existing.name}`, "success");
          goScreen("bursa");
        } else {
          showToast(
            "✨ Akun Google terverifikasi! Lengkapi profil singkatmu.",
            "success"
          );
          goScreen("onboarding");
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
    setTimerActive(false);
    setInviteCode("");
    setPlayer1(null);
    setPlayer2(null);
    showToast("Kamu telah keluar dari sesi anggota.", "info");
    goScreen("gate");
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
      showToast(`Gagal memuat anggota: ${detail}`, "error");
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
            `💘 IT'S A MATCH dengan ${data.fromName}! Room ${data.roomCode} siap dimulai.`,
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
        (screen === "mode" || screen === "bursa")
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
  }, [inviteCode, mode, screen, goScreen, showToast]);

  // Onboarding Submission (Google Authenticated Members Only)
  const handleOnboardingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleUser) {
      goScreen("gate");
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const ageNum = parseInt(regAge, 10);
    if (isNaN(ageNum) || ageNum < 18) {
      sfxPenalty();
      setRegError({
        title: "Verifikasi Gagal",
        text: "Keanggotaan BESOK KAWIN? hanya terbuka bagi peserta yang sudah cukup umur.",
        key: Date.now(),
      });
      return;
    }

    const nameLeak = detectContactLeak(regName);
    if (nameLeak) {
      sfxPenalty();
      setRegError({
        title: "Nama Panggilan Tidak Diizinkan",
        text: nameLeak,
        key: Date.now(),
      });
      return;
    }

    const bioLeak = detectContactLeak(regBio);
    if (bioLeak) {
      sfxPenalty();
      setRegError({
        title: "Kontak Pribadi Terdeteksi di Bio",
        text: bioLeak,
        key: Date.now(),
      });
      return;
    }

    if (!regCity.trim()) {
      sfxPenalty();
      setRegError({
        title: "Domisili Wajib Diisi",
        text: "Masukkan kota tempat tinggalmu agar pasangan match tahu lokasi kalian.",
        key: Date.now(),
      });
      return;
    }

    sfxTap();
    setRegError(null);
    setQuizDraftProfile({
      name: regName.trim(),
      email: googleUser.email || "",
      gender: regGender,
      age: ageNum,
      city: regCity.trim(),
      bio: regBio.trim(),
      photoURL: googleUser.photoURL || "",
      questions: build20QuestionsForProfile(regGender, ageNum),
      answers: {},
    });
    setQuizIndex(0);
    goScreen("quiz");
  };

  // Quiz Answer Handler
  const answerQuiz = async (choice: "iya" | "kayanya" | "engga") => {
    sfxTap();
    if (!quizDraftProfile) return;

    const currentQ = quizDraftProfile.questions[quizIndex];
    const updatedProfile: PlayerProfile = {
      ...quizDraftProfile,
      answers: { ...quizDraftProfile.answers, [currentQ.id]: choice },
    };

    setQuizDraftProfile(updatedProfile);

    if (quizIndex + 1 < updatedProfile.questions.length) {
      setQuizIndex(quizIndex + 1);
    } else {
      await finishQuizPhase(updatedProfile);
    }
  };

  const finishQuizPhase = async (completedProfile: PlayerProfile) => {
    if (!googleUser || !isFirebaseReady || !db) {
      showToast("Sesi Google tidak valid. Silakan masuk ulang.", "error");
      goScreen("gate");
      return;
    }

    setIsSavingRoom(true);
    try {
      let iyaCount = 0;
      let kayanyaCount = 0;
      completedProfile.questions.forEach((q) => {
        if (completedProfile.answers[q.id] === "iya") iyaCount++;
        else if (completedProfile.answers[q.id] === "kayanya") kayanyaCount++;
      });

      const pubProfile: PublicMatchProfile = {
        id: googleUser.uid,
        name: completedProfile.name,
        email: googleUser.email || completedProfile.email,
        photoURL: googleUser.photoURL || "",
        gender: completedProfile.gender,
        age: completedProfile.age,
        city: completedProfile.city || "Indonesia",
        bio:
          completedProfile.bio ||
          "Siap uji kecocokan red flag sebelum ke KUA.",
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
      setQuizDraftProfile(null);
      setIsSavingRoom(false);
      sfxWin();
      showToast(
        "✨ Profil terverifikasi! Selamat datang di Lounge.",
        "success"
      );
      goScreen("bursa");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(err);
      setIsSavingRoom(false);
      showToast(`Gagal menyimpan profil: ${detail}`, "error");
    }
  };

  // Private Couple Room: Create Invite Code
  const handleCreatePrivateRoom = async () => {
    if (!myPublicProfile || !isFirebaseReady || !db) return;
    sfxTap();
    setIsSavingRoom(true);
    try {
      const hostProfile = toPlayerProfile(myPublicProfile);
      const generatedCode = "KAWIN-" + Math.floor(100 + Math.random() * 899);
      const roomRef = doc(db, "rooms", generatedCode);
      await setDoc(roomRef, {
        code: generatedCode,
        player1: hostProfile,
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
      setMyRole("player1");
      setMode("couple");
      setIsMatchmakingRoom(false);
      setInviteCode(generatedCode);
      setPlayer1(hostProfile);
      setPlayer2(null);
      goScreen("mode");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      showToast(`Gagal membuat room privat: ${detail}`, "error");
    } finally {
      setIsSavingRoom(false);
    }
  };

  // Private Couple Room: Join Partner Code
  const handleJoinPrivateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myPublicProfile || !isFirebaseReady || !db) return;
    const code = inputJoinCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      sfxPenalty();
      showToast("Masukkan kode undangan pasanganmu.", "warning");
      return;
    }

    setIsCheckingRoom(true);
    try {
      const roomRef = doc(db, "rooms", code);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        sfxPenalty();
        showToast(`Kode ${code} tidak ditemukan.`, "error");
        setIsCheckingRoom(false);
        return;
      }

      const roomData = roomSnap.data();
      const hostProfile: PlayerProfile = roomData.player1;

      if (hostProfile.gender === myPublicProfile.gender) {
        sfxPenalty();
        showToast(
          `Kode ${code} dibuat oleh ${hostProfile.name} (${hostProfile.gender}). Hanya untuk pasangan lawan jenis.`,
          "error"
        );
        setIsCheckingRoom(false);
        return;
      }

      if (roomData.player2 && roomData.status === "playing") {
        sfxPenalty();
        showToast(`Room ${code} sudah terisi penuh.`, "error");
        setIsCheckingRoom(false);
        return;
      }

      const guestProfile = toPlayerProfile(myPublicProfile);
      const p1Deck = buildDeckFromPartnerProfile(
        guestProfile,
        "player1",
        maxRounds
      );
      const p2Deck = buildDeckFromPartnerProfile(
        hostProfile,
        "player2",
        maxRounds
      );

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error("Room tidak ditemukan");
        tx.update(roomRef, {
          player2: guestProfile,
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

      sfxCharge();
      setMyRole("player2");
      setMode("couple");
      setIsMatchmakingRoom(false);
      setInviteCode(code);
      setPlayer1(hostProfile);
      setPlayer2(guestProfile);
      setP1OnlineDeck(p1Deck);
      setP2OnlineDeck(p2Deck);
      setGameStage("dilemma");
      setTimerSeconds(60);
      setTimerActive(true);
      goScreen("game");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      sfxPenalty();
      showToast(`Gagal bergabung: ${detail}`, "error");
    } finally {
      setIsCheckingRoom(false);
    }
  };

  // Handler Pilih Lawan Jenis di Bursa Mabar
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
        setMyRole(role);
        setMode("couple");
        setIsMatchmakingRoom(true);
        setInviteCode(res.roomCode);
        sfxWin();
        showToast(
          `💘 IT'S A MATCH dengan ${candidate.name}! Masuk arena mabar...`,
          "success"
        );
        goScreen("game");
      } else {
        showToast(
          `✨ Undangan Match terkirim ke ${candidate.name}. Menunggu respons balik.`,
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
    if (!myPublicProfile) return;
    const activePlayer = toPlayerProfile(myPublicProfile);
    setPlayer1(activePlayer);

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
            "text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-amber-200 to-amber-400",
        }
      : battery >= 45
      ? {
          emoji: "⏳",
          title: "PACARAN DULU AJA",
          subtitle:
            "Rasa sayang sih ada, tapi masih banyak kompromi yang gantung dan ego yang belum kelar. Pacaran dulu aja sambil benerin komunikasi!",
          border: "border-amber-500/60 shadow-amber-500/10",
          badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
          titleClass: "text-amber-300",
        }
      : {
          emoji: "🚨",
          title: "STOP THE WEDDING",
          subtitle: endingReason
            ? `${endingReason} Terlalu banyak deadlock dan penyesalan. Mending batalin sekarang daripada jadi drama!`
            : "Terlalu banyak penyesalan, deadlock ego, dan bom waktu kebiasaan buruk. Mending stop sekarang sebelum jadi beban seumur hidup!",
          border: "border-rose-500/60 shadow-rose-500/15",
          badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/40",
          titleClass: "text-rose-400",
        };

  const downloadStoryCardPNG = () => {
    if (!player1 || !player2 || typeof document === "undefined") return;
    sfxTap();

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, 1080, 1920);

    const isWin = battery >= 80;
    const isMid = battery >= 45 && battery < 80;
    const accentColor = isWin ? "#10b981" : isMid ? "#e5c17b" : "#f43f5e";
    const accentGlow = isWin
      ? "rgba(16, 185, 129, 0.22)"
      : isMid
      ? "rgba(229, 193, 123, 0.22)"
      : "rgba(244, 63, 94, 0.25)";

    const grad = ctx.createRadialGradient(540, 620, 60, 540, 620, 760);
    grad.addColorStop(0, accentGlow);
    grad.addColorStop(1, "rgba(7, 8, 12, 0)");
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

    ctx.fillStyle = "#e5c17b";
    ctx.font = "900 44px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BESOK KAWIN? • Card Game", 540, 160);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 28px sans-serif";
    ctx.fillText("HASIL UJI NYALI & RED FLAG PASANGAN", 540, 210);

    roundRect(80, 280, 920, 1180, 48);
    ctx.fillStyle = "rgba(18, 19, 26, 0.94)";
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
    ctx.fillStyle = "#090a0f";
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
      { label: "KOMPROMI", val: `${stats.kompromiSepakat}x`, color: "#e5c17b" },
      { label: "DEADLOCK / AFK", val: `${stats.deadlockOrAfk}x`, color: "#ef4444" },
    ];

    statBoxes.forEach((box, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = 140 + col * 410;
      const by = 1140 + row * 135;
      roundRect(bx, by, 390, 115, 24);
      ctx.fillStyle = "rgba(9, 10, 15, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(229, 193, 123, 0.25)";
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

    const displayHost =
      typeof window !== "undefined"
        ? window.location.host
        : "kartu-visi.vercel.app";
    ctx.fillStyle = "#e5c17b";
    ctx.font = "800 34px monospace";
    ctx.fillText(displayHost, 540, 1635);

    const link = document.createElement("a");
    link.download = `BESOK-KAWIN-${player1.name}-${player2.name}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("📸 Kartu Hasil IG Story berhasil diunduh!", "success");
  };

  const fullResetToLounge = () => {
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
    } else if (googleUser) {
      goScreen("onboarding");
    } else {
      goScreen("gate");
    }
  };

  const startRecalibrateQuiz = () => {
    if (!googleUser || !myPublicProfile) return;
    sfxTap();
    setRegName(myPublicProfile.name);
    setRegGender(myPublicProfile.gender);
    setRegAge(String(myPublicProfile.age));
    setRegCity(myPublicProfile.city);
    setRegBio(myPublicProfile.bio);
    goScreen("onboarding");
  };

  const activeQuizQuestion = quizDraftProfile?.questions[quizIndex];

  const botOppositeGender =
    (myPublicProfile?.gender || regGender) === "Laki-laki"
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
    <div className="bg-velvet-luxury fixed inset-0 overflow-hidden overscroll-none flex flex-col bg-[#07080c] text-stone-100 selection:bg-amber-400 selection:text-stone-950">
      <style>{`
        html, body { position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden; overscroll-behavior: none; }
        /* Sembunyikan Vercel Toolbar / Live Feedback sepenuhnya */
        vercel-live-feedback, #__vercel-toolbar, [data-vercel-toolbar], iframe[src*="vercel.live"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        .bg-velvet-luxury {
          background-image: 
            radial-gradient(circle at 50% 0%, rgba(229, 193, 123, 0.13), transparent 48%),
            radial-gradient(circle at 85% 90%, rgba(244, 63, 94, 0.11), transparent 45%),
            radial-gradient(circle at 10% 85%, rgba(168, 85, 247, 0.06), transparent 40%);
        }
        .glass-luxury {
          background: linear-gradient(165deg, rgba(24, 24, 32, 0.88) 0%, rgba(12, 13, 19, 0.94) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        @keyframes cardEnter { 0% { opacity: 0; transform: translateY(14px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes cardFlipIn { 0% { opacity: 0; transform: rotateY(-10deg) scale(0.97); } 100% { opacity: 1; transform: rotateY(0deg) scale(1); } }
        @keyframes pulseShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        @keyframes floatUpFade { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-24px); } }
        .animate-card-enter { animation: cardEnter 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-card-flip { animation: cardFlipIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-shake { animation: pulseShake 0.35s ease-in-out; }
        .animate-delta { animation: floatUpFade 1.2s ease-out forwards; }
        input[type="range"] { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 999px; background: #27272a; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; margin-top: -7px;
          background-color: #e5c17b; height: 20px; width: 20px; border-radius: 50%;
          border: 3px solid #090a0f; box-shadow: 0 0 12px rgba(229, 193, 123, 0.65);
        }
        .btn-tactile { transition: transform 0.12s ease, box-shadow 0.15s ease, background-color 0.15s ease; }
        .btn-tactile:active { transform: scale(0.97); }
      `}</style>

      {/* EXCLUSIVE TOP HEADER (ANTI-OVERLAP & TOMBOL INSTALL TANPA LOGO HP) */}
      <header
        style={{ paddingTop: "max(0.65rem, env(safe-area-inset-top))" }}
        className="w-full shrink-0 border-b border-amber-500/15 bg-[#07080c]/95 backdrop-blur-xl z-40 pb-2.5"
      >
        <div className="max-w-xl mx-auto px-3 sm:px-4 flex items-center justify-between gap-1.5">
          {/* Brand Logo + Title */}
          <button
            type="button"
            onClick={() => {
              if (myPublicProfile) goScreen("bursa");
            }}
            className="flex items-center gap-1.5 sm:gap-2 min-w-0 text-left shrink"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-rose-500 p-[1.5px] shadow-md shadow-amber-500/20">
              <div className="w-full h-full rounded-full bg-[#0b0c12] flex items-center justify-center">
                <svg
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient
                      id="bkGoldGrad"
                      x1="2"
                      y1="2"
                      x2="22"
                      y2="22"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#FDE68A" />
                      <stop offset="55%" stopColor="#F59E0B" />
                      <stop offset="100%" stopColor="#FB7185" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M12 3L14.5 6L12 8.5L9.5 6L12 3Z"
                    fill="url(#bkGoldGrad)"
                  />
                  <circle
                    cx="9.5"
                    cy="14.5"
                    r="5.2"
                    stroke="url(#bkGoldGrad)"
                    strokeWidth="1.9"
                  />
                  <circle
                    cx="14.5"
                    cy="14.5"
                    r="5.2"
                    stroke="url(#bkGoldGrad)"
                    strokeWidth="1.9"
                  />
                </svg>
              </div>
            </div>

            <div className="min-w-0">
              <span className="block font-serif font-bold tracking-tight sm:tracking-wide text-[11px] sm:text-sm text-stone-100 truncate">
                BESOK KAWIN?
              </span>
              <p className="text-[10px] text-stone-400 tracking-wide truncate hidden sm:block">
                Kartu Visi &amp; Komunikasi
              </p>
            </div>
          </button>

          {/* Right Navigation Actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {googleUser && myPublicProfile && (
              <button
                onClick={() => {
                  sfxTap();
                  goScreen(screen === "profile" ? "bursa" : "profile");
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold flex items-center gap-1 border transition btn-tactile shrink-0 ${
                  screen === "profile"
                    ? "bg-gradient-to-r from-amber-300 to-amber-500 text-stone-950 border-amber-300"
                    : "bg-stone-900/90 hover:bg-stone-800 text-amber-300 border-amber-500/35"
                }`}
              >
                <span>{myPublicProfile.isUpgraded ? "👑" : "💬"}</span>
                <span className="sm:hidden">
                  {screen === "profile" ? "Lounge" : "Chat"}
                </span>
                <span className="hidden sm:inline">
                  {screen === "profile" ? "Lounge" : "Match & Chat"}
                </span>
              </button>
            )}

            {!isAppInstalled && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-2.5 sm:px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-stone-950 text-[10px] sm:text-[11px] font-extrabold tracking-wide transition btn-tactile shrink-0 shadow-sm shadow-amber-500/20"
              >
                Install
              </button>
            )}

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title="Suara Efek"
              className="w-7 h-7 rounded-full bg-stone-900/90 text-stone-300 border border-white/10 flex items-center justify-center text-xs shrink-0"
            >
              {soundEnabled ? "🔊" : "🔈"}
            </button>

            {googleUser &&
              (screen === "game" || screen === "mode" || screen === "ending") && (
                <button
                  onClick={fullResetToLounge}
                  className="text-[10px] sm:text-[11px] font-semibold px-2 sm:px-2.5 py-1.5 rounded-full bg-stone-900 hover:bg-stone-800 text-stone-300 border border-white/10 whitespace-nowrap shrink-0"
                >
                  Lounge
                </button>
              )}

            {googleUser &&
              (screen === "bursa" || screen === "onboarding") && (
                <button
                  onClick={handleGoogleLogout}
                  title="Keluar Akun Google"
                  className="text-[10px] sm:text-[11px] font-semibold px-2 sm:px-2.5 py-1.5 rounded-full bg-stone-900/80 hover:bg-rose-950/50 text-stone-400 hover:text-rose-300 border border-white/10 whitespace-nowrap shrink-0"
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass-luxury border border-amber-500/25 rounded-3xl p-5 shadow-2xl animate-card-enter"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif font-bold text-stone-100 text-sm sm:text-base">
                Pasang Aplikasi ke Layar Utama
              </h3>
              <button
                onClick={() => setShowInstallGuide(false)}
                className="w-7 h-7 rounded-full bg-stone-800 text-stone-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            {isIosDevice ? (
              <ol className="space-y-2 text-xs text-stone-300 mb-4">
                <li className="p-2.5 rounded-2xl bg-black/40 border border-white/5">
                  <strong>1.</strong> Buka halaman ini melalui{" "}
                  <strong className="text-amber-300">Safari</strong>.
                </li>
                <li className="p-2.5 rounded-2xl bg-black/40 border border-white/5">
                  <strong>2.</strong> Ketuk ikon{" "}
                  <strong className="text-amber-300">
                    Share (Kotak Panah Atas)
                  </strong>{" "}
                  di bagian bawah layar.
                </li>
                <li className="p-2.5 rounded-2xl bg-black/40 border border-white/5">
                  <strong>3.</strong> Pilih{" "}
                  <strong className="text-emerald-300">
                    Add to Home Screen
                  </strong>
                  .
                </li>
              </ol>
            ) : (
              <ol className="space-y-2 text-xs text-stone-300 mb-4">
                <li className="p-2.5 rounded-2xl bg-black/40 border border-white/5">
                  <strong>1.</strong> Pastikan membuka situs ini langsung di{" "}
                  <strong className="text-amber-300">Google Chrome</strong>{" "}
                  (bukan browser di dalam Instagram/WA).
                </li>
                <li className="p-2.5 rounded-2xl bg-black/40 border border-white/5">
                  <strong>2.</strong> Ketuk menu{" "}
                  <strong className="text-amber-300">Titik Tiga (⋮)</strong> di
                  pojok kanan atas lalu pilih{" "}
                  <strong className="text-emerald-300">Install app</strong>.
                </li>
              </ol>
            )}

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-2.5 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-stone-950 font-extrabold text-xs btn-tactile"
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
            className="pointer-events-auto px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl text-xs font-semibold flex items-center gap-2.5 bg-stone-950/95 border-amber-500/30 text-stone-100 animate-card-enter"
          >
            <span className="text-amber-300">✦</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* MAIN CONTAINER */}
      <main
        ref={mainScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-none w-full flex flex-col"
      >
        <div className="my-auto w-full max-w-xl mx-auto px-4 py-3 sm:py-5 flex flex-col justify-center">
          {/* AUTH LOADING SPLASH */}
          {authChecking && (
            <div className="text-center py-12 space-y-3 animate-card-enter">
              <div className="w-12 h-12 mx-auto rounded-full border-2 border-amber-400/30 border-t-amber-300 animate-spin" />
              <p className="text-xs font-mono tracking-widest uppercase text-amber-300/80">
                Memverifikasi Keanggotaan...
              </p>
            </div>
          )}

          {/* ==================== SCREEN 1: EXCLUSIVE GOOGLE-ONLY GATE ==================== */}
          {!authChecking && screen === "gate" && (
            <section className="animate-card-enter py-2">
              <div className="glass-luxury border border-amber-500/25 rounded-[32px] p-6 sm:p-8 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.85)] text-center relative overflow-hidden">
                <div className="absolute inset-x-12 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[10px] font-mono tracking-[0.2em] uppercase bg-amber-500/10 text-amber-300 border border-amber-500/25 mb-5">
                  <span>✦</span>
                  <span>Invitation &amp; Verified Members Only</span>
                </div>

                <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-tr from-amber-500/20 via-rose-500/20 to-amber-300/30 p-[1px] shadow-2xl shadow-amber-500/10">
                  <div className="w-full h-full rounded-full bg-[#0b0c12] flex flex-col items-center justify-center border border-amber-400/20">
                    <span className="text-2xl">🥂</span>
                  </div>
                </div>

                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-stone-100 tracking-tight leading-snug mb-2.5">
                  Where Red Flags <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-rose-400">
                    Meet Their Match.
                  </span>
                </h1>

                <p className="text-xs sm:text-sm text-stone-400 max-w-sm mx-auto leading-relaxed mb-6">
                  Permainan kartu &amp; uji kecocokan komunikasi pranikah. Buka
                  20 pengakuan jujurmu di depan sebelum melangkah lebih serius.
                </p>

                <div className="grid grid-cols-3 gap-2 mb-6 text-left">
                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/5">
                    <span className="block text-amber-300 text-xs mb-0.5">
                      🛡️
                    </span>
                    <span className="block text-[10px] font-bold text-stone-200">
                      100% Verified
                    </span>
                    <span className="block text-[9px] text-stone-500">
                      Akun Google asli
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/5">
                    <span className="block text-rose-400 text-xs mb-0.5">
                      🃏
                    </span>
                    <span className="block text-[10px] font-bold text-stone-200">
                      Deep Card Test
                    </span>
                    <span className="block text-[9px] text-stone-500">
                      Uji ego &amp; kompromi
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-black/40 border border-white/5">
                    <span className="block text-emerald-400 text-xs mb-0.5">
                      💬
                    </span>
                    <span className="block text-[10px] font-bold text-stone-200">
                      Private Chat
                    </span>
                    <span className="block text-[9px] text-stone-500">
                      Terbuka saat Match
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isLoggingInGoogle}
                  onClick={handleGoogleLogin}
                  className="w-full py-3.5 px-6 rounded-full bg-gradient-to-r from-stone-100 via-white to-amber-50 hover:from-white hover:to-amber-100 text-stone-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-3 shadow-[0_10px_30px_-5px_rgba(229,193,123,0.35)] btn-tactile disabled:opacity-60"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                      ? "Memverifikasi Akun Google..."
                      : "Masuk dengan Google"}
                  </span>
                </button>

                <p className="text-[10px] text-stone-500 mt-4 leading-relaxed">
                  Untuk menjaga kualitas &amp; keamanan komunitas, seluruh anggota
                  wajib masuk menggunakan akun Google terverifikasi.
                </p>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 1B: MEMBER ONBOARDING (POST-GOOGLE) ==================== */}
          {!authChecking && screen === "onboarding" && googleUser && (
            <section className="animate-card-enter py-1">
              <div className="glass-luxury border border-amber-500/25 rounded-[28px] p-5 shadow-2xl">
                <div className="flex items-center justify-between gap-2 pb-3 mb-3.5 border-b border-white/10">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300">
                      Step 1 of 2 • Member Dossier
                    </span>
                    <h2 className="font-serif text-lg font-bold text-stone-100">
                      Lengkapi Kartu Anggota
                    </h2>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                      ✓ {googleUser.email?.split("@")[0]}
                    </span>
                  </div>
                </div>

                {regError && (
                  <div className="mb-3 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 animate-shake">
                    <h3 className="text-xs font-extrabold text-rose-300">
                      {regError.title}
                    </h3>
                    <p className="text-[11px] text-rose-200/90 mt-0.5">
                      {regError.text}
                    </p>
                  </div>
                )}

                <form onSubmit={handleOnboardingSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                      Nama Panggilan
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={24}
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Misal: Raka / Nadya"
                      className="w-full bg-black/50 border border-white/10 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                        Identitas
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(["Laki-laki", "Perempuan"] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setRegGender(g)}
                            className={`py-2.5 px-1 rounded-xl border text-xs font-bold transition ${
                              regGender === g
                                ? "border-amber-400 bg-amber-400/15 text-amber-200"
                                : "border-white/10 bg-black/40 text-stone-400"
                            }`}
                          >
                            {g === "Laki-laki" ? "👨 Pria" : "👩 Wanita"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                        Usia
                      </label>
                      <input
                        type="number"
                        required
                        min={18}
                        max={80}
                        value={regAge}
                        onChange={(e) => setRegAge(e.target.value)}
                        placeholder="25"
                        className="w-full bg-black/50 border border-white/10 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-stone-100 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                      Domisili / Kota
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={30}
                      value={regCity}
                      onChange={(e) => setRegCity(e.target.value)}
                      placeholder="Misal: Jakarta Selatan / Bandung"
                      className="w-full bg-black/50 border border-white/10 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                      Headline / Bio Singkat
                    </label>
                    <input
                      type="text"
                      maxLength={90}
                      value={regBio}
                      onChange={(e) => setRegBio(e.target.value)}
                      placeholder="Misal: Suka kopi malam, cari yang dewasa & konsisten"
                      className="w-full bg-black/50 border border-white/10 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-2 py-3 px-5 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-rose-400 text-stone-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 btn-tactile"
                  >
                    Lanjut Kalibrasi 20 Pengakuan →
                  </button>
                </form>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 2: 20 CONFESSIONS CALIBRATION ==================== */}
          {!authChecking &&
            screen === "quiz" &&
            quizDraftProfile &&
            activeQuizQuestion && (
              <section className="py-1">
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/25">
                      Kalibrasi {quizIndex + 1} / 20
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {quizDraftProfile.name}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-300 to-rose-400 rounded-full transition-all duration-300"
                      style={{ width: `${((quizIndex + 1) / 20) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="glass-luxury border border-amber-500/25 rounded-[28px] p-5 shadow-2xl mb-3 animate-card-enter">
                  <span className="inline-block px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/30 mb-2.5">
                    {activeQuizQuestion.category}
                  </span>
                  <blockquote className="font-serif text-base sm:text-lg font-bold text-stone-100 leading-relaxed">
                    &ldquo;{activeQuizQuestion.statement}&rdquo;
                  </blockquote>
                </div>

                {isSavingRoom ? (
                  <div className="p-4 rounded-2xl glass-luxury border border-amber-500/25 text-center text-xs font-bold text-amber-300">
                    ✦ Menyimpan profil ke Lounge...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => answerQuiz("iya")}
                      className="w-full py-3 px-4 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/50 text-left flex items-center justify-between btn-tactile"
                    >
                      <span className="text-xs sm:text-sm font-extrabold text-rose-300">
                        🔥 Iya, ini gue banget (Kartu Utama)
                      </span>
                    </button>
                    <button
                      onClick={() => answerQuiz("kayanya")}
                      className="w-full py-3 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-left flex items-center justify-between btn-tactile"
                    >
                      <span className="text-xs sm:text-sm font-extrabold text-amber-300">
                        🤔 Kadang-kadang / Situasional (Wildcard)
                      </span>
                    </button>
                    <button
                      onClick={() => answerQuiz("engga")}
                      className="w-full py-3 px-4 rounded-2xl bg-stone-900/90 hover:bg-stone-800 border border-white/10 text-left flex items-center justify-between btn-tactile"
                    >
                      <span className="text-xs sm:text-sm font-extrabold text-stone-300">
                        🛡️ Nggak sama sekali (Aman)
                      </span>
                    </button>
                  </div>
                )}
              </section>
            )}

          {/* ==================== SCREEN 2B: EXCLUSIVE MEMBERS LOUNGE ==================== */}
          {!authChecking && screen === "bursa" && myPublicProfile && (
            <section className="animate-card-enter space-y-3 py-1">
              {/* Member Header Card */}
              <div className="glass-luxury border border-amber-500/25 rounded-[26px] p-3.5 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {myPublicProfile.photoURL ? (
                      <img
                        src={myPublicProfile.photoURL}
                        alt={myPublicProfile.name}
                        className="w-10 h-10 rounded-full object-cover border border-amber-400/50 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 to-rose-400 text-stone-950 font-serif font-extrabold flex items-center justify-center text-sm shrink-0">
                        {myPublicProfile.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-extrabold text-stone-100 truncate">
                          {myPublicProfile.name}, {myPublicProfile.age}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                          {myPublicProfile.isUpgraded ? "👑 VIP" : "MEMBER"}
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-400 truncate">
                        📍 {myPublicProfile.city} • 🔥{" "}
                        {myPublicProfile.iyaCount} Red Flags
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={startRecalibrateQuiz}
                    className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-semibold text-stone-300 border border-white/10 shrink-0"
                  >
                    Edit Profil
                  </button>
                </div>

                {/* Lounge Mode Switcher */}
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-full bg-black/60 border border-white/10 mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      sfxTap();
                      setLoungeTab("discover");
                    }}
                    className={`py-1.5 px-2 rounded-full text-[11px] font-bold transition ${
                      loungeTab === "discover"
                        ? "bg-gradient-to-r from-amber-300 to-amber-500 text-stone-950"
                        : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    ✨ Discover
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sfxTap();
                      setLoungeTab("private");
                    }}
                    className={`py-1.5 px-2 rounded-full text-[11px] font-bold transition ${
                      loungeTab === "private"
                        ? "bg-gradient-to-r from-rose-400 to-pink-500 text-white"
                        : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    🔑 Private Room
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sfxTap();
                      setLoungeTab("ai");
                    }}
                    className={`py-1.5 px-2 rounded-full text-[11px] font-bold transition ${
                      loungeTab === "ai"
                        ? "bg-stone-700 text-stone-100"
                        : "text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    🤖 AI Sparring
                  </button>
                </div>
              </div>

              {/* TAB 1: DISCOVER CURATED MATCHES */}
              {loungeTab === "discover" && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={bursaCityFilter}
                      onChange={(e) => setBursaCityFilter(e.target.value)}
                      placeholder="🔍 Filter domisili (Jakarta, Bandung, Bali...)"
                      className="flex-1 bg-stone-950/90 border border-white/10 focus:border-amber-400 rounded-full px-4 py-2 text-xs text-stone-100 focus:outline-none"
                    />
                    <button
                      onClick={fetchBursaCandidates}
                      className="px-3.5 py-2 rounded-full bg-stone-900 hover:bg-stone-800 text-[11px] font-bold text-amber-300 border border-amber-500/25 shrink-0"
                    >
                      🔄 Refresh
                    </button>
                  </div>

                  {incomingLikes.length > 0 && (
                    <div className="p-3 rounded-2xl bg-gradient-to-r from-rose-500/20 via-amber-500/15 to-rose-500/20 border border-amber-400/40 text-xs text-amber-100 flex items-center justify-between gap-2">
                      <span>
                        💘{" "}
                        <strong>
                          {incomingLikes.map((l) => l.fromName).join(", ")}
                        </strong>{" "}
                        tertarik uji kecocokan denganmu!
                      </span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-400 text-stone-950 font-extrabold shrink-0">
                        Secret Admirer
                      </span>
                    </div>
                  )}

                  {isLoadingBursa ? (
                    <div className="p-8 rounded-[28px] glass-luxury border border-white/10 text-center text-xs text-stone-400">
                      ✦ Mengkurasi anggota{" "}
                      {myPublicProfile.gender === "Laki-laki"
                        ? "wanita"
                        : "pria"}{" "}
                      terverifikasi...
                    </div>
                  ) : filteredCandidates.length === 0 ? (
                    <div className="p-6 rounded-[28px] glass-luxury border border-white/10 text-center space-y-3">
                      <p className="font-serif text-sm text-stone-200 font-bold">
                        Belum ada anggota aktif di kota ini.
                      </p>
                      <p className="text-[11px] text-stone-400">
                        Profilmu sudah tampil di lounge. Kamu bisa latihan
                        dulu dengan AI atau undang pasangan lewat tab Private
                        Room.
                      </p>
                      <button
                        onClick={() => setLoungeTab("ai")}
                        className="px-4 py-2 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 font-bold text-xs"
                      >
                        Coba AI Sparring →
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredCandidates.map((cand) => {
                        const alreadyLiked = Boolean(likedTargetIds[cand.id]);
                        const likedMeBack = incomingLikes.some(
                          (l) => l.fromId === cand.id
                        );

                        return (
                          <div
                            key={cand.id}
                            className={`glass-luxury border rounded-[28px] p-4 shadow-xl transition ${
                              likedMeBack
                                ? "border-amber-400/60 shadow-amber-500/10"
                                : "border-white/10 hover:border-amber-500/30"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {cand.photoURL ? (
                                <img
                                  src={cand.photoURL}
                                  alt={cand.name}
                                  className="w-12 h-12 rounded-2xl object-cover border border-amber-400/40 shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-stone-800 to-stone-900 border border-amber-400/30 flex items-center justify-center font-serif text-lg font-bold text-amber-300 shrink-0">
                                  {cand.name.charAt(0).toUpperCase()}
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center flex-wrap gap-1.5">
                                  <span className="font-serif text-base font-bold text-stone-100">
                                    {cand.name}, {cand.age}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-stone-300 border border-white/10">
                                    📍 {cand.city}
                                  </span>
                                  {cand.isUpgraded && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                                      👑 VIP
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-stone-300 mt-1.5 leading-relaxed">
                                  &ldquo;{cand.bio}&rdquo;
                                </p>

                                <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/5">
                                  <div className="flex items-center gap-2 text-[10px] font-mono text-stone-400">
                                    <span className="text-rose-400">
                                      🔥 {cand.iyaCount} Utama
                                    </span>
                                    <span>•</span>
                                    <span className="text-amber-300">
                                      🤔 {cand.kayanyaCount} Wildcard
                                    </span>
                                  </div>

                                  <button
                                    disabled={
                                      alreadyLiked || sendingLikeId === cand.id
                                    }
                                    onClick={() => handleSelectCandidate(cand)}
                                    className={`px-4 py-2 rounded-full font-extrabold text-xs shrink-0 btn-tactile ${
                                      alreadyLiked
                                        ? "bg-stone-900 text-stone-400 border border-white/10"
                                        : likedMeBack
                                        ? "bg-gradient-to-r from-amber-300 via-amber-400 to-rose-400 text-stone-950 shadow-lg shadow-amber-500/20"
                                        : "bg-stone-100 hover:bg-white text-stone-950"
                                    }`}
                                  >
                                    {sendingLikeId === cand.id
                                      ? "..."
                                      : alreadyLiked
                                      ? "✓ Menunggu"
                                      : likedMeBack
                                      ? "💘 Balas Match"
                                      : "✦ Ajak Mabar"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: PRIVATE COUPLE ROOM */}
              {loungeTab === "private" && (
                <div className="space-y-3 animate-card-enter">
                  <div className="glass-luxury border border-amber-500/25 rounded-[28px] p-4 space-y-2.5">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300">
                      Private Invitation
                    </span>
                    <h3 className="font-serif text-base font-bold text-stone-100">
                      Buat Room Khusus Pasanganmu
                    </h3>
                    <p className="text-xs text-stone-400 leading-relaxed">
                      Dapatkan kode undangan privat untuk bermain 1-on-1 bersama
                      pasanganmu secara real-time.
                    </p>
                    <button
                      disabled={isSavingRoom}
                      onClick={handleCreatePrivateRoom}
                      className="w-full py-3 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-stone-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 btn-tactile disabled:opacity-50"
                    >
                      {isSavingRoom
                        ? "Menyiapkan Room..."
                        : "✦ Buat Kode Undangan Privat"}
                    </button>
                  </div>

                  <form
                    onSubmit={handleJoinPrivateRoom}
                    className="glass-luxury border border-white/10 rounded-[28px] p-4 space-y-2.5"
                  >
                    <h3 className="font-serif text-base font-bold text-stone-100">
                      Punya Kode dari Pasangan?
                    </h3>
                    <input
                      type="text"
                      value={inputJoinCode}
                      onChange={(e) => setInputJoinCode(e.target.value)}
                      placeholder="Masukkan kode (misal: KAWIN-729)"
                      maxLength={12}
                      className="w-full bg-black/60 border border-white/15 focus:border-rose-400 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold uppercase text-stone-100 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isCheckingRoom}
                      className="w-full py-3 rounded-full bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs btn-tactile disabled:opacity-50"
                    >
                      {isCheckingRoom
                        ? "Memeriksa Kode..."
                        : "Gabung ke Room Pasangan →"}
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 3: AI SPARRING */}
              {loungeTab === "ai" && (
                <div className="glass-luxury border border-white/10 rounded-[28px] p-4 space-y-3 animate-card-enter">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300">
                        Solo Simulation
                      </span>
                      <h3 className="font-serif text-base font-bold text-stone-100">
                        Latihan Lawan {botPreview.name} ({botAgeSlider} thn)
                      </h3>
                    </div>
                    <span className="text-2xl">{botPreview.emoji}</span>
                  </div>
                  <p className="text-xs text-stone-400">
                    {botPreview.vibe} — {botPreview.bio}
                  </p>
                  <input
                    type="range"
                    min={18}
                    max={45}
                    value={botAgeSlider}
                    onChange={(e) =>
                      setBotAgeSlider(parseInt(e.target.value, 10))
                    }
                    className="w-full my-1"
                  />
                  <button
                    onClick={startSoloGame}
                    className="w-full py-3 rounded-full bg-stone-100 hover:bg-white text-stone-950 font-extrabold text-xs btn-tactile"
                  >
                    Mulai Simulasi Sekarang →
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ==================== SCREEN 3: PRIVATE WAITING LOUNGE ==================== */}
          {!authChecking && screen === "mode" && player1 && (
            <section className="animate-card-enter space-y-3 py-1">
              <div className="glass-luxury border border-amber-500/35 rounded-[28px] p-5 shadow-xl text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest bg-amber-500/15 text-amber-300 border border-amber-500/30 mb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Menunggu Pasangan Masuk...</span>
                </div>

                <h2 className="font-serif text-lg font-bold text-stone-100 mb-1">
                  Kode Akses Privat
                </h2>
                <p className="text-xs text-stone-400 mb-4">
                  Bagikan kode ini ke pasanganmu. Pastikan pasanganmu juga
                  masuk menggunakan akun Google-nya.
                </p>

                <div className="inline-block font-mono font-extrabold text-2xl px-6 py-3 rounded-2xl bg-black/70 text-amber-300 border border-amber-400/40 tracking-widest">
                  {inviteCode}
                </div>

                <button
                  onClick={() => {
                    const shareOrigin =
                      typeof window !== "undefined"
                        ? window.location.origin
                        : "https://kartu-visi.vercel.app";
                    copyTextSafe(
                      `Ayo uji kecocokan kita di BESOK KAWIN! Masuk dengan Google di ${shareOrigin} lalu buka tab Private Room dan masukkan kode: ${inviteCode}`,
                      "Kode undangan privat berhasil disalin!"
                    );
                  }}
                  className="block w-full mt-4 py-3 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-stone-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 btn-tactile"
                >
                  📋 Salin Kode Undangan
                </button>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 4: GAMEPLAY ==================== */}
          {!authChecking &&
            screen === "game" &&
            currentCard &&
            meProfile &&
            partnerProfile && (
              <section className="space-y-2.5 py-1">
                <div
                  key={shakeHud}
                  className={`glass-luxury border border-amber-500/25 rounded-[26px] p-3.5 shadow-xl relative ${
                    shakeHud > 0 ? "animate-shake" : ""
                  }`}
                >
                  {deltaPop && (
                    <div
                      key={deltaPop.key}
                      className="absolute right-6 -top-3 pointer-events-none z-30"
                    >
                      <span
                        className={`inline-block font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-full shadow-lg animate-delta ${
                          deltaPop.val > 0
                            ? "bg-emerald-400 text-stone-950"
                            : "bg-rose-500 text-white"
                        }`}
                      >
                        {deltaPop.val > 0
                          ? `+${deltaPop.val}%`
                          : `${deltaPop.val}%`}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-stone-300">
                      🥂 Chemistry &amp; Battery
                    </span>
                    <span
                      className={`font-mono font-extrabold text-base ${
                        battery >= 80
                          ? "text-emerald-400"
                          : battery >= 45
                          ? "text-amber-300"
                          : "text-rose-400"
                      }`}
                    >
                      {battery}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-black/70 rounded-full border border-white/10 p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                        battery >= 80
                          ? "from-emerald-400 to-teal-300"
                          : battery >= 45
                          ? "from-amber-300 to-amber-500"
                          : "from-rose-600 to-rose-400"
                      }`}
                      style={{ width: `${battery}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-[11px] text-stone-400">
                    <span>
                      Ronde <strong className="text-amber-300">{round}</strong>
                      /8 •{" "}
                      <strong className="text-stone-100">
                        {meProfile.name}
                      </strong>{" "}
                      ×{" "}
                      <strong className="text-rose-300">
                        {partnerProfile.name}
                      </strong>
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        timerSeconds <= 10 ? "text-rose-400 animate-pulse" : ""
                      }`}
                    >
                      ⏱️ {timerSeconds}s
                    </span>
                  </div>
                </div>

                {(mode === "solo" || needsResponderAction) && (
                  <>
                    {gameStage === "dilemma" && (
                      <div className="glass-luxury border border-amber-500/25 rounded-[28px] p-4 shadow-2xl animate-card-enter">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            {currentCard.category}
                          </span>
                          <span className="text-[11px] font-semibold text-amber-300">
                            Kartu {partnerProfile.name}
                          </span>
                        </div>

                        <p className="font-serif text-sm sm:text-base font-bold text-stone-100 leading-snug mb-2">
                          &ldquo;{currentCard.partnerPrompt}&rdquo;
                        </p>
                        <p className="text-[11px] text-stone-400 italic mb-3.5 pl-2.5 border-l-2 border-amber-400/40">
                          Pengakuan asli {partnerProfile.name}: &ldquo;
                          {currentCard.statement}&rdquo;
                        </p>

                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            onClick={chooseAcceptCard}
                            className="py-3 px-2 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/50 text-center btn-tactile"
                          >
                            <span className="block text-xs sm:text-sm font-extrabold text-emerald-300">
                              💚 TERIMA
                            </span>
                            <span className="block text-[9px] text-stone-400 mt-0.5">
                              Uji Konsekuensi
                            </span>
                          </button>
                          <button
                            onClick={chooseRejectCard}
                            className="py-3 px-2 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/50 text-center btn-tactile"
                          >
                            <span className="block text-xs sm:text-sm font-extrabold text-rose-300">
                              🛑 TOLAK
                            </span>
                            <span className="block text-[9px] text-stone-400 mt-0.5">
                              Ajak Kompromi
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {gameStage === "consequence" && (
                      <div className="glass-luxury border border-amber-400/50 rounded-[28px] p-4 shadow-2xl animate-card-flip">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/40 mb-2">
                          ⚠️ KARTU KONSEKUENSI
                        </span>
                        <p className="font-serif text-sm sm:text-base font-bold text-stone-100 mb-2.5">
                          &ldquo;{currentCard.consequenceQuestion}&rdquo;
                        </p>
                        {personalTrap && (
                          <p className="text-[11px] text-stone-400 italic mb-3 p-2.5 rounded-xl bg-black/50 border border-white/10">
                            🪞 Cermin dirimu sendiri: &ldquo;
                            {personalTrap.statement}&rdquo;
                          </p>
                        )}
                        <div className="space-y-2">
                          <button
                            disabled={isSubmittingDecision}
                            onClick={() => resolveConsequence(true)}
                            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs flex justify-between btn-tactile disabled:opacity-50"
                          >
                            <span>💪 Tetap Terima Konsekuensinya</span>
                            <span>{mode === "couple" ? "+8%" : "+10%"}</span>
                          </button>
                          <button
                            disabled={isSubmittingDecision}
                            onClick={() => resolveConsequence(false)}
                            className="w-full py-3 px-4 rounded-2xl bg-rose-500/20 border border-rose-500/60 text-rose-200 font-extrabold text-xs flex justify-between btn-tactile disabled:opacity-50"
                          >
                            <span>😰 Ragu / Menyesal Pilih Terima</span>
                            <span>{mode === "couple" ? "-10%" : "-12%"}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {gameStage === "negotiate" && (
                      <div className="glass-luxury border border-rose-500/45 rounded-[28px] p-4 shadow-2xl animate-card-flip">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-rose-500/20 text-rose-300 mb-2">
                          🤝 PILIH JALAN TENGAH
                        </span>
                        <p className="text-xs font-semibold text-stone-300 mb-2.5">
                          Pilih opsi kompromimu — jika {partnerProfile.name}{" "}
                          memilih opsi yang sama, kalian{" "}
                          <strong className="text-emerald-300">
                            MATCH (+8%)
                          </strong>
                          .
                        </p>
                        <div className="space-y-1.5">
                          {currentCard.compromises.map((opt, idx) => (
                            <button
                              key={idx}
                              disabled={isSubmittingDecision}
                              onClick={() => resolveNegotiation(idx)}
                              className="w-full p-2.5 rounded-xl bg-black/50 hover:bg-white/5 border border-white/10 text-left flex items-start gap-2 text-[11px] sm:text-xs text-stone-200 btn-tactile disabled:opacity-50"
                            >
                              <span className="font-mono font-bold text-amber-300">
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
                    <div className="glass-luxury border border-amber-400/60 rounded-[28px] p-4 shadow-2xl animate-card-flip">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                          🚨 {partnerProfile.name.toUpperCase()} MENOLAK
                          KARTUMU
                        </span>
                      </div>

                      <p className="text-xs font-bold text-stone-100 leading-snug mb-1.5">
                        Pengakuanmu: &ldquo;{myOwnedCard.statement}&rdquo;
                      </p>
                      <p className="text-[11px] text-stone-300 mb-3">
                        Pilih solusi kompromi yang sama dengan{" "}
                        <strong className="text-amber-300">
                          {partnerProfile.name}
                        </strong>{" "}
                        supaya{" "}
                        <strong className="text-emerald-300">
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
                            className="w-full p-2.5 rounded-xl bg-black/50 hover:bg-amber-400/10 border border-white/10 hover:border-amber-400/50 text-left flex items-start gap-2 text-[11px] sm:text-xs text-stone-200 btn-tactile disabled:opacity-50"
                          >
                            <span className="font-mono font-bold text-amber-300">
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
                    <div className="glass-luxury border border-amber-500/30 rounded-[28px] p-6 text-center shadow-2xl animate-card-enter">
                      <div className="text-3xl mb-2 animate-bounce">🥂</div>
                      <h3 className="font-serif text-base font-bold text-stone-100">
                        Keputusanmu Terkunci
                      </h3>
                      <p className="text-xs text-stone-300 mt-1.5 leading-relaxed">
                        Menunggu{" "}
                        <strong className="text-amber-300">
                          {partnerProfile.name}
                        </strong>{" "}
                        menyelesaikan gilirannya di Ronde {round}...
                      </p>
                    </div>
                  )}
              </section>
            )}

          {/* ==================== SCREEN 5: ENDING ==================== */}
          {!authChecking && screen === "ending" && player1 && player2 && (
            <section className="animate-card-enter space-y-3 py-1 text-center">
              <div
                className={`glass-luxury border-2 rounded-[30px] p-5 shadow-2xl ${endingVerdict.border}`}
              >
                <div className="text-3xl mb-1.5">{endingVerdict.emoji}</div>
                <span
                  className={`inline-block px-3 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase border mb-1.5 ${endingVerdict.badgeBg}`}
                >
                  CHEMISTRY SCORE: {battery}%
                </span>
                <h1
                  className={`font-serif text-2xl sm:text-3xl font-extrabold ${endingVerdict.titleClass}`}
                >
                  {endingVerdict.title}
                </h1>
                <p className="text-xs text-stone-300 mt-2 leading-relaxed">
                  {endingVerdict.subtitle}
                </p>
                <div className="mt-3 pt-2.5 border-t border-white/10 text-xs text-stone-400">
                  <strong className="text-stone-100">{player1.name}</strong> ⚡{" "}
                  <strong className="text-amber-300">{player2.name}</strong>
                </div>
              </div>

              {mode === "couple" && isMatchmakingRoom && myPublicProfile && (
                <div className="glass-luxury border border-amber-400/50 rounded-[28px] p-4 shadow-xl text-center space-y-2">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                    💬 PRIVATE MATCH LOUNGE
                  </span>
                  <h3 className="font-serif text-base font-bold text-stone-100">
                    Lanjutkan Obrolan di Private Chat
                  </h3>
                  <p className="text-xs text-stone-300">
                    Kirim pesan ke pasangan Match kamu. Anggota VIP{" "}
                    <strong>Rp10.000 sekali bayar</strong> bebas membaca &amp;
                    membalas pesan ke semua Match tanpa sensor.
                  </p>
                  <button
                    onClick={() => goScreen("profile")}
                    className="w-full mt-1 py-3 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-rose-400 text-stone-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 btn-tactile"
                  >
                    💬 Buka Match &amp; Chat Sekarang →
                  </button>
                </div>
              )}

              <div className="grid grid-cols-4 gap-1.5">
                <div className="p-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <span className="block font-mono font-extrabold text-sm text-emerald-300">
                    {stats.terimaMantap}
                  </span>
                  <span className="text-[9px] text-stone-400">Terima</span>
                </div>
                <div className="p-2 rounded-2xl bg-rose-500/10 border border-rose-500/25">
                  <span className="block font-mono font-extrabold text-sm text-rose-300">
                    {stats.menyesal}
                  </span>
                  <span className="text-[9px] text-stone-400">Nyesel</span>
                </div>
                <div className="p-2 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                  <span className="block font-mono font-extrabold text-sm text-amber-300">
                    {stats.kompromiSepakat}
                  </span>
                  <span className="text-[9px] text-stone-400">Kompromi</span>
                </div>
                <div className="p-2 rounded-2xl bg-red-500/10 border border-red-500/25">
                  <span className="block font-mono font-extrabold text-sm text-red-400">
                    {stats.deadlockOrAfk}
                  </span>
                  <span className="text-[9px] text-stone-400">Gagal/AFK</span>
                </div>
              </div>

              <button
                onClick={downloadStoryCardPNG}
                className="w-full py-3 rounded-full bg-stone-100 hover:bg-white text-stone-950 font-extrabold text-xs sm:text-sm shadow-lg btn-tactile"
              >
                📸 Unduh Kartu Hasil IG Story
              </button>

              <button
                onClick={fullResetToLounge}
                className="w-full py-2.5 rounded-full bg-stone-900 hover:bg-stone-800 text-stone-200 font-bold text-xs border border-white/10 btn-tactile"
              >
                ✦ Kembali ke Lounge
              </button>
            </section>
          )}

          {/* ==================== SCREEN 6: DASHBOARD PROFIL & CHAT ==================== */}
          {!authChecking && screen === "profile" && myPublicProfile && (
            <ProfileDashboard
              profile={myPublicProfile}
              onClose={() => goScreen("bursa")}
              onGoBursa={() => goScreen("bursa")}
              showToast={showToast}
            />
          )}
        </div>

        <footer className="w-full pt-2 pb-1 text-center text-[10px] font-mono tracking-widest uppercase text-stone-600 shrink-0">
          BESOK KAWIN?
        </footer>
      </main>
    </div>
  );
}
