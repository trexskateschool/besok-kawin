"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { QuestionItem, build20QuestionsForProfile } from "./questions";
import { db, isFirebaseReady } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    window.__deferredInstallPrompt = e as BeforeInstallPromptEvent;
  });
}

interface PlayerProfile {
  name: string;
  gender: "Laki-laki" | "Perempuan";
  age: number;
  questions: QuestionItem[];
  answers: Record<string, "iya" | "kayanya" | "engga">;
  emoji?: string;
  tier?: "young" | "mid" | "mature";
  vibe?: string;
  bio?: string;
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

type ScreenType = "lobby" | "quiz" | "waiting" | "game" | "ending";

function getBotPersonaConfig(level: number) {
  if (level <= 23) {
    return {
      name: "Arkan",
      gender: "Laki-laki" as const,
      age: 22,
      tier: "young" as const,
      emoji: "🧢",
      vibe: "Spontan & Emosional",
      bio: "Gampang kebawa suasana, suka debat panjang kalau prinsipnya disentil.",
    };
  } else if (level <= 33) {
    return {
      name: "Nadya",
      gender: "Perempuan" as const,
      age: 27,
      tier: "mid" as const,
      emoji: "🎧",
      vibe: "Realistis & Logis",
      bio: "Suka diskusi objektif, hitung-hitungan untung rugi sebelum sepakat.",
    };
  } else {
    return {
      name: "Dimas",
      gender: "Laki-laki" as const,
      age: 35,
      tier: "mature" as const,
      emoji: "☕",
      vibe: "Pragmatis & To-The-Point",
      bio: "Anti-drama, fokus solusi praktis supaya masalah cepat selesai.",
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

export default function SefrekuensiGame() {
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
    const ua = window.navigator.userAgent;
    setIsIosDevice(/iPad|iPhone|iPod/.test(ua));

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
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
      showToast("Game berhasil dipasang di layar utama!", "success");
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
        }
        return;
      } catch {}
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
      }, 3400);
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

  const [screen, setScreen] = useState<ScreenType>("lobby");
  const goScreen = useCallback((next: ScreenType) => {
    setScreen(next);
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  // Lobby Setup State
  const [playerName, setPlayerName] = useState("");
  const [deckVariant, setDeckVariant] = useState<"Laki-laki" | "Perempuan">(
    "Laki-laki"
  );
  const [playIntent, setPlayIntent] = useState<"solo" | "create" | "join">(
    "solo"
  );
  const [inputJoinCode, setInputJoinCode] = useState("");
  const [botPersonaSlider, setBotPersonaSlider] = useState(27);
  const [isBusy, setIsBusy] = useState(false);

  // Room & Quiz State
  const [inviteCode, setInviteCode] = useState("");
  const [myRole, setMyRole] = useState<"player1" | "player2">("player1");
  const [player1, setPlayer1] = useState<PlayerProfile | null>(null);
  const [player2, setPlayer2] = useState<PlayerProfile | null>(null);
  const [mode, setMode] = useState<"solo" | "multiplayer">("solo");
  const [quizDraftProfile, setQuizDraftProfile] =
    useState<PlayerProfile | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);

  // Gameplay State
  const [syncScore, setSyncScore] = useState(50);
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

  const prevScoreRef = useRef(50);
  const lastSummaryIdRef = useRef<number>(0);

  const applyScoreDelta = (delta: number) => {
    setSyncScore((prev) => Math.max(0, Math.min(100, prev + delta)));
    if (delta !== 0) {
      setDeltaPop({ val: delta, key: Date.now() + Math.random() });
      if (delta < 0) setShakeHud((prev) => prev + 1);
    }
  };

  useEffect(() => {
    if (screen === "game" && mode === "multiplayer") {
      setGameStage("dilemma");
      setTimerSeconds(60);
      setTimerActive(true);
    }
  }, [round, screen, mode]);

  const myResponderCardState = myRole === "player1" ? c1State : c2State;
  const myOwnedCardState = myRole === "player1" ? c2State : c1State;

  const needsResponderAction =
    mode === "multiplayer" && myResponderCardState.status === "dilemma";
  const needsOwnerCompromiseAction =
    mode === "multiplayer" &&
    !needsResponderAction &&
    myOwnedCardState.status === "negotiating" &&
    myOwnedCardState.ownerChoice === undefined;

  useEffect(() => {
    if (screen !== "game" || !timerActive) return;
    if (
      mode === "multiplayer" &&
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

  // Real-time Firestore Room Listener
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
        const diff = data.battery - prevScoreRef.current;
        if (diff !== 0) {
          setDeltaPop({ val: diff, key: Date.now() + Math.random() });
          if (diff < 0) setShakeHud((s) => s + 1);
          prevScoreRef.current = data.battery;
        }
        setSyncScore(data.battery);
      }

      if (typeof data.round === "number") {
        setRound(data.round);
      }

      if (
        data.status === "playing" &&
        data.player1 &&
        data.player2 &&
        screen === "waiting"
      ) {
        setMode("multiplayer");
        prevScoreRef.current = data.battery ?? 50;
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

  // Step 1: Start Calibration from Lobby
  const handleStartCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = playerName.trim();
    if (!cleanName) {
      sfxPenalty();
      showToast("Masukkan nama panggilanmu dulu.", "warning");
      return;
    }

    if (playIntent === "join") {
      const cleanCode = inputJoinCode.trim().toUpperCase();
      if (cleanCode.length < 4) {
        sfxPenalty();
        showToast("Masukkan kode room yang valid.", "warning");
        return;
      }
      if (!isFirebaseReady || !db) {
        showToast("Layanan multiplayer belum terhubung.", "error");
        return;
      }
      setIsBusy(true);
      try {
        const snap = await getDoc(doc(db, "rooms", cleanCode));
        if (!snap.exists()) {
          sfxPenalty();
          showToast(`Kode room ${cleanCode} tidak ditemukan.`, "error");
          setIsBusy(false);
          return;
        }
        const roomData = snap.data();
        if (roomData.player2 && roomData.status === "playing") {
          sfxPenalty();
          showToast(`Room ${cleanCode} sudah penuh.`, "error");
          setIsBusy(false);
          return;
        }
      } catch {
        showToast("Gagal memeriksa room.", "error");
        setIsBusy(false);
        return;
      }
      setIsBusy(false);
    }

    sfxTap();
    setQuizDraftProfile({
      name: cleanName,
      gender: deckVariant,
      age: 26,
      questions: build20QuestionsForProfile(deckVariant, 26),
      answers: {},
    });
    setQuizIndex(0);
    goScreen("quiz");
  };

  // Step 2: Answer 20 Calibration Cards
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
      await finishCalibration(updatedProfile);
    }
  };

  const finishCalibration = async (completedProfile: PlayerProfile) => {
    if (playIntent === "solo") {
      const persona = getBotPersonaConfig(botPersonaSlider);
      const botQuestions = build20QuestionsForProfile(
        persona.gender,
        persona.age
      );
      const botAnswers: PlayerProfile["answers"] = {};
      botQuestions.forEach((q, i) => {
        if (i % 3 === 0 || i % 5 === 0) botAnswers[q.id] = "iya";
        else if (i % 2 === 0) botAnswers[q.id] = "kayanya";
        else botAnswers[q.id] = "engga";
      });

      const botProfile: PlayerProfile = {
        name: persona.name,
        gender: persona.gender,
        age: persona.age,
        questions: botQuestions,
        answers: botAnswers,
        emoji: persona.emoji,
        tier: persona.tier,
        vibe: persona.vibe,
        bio: persona.bio,
      };

      const generatedSoloDeck = buildDeckFromPartnerProfile(
        botProfile,
        "player1",
        maxRounds
      );

      setMode("solo");
      setPlayer1(completedProfile);
      setPlayer2(botProfile);
      setSoloDeck(generatedSoloDeck);
      setSyncScore(50);
      prevScoreRef.current = 50;
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
      sfxCharge();
      goScreen("game");
      return;
    }

    if (!isFirebaseReady || !db) {
      showToast("Koneksi database belum siap.", "error");
      return;
    }

    setIsBusy(true);
    try {
      if (playIntent === "create") {
        const generatedCode = "MEJA-" + Math.floor(100 + Math.random() * 899);
        const roomRef = doc(db, "rooms", generatedCode);
        await setDoc(roomRef, {
          code: generatedCode,
          player1: completedProfile,
          player2: null,
          status: "waiting",
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
        setMode("multiplayer");
        setInviteCode(generatedCode);
        setPlayer1(completedProfile);
        setPlayer2(null);
        sfxCharge();
        goScreen("waiting");
      } else if (playIntent === "join") {
        const code = inputJoinCode.trim().toUpperCase();
        const roomRef = doc(db, "rooms", code);
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
          showToast("Room tidak ditemukan.", "error");
          setIsBusy(false);
          return;
        }
        const roomData = roomSnap.data();
        const hostProfile: PlayerProfile = roomData.player1;

        const p1Deck = buildDeckFromPartnerProfile(
          completedProfile,
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

        setMyRole("player2");
        setMode("multiplayer");
        setInviteCode(code);
        setPlayer1(hostProfile);
        setPlayer2(completedProfile);
        setP1OnlineDeck(p1Deck);
        setP2OnlineDeck(p2Deck);
        setGameStage("dilemma");
        setTimerSeconds(60);
        setTimerActive(true);
        sfxCharge();
        goScreen("game");
      }
    } catch (err) {
      console.error(err);
      showToast("Gagal menyiapkan room permainan.", "error");
    } finally {
      setIsBusy(false);
    }
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
    const nextScore = Math.max(
      0,
      Math.min(100, ((data.battery as number) ?? 50) + roundDelta)
    );

    const prevHistory: HistoryItem[] = (data.history as HistoryItem[]) || [];
    const newItems: HistoryItem[] = [
      {
        round: curRound,
        category: card1?.category || "Topik",
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
        category: card2?.category || "Topik",
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

    const isGameOver = nextScore <= 0 || curRound >= maxRounds;
    const nextReason =
      nextScore <= 0
        ? "Skor sefrekuensi menyentuh 0% sebelum ronde selesai!"
        : "";

    const summaryText = `Ronde ${curRound} selesai (${
      roundDelta >= 0 ? `+${roundDelta}%` : `${roundDelta}%`
    })`;

    return {
      battery: nextScore,
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
          tx.update(roomRef, { c1, c2, updatedAt: Date.now() });
        }
      });
    } catch {
      showToast("Gagal mengirim jawaban.", "error");
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

        tx.update(roomRef, { c1, c2, updatedAt: Date.now() });
      });
      showToast(
        `Opsi ${String.fromCharCode(
          65 + chosenIdx
        )} terkunci! Menunggu pemain lain memilih kompromi...`,
        "info"
      );
    } catch {
      showToast("Gagal mengirim pilihan.", "error");
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
          ? `Sepakat! (Opsi ${String.fromCharCode(65 + ownerIdx)})`
          : isTimeout
          ? `Timeout Kompromi (${ownerName})`
          : `Deadlock (${responderName}: ${String.fromCharCode(
              65 + responderIdx
            )} vs ${ownerName}: ${String.fromCharCode(65 + ownerIdx)})`;

        if (isMatch) sfxCharge();
        else sfxPenalty();

        if (c1.status === "resolved" && c2.status === "resolved") {
          tx.update(roomRef, finalizeRoundIfBothResolved(data, c1, c2));
        } else {
          tx.update(roomRef, { c1, c2, updatedAt: Date.now() });
        }
      });
    } catch {
      showToast("Gagal mengirim kompromi.", "error");
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const advanceSoloRound = (projectedScore: number) => {
    if (projectedScore <= 0) {
      setTimerActive(false);
      setEndingReason("Skor sefrekuensi menyentuh 0% sebelum ronde selesai!");
      sfxPenalty();
      goScreen("ending");
      return;
    }
    if (round >= maxRounds) {
      setTimerActive(false);
      if (projectedScore >= 80) sfxWin();
      else if (projectedScore >= 45) sfxCharge();
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

    if (mode === "multiplayer") {
      if (needsResponderAction) {
        showToast("Waktu habis! Dihitung telat merespons (-10%).", "error");
        await submitOnlineResponderDirect(
          -10,
          `${meProfile.name}: Timeout`,
          "deadlockOrAfk"
        );
      } else if (needsOwnerCompromiseAction) {
        showToast("Waktu habis memilih kompromi (-10%).", "error");
        await submitOnlineOwnerCompromiseChoice(-1);
      }
      return;
    }

    const nextAfk = consecutiveTimeouts + 1;
    setConsecutiveTimeouts(nextAfk);
    const nextScore = Math.max(0, Math.min(100, syncScore - 15));
    applyScoreDelta(-15);
    setStats((s) => ({ ...s, deadlockOrAfk: s.deadlockOrAfk + 1 }));
    setHistory((h) => [
      ...h,
      {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `${meProfile.name}: Timeout`,
        delta: -15,
        type: "bad",
      },
    ]);

    if (nextAfk >= 3) {
      setTimeout(() => {
        setEndingReason("3x Timeout berturut-turut!");
        goScreen("ending");
      }, 800);
      return;
    }
    setTimeout(() => advanceSoloRound(nextScore), 900);
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

    if (mode === "multiplayer") {
      if (isFirm) {
        sfxCharge();
        await submitOnlineResponderDirect(
          8,
          `${meProfile.name}: Konsisten Terima`,
          "terimaMantap"
        );
      } else {
        sfxPenalty();
        await submitOnlineResponderDirect(
          -10,
          `${meProfile.name}: Ragu Setelah Terima`,
          "menyesal"
        );
      }
      return;
    }

    setTimerActive(false);
    if (isFirm) {
      sfxCharge();
      const nextScore = Math.max(0, Math.min(100, syncScore + 10));
      applyScoreDelta(10);
      setStats((s) => ({ ...s, terimaMantap: s.terimaMantap + 1 }));
      setHistory((h) => [
        ...h,
        {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `${meProfile.name}: Konsisten Terima`,
          delta: 10,
          type: "good",
        },
      ]);
      showToast("Konsisten! Skor sefrekuensi +10%", "success");
      setTimeout(() => advanceSoloRound(nextScore), 750);
    } else {
      sfxPenalty();
      const nextScore = Math.max(0, Math.min(100, syncScore - 12));
      applyScoreDelta(-12);
      setStats((s) => ({ ...s, menyesal: s.menyesal + 1 }));
      setHistory((h) => [
        ...h,
        {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `${meProfile.name}: Ragu Setelah Terima`,
          delta: -12,
          type: "bad",
        },
      ]);
      showToast("Goyah di tengah jalan! Penalti -12%", "error");
      setTimeout(() => advanceSoloRound(nextScore), 750);
    }
  };

  const resolveNegotiation = async (chosenIdx: number) => {
    if (!currentCard || !meProfile || !partnerProfile) return;

    if (mode === "multiplayer") {
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
      const nextScore = Math.max(0, Math.min(100, syncScore + 5));
      applyScoreDelta(5);
      setStats((s) => ({ ...s, kompromiSepakat: s.kompromiSepakat + 1 }));
      setHistory((h) => [
        ...h,
        {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `Sepakat Kompromi (Opsi ${String.fromCharCode(
            65 + chosenIdx
          )})`,
          delta: 5,
          type: "neutral",
        },
      ]);
      showToast(
        `Sepakat di Opsi ${String.fromCharCode(65 + chosenIdx)}! (+5%)`,
        "success"
      );
      setTimeout(() => advanceSoloRound(nextScore), 850);
    } else {
      sfxPenalty();
      const nextScore = Math.max(0, Math.min(100, syncScore - 15));
      applyScoreDelta(-15);
      setStats((s) => ({ ...s, deadlockOrAfk: s.deadlockOrAfk + 1 }));
      setHistory((h) => [
        ...h,
        {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `Deadlock (Kamu: ${String.fromCharCode(
            65 + chosenIdx
          )} vs ${partnerProfile.name}: ${String.fromCharCode(65 + botIdx)})`,
          delta: -15,
          type: "bad",
        },
      ]);
      showToast(
        `Deadlock! Kamu pilih ${String.fromCharCode(65 + chosenIdx)}, ${
          partnerProfile.name
        } pilih ${String.fromCharCode(65 + botIdx)} (-15%)`,
        "error"
      );
      setTimeout(() => advanceSoloRound(nextScore), 850);
    }
  };

  const endingVerdict =
    syncScore >= 80
      ? {
          emoji: "🏆",
          title: "SEFREKUENSI TOTAL!",
          subtitle:
            "Cara pikir dan kompromi kalian nyambung banget. Ego bisa ditekan dan solusi selalu ketemu di tengah!",
          border: "border-emerald-500/60",
          badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
          titleClass: "text-emerald-300",
        }
      : syncScore >= 45
      ? {
          emoji: "⚖️",
          title: "MASIH BISA NEGO",
          subtitle:
            "Banyak titik temu yang cocok, tapi masih ada beberapa prinsip yang bikin debat panjang sebelum sepakat.",
          border: "border-amber-500/60",
          badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
          titleClass: "text-amber-300",
        }
      : {
          emoji: "💥",
          title: "BEDA FREKUENSI",
          subtitle: endingReason
            ? `${endingReason} Terlalu sering deadlock dan tarik ulur argumen.`
            : "Terlalu banyak deadlock ego dan jalan buntu setiap kali beda pendapat!",
          border: "border-rose-500/60",
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

    ctx.fillStyle = "#090a0f";
    ctx.fillRect(0, 0, 1080, 1920);

    const isWin = syncScore >= 80;
    const isMid = syncScore >= 45 && syncScore < 80;
    const accentColor = isWin ? "#10b981" : isMid ? "#f59e0b" : "#f43f5e";

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

    ctx.fillStyle = "#f59e0b";
    ctx.font = "900 44px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SEFREKUENSI • Card Game", 540, 160);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 28px sans-serif";
    ctx.fillText("HASIL UJI KOMPROMI & FREKUENSI", 540, 210);

    roundRect(80, 280, 920, 1180, 48);
    ctx.fillStyle = "rgba(18, 19, 26, 0.96)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = accentColor;
    ctx.stroke();

    ctx.font = "130px sans-serif";
    ctx.fillText(endingVerdict.emoji, 540, 460);

    roundRect(300, 515, 480, 64, 32);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fill();
    ctx.fillStyle = accentColor;
    ctx.font = "800 30px monospace";
    ctx.fillText(`SKOR SEFREKUENSI: ${syncScore}%`, 540, 558);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 62px sans-serif";
    ctx.fillText(endingVerdict.title, 540, 665);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 36px sans-serif";
    ctx.fillText(`${player1.name}  ⚡  ${player2.name}`, 540, 740);

    roundRect(150, 795, 780, 44, 22);
    ctx.fillStyle = "#090a0f";
    ctx.fill();
    if (syncScore > 0) {
      roundRect(156, 801, Math.max(32, (768 * syncScore) / 100), 32, 16);
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
      { label: "KONSISTEN", val: `${stats.terimaMantap}x`, color: "#10b981" },
      { label: "GOYAH", val: `${stats.menyesal}x`, color: "#f43f5e" },
      { label: "KOMPROMI", val: `${stats.kompromiSepakat}x`, color: "#f59e0b" },
      { label: "DEADLOCK", val: `${stats.deadlockOrAfk}x`, color: "#ef4444" },
    ];

    statBoxes.forEach((box, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = 140 + col * 410;
      const by = 1140 + row * 135;
      roundRect(bx, by, 390, 115, 24);
      ctx.fillStyle = "rgba(9, 10, 15, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(245, 158, 11, 0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = box.color;
      ctx.font = "900 34px monospace";
      ctx.fillText(box.val, bx + 195, by + 54);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 22px sans-serif";
      ctx.fillText(box.label, bx + 195, by + 90);
    });

    const displayHost =
      typeof window !== "undefined" ? window.location.host : "vercel.app";
    ctx.fillStyle = "#f59e0b";
    ctx.font = "800 34px monospace";
    ctx.fillText(displayHost, 540, 1615);

    const link = document.createElement("a");
    link.download = `SEFREKUENSI-${player1.name}-${player2.name}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("Kartu hasil berhasil diunduh!", "success");
  };

  const resetToLobby = () => {
    sfxTap();
    setTimerActive(false);
    setInviteCode("");
    setMyRole("player1");
    setMode("solo");
    setPlayer1(null);
    setPlayer2(null);
    setC1State({ status: "dilemma" });
    setC2State({ status: "dilemma" });
    setHistory([]);
    goScreen("lobby");
  };

  const activeQuizQuestion = quizDraftProfile?.questions[quizIndex];
  const botPreview = getBotPersonaConfig(botPersonaSlider);
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

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none flex flex-col bg-[#090a0f] text-stone-100">
      <style>{`
        html, body { position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden; overscroll-behavior: none; }
        vercel-live-feedback, #__vercel-toolbar, [data-vercel-toolbar], iframe[src*="vercel.live"] {
          display: none !important;
        }
        .card-surface {
          background: linear-gradient(165deg, rgba(24, 25, 34, 0.92) 0%, rgba(13, 14, 20, 0.96) 100%);
          backdrop-filter: blur(18px);
        }
        .btn-tactile { transition: transform 0.12s ease; }
        .btn-tactile:active { transform: scale(0.97); }
      `}</style>

      {/* HEADER */}
      <header
        style={{ paddingTop: "max(0.65rem, env(safe-area-inset-top))" }}
        className="w-full shrink-0 border-b border-amber-500/15 bg-[#090a0f]/95 z-40 pb-2.5"
      >
        <div className="max-w-xl mx-auto px-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={resetToLobby}
            className="flex items-center gap-2 text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-base">
              🃏
            </div>
            <div>
              <span className="block font-bold text-xs sm:text-sm text-stone-100 tracking-wide">
                SEFREKUENSI
              </span>
              <span className="block text-[10px] text-stone-400">
                Game Kartu Dilema &amp; Kompromi
              </span>
            </div>
          </button>

          <div className="flex items-center gap-1.5">
            {!isAppInstalled && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-2.5 py-1.5 rounded-full bg-amber-400 text-stone-950 text-[11px] font-extrabold btn-tactile"
              >
                Install
              </button>
            )}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="w-7 h-7 rounded-full bg-stone-900 text-stone-300 border border-white/10 flex items-center justify-center text-xs"
            >
              {soundEnabled ? "🔊" : "🔈"}
            </button>
            {screen !== "lobby" && (
              <button
                onClick={resetToLobby}
                className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-stone-900 hover:bg-stone-800 text-stone-300 border border-white/10"
              >
                Menu
              </button>
            )}
          </div>
        </div>
      </header>

      {/* INSTALL MODAL */}
      {showInstallGuide && (
        <div
          onClick={() => setShowInstallGuide(false)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md card-surface border border-amber-500/25 rounded-3xl p-5"
          >
            <h3 className="font-bold text-stone-100 text-sm mb-3">
              Pasang Game ke Layar Utama
            </h3>
            <p className="text-xs text-stone-300 mb-4 leading-relaxed">
              {isIosDevice
                ? "Buka di Safari, ketuk ikon Share di bawah layar, lalu pilih Add to Home Screen."
                : "Buka di Google Chrome, ketuk menu titik tiga (⋮) di pojok kanan atas, lalu pilih Install app."}
            </p>
            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-2.5 rounded-full bg-amber-400 text-stone-950 font-extrabold text-xs"
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
            className="px-4 py-3 rounded-2xl border bg-stone-950/95 border-amber-500/30 text-stone-100 text-xs font-semibold shadow-xl"
          >
            ✦ {t.message}
          </div>
        ))}
      </div>

      {/* MAIN CONTENT */}
      <main
        ref={mainScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-none w-full flex flex-col"
      >
        <div className="my-auto w-full max-w-xl mx-auto px-4 py-4 flex flex-col justify-center">
          {/* ==================== SCREEN 1: LOBBY ==================== */}
          {screen === "lobby" && (
            <section className="space-y-3">
              <div className="card-surface border border-amber-500/25 rounded-3xl p-5 shadow-2xl">
                <span className="inline-block px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest bg-amber-500/10 text-amber-300 border border-amber-500/25 mb-3">
                  2-Player &amp; Solo Card Game
                </span>
                <h1 className="text-2xl font-extrabold text-stone-100 leading-snug mb-1.5">
                  Seberapa Sefrekuensi Isi Kepalamu?
                </h1>
                <p className="text-xs text-stone-400 leading-relaxed mb-4">
                  Jawab 20 kartu pengakuan singkat, lalu adu argumen dan cari
                  kompromi bareng teman, pasangan, atau lawan AI dalam 8 ronde.
                </p>

                <form onSubmit={handleStartCalibration} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                      Nama Panggilan
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={20}
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Masukkan namamu..."
                      className="w-full bg-black/50 border border-white/10 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                      Dek Kartu Sudut Pandang
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Laki-laki", "Perempuan"] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setDeckVariant(g)}
                          className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition ${
                            deckVariant === g
                              ? "border-amber-400 bg-amber-400/15 text-amber-200"
                              : "border-white/10 bg-black/40 text-stone-400"
                          }`}
                        >
                          {g === "Laki-laki"
                            ? "🎯 Dek Perspektif A"
                            : "✨ Dek Perspektif B"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-300 mb-1">
                      Mode Bermain
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPlayIntent("solo")}
                        className={`py-2.5 px-2 rounded-xl border text-[11px] font-bold ${
                          playIntent === "solo"
                            ? "border-amber-400 bg-amber-400/15 text-amber-200"
                            : "border-white/10 bg-black/40 text-stone-400"
                        }`}
                      >
                        🤖 Lawan AI
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlayIntent("create")}
                        className={`py-2.5 px-2 rounded-xl border text-[11px] font-bold ${
                          playIntent === "create"
                            ? "border-emerald-400 bg-emerald-400/15 text-emerald-200"
                            : "border-white/10 bg-black/40 text-stone-400"
                        }`}
                      >
                        🔑 Buat Room
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlayIntent("join")}
                        className={`py-2.5 px-2 rounded-xl border text-[11px] font-bold ${
                          playIntent === "join"
                            ? "border-rose-400 bg-rose-400/15 text-rose-200"
                            : "border-white/10 bg-black/40 text-stone-400"
                        }`}
                      >
                        🎟️ Gabung Kode
                      </button>
                    </div>
                  </div>

                  {playIntent === "solo" && (
                    <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-stone-300 font-bold">
                          Lawan: {botPreview.emoji} {botPreview.name}
                        </span>
                        <span className="text-amber-300 font-mono text-[11px]">
                          {botPreview.vibe}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={18}
                        max={45}
                        value={botPersonaSlider}
                        onChange={(e) =>
                          setBotPersonaSlider(parseInt(e.target.value, 10))
                        }
                        className="w-full"
                      />
                    </div>
                  )}

                  {playIntent === "join" && (
                    <div>
                      <input
                        type="text"
                        value={inputJoinCode}
                        onChange={(e) => setInputJoinCode(e.target.value)}
                        placeholder="Masukkan kode room (misal: MEJA-412)"
                        maxLength={12}
                        className="w-full bg-black/60 border border-white/15 focus:border-rose-400 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold uppercase text-stone-100 focus:outline-none"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="w-full py-3.5 px-5 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 text-stone-950 font-extrabold text-xs sm:text-sm shadow-lg btn-tactile disabled:opacity-50"
                  >
                    {isBusy
                      ? "Memproses..."
                      : "Mulai Kalibrasi 20 Kartu →"}
                  </button>
                </form>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 2: 20 CARDS CALIBRATION ==================== */}
          {screen === "quiz" && quizDraftProfile && activeQuizQuestion && (
            <section className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/25">
                    Kartu {quizIndex + 1} / 20
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {quizDraftProfile.name}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-stone-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${((quizIndex + 1) / 20) * 100}%` }}
                  />
                </div>
              </div>

              <div className="card-surface border border-amber-500/25 rounded-3xl p-5 shadow-2xl">
                <span className="inline-block px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30 mb-2.5">
                  {activeQuizQuestion.category}
                </span>
                <blockquote className="text-base sm:text-lg font-bold text-stone-100 leading-relaxed">
                  &ldquo;{activeQuizQuestion.statement}&rdquo;
                </blockquote>
              </div>

              {isBusy ? (
                <div className="p-4 rounded-2xl card-surface border border-amber-500/25 text-center text-xs font-bold text-amber-300">
                  Menyiapkan meja permainan...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => answerQuiz("iya")}
                    className="w-full py-3 px-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-left text-xs sm:text-sm font-extrabold text-emerald-300 btn-tactile"
                  >
                    🔥 Iya, ini gue banget (Kartu Utama)
                  </button>
                  <button
                    onClick={() => answerQuiz("kayanya")}
                    className="w-full py-3 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-left text-xs sm:text-sm font-extrabold text-amber-300 btn-tactile"
                  >
                    🤔 Kadang-kadang / Situasional (Wildcard)
                  </button>
                  <button
                    onClick={() => answerQuiz("engga")}
                    className="w-full py-3 px-4 rounded-2xl bg-stone-900 hover:bg-stone-800 border border-white/10 text-left text-xs sm:text-sm font-extrabold text-stone-300 btn-tactile"
                  >
                    🛡️ Nggak sama sekali
                  </button>
                </div>
              )}
            </section>
          )}

          {/* ==================== SCREEN 3: WAITING ROOM ==================== */}
          {screen === "waiting" && player1 && (
            <section className="space-y-3">
              <div className="card-surface border border-amber-500/35 rounded-3xl p-5 shadow-xl text-center">
                <span className="inline-block px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest bg-amber-500/15 text-amber-300 border border-amber-500/30 mb-3">
                  Menunggu Pemain Kedua...
                </span>
                <h2 className="text-lg font-bold text-stone-100 mb-1">
                  Kode Room Permainan
                </h2>
                <p className="text-xs text-stone-400 mb-4">
                  Bagikan kode ini ke teman mainmu untuk masuk ke meja yang
                  sama.
                </p>

                <div className="inline-block font-mono font-extrabold text-2xl px-6 py-3 rounded-2xl bg-black/70 text-amber-300 border border-amber-400/40 tracking-widest">
                  {inviteCode}
                </div>

                <button
                  onClick={() => {
                    const shareOrigin =
                      typeof window !== "undefined"
                        ? window.location.origin
                        : "";
                    copyTextSafe(
                      `Ayo main SEFREKUENSI! Buka ${shareOrigin} pilih Gabung Kode dan masukkan: ${inviteCode}`,
                      "Kode room berhasil disalin!"
                    );
                  }}
                  className="block w-full mt-4 py-3 rounded-full bg-amber-400 text-stone-950 font-extrabold text-xs btn-tactile"
                >
                  📋 Salin Kode Room
                </button>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 4: GAMEPLAY ==================== */}
          {screen === "game" &&
            currentCard &&
            meProfile &&
            partnerProfile && (
              <section className="space-y-2.5">
                <div
                  key={shakeHud}
                  className="card-surface border border-amber-500/25 rounded-3xl p-3.5 shadow-xl relative"
                >
                  {deltaPop && (
                    <div
                      key={deltaPop.key}
                      className="absolute right-6 -top-3 pointer-events-none z-30"
                    >
                      <span
                        className={`inline-block font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-full shadow-lg ${
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
                      ⚡ Skor Sefrekuensi
                    </span>
                    <span
                      className={`font-mono font-extrabold text-base ${
                        syncScore >= 80
                          ? "text-emerald-400"
                          : syncScore >= 45
                          ? "text-amber-300"
                          : "text-rose-400"
                      }`}
                    >
                      {syncScore}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-black/70 rounded-full border border-white/10 p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        syncScore >= 80
                          ? "bg-emerald-400"
                          : syncScore >= 45
                          ? "bg-amber-400"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${syncScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-[11px] text-stone-400">
                    <span>
                      Ronde <strong className="text-amber-300">{round}</strong>
                      /8 •{" "}
                      <strong className="text-stone-100">
                        {meProfile.name}
                      </strong>{" "}
                      vs{" "}
                      <strong className="text-amber-300">
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
                      <div className="card-surface border border-amber-500/25 rounded-3xl p-4 shadow-2xl">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {currentCard.category}
                          </span>
                          <span className="text-[11px] font-semibold text-stone-400">
                            Kartu {partnerProfile.name}
                          </span>
                        </div>

                        <p className="text-sm sm:text-base font-bold text-stone-100 leading-snug mb-2">
                          &ldquo;{currentCard.partnerPrompt}&rdquo;
                        </p>
                        <p className="text-[11px] text-stone-400 italic mb-3.5 pl-2.5 border-l-2 border-amber-400/40">
                          Pernyataan {partnerProfile.name}: &ldquo;
                          {currentCard.statement}&rdquo;
                        </p>

                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            onClick={chooseAcceptCard}
                            className="py-3 px-2 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/50 text-center btn-tactile"
                          >
                            <span className="block text-xs sm:text-sm font-extrabold text-emerald-300">
                              ✅ TERIMA
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
                      <div className="card-surface border border-amber-400/50 rounded-3xl p-4 shadow-2xl">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/40 mb-2">
                          ⚠️ KARTU KONSEKUENSI
                        </span>
                        <p className="text-sm sm:text-base font-bold text-stone-100 mb-2.5">
                          &ldquo;{currentCard.consequenceQuestion}&rdquo;
                        </p>
                        {personalTrap && (
                          <p className="text-[11px] text-stone-400 italic mb-3 p-2.5 rounded-xl bg-black/50 border border-white/10">
                            🪞 Kartu dirimu sendiri: &ldquo;
                            {personalTrap.statement}&rdquo;
                          </p>
                        )}
                        <div className="space-y-2">
                          <button
                            disabled={isSubmittingDecision}
                            onClick={() => resolveConsequence(true)}
                            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs flex justify-between btn-tactile disabled:opacity-50"
                          >
                            <span>💪 Tetap Konsisten Terima</span>
                            <span>
                              {mode === "multiplayer" ? "+8%" : "+10%"}
                            </span>
                          </button>
                          <button
                            disabled={isSubmittingDecision}
                            onClick={() => resolveConsequence(false)}
                            className="w-full py-3 px-4 rounded-2xl bg-rose-500/20 border border-rose-500/60 text-rose-200 font-extrabold text-xs flex justify-between btn-tactile disabled:opacity-50"
                          >
                            <span>😰 Ragu / Tarik Ucapan</span>
                            <span>
                              {mode === "multiplayer" ? "-10%" : "-12%"}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {gameStage === "negotiate" && (
                      <div className="card-surface border border-rose-500/45 rounded-3xl p-4 shadow-2xl">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-rose-500/20 text-rose-300 mb-2">
                          🤝 PILIH JALAN TENGAH
                        </span>
                        <p className="text-xs font-semibold text-stone-300 mb-2.5">
                          Pilih opsi kompromi — jika {partnerProfile.name}{" "}
                          memilih opsi yang sama, kalian{" "}
                          <strong className="text-emerald-300">
                            SEPAKAT (+8%)
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

                {mode === "multiplayer" &&
                  needsOwnerCompromiseAction &&
                  myOwnedCard && (
                    <div className="card-surface border border-amber-400/60 rounded-3xl p-4 shadow-2xl">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-400/20 text-amber-300 border border-amber-400/40 mb-2">
                        🚨 {partnerProfile.name.toUpperCase()} MENOLAK KARTUMU
                      </span>
                      <p className="text-xs font-bold text-stone-100 leading-snug mb-1.5">
                        Kartumu: &ldquo;{myOwnedCard.statement}&rdquo;
                      </p>
                      <p className="text-[11px] text-stone-300 mb-3">
                        Pilih kompromi yang sama dengan{" "}
                        <strong className="text-amber-300">
                          {partnerProfile.name}
                        </strong>{" "}
                        agar{" "}
                        <strong className="text-emerald-300">
                          SEPAKAT (+8%)
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
                            className="w-full p-2.5 rounded-xl bg-black/50 hover:bg-amber-400/10 border border-white/10 text-left flex items-start gap-2 text-[11px] sm:text-xs text-stone-200 btn-tactile disabled:opacity-50"
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

                {mode === "multiplayer" &&
                  !needsResponderAction &&
                  !needsOwnerCompromiseAction && (
                    <div className="card-surface border border-amber-500/30 rounded-3xl p-6 text-center shadow-2xl">
                      <div className="text-3xl mb-2">⏳</div>
                      <h3 className="text-base font-bold text-stone-100">
                        Keputusanmu Terkunci
                      </h3>
                      <p className="text-xs text-stone-300 mt-1.5">
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
          {screen === "ending" && player1 && player2 && (
            <section className="space-y-3 text-center">
              <div
                className={`card-surface border-2 rounded-3xl p-5 shadow-2xl ${endingVerdict.border}`}
              >
                <div className="text-3xl mb-1.5">{endingVerdict.emoji}</div>
                <span
                  className={`inline-block px-3 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase border mb-1.5 ${endingVerdict.badgeBg}`}
                >
                  SKOR SEFREKUENSI: {syncScore}%
                </span>
                <h1 className={`text-2xl font-extrabold ${endingVerdict.titleClass}`}>
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

              <div className="grid grid-cols-4 gap-1.5">
                <div className="p-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                  <span className="block font-mono font-extrabold text-sm text-emerald-300">
                    {stats.terimaMantap}
                  </span>
                  <span className="text-[9px] text-stone-400">Konsisten</span>
                </div>
                <div className="p-2 rounded-2xl bg-rose-500/10 border border-rose-500/25">
                  <span className="block font-mono font-extrabold text-sm text-rose-300">
                    {stats.menyesal}
                  </span>
                  <span className="text-[9px] text-stone-400">Goyah</span>
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
                  <span className="text-[9px] text-stone-400">Deadlock</span>
                </div>
              </div>

              {history.length > 0 && (
                <div className="card-surface border border-white/10 rounded-3xl p-4 text-left space-y-2 max-h-48 overflow-y-auto">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400">
                    Rekap Ronde Permainan
                  </span>
                  {history.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-start justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-stone-200 block truncate">
                          R{item.round} • {item.category}
                        </span>
                        <span className="text-stone-400 block truncate">
                          {item.outcomeLabel}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-bold shrink-0 ${
                          item.delta >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {item.delta >= 0 ? `+${item.delta}%` : `${item.delta}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={downloadStoryCardPNG}
                className="w-full py-3 rounded-full bg-stone-100 hover:bg-white text-stone-950 font-extrabold text-xs sm:text-sm shadow-lg btn-tactile"
              >
                📸 Unduh Kartu Hasil Story
              </button>

              <button
                onClick={resetToLobby}
                className="w-full py-2.5 rounded-full bg-stone-900 hover:bg-stone-800 text-stone-200 font-bold text-xs border border-white/10 btn-tactile"
              >
                Main Lagi
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
