"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  DeckTheme,
  DECK_THEME_META,
  QuestionItem,
  SUDDEN_DEATH_QUESTIONS,
  build20QuestionsForProfile,
} from "./questions";
import { db, isFirebaseReady } from "@/lib/firebase";
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";

interface PlayerProfile {
  name: string;
  email: string;
  gender: "Laki-laki" | "Perempuan";
  age: number;
  questions: QuestionItem[];
  answers: Record<string, "iya" | "kayanya" | "engga">;
  tier?: "young" | "mid" | "mature";
  emoji?: string;
  vibe?: string;
  bio?: string;
  reactAccept?: string;
  reactReject?: string;
}

interface DeckCard extends QuestionItem {
  isWildcard: boolean;
  sourceOwner: string;
  roundNum: number;
  responderKey: "player1" | "player2";
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

interface AuditAlert {
  id: number;
  title: string;
  detail: string;
  delta: number;
  isCaught: boolean;
}

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

type ScreenType =
  | "register"
  | "quiz"
  | "waiting-host"
  | "mode"
  | "partner-join"
  | "game"
  | "ending";

const STAKE_PRESETS = [
  "Kalah wajib traktir makan / kopi",
  "Skor < 80% wajib jawab 1 pertanyaan jujur tanpa marah",
  "Yang paling sering deadlock wajib post rapor ini di Threads",
  "Kalah wajib nurutin 1 permintaan pasangan seharian",
];

function formatRejectedProblemForOwner(
  rejectorName: string,
  rawStatement: string
): string {
  let text = rawStatement.trim().replace(/[.!?]+$/, "");

  text = text.replace(
    /\b(pasangan|cowok|cewek|pacar|suami|istri|keluarga|orang\s*tua|ortu|hidup|karier|karir|uang|duit|gaji|waktu|diri|hati|perasaan|mental|emosi|ego|sikap|kebiasaan|masa\s*lalu)\s+(gua|gue|aku|saya)\b/gi,
    (_, noun: string) => `${noun.toLowerCase()}mu`
  );

  text = text.replace(/\b(gua|gue|aku|saya)\b/gi, "kamu");
  text = text.replace(/\s+/g, " ").trim();

  if (!/^kamu\b/i.test(text)) {
    const firstWord = text.split(" ")[0] || "";
    const isAcronym =
      firstWord.length > 1 && firstWord === firstWord.toUpperCase();
    if (!isAcronym && text.length > 0) {
      text = text.charAt(0).toLowerCase() + text.slice(1);
    }
    text = `kamu ${text}`;
  } else {
    text = `kamu${text.slice(4)}`;
  }

  return `${rejectorName} menolak masalahmu soal ${text}.`;
}

function findContradictoryConfession(
  responder: PlayerProfile,
  currentCard: DeckCard
): QuestionItem | null {
  const iyaList = responder.questions.filter(
    (q) => responder.answers[q.id] === "iya" && q.id !== currentCard.id
  );
  if (iyaList.length > 0) {
    const sameCat = iyaList.find((q) => q.category === currentCard.category);
    return sameCat || iyaList[Math.floor(Math.random() * iyaList.length)];
  }

  const kayanyaList = responder.questions.filter(
    (q) => responder.answers[q.id] === "kayanya" && q.id !== currentCard.id
  );
  if (kayanyaList.length > 0) {
    return kayanyaList[Math.floor(Math.random() * kayanyaList.length)];
  }

  return null;
}

function getSuddenDeathForMatch(seedStr: string) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  return SUDDEN_DEATH_QUESTIONS[hash % SUDDEN_DEATH_QUESTIONS.length];
}

function glitterBurst(ev?: React.MouseEvent<HTMLElement>) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const r = ev?.currentTarget
    ? ev.currentTarget.getBoundingClientRect()
    : null;
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 2 : window.innerHeight / 2;

  const c = document.createElement("canvas");
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  c.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99";
  document.body.appendChild(c);

  const g = c.getContext("2d");
  if (!g) {
    c.remove();
    return;
  }

  const cols = ["#f43f5e", "#34d399", "#fbbf24", "#38bdf8", "#ffffff"];
  let f = 0;
  const ps = Array.from({ length: 80 }, () => {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 7;
    return {
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 3,
      r: 2 + Math.random() * 4,
      c: cols[Math.floor(Math.random() * cols.length)],
      w: Math.random() * 6,
    };
  });

  function step() {
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    f++;
    ps.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.985;
      g.globalAlpha =
        Math.max(0, 1 - f / 100) * (0.55 + 0.45 * Math.sin(f * 0.5 + p.w));
      g.fillStyle = p.c;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(f * 0.1 + p.w);
      const q = p.r;
      g.beginPath();
      g.moveTo(0, -q * 2);
      g.lineTo(q * 0.5, -q * 0.5);
      g.lineTo(q * 2, 0);
      g.lineTo(q * 0.5, q * 0.5);
      g.lineTo(0, q * 2);
      g.lineTo(-q * 0.5, q * 0.5);
      g.lineTo(-q * 2, 0);
      g.lineTo(-q * 0.5, -q * 0.5);
      g.closePath();
      g.fill();
      g.restore();
    });
    if (f < 100) requestAnimationFrame(step);
    else c.remove();
  }
  requestAnimationFrame(step);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function truncateCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
}

function getBotPersonaConfig(
  botGender: "Laki-laki" | "Perempuan",
  botAge: number
) {
  const isFemale = botGender === "Perempuan";
  if (botAge <= 24) {
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
  } else if (botAge <= 32) {
    return {
      name: isFemale ? "Nadya" : "Bagas",
      age: botAge,
      gender: botGender,
      tier: "mid" as const,
      emoji: isFemale ? "👩" : "👨",
      vibe: "Quarter-Life Realistis",
      bio: "Mikirin karier, stabilitas finansial, dan trauma masa lalu. Suka diskusi objektif.",
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
      vibe: "Pragmatis Siap Nikah",
      bio: "To-the-point, anti-drama, fokus efisiensi keuangan, keluarga, dan komitmen konkret.",
      reactAccept:
        "Bagus. Dalam pernikahan memang butuh kesiapan mental nerima kekurangan pasangan tanpa banyak drama.",
      reactReject:
        "Saya menghargai ketegasan kamu menolak. Sekarang pilih solusi paling praktis supaya ini nggak jadi masalah di rumah tangga.",
    };
  }
}

function buildMatchDeck(
  p1: PlayerProfile,
  p2: PlayerProfile,
  mode: "solo" | "couple" | "online",
  maxRounds: number
): DeckCard[] {
  const extractDeckCards = (profile: PlayerProfile) => {
    const mainCards: Omit<DeckCard, "roundNum" | "responderKey">[] = [];
    const wildCards: Omit<DeckCard, "roundNum" | "responderKey">[] = [];
    const fallbackCards: Omit<DeckCard, "roundNum" | "responderKey">[] = [];

    profile.questions.forEach((q) => {
      const ans = profile.answers[q.id];
      if (ans === "iya")
        mainCards.push({ ...q, isWildcard: false, sourceOwner: profile.name });
      else if (ans === "kayanya")
        wildCards.push({ ...q, isWildcard: true, sourceOwner: profile.name });
      else
        fallbackCards.push({
          ...q,
          isWildcard: true,
          sourceOwner: profile.name,
        });
    });

    const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
    return [
      ...shuffle(mainCards),
      ...shuffle(wildCards),
      ...shuffle(fallbackCards),
    ];
  };

  const p2Pool = extractDeckCards(p2);
  const p1Pool = extractDeckCards(p1);
  const matchDeck: DeckCard[] = [];

  for (let r = 1; r <= maxRounds; r++) {
    if (mode === "solo") {
      const card = p2Pool[(r - 1) % p2Pool.length];
      matchDeck.push({ ...card, roundNum: r, responderKey: "player1" });
    } else {
      if (r % 2 === 1) {
        const card = p2Pool[Math.floor(r / 2) % p2Pool.length];
        matchDeck.push({ ...card, roundNum: r, responderKey: "player1" });
      } else {
        const card = p1Pool[Math.floor((r - 1) / 2) % p1Pool.length];
        matchDeck.push({ ...card, roundNum: r, responderKey: "player2" });
      }
    }
  }
  return matchDeck;
}

export default function SefrekuensiGame() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playTone = useCallback(
    (
      freq: number,
      type: OscillatorType = "sine",
      duration = 0.15,
      vol = 0.08,
      delay = 0
    ) => {
      if (!soundEnabled || typeof window === "undefined") return;
      try {
        if (!audioCtxRef.current) {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          if (AudioCtx) audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});

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
    },
    [soundEnabled]
  );

  const sfxTap = useCallback(
    () => playTone(520, "triangle", 0.08, 0.06),
    [playTone]
  );
  const sfxCharge = useCallback(() => {
    playTone(523.25, "sine", 0.14, 0.09, 0);
    playTone(659.25, "sine", 0.18, 0.09, 0.09);
  }, [playTone]);
  const sfxPenalty = useCallback(() => {
    playTone(220, "sawtooth", 0.18, 0.08, 0);
    playTone(165, "sawtooth", 0.25, 0.08, 0.12);
  }, [playTone]);
  const sfxFlip = useCallback(
    () => playTone(380, "sine", 0.12, 0.07),
    [playTone]
  );
  const sfxWin = useCallback(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      playTone(f, "triangle", 0.25, 0.09, i * 0.1)
    );
  }, [playTone]);

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

  const copyTextSafe = (text: string, successMsg?: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(successMsg || "Berhasil disalin!", "success"))
        .catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  };

  const fallbackCopy = (text: string, successMsg?: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      showToast(successMsg || "Berhasil disalin!", "success");
    } catch {
      showToast("Gagal menyalin otomatis, silakan salin manual.", "warning");
    }
    document.body.removeChild(textArea);
  };

  const [screen, setScreen] = useState<ScreenType>("register");
  const screenRef = useRef<ScreenType>("register");
  const [animKey, setAnimKey] = useState(0);

  const goScreen = useCallback((next: ScreenType) => {
    screenRef.current = next;
    setScreen(next);
    setAnimKey((k) => k + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const [landingTab, setLandingTab] = useState<"new" | "invite">("new");
  const [inputJoinCode, setInputJoinCode] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regGender, setRegGender] = useState<"Laki-laki" | "Perempuan">(
    "Laki-laki"
  );
  const [regAge, setRegAge] = useState("");
  const [deckTheme, setDeckTheme] = useState<DeckTheme>("standar");
  const [customStake, setCustomStake] = useState(STAKE_PRESETS[0]);
  const [registerError, setRegisterError] = useState<{
    title: string;
    text: string;
    key: number;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("code");
    if (urlCode && urlCode.trim().length >= 4) {
      setLandingTab("invite");
      setInputJoinCode(urlCode.trim().toUpperCase());
    }
  }, []);

  const [inviteCode, setInviteCode] = useState("");
  const [roomOnlineStatus, setRoomOnlineStatus] = useState<
    "idle" | "creating" | "connected" | "error"
  >("idle");
  const [myOnlineRole, setMyOnlineRole] = useState<"player1" | "player2">(
    "player1"
  );
  const [player1, setPlayer1] = useState<PlayerProfile | null>(null);
  const [player2, setPlayer2] = useState<PlayerProfile | null>(null);
  const [mode, setMode] = useState<"solo" | "couple" | "online">("online");
  const [quizTarget, setQuizTarget] = useState<"player1" | "player2">(
    "player1"
  );
  const [quizIndex, setQuizIndex] = useState(0);
  const [botAgeSlider, setBotAgeSlider] = useState(25);

  const [partnerNameInput, setPartnerNameInput] = useState("");
  const [partnerGenderInput, setPartnerGenderInput] = useState<
    "Laki-laki" | "Perempuan"
  >("Perempuan");
  const [partnerAgeInput, setPartnerAgeInput] = useState("");
  const [partnerError, setPartnerError] = useState<{
    title: string;
    text: string;
    key: number;
  } | null>(null);

  const [battery, setBattery] = useState(50);
  const [deltaBadge, setDeltaBadge] = useState<{
    val: number;
    key: number;
  } | null>(null);
  const [hudShakeKey, setHudShakeKey] = useState(0);
  const [round, setRound] = useState(1);
  const maxRounds = 8;
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [gameStage, setGameStage] = useState<
    "dilemma" | "consequence" | "negotiate1" | "negotiate2" | "suddendeath"
  >("dilemma");

  const [negotiateOwnerChoice, setNegotiateOwnerChoice] = useState<
    number | null
  >(null);

  const [vetoUsed, setVetoUsed] = useState<{
    player1: boolean;
    player2: boolean;
  }>({ player1: false, player2: false });

  const [p1SyncChoice, setP1SyncChoice] = useState<number | null>(null);
  const [p2SyncChoice, setP2SyncChoice] = useState<number | null>(null);

  const [lastAuditAlert, setLastAuditAlert] = useState<AuditAlert | null>(null);

  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState({
    terimaMantap: 0,
    pencitraanTerbongkar: 0,
    kompromiSepakat: 0,
    deadlockOrAfk: 0,
  });
  const [endingCustomReason, setEndingCustomReason] = useState("");

  const prevBatteryRef = useRef(50);
  const syncedStepRef = useRef("");
  const lastAuditIdRef = useRef<number | null>(null);

  const triggerBatteryDelta = useCallback((delta: number) => {
    if (delta === 0) return;
    setDeltaBadge({ val: delta, key: Date.now() + Math.random() });
    if (delta < 0) {
      setHudShakeKey((k) => k + 1);
    }
  }, []);

  const publishOnlineRoom = useCallback(
    async (
      code: string,
      hostProfile: PlayerProfile,
      status: string,
      theme: DeckTheme,
      stakeText: string
    ) => {
      if (!isFirebaseReady || !db) {
        setRoomOnlineStatus("error");
        return;
      }
      setRoomOnlineStatus("creating");
      try {
        await setDoc(
          doc(db, "rooms", code),
          {
            code,
            deckTheme: theme,
            stake: stakeText,
            player1: hostProfile,
            player2: null,
            status,
            round: 1,
            battery: 50,
            stage: "dilemma",
            negotiateOwnerChoice: null,
            vetoUsed: { player1: false, player2: false },
            p1SyncChoice: null,
            p2SyncChoice: null,
            lastAuditAlert: null,
            consecutiveTimeouts: 0,
            history: [],
            stats: {
              terimaMantap: 0,
              pencitraanTerbongkar: 0,
              kompromiSepakat: 0,
              deadlockOrAfk: 0,
            },
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        setRoomOnlineStatus("connected");
      } catch {
        setRoomOnlineStatus("error");
      }
    },
    []
  );

  const handleStakeChange = async (newStake: string) => {
    setCustomStake(newStake);
    if (mode === "online" && inviteCode && isFirebaseReady && db) {
      try {
        await setDoc(
          doc(db, "rooms", inviteCode),
          { stake: newStake, updatedAt: Date.now() },
          { merge: true }
        );
      } catch {}
    }
  };

  useEffect(() => {
    if (!inviteCode || !isFirebaseReady || !db) return;
    if (mode !== "online") return;

    const roomRef = doc(db, "rooms", inviteCode);
    const unsubscribe = onSnapshot(
      roomRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        if (data.deckTheme) setDeckTheme(data.deckTheme as DeckTheme);
        if (typeof data.stake === "string") setCustomStake(data.stake);
        if (data.player1) setPlayer1(data.player1);
        if (data.player2) setPlayer2(data.player2);
        if (data.deck) setDeck(data.deck);
        if (data.stage) setGameStage(data.stage);
        if (data.vetoUsed) setVetoUsed(data.vetoUsed);
        if (
          typeof data.p1SyncChoice === "number" ||
          data.p1SyncChoice === null
        ) {
          setP1SyncChoice(data.p1SyncChoice);
        }
        if (
          typeof data.p2SyncChoice === "number" ||
          data.p2SyncChoice === null
        ) {
          setP2SyncChoice(data.p2SyncChoice);
        }
        if (
          typeof data.negotiateOwnerChoice === "number" ||
          data.negotiateOwnerChoice === null
        ) {
          setNegotiateOwnerChoice(data.negotiateOwnerChoice);
        }
        if (data.history) setHistory(data.history);
        if (data.stats) setStats(data.stats);
        if (typeof data.consecutiveTimeouts === "number") {
          setConsecutiveTimeouts(data.consecutiveTimeouts);
        }
        setEndingCustomReason(data.endingReason || "");

        if (
          data.lastAuditAlert &&
          data.lastAuditAlert.id !== lastAuditIdRef.current
        ) {
          lastAuditIdRef.current = data.lastAuditAlert.id;
          setLastAuditAlert(data.lastAuditAlert as AuditAlert);
        }

        if (typeof data.battery === "number") {
          const diff = data.battery - prevBatteryRef.current;
          if (diff !== 0) {
            triggerBatteryDelta(diff);
            prevBatteryRef.current = data.battery;
          }
          setBattery(data.battery);
        }

        if (typeof data.round === "number") {
          setRound(data.round);
        }

        const stepSignature = `${data.status}-${data.round}-${data.stage}`;
        if (stepSignature !== syncedStepRef.current) {
          syncedStepRef.current = stepSignature;
          if (data.status === "playing") {
            setTimerSeconds(60);
            setTimerRunning(true);

            if (
              data.stage === "negotiate1" &&
              Array.isArray(data.deck) &&
              typeof data.round === "number" &&
              data.player1 &&
              data.player2
            ) {
              const activeCard = data.deck[data.round - 1] as
                | DeckCard
                | undefined;
              if (activeCard && activeCard.responderKey !== myOnlineRole) {
                const rejectorProfile =
                  activeCard.responderKey === "player1"
                    ? (data.player1 as PlayerProfile)
                    : (data.player2 as PlayerProfile);
                showToast(
                  formatRejectedProblemForOwner(
                    rejectorProfile.name,
                    activeCard.statement
                  ),
                  "warning"
                );
              }
            }
          }
        }

        if (
          data.status === "playing" &&
          data.player1 &&
          data.player2 &&
          Array.isArray(data.deck) &&
          data.deck.length > 0 &&
          (screenRef.current === "mode" ||
            screenRef.current === "waiting-host" ||
            screenRef.current === "quiz" ||
            screenRef.current === "ending")
        ) {
          const isRematch = screenRef.current === "ending";
          prevBatteryRef.current = data.battery ?? 50;
          setDeltaBadge(null);
          setEndingCustomReason("");
          setTimerSeconds(60);
          setTimerRunning(true);
          sfxCharge();
          showToast(
            isRematch
              ? `Kesempatan kedua dimulai! ${data.player1.name} & ${data.player2.name} kembali ke arena.`
              : `${data.player1.name} & ${data.player2.name} siap! Memulai permainan...`,
            "success"
          );
          goScreen("game");
        }

        if (data.status === "finished" && screenRef.current === "game") {
          setTimerRunning(false);
          const finalPct = data.battery ?? 0;
          if (finalPct >= 80) sfxWin();
          else if (finalPct >= 45) sfxCharge();
          else sfxPenalty();
          goScreen("ending");
        }
      },
      () => {
        setRoomOnlineStatus("error");
      }
    );

    return () => unsubscribe();
  }, [
    inviteCode,
    mode,
    myOnlineRole,
    goScreen,
    showToast,
    sfxCharge,
    sfxPenalty,
    sfxWin,
    triggerBatteryDelta,
  ]);

  const currentCard = deck[round - 1];

  const isMyOnlineTurn =
    mode !== "online" ||
    gameStage === "suddendeath" ||
    !currentCard ||
    (gameStage === "consequence"
      ? currentCard.responderKey !== myOnlineRole
      : gameStage === "negotiate1"
      ? currentCard.responderKey !== myOnlineRole
      : gameStage === "negotiate2"
      ? currentCard.responderKey === myOnlineRole
      : currentCard.responderKey === myOnlineRole);

  useEffect(() => {
    if (screen !== "game" || !timerRunning) return;
    if (gameStage === "suddendeath") return;
    if (mode === "online" && !isMyOnlineTurn) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerRunning(false);
          handleTimeoutPenalty();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, timerRunning, round, gameStage, mode, isMyOnlineTurn]);

  const switchLandingTab = (tab: "new" | "invite") => {
    sfxTap();
    setLandingTab(tab);
    setRegisterError(null);
  };

  const showRegisterError = (title: string, text: string) => {
    sfxPenalty();
    setRegisterError({ title, text, key: Date.now() + Math.random() });
  };

  const handleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = regName.trim();
    const email = regEmail.trim();
    const age = parseInt(regAge, 10);

    if (isNaN(age) || age < 18) {
      showRegisterError(
        "Usia Belum Mencukupi",
        "Permainan ini dirancang khusus untuk dewasa yang sudah siap membahas komitmen hubungan serius."
      );
      return;
    }

    if (landingTab === "invite") {
      const code = inputJoinCode.trim().toUpperCase();
      if (!code || code.length < 4) {
        showRegisterError(
          "Kode Undangan Kosong!",
          "Masukkan kode undangan yang dikirimkan pasanganmu."
        );
        return;
      }

      if (!isFirebaseReady || !db) {
        showRegisterError(
          "Koneksi Server Terputus",
          "Layanan bermain online sedang tidak tersedia. Periksa koneksi internetmu atau mainkan Mode Solo / 1 Perangkat."
        );
        return;
      }

      setIsBusy(true);
      try {
        const roomRef = doc(db, "rooms", code);
        const snap = await getDoc(roomRef);
        if (!snap.exists()) {
          showRegisterError(
            "Kode Undangan Tidak Ditemukan!",
            `Room dengan kode ${code} tidak ditemukan atau sudah berakhir. Pastikan pasanganmu sudah mendaftar dan membuat kode.`
          );
          setIsBusy(false);
          return;
        }

        const roomData = snap.data();
        const hostProfile: PlayerProfile = roomData.player1;
        const roomTheme: DeckTheme =
          (roomData.deckTheme as DeckTheme) || "standar";

        if (roomData.player2 && roomData.player2.email !== email) {
          showRegisterError(
            "Room Sudah Penuh!",
            `Kode ${code} sudah dipakai oleh pasangan lain.`
          );
          setIsBusy(false);
          return;
        }

        if (regGender === hostProfile.gender) {
          showRegisterError(
            "Ditolak! Kode undangan hanya berlaku untuk pasangan lawan jenis.",
            `Kode ${code} dibuat oleh ${hostProfile.name} (${hostProfile.gender}). Kamu tidak bisa bergabung dengan jenis kelamin yang sama.`
          );
          setIsBusy(false);
          return;
        }

        const p2Profile: PlayerProfile = {
          name,
          email,
          gender: regGender,
          age,
          questions: build20QuestionsForProfile(regGender, age, roomTheme),
          answers: {},
        };

        await setDoc(
          roomRef,
          {
            player2: p2Profile,
            updatedAt: Date.now(),
          },
          { merge: true }
        );

        setRegisterError(null);
        setDeckTheme(roomTheme);
        if (typeof roomData.stake === "string") setCustomStake(roomData.stake);
        setInviteCode(code);
        setMode("online");
        setMyOnlineRole("player2");
        setPlayer1(hostProfile);
        setPlayer2(p2Profile);
        setQuizTarget("player2");
        setQuizIndex(0);
        setIsBusy(false);
        sfxTap();
        showToast(
          `Terhubung ke room ${hostProfile.name} (${DECK_THEME_META[roomTheme].label})!`,
          "success"
        );
        goScreen("quiz");
        return;
      } catch {
        showRegisterError(
          "Gagal Memeriksa Kode",
          "Terjadi gangguan jaringan saat memverifikasi kode undangan. Silakan coba lagi."
        );
        setIsBusy(false);
        return;
      }
    }

    sfxTap();
    setRegisterError(null);
    const newCode = "SEFREK-" + Math.floor(100 + Math.random() * 899);
    const newHostProfile: PlayerProfile = {
      name,
      email,
      gender: regGender,
      age,
      questions: build20QuestionsForProfile(regGender, age, deckTheme),
      answers: {},
    };

    setMode("online");
    setMyOnlineRole("player1");
    setInviteCode(newCode);
    setPlayer1(newHostProfile);
    setPlayer2(null);
    setQuizTarget("player1");
    setQuizIndex(0);

    publishOnlineRoom(
      newCode,
      newHostProfile,
      "p1_quiz",
      deckTheme,
      customStake
    );
    goScreen("quiz");
  };

  const activeQuizProfile = quizTarget === "player1" ? player1 : player2;
  const activeQuizQuestion = activeQuizProfile?.questions[quizIndex];

  const finishQuizPhase = async (
    updatedP1: PlayerProfile | null,
    updatedP2: PlayerProfile | null
  ) => {
    if (mode === "online" && isFirebaseReady && db && inviteCode) {
      setIsBusy(true);
      try {
        const roomRef = doc(db, "rooms", inviteCode);
        let shouldStartGame = false;
        let waitingForHost = false;

        await runTransaction(db, async (tx) => {
          const snap = await tx.get(roomRef);
          if (!snap.exists()) return;
          const data = snap.data();

          if (myOnlineRole === "player1" && updatedP1) {
            const p2Data = data.player2 as PlayerProfile | null;
            const p2Done =
              p2Data &&
              Object.keys(p2Data.answers || {}).length >=
                p2Data.questions.length;

            if (p2Done && p2Data) {
              const generatedDeck = buildMatchDeck(
                updatedP1,
                p2Data,
                "online",
                maxRounds
              );
              tx.update(roomRef, {
                player1: updatedP1,
                deck: generatedDeck,
                status: "playing",
                round: 1,
                battery: 50,
                stage: "dilemma",
                negotiateOwnerChoice: null,
                vetoUsed: { player1: false, player2: false },
                p1SyncChoice: null,
                p2SyncChoice: null,
                lastAuditAlert: null,
                consecutiveTimeouts: 0,
                history: [],
                stats: {
                  terimaMantap: 0,
                  pencitraanTerbongkar: 0,
                  kompromiSepakat: 0,
                  deadlockOrAfk: 0,
                },
                updatedAt: Date.now(),
              });
              shouldStartGame = true;
            } else {
              tx.update(roomRef, {
                player1: updatedP1,
                status: "waiting",
                updatedAt: Date.now(),
              });
            }
          } else if (myOnlineRole === "player2" && updatedP2) {
            const p1Data = data.player1 as PlayerProfile | null;
            const p1Done =
              p1Data &&
              Object.keys(p1Data.answers || {}).length >=
                p1Data.questions.length;

            if (p1Done && p1Data) {
              const generatedDeck = buildMatchDeck(
                p1Data,
                updatedP2,
                "online",
                maxRounds
              );
              tx.update(roomRef, {
                player2: updatedP2,
                deck: generatedDeck,
                status: "playing",
                round: 1,
                battery: 50,
                stage: "dilemma",
                negotiateOwnerChoice: null,
                vetoUsed: { player1: false, player2: false },
                p1SyncChoice: null,
                p2SyncChoice: null,
                lastAuditAlert: null,
                consecutiveTimeouts: 0,
                history: [],
                stats: {
                  terimaMantap: 0,
                  pencitraanTerbongkar: 0,
                  kompromiSepakat: 0,
                  deadlockOrAfk: 0,
                },
                updatedAt: Date.now(),
              });
              shouldStartGame = true;
            } else {
              tx.update(roomRef, {
                player2: updatedP2,
                status: "p2_ready",
                updatedAt: Date.now(),
              });
              waitingForHost = true;
            }
          }
        });

        setIsBusy(false);

        if (shouldStartGame) {
          if (screenRef.current !== "game") {
            prevBatteryRef.current = 50;
            setTimerSeconds(60);
            setTimerRunning(true);
            goScreen("game");
          }
          return;
        }
        if (waitingForHost) {
          goScreen("waiting-host");
          return;
        }
        goScreen("mode");
        return;
      } catch {
        setIsBusy(false);
        showToast("Gagal menyimpan jawaban ke server online.", "error");
        if (myOnlineRole === "player1") goScreen("mode");
        return;
      }
    }

    if (quizTarget === "player2" && updatedP1 && updatedP2) {
      showToast(
        `Dek masalah ${updatedP2.name} siap! Memulai permainan pasangan...`,
        "success"
      );
      initMatchArena(updatedP1, updatedP2, "couple");
      return;
    }

    goScreen("mode");
  };

  const answerQuiz = async (choice: "iya" | "kayanya" | "engga") => {
    sfxTap();
    if (!activeQuizProfile) return;
    const q = activeQuizProfile.questions[quizIndex];
    const updatedProfile: PlayerProfile = {
      ...activeQuizProfile,
      answers: { ...activeQuizProfile.answers, [q.id]: choice },
    };

    const nextP1 = quizTarget === "player1" ? updatedProfile : player1;
    const nextP2 = quizTarget === "player2" ? updatedProfile : player2;
    if (quizTarget === "player1") setPlayer1(updatedProfile);
    else setPlayer2(updatedProfile);

    if (quizIndex + 1 < updatedProfile.questions.length) {
      setQuizIndex(quizIndex + 1);
    } else {
      await finishQuizPhase(nextP1, nextP2);
    }
  };

  const startSoloGame = () => {
    if (!player1) return;
    sfxTap();
    const botGender =
      player1.gender === "Laki-laki" ? "Perempuan" : "Laki-laki";
    const persona = getBotPersonaConfig(botGender, botAgeSlider);
    const botQuestions = build20QuestionsForProfile(
      botGender,
      botAgeSlider,
      deckTheme
    );

    const botAnswers: PlayerProfile["answers"] = {};
    botQuestions.forEach((q, i) => {
      if (i % 3 === 0 || i % 5 === 0) botAnswers[q.id] = "iya";
      else if (i % 2 === 0) botAnswers[q.id] = "kayanya";
      else botAnswers[q.id] = "engga";
    });

    const botProfile: PlayerProfile = {
      ...persona,
      email: "bot@sefrekuensi.id",
      questions: botQuestions,
      answers: botAnswers,
    };

    setMode("solo");
    setPlayer2(botProfile);
    initMatchArena(player1, botProfile, "solo");
  };

  const openPartnerSimulatorModal = () => {
    if (!player1) return;
    sfxTap();
    setPartnerError(null);
    setPartnerGenderInput(
      player1.gender === "Laki-laki" ? "Perempuan" : "Laki-laki"
    );
    goScreen("partner-join");
  };

  const handlePartnerJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!player1) return;
    const pName = partnerNameInput.trim();
    const pAge = parseInt(partnerAgeInput, 10);

    if (isNaN(pAge) || pAge < 18) {
      sfxPenalty();
      setPartnerError({
        title: "Usia Belum Mencukupi",
        text: "Permainan ini dirancang khusus untuk dewasa yang sudah siap membahas komitmen hubungan serius.",
        key: Date.now(),
      });
      return;
    }

    if (partnerGenderInput === player1.gender) {
      sfxPenalty();
      setPartnerError({
        title:
          "Ditolak! Kode undangan hanya berlaku untuk pasangan lawan jenis.",
        text: `${player1.name} terdaftar sebagai ${
          player1.gender
        }. Pasangan harus berjenis kelamin ${
          player1.gender === "Laki-laki" ? "Perempuan" : "Laki-laki"
        }.`,
        key: Date.now(),
      });
      return;
    }

    setPartnerError(null);
    setMode("couple");
    setPlayer2({
      name: pName,
      email: "pasangan@invite.id",
      gender: partnerGenderInput,
      age: pAge,
      questions: build20QuestionsForProfile(
        partnerGenderInput,
        pAge,
        deckTheme
      ),
      answers: {},
    });
    setQuizTarget("player2");
    setQuizIndex(0);
    goScreen("quiz");
  };

  const initMatchArena = (
    p1: PlayerProfile,
    p2: PlayerProfile,
    activeMode: "solo" | "couple"
  ) => {
    const generatedDeck = buildMatchDeck(p1, p2, activeMode, maxRounds);
    setBattery(50);
    prevBatteryRef.current = 50;
    setDeltaBadge(null);
    setRound(1);
    setVetoUsed({ player1: false, player2: false });
    setP1SyncChoice(null);
    setP2SyncChoice(null);
    setLastAuditAlert(null);
    setConsecutiveTimeouts(0);
    setHistory([]);
    setStats({
      terimaMantap: 0,
      pencitraanTerbongkar: 0,
      kompromiSepakat: 0,
      deadlockOrAfk: 0,
    });
    setEndingCustomReason("");
    setDeck(generatedDeck);
    setGameStage("dilemma");
    setTimerSeconds(60);
    setTimerRunning(true);
    goScreen("game");
  };

  const syncOnlineRoundOutcome = async (
    delta: number,
    newHistoryItem: HistoryItem,
    statKey: keyof typeof stats,
    options?: {
      isTimeout?: boolean;
      updatedVeto?: { player1: boolean; player2: boolean };
      auditAlert?: AuditAlert | null;
    }
  ) => {
    if (!inviteCode || !isFirebaseReady || !db) return;
    const roomRef = doc(db, "rooms", inviteCode);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const curBattery = (data.battery as number) ?? 50;
      const curRound = (data.round as number) ?? 1;
      const curAfk = (data.consecutiveTimeouts as number) ?? 0;
      const nextAfk = options?.isTimeout ? curAfk + 1 : 0;
      const nextBattery = Math.max(0, Math.min(100, curBattery + delta));
      const prevHist = (data.history as HistoryItem[]) || [];
      const prevStats = (data.stats as typeof stats) || {
        terimaMantap: 0,
        pencitraanTerbongkar: 0,
        kompromiSepakat: 0,
        deadlockOrAfk: 0,
      };
      const updatedStats = {
        ...prevStats,
        [statKey]: (prevStats[statKey] || 0) + 1,
      };

      const isAfkEnd = nextAfk >= 3;
      const isBatteryZero = nextBattery <= 0;
      const isRoundsDone = curRound >= maxRounds;
      const isFinished = isAfkEnd || isBatteryZero || isRoundsDone;
      const nextRound = isFinished ? curRound : curRound + 1;
      const nextStage =
        !isFinished && nextRound === maxRounds ? "suddendeath" : "dilemma";

      const reason = isAfkEnd
        ? "3x Timeout / Pasangan Ghosting Berturut-turut!"
        : isBatteryZero
        ? "Baterai Cinta habis menyentuh 0% sebelum ronde selesai!"
        : "";

      tx.update(roomRef, {
        battery: nextBattery,
        history: [...prevHist, newHistoryItem],
        stats: updatedStats,
        consecutiveTimeouts: nextAfk,
        round: nextRound,
        stage: nextStage,
        negotiateOwnerChoice: null,
        p1SyncChoice: null,
        p2SyncChoice: null,
        vetoUsed: options?.updatedVeto ?? data.vetoUsed ?? {
          player1: false,
          player2: false,
        },
        lastAuditAlert:
          options?.auditAlert !== undefined
            ? options.auditAlert
            : data.lastAuditAlert ?? null,
        status: isFinished ? "finished" : "playing",
        endingReason: reason,
        updatedAt: Date.now(),
      });
    });
  };

  const applyLocalRoundOutcome = (
    delta: number,
    newHistoryItem: HistoryItem,
    statKey: keyof typeof stats,
    nextConsecutiveTimeouts: number
  ) => {
    const nextBattery = Math.max(0, Math.min(100, battery + delta));
    setBattery(nextBattery);
    prevBatteryRef.current = nextBattery;
    triggerBatteryDelta(delta);
    setConsecutiveTimeouts(nextConsecutiveTimeouts);
    setHistory((prev) => [...prev, newHistoryItem]);
    setStats((prev) => ({ ...prev, [statKey]: prev[statKey] + 1 }));

    if (nextConsecutiveTimeouts >= 3) {
      setTimeout(() => {
        setEndingCustomReason("3x Timeout / Pasangan Ghosting Berturut-turut!");
        sfxPenalty();
        goScreen("ending");
      }, 900);
      return;
    }

    setTimeout(() => {
      if (nextBattery <= 0) {
        setEndingCustomReason(
          "Baterai Cinta habis menyentuh 0% sebelum ronde selesai!"
        );
        sfxPenalty();
        goScreen("ending");
        return;
      }
      if (round >= maxRounds) {
        if (nextBattery >= 80) sfxWin();
        else if (nextBattery >= 45) sfxCharge();
        else sfxPenalty();
        goScreen("ending");
        return;
      }
      const nextR = round + 1;
      setRound(nextR);
      setGameStage(nextR === maxRounds ? "suddendeath" : "dilemma");
      setP1SyncChoice(null);
      setP2SyncChoice(null);
      setTimerSeconds(60);
      setTimerRunning(true);
    }, 850);
  };

  const handleTimeoutPenalty = async () => {
    if (!currentCard || !player1 || !player2) return;
    sfxPenalty();
    const nextAfk = consecutiveTimeouts + 1;
    const responder =
      currentCard.responderKey === "player1" ? player1 : player2;
    const item: HistoryItem = {
      round,
      category: currentCard.category,
      isWildcard: currentCard.isWildcard,
      problem: currentCard.partnerPrompt,
      outcomeLabel: `Timeout / AFK (${responder.name})`,
      delta: -15,
      type: "bad",
    };

    showToast(
      "⏱️ Waktu habis / AFK! Dihitung Tolak tanpa kompromi (-15%).",
      "error"
    );

    if (mode === "online") {
      await syncOnlineRoundOutcome(-15, item, "deadlockOrAfk", {
        isTimeout: true,
      });
    } else {
      applyLocalRoundOutcome(-15, item, "deadlockOrAfk", nextAfk);
    }
  };

  const useVetoCard = async () => {
    if (!currentCard || !player1 || !player2) return;
    const rKey = currentCard.responderKey;
    if (vetoUsed[rKey]) return;

    sfxFlip();
    setTimerRunning(false);
    const responder = rKey === "player1" ? player1 : player2;
    const nextVeto = { ...vetoUsed, [rKey]: true };
    setVetoUsed(nextVeto);

    const item: HistoryItem = {
      round,
      category: currentCard.category,
      isWildcard: currentCard.isWildcard,
      problem: currentCard.partnerPrompt,
      outcomeLabel: `${responder.name}: Pakai Kartu Veto (Skip Tanpa Debat)`,
      delta: -5,
      type: "neutral",
    };

    showToast(
      `🛡️ ${responder.name} memakai 1x Kartu Veto! Kartu dilewati (-5%).`,
      "warning"
    );

    if (mode === "online") {
      await syncOnlineRoundOutcome(-5, item, "kompromiSepakat", {
        updatedVeto: nextVeto,
      });
    } else {
      applyLocalRoundOutcome(-5, item, "kompromiSepakat", 0);
    }
  };

  const runPencitraanAudit = async (
    responder: PlayerProfile,
    cardPartner: PlayerProfile,
    card: DeckCard,
    accuserIsBot = false
  ) => {
    const contradiction = findContradictoryConfession(responder, card);

    if (contradiction) {
      sfxPenalty();
      const alertObj: AuditAlert = {
        id: Date.now() + Math.random(),
        title: `🚨 DETEKTOR PENCITRAAN TERBUKTI! (${responder.name})`,
        detail: `${
          accuserIsBot ? `${cardPartner.name} (Bot AI)` : cardPartner.name
        } menuduh pencitraan dan terbukti! Di awal ${
          responder.name
        } mengaku: "${contradiction.statement}"`,
        delta: -15,
        isCaught: true,
      };
      setLastAuditAlert(alertObj);

      const item: HistoryItem = {
        round,
        category: card.category,
        isWildcard: card.isWildcard,
        problem: card.partnerPrompt,
        outcomeLabel: `${responder.name}: Terbukti Pencitraan! (-15%)`,
        delta: -15,
        type: "bad",
      };

      showToast(
        `🚨 Pencitraan terbongkar! Pengakuan awal ${responder.name} bertentangan (-15%).`,
        "error"
      );

      if (mode === "online") {
        await syncOnlineRoundOutcome(-15, item, "pencitraanTerbongkar", {
          auditAlert: alertObj,
        });
      } else {
        applyLocalRoundOutcome(-15, item, "pencitraanTerbongkar", 0);
      }
    } else {
      sfxCharge();
      const alertObj: AuditAlert = {
        id: Date.now() + Math.random(),
        title: `✅ TUDUHAN PENCITRAAN MELESET!`,
        detail: `${cardPartner.name} menuduh pencitraan, tapi ${responder.name} terbukti konsisten dengan 20 pengakuan awalnya!`,
        delta: 10,
        isCaught: false,
      };
      setLastAuditAlert(alertObj);

      const item: HistoryItem = {
        round,
        category: card.category,
        isWildcard: card.isWildcard,
        problem: card.partnerPrompt,
        outcomeLabel: `${responder.name}: Lolos Detektor Pencitraan (+10%)`,
        delta: 10,
        type: "good",
      };

      showToast(
        `✅ Tuduhan meleset! ${responder.name} terbukti jujur (+10%).`,
        "success"
      );

      if (mode === "online") {
        await syncOnlineRoundOutcome(10, item, "terimaMantap", {
          auditAlert: alertObj,
        });
      } else {
        applyLocalRoundOutcome(10, item, "terimaMantap", 0);
      }
    }
  };

  const chooseAcceptCard = async (ev: React.MouseEvent<HTMLButtonElement>) => {
    glitterBurst(ev);
    sfxFlip();
    setConsecutiveTimeouts(0);

    if (mode === "solo" && currentCard && player1 && player2) {
      setTimerRunning(false);
      const contradiction = findContradictoryConfession(player1, currentCard);
      const botAudits =
        Boolean(contradiction) &&
        (player2.tier !== "young" || Math.random() < 0.7);

      if (botAudits) {
        await runPencitraanAudit(player1, player2, currentCard, true);
      } else {
        sfxCharge();
        const item: HistoryItem = {
          round,
          category: currentCard.category,
          isWildcard: currentCard.isWildcard,
          problem: currentCard.partnerPrompt,
          outcomeLabel: `${player1.name}: Komitmen Dipercaya ${player2.name}`,
          delta: 10,
          type: "good",
        };
        showToast(
          `${player2.name} percaya komitmenmu! Baterai Cinta +10%`,
          "success"
        );
        applyLocalRoundOutcome(10, item, "terimaMantap", 0);
      }
      return;
    }

    if (mode === "online" && inviteCode && isFirebaseReady && db) {
      await setDoc(
        doc(db, "rooms", inviteCode),
        { stage: "consequence", consecutiveTimeouts: 0, updatedAt: Date.now() },
        { merge: true }
      );
    } else {
      setGameStage("consequence");
    }
  };

  const resolveConsequenceAudit = async (trustCommitment: boolean) => {
    if (!currentCard || !player1 || !player2) return;
    setTimerRunning(false);
    const responder =
      currentCard.responderKey === "player1" ? player1 : player2;
    const cardPartner =
      currentCard.responderKey === "player1" ? player2 : player1;

    if (trustCommitment) {
      sfxCharge();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `${cardPartner.name} Percaya Komitmen ${responder.name}`,
        delta: 10,
        type: "good",
      };
      showToast("Komitmen dipercaya! Baterai Cinta +10%", "success");
      if (mode === "online") {
        await syncOnlineRoundOutcome(10, item, "terimaMantap");
      } else {
        applyLocalRoundOutcome(10, item, "terimaMantap", 0);
      }
    } else {
      await runPencitraanAudit(responder, cardPartner, currentCard, false);
    }
  };

  const chooseRejectCard = async () => {
    sfxFlip();
    setConsecutiveTimeouts(0);
    setNegotiateOwnerChoice(null);
    if (mode === "online" && inviteCode && isFirebaseReady && db) {
      await setDoc(
        doc(db, "rooms", inviteCode),
        {
          stage: "negotiate1",
          negotiateOwnerChoice: null,
          consecutiveTimeouts: 0,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } else {
      setGameStage("negotiate1");
      if (mode === "couple" && currentCard && player1 && player2) {
        const rejector =
          currentCard.responderKey === "player1" ? player1 : player2;
        showToast(
          formatRejectedProblemForOwner(rejector.name, currentCard.statement),
          "warning"
        );
      }
    }
  };

  const resolveSoloNegotiation = (
    ownerChoiceIdx: number,
    botResponderIdx: number
  ) => {
    if (!currentCard || !player2) return;
    setTimerRunning(false);
    const isAgreed = ownerChoiceIdx === botResponderIdx;

    if (isAgreed) {
      sfxCharge();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `Tolak → Sepakat Kompromi (${String.fromCharCode(
          65 + ownerChoiceIdx
        )})`,
        delta: 5,
        type: "neutral",
      };
      showToast(
        `Sepakat dengan ${player2.name} di Opsi ${String.fromCharCode(
          65 + ownerChoiceIdx
        )}! Baterai +5%`,
        "success"
      );
      applyLocalRoundOutcome(5, item, "kompromiSepakat", 0);
    } else {
      sfxPenalty();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `Tolak → Deadlock (Pemilik: ${String.fromCharCode(
          65 + ownerChoiceIdx
        )}, Bot: ${String.fromCharCode(65 + botResponderIdx)})`,
        delta: -15,
        type: "bad",
      };
      showToast(`Deadlock! Pilihan kompromi tidak cocok (-15%)`, "error");
      applyLocalRoundOutcome(-15, item, "deadlockOrAfk", 0);
    }
  };

  const submitNegotiateOwnerChoice = async (choiceIdx: number) => {
    sfxTap();
    setNegotiateOwnerChoice(choiceIdx);
    if (mode === "online" && inviteCode && isFirebaseReady && db) {
      await setDoc(
        doc(db, "rooms", inviteCode),
        {
          stage: "negotiate2",
          negotiateOwnerChoice: choiceIdx,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } else {
      setGameStage("negotiate2");
    }
  };

  const resolveCoupleNegotiation = async (responderChoiceIdx: number) => {
    if (!currentCard || negotiateOwnerChoice === null) return;
    setTimerRunning(false);
    const ownerIdx = negotiateOwnerChoice;
    const isAgreed = ownerIdx === responderChoiceIdx;

    if (isAgreed) {
      sfxCharge();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `Tolak → Sepakat Kompromi (${String.fromCharCode(
          65 + ownerIdx
        )})`,
        delta: 5,
        type: "neutral",
      };
      showToast(
        `Kalian berdua sepakat di Opsi ${String.fromCharCode(
          65 + ownerIdx
        )}! Baterai +5%`,
        "success"
      );
      if (mode === "online") {
        await syncOnlineRoundOutcome(5, item, "kompromiSepakat");
      } else {
        applyLocalRoundOutcome(5, item, "kompromiSepakat", 0);
      }
    } else {
      sfxPenalty();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `Tolak → Deadlock (${String.fromCharCode(
          65 + ownerIdx
        )} vs ${String.fromCharCode(65 + responderChoiceIdx)})`,
        delta: -15,
        type: "bad",
      };
      showToast(
        `Beda pilihan kompromi (${String.fromCharCode(
          65 + ownerIdx
        )} vs ${String.fromCharCode(65 + responderChoiceIdx)})! Deadlock -15%`,
        "error"
      );
      if (mode === "online") {
        await syncOnlineRoundOutcome(-15, item, "deadlockOrAfk");
      } else {
        applyLocalRoundOutcome(-15, item, "deadlockOrAfk", 0);
      }
    }
  };

  const suddenDeathItem = getSuddenDeathForMatch(
    inviteCode || `${player1?.name || "p1"}-${player2?.name || "p2"}`
  );

  const handleSuddenDeathChoice = async (
    choiceIdx: number,
    ev?: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (!player1 || !player2) return;
    sfxTap();

    if (mode === "solo") {
      setTimerRunning(false);
      const botChoice = suddenDeathItem.botPref[player2.tier || "mid"] ?? 0;
      const isSync = choiceIdx === botChoice;
      const delta = isSync ? 15 : -15;
      if (isSync && ev) glitterBurst(ev);

      const item: HistoryItem = {
        round: maxRounds,
        category: "Sinkronisasi Otak",
        isWildcard: false,
        problem: suddenDeathItem.scenario,
        outcomeLabel: isSync
          ? `Sinkronisasi Otak Cocok! (Opsi ${String.fromCharCode(
              65 + choiceIdx
            )})`
          : `Beda Frekuensi (${String.fromCharCode(
              65 + choiceIdx
            )} vs Bot ${String.fromCharCode(65 + botChoice)})`,
        delta,
        type: isSync ? "good" : "bad",
      };

      showToast(
        isSync
          ? "⚡ SINKRONISASI OTAK BERHASIL! Bonus Clutch +15%!"
          : "💥 Beda frekuensi di ronde penentu! -15%.",
        isSync ? "success" : "error"
      );

      applyLocalRoundOutcome(
        delta,
        item,
        isSync ? "kompromiSepakat" : "deadlockOrAfk",
        0
      );
      return;
    }

    if (mode === "couple") {
      if (p1SyncChoice === null) {
        setP1SyncChoice(choiceIdx);
        showToast(
          `Jawaban ${player1.name} dikunci! Serahkan HP ke ${player2.name}.`,
          "info"
        );
        return;
      }

      setTimerRunning(false);
      const c1 = p1SyncChoice;
      const c2 = choiceIdx;
      setP2SyncChoice(c2);
      const isSync = c1 === c2;
      const delta = isSync ? 15 : -15;
      if (isSync && ev) glitterBurst(ev);

      const item: HistoryItem = {
        round: maxRounds,
        category: "Sinkronisasi Otak",
        isWildcard: false,
        problem: suddenDeathItem.scenario,
        outcomeLabel: isSync
          ? `Sinkronisasi Otak Cocok! (Opsi ${String.fromCharCode(65 + c1)})`
          : `Beda Frekuensi (${String.fromCharCode(
              65 + c1
            )} vs ${String.fromCharCode(65 + c2)})`,
        delta,
        type: isSync ? "good" : "bad",
      };

      showToast(
        isSync
          ? "⚡ SINKRONISASI OTAK BERHASIL! Bonus Clutch +15%!"
          : "💥 Beda frekuensi di ronde penentu! -15%.",
        isSync ? "success" : "error"
      );

      applyLocalRoundOutcome(
        delta,
        item,
        isSync ? "kompromiSepakat" : "deadlockOrAfk",
        0
      );
      return;
    }

    if (mode === "online" && inviteCode && isFirebaseReady && db) {
      setIsBusy(true);
      try {
        const roomRef = doc(db, "rooms", inviteCode);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(roomRef);
          if (!snap.exists()) return;
          const data = snap.data();

          const curC1 =
            myOnlineRole === "player1"
              ? choiceIdx
              : typeof data.p1SyncChoice === "number"
              ? data.p1SyncChoice
              : null;
          const curC2 =
            myOnlineRole === "player2"
              ? choiceIdx
              : typeof data.p2SyncChoice === "number"
              ? data.p2SyncChoice
              : null;

          if (curC1 !== null && curC2 !== null) {
            const isSync = curC1 === curC2;
            const delta = isSync ? 15 : -15;
            const curBattery = (data.battery as number) ?? 50;
            const nextBattery = Math.max(0, Math.min(100, curBattery + delta));
            const prevHist = (data.history as HistoryItem[]) || [];
            const prevStats = (data.stats as typeof stats) || {
              terimaMantap: 0,
              pencitraanTerbongkar: 0,
              kompromiSepakat: 0,
              deadlockOrAfk: 0,
            };

            const statKey = isSync ? "kompromiSepakat" : "deadlockOrAfk";
            const item: HistoryItem = {
              round: maxRounds,
              category: "Sinkronisasi Otak",
              isWildcard: false,
              problem: suddenDeathItem.scenario,
              outcomeLabel: isSync
                ? `Sinkronisasi Otak Cocok! (Opsi ${String.fromCharCode(
                    65 + curC1
                  )})`
                : `Beda Frekuensi (${String.fromCharCode(
                    65 + curC1
                  )} vs ${String.fromCharCode(65 + curC2)})`,
              delta,
              type: isSync ? "good" : "bad",
            };

            tx.update(roomRef, {
              p1SyncChoice: curC1,
              p2SyncChoice: curC2,
              battery: nextBattery,
              history: [...prevHist, item],
              stats: {
                ...prevStats,
                [statKey]: (prevStats[statKey] || 0) + 1,
              },
              status: "finished",
              updatedAt: Date.now(),
            });
          } else {
            tx.update(roomRef, {
              p1SyncChoice: curC1,
              p2SyncChoice: curC2,
              updatedAt: Date.now(),
            });
          }
        });
      } catch {
        showToast("Gagal mengirim jawaban Sinkronisasi Otak.", "error");
      } finally {
        setIsBusy(false);
      }
    }
  };

  const copyInviteShareLink = () => {
    if (typeof window === "undefined") return;
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?code=${inviteCode}`;
    const shareMsg = `Uji kecocokan & buka borok kita di SEFREKUENSI!\nLink: ${shareUrl}\nAtau masukkan Kode Undangan: ${inviteCode}`;
    copyTextSafe(
      shareMsg,
      `Link & kode undangan ${inviteCode} disalin! Kirim ke WhatsApp pasanganmu.`
    );
  };

  const copyMatchReport = () => {
    if (!player1 || !player2) return;
    const title =
      battery >= 80
        ? "SEFREKUENSI!"
        : battery >= 45
        ? "PACARAN DULU AJA"
        : "STOP THE WEDDING";
    const stakeStatus =
      battery >= 80
        ? "BEBAS TARUHAN (Tantangan Lulus >= 80%)"
        : `TARUHAN BERLAKU: ${customStake}`;
    const summary = [
      `=== HASIL SEFREKUENSI (${DECK_THEME_META[deckTheme].label}) ===`,
      `Pasangan: ${player1.name} & ${player2.name}`,
      `Baterai Cinta Akhir: ${battery}% -> ${title}`,
      `${stakeStatus}`,
      `Statistik: Terima (${stats.terimaMantap}), Pencitraan (${stats.pencitraanTerbongkar}), Kompromi (${stats.kompromiSepakat}), Deadlock/AFK (${stats.deadlockOrAfk})`,
    ].join("\n");
    copyTextSafe(summary, "Rapor kecocokan berhasil disalin!");
  };

  const downloadReportImage = () => {
    if (!player1 || !player2 || typeof document === "undefined") return;
    sfxTap();
    setIsDownloadingImage(true);

    try {
      const W = 1080;
      const H = 1780;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        setIsDownloadingImage(false);
        showToast("Browser tidak mendukung pembuatan gambar.", "error");
        return;
      }

      const isHigh = battery >= 80;
      const isMid = battery >= 45 && battery < 80;

      const accentPrimary = isHigh ? "#10b981" : isMid ? "#f59e0b" : "#f43f5e";
      const accentLight = isHigh ? "#6ee7b7" : isMid ? "#fcd34d" : "#fda4af";
      const accentBgSoft = isHigh
        ? "rgba(16, 185, 129, 0.14)"
        : isMid
        ? "rgba(245, 158, 11, 0.14)"
        : "rgba(244, 63, 94, 0.14)";
      const accentBorder = isHigh
        ? "rgba(16, 185, 129, 0.45)"
        : isMid
        ? "rgba(245, 158, 11, 0.45)"
        : "rgba(244, 63, 94, 0.45)";

      const verdictTitle = isHigh
        ? "SEFREKUENSI!"
        : isMid
        ? "PACARAN DULU AJA"
        : "STOP THE WEDDING";

      const verdictDesc = isHigh
        ? "Red flag kalian saling mengunci seperti puzzle! Kesiapan mental dan kompromi kalian sudah matang untuk melangkah ke jenjang serius."
        : isMid
        ? "Rasa sayang memang ada, tetapi masih banyak kompromi yang menggantung dan ego yang belum selesai. Jangan buru-buru DP gedung."
        : endingCustomReason
        ? `${endingCustomReason} Terlalu banyak deadlock dan penyesalan untuk dilanjutkan.`
        : "Terlalu banyak pencitraan, deadlock ego, dan tabrakan kebiasaan buruk. Evaluasi ulang sebelum melangkah lebih jauh.";

      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#070b14");
      bgGrad.addColorStop(0.5, "#0d1322");
      bgGrad.addColorStop(1, "#070b14");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      const radialGlow = ctx.createRadialGradient(
        W / 2,
        220,
        40,
        W / 2,
        220,
        560
      );
      radialGlow.addColorStop(
        0,
        isHigh
          ? "rgba(16, 185, 129, 0.22)"
          : isMid
          ? "rgba(245, 158, 11, 0.20)"
          : "rgba(244, 63, 94, 0.22)"
      );
      radialGlow.addColorStop(1, "rgba(7, 11, 20, 0)");
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, W, 780);

      ctx.textAlign = "center";
      ctx.fillStyle = "#f43f5e";
      ctx.font = "800 24px sans-serif";
      ctx.fillText("SEFREKUENSI", W / 2, 70);

      ctx.fillStyle = "#64748b";
      ctx.font = "600 17px sans-serif";
      ctx.fillText(
        `COMPATIBILITY REPORT  •  ${DECK_THEME_META[
          deckTheme
        ].label.toUpperCase()}`,
        W / 2,
        98
      );

      const cardX = 56;
      const cardY = 124;
      const cardW = W - 112;
      const cardH = 490;

      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 36);
      ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = accentBorder;
      ctx.stroke();

      const pillText = `BATERAI CINTA AKHIR: ${battery}%`;
      ctx.font = "800 20px monospace";
      const pillW = ctx.measureText(pillText).width + 56;
      const pillH = 44;
      const pillX = (W - pillW) / 2;
      const pillY = cardY + 34;

      drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 22);
      ctx.fillStyle = accentBgSoft;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = accentBorder;
      ctx.stroke();

      ctx.fillStyle = accentLight;
      ctx.textAlign = "center";
      ctx.fillText(pillText, W / 2, pillY + 29);

      const barW = 680;
      const barH = 32;
      const barX = (W - barW) / 2;
      const barY = pillY + 62;

      drawRoundedRect(ctx, barX, barY, barW, barH, 14);
      ctx.fillStyle = "#020617";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#334155";
      ctx.stroke();

      if (battery > 0) {
        const fillW = Math.max(24, ((barW - 10) * battery) / 100);
        drawRoundedRect(ctx, barX + 5, barY + 5, fillW, barH - 10, 10);
        ctx.fillStyle = accentPrimary;
        ctx.fill();
      }

      ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
      ctx.fillRect(barX + barW * 0.45, barY + 2, 2, barH - 4);
      ctx.fillStyle = "rgba(52, 211, 153, 0.75)";
      ctx.fillRect(barX + barW * 0.8, barY + 2, 2, barH - 4);

      ctx.fillStyle = accentPrimary;
      ctx.font = "900 60px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(verdictTitle, W / 2, barY + 108);

      const matchupText = `${player1.name} (${player1.age} thn)   ×   ${player2.name} (${player2.age} thn)`;
      ctx.font = "700 23px sans-serif";
      const matchW = Math.min(
        cardW - 80,
        ctx.measureText(matchupText).width + 64
      );
      const matchH = 46;
      const matchX = (W - matchW) / 2;
      const matchY = barY + 130;

      drawRoundedRect(ctx, matchX, matchY, matchW, matchH, 16);
      ctx.fillStyle = "#090f1d";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#1e293b";
      ctx.stroke();

      ctx.fillStyle = "#f8fafc";
      ctx.fillText(
        truncateCanvasText(ctx, matchupText, matchW - 36),
        W / 2,
        matchY + 31
      );

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "500 21px sans-serif";
      const descLines = wrapCanvasText(ctx, verdictDesc, cardW - 110);
      descLines.slice(0, 3).forEach((line, i) => {
        ctx.fillText(line, W / 2, matchY + 88 + i * 31);
      });

      // Custom Stake Box inside PNG
      const stakeBoxY = cardY + cardH + 20;
      const stakeBoxH = 104;
      drawRoundedRect(ctx, cardX, stakeBoxY, cardW, stakeBoxH, 24);
      ctx.fillStyle = isHigh
        ? "rgba(16, 185, 129, 0.12)"
        : "rgba(245, 158, 11, 0.12)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isHigh
        ? "rgba(52, 211, 153, 0.45)"
        : "rgba(251, 191, 36, 0.45)";
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = isHigh ? "#34d399" : "#fbbf24";
      ctx.font = "800 16px monospace";
      ctx.fillText(
        isHigh
          ? "🎯 TARUHAN NYATA  •  LULUS TANTANGAN (>= 80%)"
          : "🎯 TARUHAN NYATA  •  WAJIB DILAKSANAKAN (< 80%)",
        cardX + 28,
        stakeBoxY + 36
      );

      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 21px sans-serif";
      ctx.fillText(
        truncateCanvasText(ctx, customStake || STAKE_PRESETS[0], cardW - 56),
        cardX + 28,
        stakeBoxY + 74
      );

      const statY = stakeBoxY + stakeBoxH + 20;
      const statH = 122;
      const gap = 16;
      const statW = (cardW - gap * 3) / 4;

      const statCards = [
        {
          val: String(stats.terimaMantap),
          label: "DIPERCAYA",
          sub: "+10% / ronde",
          color: "#34d399",
          border: "rgba(52, 211, 153, 0.35)",
          bg: "rgba(16, 185, 129, 0.10)",
        },
        {
          val: String(stats.pencitraanTerbongkar),
          label: "PENCITRAAN",
          sub: "-15% / ronde",
          color: "#fb7185",
          border: "rgba(251, 113, 133, 0.35)",
          bg: "rgba(244, 63, 94, 0.10)",
        },
        {
          val: String(stats.kompromiSepakat),
          label: "KOMPROMI",
          sub: "+5% / +15%",
          color: "#fbbf24",
          border: "rgba(251, 191, 36, 0.35)",
          bg: "rgba(245, 158, 11, 0.10)",
        },
        {
          val: String(stats.deadlockOrAfk),
          label: "DEADLOCK / AFK",
          sub: "-15% / ronde",
          color: "#f87171",
          border: "rgba(248, 113, 113, 0.35)",
          bg: "rgba(239, 68, 68, 0.10)",
        },
      ];

      statCards.forEach((sc, idx) => {
        const sx = cardX + idx * (statW + gap);
        drawRoundedRect(ctx, sx, statY, statW, statH, 24);
        ctx.fillStyle = sc.bg;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = sc.border;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = sc.color;
        ctx.font = "900 38px monospace";
        ctx.fillText(sc.val, sx + statW / 2, statY + 52);

        ctx.fillStyle = "#e2e8f0";
        ctx.font = "800 15px sans-serif";
        ctx.fillText(sc.label, sx + statW / 2, statY + 82);

        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 13px monospace";
        ctx.fillText(sc.sub, sx + statW / 2, statY + 104);
      });

      const logBoxY = statY + statH + 20;
      const logBoxH = 804;

      drawRoundedRect(ctx, cardX, logBoxY, cardW, logBoxH, 32);
      ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1e293b";
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 24px sans-serif";
      ctx.fillText("RAPOR SINGKAT KECOCOKAN", cardX + 32, logBoxY + 46);

      ctx.textAlign = "right";
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 18px monospace";
      ctx.fillText(
        `${history.length} RONDE TERCATAT`,
        cardX + cardW - 32,
        logBoxY + 45
      );

      ctx.fillStyle = "#1e293b";
      ctx.fillRect(cardX + 32, logBoxY + 64, cardW - 64, 2);

      const itemsToRender = history.slice(0, 8);
      itemsToRender.forEach((item, idx) => {
        const rowY = logBoxY + 82 + idx * 88;
        const rowH = 76;
        const rowX = cardX + 28;
        const rowW = cardW - 56;

        drawRoundedRect(ctx, rowX, rowY, rowW, rowH, 18);
        ctx.fillStyle = "#070c18";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#1e293b";
        ctx.stroke();

        drawRoundedRect(ctx, rowX + 14, rowY + 14, 48, 48, 12);
        ctx.fillStyle = "#1e293b";
        ctx.fill();

        ctx.textAlign = "center";
        ctx.fillStyle = "#f8fafc";
        ctx.font = "800 18px monospace";
        ctx.fillText(`R${item.round}`, rowX + 38, rowY + 44);

        ctx.textAlign = "left";
        ctx.fillStyle = "#94a3b8";
        ctx.font = "700 15px sans-serif";
        const metaText = item.isWildcard
          ? `${item.category.toUpperCase()}  •  WILDCARD`
          : item.category.toUpperCase();
        ctx.fillText(metaText, rowX + 76, rowY + 31);

        ctx.fillStyle = "#f1f5f9";
        ctx.font = "600 18px sans-serif";
        const maxTextWidth = rowW - 210;
        ctx.fillText(
          truncateCanvasText(ctx, item.outcomeLabel, maxTextWidth),
          rowX + 76,
          rowY + 57
        );

        const deltaStr = item.delta > 0 ? `+${item.delta}%` : `${item.delta}%`;
        const isPositive = item.delta > 0;
        const dPillW = 92;
        const dPillH = 42;
        const dPillX = rowX + rowW - dPillW - 16;
        const dPillY = rowY + (rowH - dPillH) / 2;

        drawRoundedRect(ctx, dPillX, dPillY, dPillW, dPillH, 12);
        ctx.fillStyle = isPositive
          ? "rgba(16, 185, 129, 0.16)"
          : "rgba(244, 63, 94, 0.16)";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = isPositive
          ? "rgba(52, 211, 153, 0.45)"
          : "rgba(251, 113, 133, 0.45)";
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = isPositive ? "#34d399" : "#fb7185";
        ctx.font = "800 20px monospace";
        ctx.fillText(deltaStr, dPillX + dPillW / 2, dPillY + 28);
      });

      ctx.textAlign = "center";
      ctx.fillStyle = "#64748b";
      ctx.font = "600 18px sans-serif";
      ctx.fillText(
        "SEFREKUENSI  •  oleh Krisna Oktaria",
        W / 2,
        H - 32
      );

      const safeP1 =
        player1.name.toLowerCase().replace(/[^a-z0-9]/g, "") || "p1";
      const safeP2 =
        player2.name.toLowerCase().replace(/[^a-z0-9]/g, "") || "p2";
      const fileName = `rapor-sefrekuensi-${safeP1}-${safeP2}.png`;

      const triggerDownloadUrl = (url: string, revokeAfter: boolean) => {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (revokeAfter) {
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        sfxCharge();
        showToast("Gambar rapor kecocokan berhasil didownload!", "success");
        setIsDownloadingImage(false);
      };

      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            triggerDownloadUrl(url, true);
          } else {
            triggerDownloadUrl(canvas.toDataURL("image/png"), false);
          }
        }, "image/png");
      } else {
        triggerDownloadUrl(canvas.toDataURL("image/png"), false);
      }
    } catch {
      setIsDownloadingImage(false);
      showToast("Gagal membuat gambar rapor. Silakan coba lagi.", "error");
    }
  };

  const handleSecondChance = async () => {
    if (!player1 || !player2) return;
    sfxTap();
    setTimerRunning(false);

    if (mode === "online" && isFirebaseReady && db && inviteCode) {
      setIsBusy(true);
      try {
        const freshDeck = buildMatchDeck(player1, player2, "online", maxRounds);
        await setDoc(
          doc(db, "rooms", inviteCode),
          {
            deck: freshDeck,
            status: "playing",
            round: 1,
            battery: 50,
            stage: "dilemma",
            negotiateOwnerChoice: null,
            vetoUsed: { player1: false, player2: false },
            p1SyncChoice: null,
            p2SyncChoice: null,
            lastAuditAlert: null,
            consecutiveTimeouts: 0,
            history: [],
            stats: {
              terimaMantap: 0,
              pencitraanTerbongkar: 0,
              kompromiSepakat: 0,
              deadlockOrAfk: 0,
            },
            endingReason: "",
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } catch {
        showToast(
          "Gagal memulai ulang sesi online. Periksa koneksi internetmu.",
          "error"
        );
      } finally {
        setIsBusy(false);
      }
      return;
    }

    sfxCharge();
    showToast(
      "Kesempatan kedua dimulai! Baterai Cinta kembali ke 50%.",
      "success"
    );
    initMatchArena(player1, player2, mode === "solo" ? "solo" : "couple");
  };

  const fullResetGame = () => {
    sfxTap();
    setTimerRunning(false);
    setPlayer1(null);
    setPlayer2(null);
    setHistory([]);
    setLastAuditAlert(null);
    setRegName("");
    setRegEmail("");
    setRegAge("");
    setInputJoinCode("");
    setRegisterError(null);
    setLandingTab("new");
    goScreen("register");
  };

  const botGenderForPreview: "Laki-laki" | "Perempuan" =
    player1?.gender === "Laki-laki" ? "Perempuan" : "Laki-laki";
  const botPreview = getBotPersonaConfig(botGenderForPreview, botAgeSlider);

  let countIya = 0;
  let countKayanya = 0;
  let countEngga = 0;
  const confessions: Array<{ tag: string; text: string }> = [];

  if (player1) {
    player1.questions.forEach((q) => {
      const ans = player1.answers[q.id];
      if (ans === "iya") {
        countIya++;
        confessions.push({ tag: "🔥 Masalah", text: q.statement });
      } else if (ans === "kayanya") {
        countKayanya++;
        confessions.push({ tag: "🤔 Wildcard", text: q.statement });
      } else {
        countEngga++;
      }
    });
  }

  const responder =
    currentCard && player1 && player2
      ? currentCard.responderKey === "player1"
        ? player1
        : player2
      : null;
  const cardPartner =
    currentCard && player1 && player2
      ? currentCard.responderKey === "player1"
        ? player2
        : player1
      : null;

  const cluePhrases: Record<"young" | "mid" | "mature", string> = {
    young: "Aku maunya yang tetep ngejaga perasaan & perhatian kita sih...",
    mid: "Menurutku kita butuh aturan yang realistis dan adil buat masing-masing.",
    mature:
      "Pilih opsi yang paling praktis, terukur, dan minim drama ke depannya.",
  };

  const mySyncChoiceOnline =
    myOnlineRole === "player1" ? p1SyncChoice : p2SyncChoice;
  const partnerSyncChoiceOnline =
    myOnlineRole === "player1" ? p2SyncChoice : p1SyncChoice;

  return (
    <>
      <header className="w-full border-b border-slate-800/80 bg-obsidian/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <svg
                className="w-5 h-5 text-white"
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
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-base sm:text-lg text-white">
                  SEFREKUENSI
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  COUPLES
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-none">
                Relationship &amp; Red Flag Card Game
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mode === "online" && inviteCode && screen !== "register" && (
              <button
                type="button"
                onClick={() =>
                  copyTextSafe(
                    inviteCode,
                    `Kode undangan ${inviteCode} disalin!`
                  )
                }
                title="Klik untuk salin kode room"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-[11px] font-mono font-bold text-emerald-400 transition"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {inviteCode}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                showToast(
                  next ? "Suara efek diaktifkan" : "Suara efek dimatikan",
                  "info"
                );
              }}
              title="Suara Efek"
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70 transition"
            >
              {soundEnabled ? (
                <svg
                  className="w-4 h-4 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              )}
            </button>

            {screen !== "register" && (
              <button
                type="button"
                onClick={() => {
                  fullResetGame();
                  showToast("Sesi direset. Silakan mulai dari awal.", "info");
                }}
                className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70 transition"
              >
                Keluar
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const styles = {
            success: "bg-emerald-950/95 border-emerald-500/60 text-emerald-200",
            error: "bg-red-950/95 border-red-500/60 text-red-200",
            warning: "bg-amber-950/95 border-amber-500/60 text-amber-200",
            info: "bg-slate-900/95 border-slate-700 text-slate-200",
          };
          const icons = {
            success: "✅",
            error: "🚨",
            warning: "⚠️",
            info: "💬",
          };
          return (
            <div
              key={t.id}
              className={`pointer-events-auto px-4 py-3 rounded-2xl border backdrop-blur-md shadow-2xl text-xs font-bold flex items-center gap-2.5 animate-card-enter ${styles[t.type]}`}
            >
              <span className="text-sm">{icons[t.type]}</span>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>

      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6 flex flex-col justify-center">
        {screen === "register" && (
          <section key={animKey} className="animate-card-enter">
            <div className="text-center mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-3">
                <span>🔥</span> Uji Nyali Sebelum DP Gedung
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                Buka Borokmu di Depan,
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-pink-500 to-amber-400">
                  Biar Nggak Nyesel di KUA.
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto">
                Bukan aplikasi cari pencitraan. Jawab 20 pengakuan jujur, hadapi
                kartu masalah pasangan, dan ukur apakah Baterai Cinta kalian
                sanggup bertahan.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => switchLandingTab("new")}
                className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition ${
                  landingTab === "new"
                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Daftar Pemain Baru
              </button>
              <button
                type="button"
                onClick={() => switchLandingTab("invite")}
                className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition ${
                  landingTab === "invite"
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Punya Kode Undangan?
              </button>
            </div>

            <div className="bg-cardbg/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl">
              {landingTab === "invite" && (
                <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5">
                    Masukkan Kode Undangan Pasangan
                  </label>
                  <input
                    type="text"
                    value={inputJoinCode}
                    onChange={(e) => setInputJoinCode(e.target.value)}
                    placeholder="Contoh: SEFREK-729"
                    maxLength={12}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold uppercase text-white placeholder-slate-600 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    *Tema dek otomatis mengikuti room pasangan &amp; memblokir
                    jenis kelamin yang sama.
                  </p>
                </div>
              )}

              {registerError && (
                <div
                  key={registerError.key}
                  className="mb-5 p-4 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-200 animate-shake"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-base">🚫</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-red-400">
                        {registerError.title}
                      </h3>
                      <p className="text-xs text-red-200/90 mt-0.5 leading-relaxed">
                        {registerError.text}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleRegistration} className="space-y-4">
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    Identitas Pemain
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="regName"
                    className="block text-xs font-semibold text-slate-300 mb-1.5"
                  >
                    Nama Panggilan
                  </label>
                  <input
                    type="text"
                    id="regName"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Misal: Raka / Nadya"
                    className="w-full bg-slate-950/90 border border-slate-700/90 focus:border-rose-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label
                    htmlFor="regEmail"
                    className="block text-xs font-semibold text-slate-300 mb-1.5"
                  >
                    Email Aktif
                  </label>
                  <input
                    type="email"
                    id="regEmail"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full bg-slate-950/90 border border-slate-700/90 focus:border-rose-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Jenis Kelamin
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Laki-laki", "Perempuan"] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setRegGender(g)}
                          className={`py-3 px-2 rounded-xl border text-xs font-bold text-center transition ${
                            regGender === g
                              ? "border-rose-500 bg-rose-500/15 text-white"
                              : "border-slate-700 bg-slate-950/90 text-slate-400"
                          }`}
                        >
                          {g === "Laki-laki" ? "👨 Laki-laki" : "👩 Perempuan"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="regAge"
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      Usia (Tahun)
                    </label>
                    <input
                      type="number"
                      id="regAge"
                      required
                      min={18}
                      max={80}
                      value={regAge}
                      onChange={(e) => setRegAge(e.target.value)}
                      placeholder="Contoh: 24"
                      className="w-full bg-slate-950/90 border border-slate-700/90 focus:border-rose-500 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>
                </div>

                {landingTab === "new" && (
                  <div className="pt-1">
                    <label className="block text-xs font-semibold text-slate-300 mb-2">
                      Pilih Paket Tema Dek
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(DECK_THEME_META) as DeckTheme[]).map(
                        (themeKey) => {
                          const meta = DECK_THEME_META[themeKey];
                          const isSelected = deckTheme === themeKey;
                          return (
                            <button
                              key={themeKey}
                              type="button"
                              onClick={() => {
                                sfxTap();
                                setDeckTheme(themeKey);
                              }}
                              className={`p-3 rounded-2xl border text-left transition ${
                                isSelected
                                  ? "border-rose-500 bg-rose-500/15 text-white"
                                  : "border-slate-800 bg-slate-950/80 text-slate-400 hover:border-slate-700"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-extrabold text-xs text-white">
                                <span>{meta.emoji}</span>
                                <span className="truncate">{meta.label}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-snug">
                                {meta.desc}
                              </p>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full mt-2 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-extrabold text-sm shadow-lg shadow-rose-500/25 btn-tactile flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>
                    {isBusy
                      ? "Menghubungkan Room..."
                      : landingTab === "new"
                      ? "Lanjut ke 20 Pengakuan Hidup"
                      : "Gabung Kode & Isi 20 Pengakuan"}
                  </span>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </button>
              </form>
            </div>
          </section>
        )}

        {screen === "quiz" && activeQuizProfile && activeQuizQuestion && (
          <section key={animKey} className="animate-card-enter">
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                    {activeQuizProfile.name} (
                    {activeQuizProfile.gender === "Laki-laki" ? "👨" : "👩"}{" "}
                    {activeQuizProfile.age} thn)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {DECK_THEME_META[deckTheme].emoji}{" "}
                    {DECK_THEME_META[deckTheme].label}
                  </span>
                </div>
                <span className="font-mono font-extrabold text-rose-400 text-sm">
                  <span>{quizIndex + 1}</span>
                  <span className="text-slate-500">/20</span>
                </span>
              </div>

              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 via-pink-500 to-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${((quizIndex + 1) / 20) * 100}%` }}
                />
              </div>
            </div>

            <div
              key={quizIndex}
              className="bg-cardbg/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl min-h-[270px] flex flex-col justify-between animate-card-enter"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wide border bg-rose-500/15 text-rose-400 border-rose-500/30">
                    {activeQuizQuestion.category}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    #{String(quizIndex + 1).padStart(2, "0")}
                  </span>
                </div>

                <blockquote className="text-lg sm:text-xl font-bold text-white leading-relaxed">
                  &ldquo;{activeQuizQuestion.statement}&rdquo;
                </blockquote>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Jawab jujur — juga jadi bahan audit Detektor Pencitraan!
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 mt-4">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => answerQuiz("iya")}
                className="w-full py-3.5 px-5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border-2 border-rose-500/60 hover:border-rose-500 text-left flex items-center justify-between group btn-tactile disabled:opacity-50"
              >
                <div>
                  <span className="block text-sm sm:text-base font-extrabold text-rose-400 group-hover:text-rose-300">
                    🔥 Iya lagi
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    Setuju banget — masuk ke Dek Masalah Utama
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-rose-500/20 text-rose-300">
                  MASALAH
                </span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => answerQuiz("kayanya")}
                className="w-full py-3.5 px-5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border-2 border-amber-500/50 hover:border-amber-400 text-left flex items-center justify-between group btn-tactile disabled:opacity-50"
              >
                <div>
                  <span className="block text-sm sm:text-base font-extrabold text-amber-400 group-hover:text-amber-300">
                    🤔 Kayanya sih
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    Ragu-ragu — masuk ke Dek Kartu Jebakan (Wildcard)
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-300">
                  WILDCARD
                </span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => answerQuiz("engga")}
                className="w-full py-3.5 px-5 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border-2 border-slate-700/80 hover:border-slate-500 text-left flex items-center justify-between group btn-tactile disabled:opacity-50"
              >
                <div>
                  <span className="block text-sm sm:text-base font-extrabold text-slate-200">
                    🛡️ Engga
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    Bukan gua banget — dibuang dari dek permainan
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-slate-700 text-slate-400">
                  BUANG
                </span>
              </button>
            </div>
          </section>
        )}

        {screen === "waiting-host" && player1 && player2 && (
          <section key={animKey} className="animate-card-enter">
            <div className="bg-cardbg/95 border-2 border-emerald-500/40 rounded-3xl p-7 text-center shadow-2xl">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-3xl mb-4 animate-bounce">
                ⏳
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Room: {inviteCode}
              </span>
              <h2 className="text-xl font-extrabold text-white mt-3">
                20 Pengakuanmu Sudah Terkunci!
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                Menunggu <strong className="text-rose-400">{player1.name}</strong>{" "}
                menyelesaikan 20 pengakuan hidupnya. Begitu selesai, permainan
                otomatis dimulai di kedua perangkat!
              </p>
              <div className="mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                🎯 Taruhan Aktif: <strong>{customStake}</strong>
              </div>
            </div>
          </section>
        )}

        {screen === "mode" && player1 && (
          <section key={animKey} className="animate-card-enter space-y-5">
            <div className="bg-cardbg/95 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                    Hasil Profiling Jujur • {DECK_THEME_META[deckTheme].label}
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold text-white">
                    Profil Borok &amp; Red Flag{" "}
                    <span className="text-rose-400">{player1.name}</span>
                  </h2>
                </div>
                <span className="text-xs font-mono bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 border border-slate-700">
                  {player1.gender} • {player1.age} thn
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 my-4">
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-center">
                  <span className="block text-2xl font-mono font-extrabold text-rose-400">
                    {countIya}
                  </span>
                  <span className="text-[11px] font-bold text-slate-300">
                    Iya lagi
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    Masalah Utama
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center">
                  <span className="block text-2xl font-mono font-extrabold text-amber-400">
                    {countKayanya}
                  </span>
                  <span className="text-[11px] font-bold text-slate-300">
                    Kayanya sih
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    Kartu Wildcard
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-800/70 border border-slate-700 text-center">
                  <span className="block text-2xl font-mono font-extrabold text-slate-300">
                    {countEngga}
                  </span>
                  <span className="text-[11px] font-bold text-slate-300">
                    Engga
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    Dibuang
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/90">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  💣 Senjata Makan Tuan Teratasmu:
                </p>
                {confessions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    Kamu menjawab &ldquo;Engga&rdquo; semua! Pencitraan tingkat
                    dewa — hati-hati kena kartu jebakan sistem.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {confessions.slice(0, 3).map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-rose-300 border border-slate-700">
                          {item.tag}
                        </span>
                        <span className="line-clamp-2">
                          &ldquo;{item.text}&rdquo;
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="bg-cardbg/95 border border-amber-500/40 rounded-3xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                  🎯 Taruhan Nyata (Tercetak di Rapor PNG)
                </span>
              </div>
              <input
                type="text"
                maxLength={80}
                value={customStake}
                onChange={(e) => handleStakeChange(e.target.value)}
                placeholder="Tulis taruhan dunia nyata kalian..."
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white focus:outline-none mb-2.5"
              />
              <div className="flex flex-wrap gap-1.5">
                {STAKE_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      sfxTap();
                      handleStakeChange(preset);
                    }}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition text-left ${
                      customStake === preset
                        ? "bg-amber-500/20 border-amber-400 text-amber-200 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-base font-extrabold text-white">
                Pilih Lawan Main Uji Kecocokan
              </h3>
              <p className="text-xs text-slate-400">
                Baterai Cinta dimulai dari{" "}
                <span className="text-amber-400 font-bold">50%</span>. Masing-masing punya{" "}
                <span className="text-sky-400 font-bold">1x Kartu Veto</span>!
              </p>
            </div>

            <div className="bg-cardbg/95 border-2 border-emerald-500/50 rounded-3xl p-5 shadow-xl shadow-emerald-500/5 transition">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xl shadow-lg shrink-0">
                    💌
                  </div>
                  <div>
                    <h4 className="font-extrabold text-white text-base">
                      Main Online Beda Perangkat
                    </h4>
                    <p className="text-xs text-slate-400">
                      Kirim kode/link ke HP pasangan lawan jenis. Layar otomatis
                      mulai saat dia selesai menjawab!
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-3">
                {player2 ? (
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-2 text-xs text-emerald-200 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span>
                      {player2.name} ({player2.gender}, {player2.age} thn) sudah
                      masuk room &amp; sedang menjawab 20 pengakuan...
                    </span>
                  </div>
                ) : roomOnlineStatus === "connected" ? (
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span>
                      Room Online Aktif — Menunggu pasangan masukkan kode...
                    </span>
                  </div>
                ) : roomOnlineStatus === "creating" ? (
                  <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 font-semibold">
                    ⏳ Menyiapkan room online...
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-semibold">
                    ⚠️ Gagal terhubung ke server online. Periksa koneksi
                    internetmu.
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    Kode Undangan Kamu
                  </span>
                  <span className="font-mono font-extrabold text-xl text-emerald-400 tracking-wider">
                    {inviteCode}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      copyTextSafe(
                        inviteCode,
                        `Kode undangan ${inviteCode} disalin!`
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold btn-tactile"
                  >
                    Salin Kode
                  </button>
                  <button
                    type="button"
                    onClick={copyInviteShareLink}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 btn-tactile"
                  >
                    <span>🔗 Salin Link Undangan</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={openPartnerSimulatorModal}
                className="w-full py-3 px-4 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs sm:text-sm btn-tactile"
              >
                📲 Atau Main Berdua Gantian di 1 HP Ini
              </button>
            </div>

            <div className="bg-cardbg/95 border-2 border-slate-800 hover:border-rose-500/50 rounded-3xl p-5 transition">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl shadow-lg">
                    🤖
                  </div>
                  <div>
                    <h4 className="font-extrabold text-white text-base">
                      Mode Solo — Lawan Bot AI
                    </h4>
                    <p className="text-xs text-slate-400">
                      Otomatis lawan jenis (
                      <span className="text-rose-400 font-semibold">
                        {botGenderForPreview}
                      </span>
                      ) dengan kepribadian sesuai usia.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="botAgeSlider"
                    className="text-xs font-bold text-slate-300"
                  >
                    Pilih Usia Bot AI:
                  </label>
                  <span className="font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    {botAgeSlider} Tahun
                  </span>
                </div>
                <input
                  type="range"
                  id="botAgeSlider"
                  min={20}
                  max={45}
                  value={botAgeSlider}
                  onChange={(e) =>
                    setBotAgeSlider(parseInt(e.target.value, 10))
                  }
                  className="w-full my-2"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-3">
                  <span>20 (Dramatis)</span>
                  <span>28 (Realistis)</span>
                  <span>45 (Pragmatis)</span>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-slate-800/80">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-lg shrink-0">
                    {botPreview.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-white">
                        {botPreview.name} ({botAgeSlider} thn)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        {botPreview.vibe}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      &ldquo;{botPreview.bio}&rdquo;
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={startSoloGame}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-extrabold text-sm shadow-lg shadow-rose-500/25 btn-tactile"
              >
                Mulai Main Lawan Bot AI →
              </button>
            </div>
          </section>
        )}

        {screen === "partner-join" && player1 && (
          <section key={animKey} className="animate-card-enter">
            <div className="bg-cardbg/95 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Mode 1 Perangkat
                </span>
                <button
                  type="button"
                  onClick={() => {
                    sfxTap();
                    goScreen("mode");
                  }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ← Kembali
                </button>
              </div>

              <h2 className="text-xl font-extrabold text-white">
                Pasangan Bergabung!
              </h2>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                <span className="text-rose-400 font-semibold">
                  {player1.name} ({player1.gender}, {player1.age} thn)
                </span>{" "}
                mengundangmu uji kecocokan. Masukkan datamu (wajib lawan jenis).
              </p>

              {partnerError && (
                <div
                  key={partnerError.key}
                  className="mb-4 p-3.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-200 animate-shake"
                >
                  <p className="text-xs font-extrabold text-red-400">
                    {partnerError.title}
                  </p>
                  <p className="text-xs text-red-200/90 mt-0.5">
                    {partnerError.text}
                  </p>
                </div>
              )}

              <form onSubmit={handlePartnerJoinSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Panggilan Pasangan
                  </label>
                  <input
                    type="text"
                    required
                    value={partnerNameInput}
                    onChange={(e) => setPartnerNameInput(e.target.value)}
                    placeholder="Nama pasanganmu"
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Jenis Kelamin Pasangan
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Laki-laki", "Perempuan"] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setPartnerGenderInput(g)}
                          className={`py-2.5 px-2 rounded-xl border text-xs font-bold text-center transition ${
                            partnerGenderInput === g
                              ? "border-emerald-500 bg-emerald-500/15 text-white"
                              : "border-slate-700 bg-slate-950 text-slate-400"
                          }`}
                        >
                          {g === "Laki-laki" ? "👨 Laki-laki" : "👩 Perempuan"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Usia Pasangan (Tahun)
                    </label>
                    <input
                      type="number"
                      required
                      min={18}
                      max={80}
                      value={partnerAgeInput}
                      onChange={(e) => setPartnerAgeInput(e.target.value)}
                      placeholder="Contoh: 25"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-2 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 btn-tactile"
                >
                  Generate Dek Masalah Pasangan &amp; Mulai →
                </button>
              </form>
            </div>
          </section>
        )}

        {screen === "game" &&
          currentCard &&
          player1 &&
          player2 &&
          responder &&
          cardPartner && (
            <section className="space-y-4">
              <div
                key={hudShakeKey}
                className={`bg-cardbg/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 shadow-xl relative overflow-visible ${
                  hudShakeKey > 0 ? "animate-shake" : ""
                }`}
              >
                {deltaBadge && (
                  <div
                    key={deltaBadge.key}
                    className="absolute right-6 -top-3 pointer-events-none z-30"
                  >
                    <span
                      className={`inline-block font-mono font-extrabold text-base px-2.5 py-1 rounded-xl shadow-lg animate-delta ${
                        deltaBadge.val > 0
                          ? "bg-emerald-500 text-slate-950"
                          : "bg-red-500 text-white"
                      }`}
                    >
                      {deltaBadge.val > 0
                        ? `+${deltaBadge.val}%`
                        : `${deltaBadge.val}%`}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔋</span>
                    <div>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                        Baterai Cinta
                      </span>
                      <span
                        className={`ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          battery >= 80
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : battery >= 45
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : "bg-red-500/15 text-red-400 border-red-500/30"
                        }`}
                      >
                        {battery >= 80
                          ? "100% Sefrekuensi!"
                          : battery >= 45
                          ? "Zona Pacaran Dulu"
                          : "Zona Bahaya!"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`font-mono font-extrabold text-xl sm:text-2xl ${
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

                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-6 bg-slate-950 rounded-xl border-2 border-slate-700 p-1 relative overflow-hidden">
                    <div
                      className={`h-full rounded-lg transition-all duration-500 ease-out relative battery-shimmer ${
                        battery >= 80
                          ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                          : battery >= 45
                          ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                          : "bg-gradient-to-r from-red-600 to-rose-500"
                      }`}
                      style={{ width: `${battery}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 left-[45%] w-0.5 bg-slate-600/70"
                      title="Batas Minimal 45%"
                    />
                    <div
                      className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-emerald-400/70"
                      title="Target Sefrekuensi 80%"
                    />
                  </div>
                  <div className="w-2 h-3.5 bg-slate-700 rounded-r-md" />
                </div>

                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200">
                      Ronde <span className="text-rose-400">{round}</span>/8
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 truncate max-w-[155px] sm:max-w-[220px]">
                      {gameStage === "suddendeath"
                        ? "⚡ Sinkronisasi Otak (Serentak)"
                        : `Giliran: ${
                            gameStage === "consequence" ||
                            gameStage === "negotiate1"
                              ? cardPartner.name
                              : responder.name
                          }`}
                    </span>
                  </div>

                  {gameStage !== "suddendeath" && (
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono font-bold ${
                          timerSeconds <= 10
                            ? "bg-red-500/20 border-red-500/60 text-red-400 animate-pulse"
                            : "bg-slate-950 border-slate-700 text-slate-200"
                        }`}
                      >
                        <span>⏱️</span>
                        <span>{timerSeconds}s</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                  <span className="truncate">
                    🎯 Taruhan: <strong className="text-slate-200">{customStake}</strong>
                  </span>
                  <span className="shrink-0 font-mono">
                    Veto: {player1.name} ({vetoUsed.player1 ? "0" : "1"}) •{" "}
                    {player2.name} ({vetoUsed.player2 ? "0" : "1"})
                  </span>
                </div>
              </div>

              {lastAuditAlert && (
                <div
                  className={`p-4 rounded-2xl border flex items-start justify-between gap-3 animate-card-enter ${
                    lastAuditAlert.isCaught
                      ? "bg-red-950/90 border-red-500/60 text-red-100"
                      : "bg-emerald-950/90 border-emerald-500/60 text-emerald-100"
                  }`}
                >
                  <div>
                    <p className="text-xs font-extrabold">
                      {lastAuditAlert.title}
                    </p>
                    <p className="text-[11px] opacity-90 mt-1 leading-relaxed">
                      {lastAuditAlert.detail}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLastAuditAlert(null)}
                    className="text-xs font-bold px-2 py-1 rounded-lg bg-black/30 hover:bg-black/50 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              )}

              {gameStage === "suddendeath" ? (
                <div
                  key="suddendeath-round"
                  className="bg-cardbg/95 backdrop-blur-xl border-2 border-purple-500/60 rounded-3xl p-5 sm:p-6 shadow-2xl animate-card-enter"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      ⚡ RONDE 8 • SINKRONISASI OTAK
                    </span>
                    <span className="text-xs text-slate-400">
                      Sama: <strong className="text-emerald-400">+15%</strong> |
                      Beda: <strong className="text-red-400">-15%</strong>
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950 border border-purple-500/30 mb-4">
                    <p className="text-base sm:text-lg font-extrabold text-white leading-relaxed">
                      &ldquo;{suddenDeathItem.scenario}&rdquo;
                    </p>
                  </div>

                  {mode === "online" && mySyncChoiceOnline !== null ? (
                    <div className="p-5 rounded-2xl bg-purple-950/30 border border-purple-500/40 text-center">
                      <div className="text-3xl mb-2 animate-pulse">🔒</div>
                      <p className="text-sm font-extrabold text-white">
                        Jawabanmu (Opsi{" "}
                        {String.fromCharCode(65 + mySyncChoiceOnline)}) Sudah
                        Dikunci!
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {partnerSyncChoiceOnline === null
                          ? `Menunggu pasanganmu mengunci jawabannya secara rahasia...`
                          : "Membuka hasil sinkronisasi..."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-bold text-slate-300 mb-3">
                        {mode === "couple" ? (
                          p1SyncChoice === null ? (
                            <>
                              👉 Giliran Rahasia{" "}
                              <span className="text-rose-400">
                                {player1.name}
                              </span>{" "}
                              (Jangan sampai {player2.name} mengintip!):
                            </>
                          ) : (
                            <>
                              👉 Sekarang Giliran Rahasia{" "}
                              <span className="text-emerald-400">
                                {player2.name}
                              </span>{" "}
                              (Jawaban {player1.name} sudah terkunci!):
                            </>
                          )
                        ) : (
                          <>
                            👉 Pilih jawaban paling jujur tanpa diskusi (jika
                            sama persis dengan pasangan, dapat{" "}
                            <span className="text-emerald-400">+15%</span>!):
                          </>
                        )}
                      </p>

                      <div className="space-y-2.5">
                        {suddenDeathItem.options.map((opt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            disabled={isBusy}
                            onClick={(e) => handleSuddenDeathChoice(idx, e)}
                            className="w-full p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-purple-400 text-left flex items-start gap-3 transition btn-tactile disabled:opacity-50"
                          >
                            <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center font-mono font-bold text-xs text-purple-300 shrink-0 mt-0.5">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold text-slate-200 leading-snug">
                              {opt}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : mode === "online" && !isMyOnlineTurn ? (
                <div className="bg-cardbg/95 backdrop-blur-xl border-2 border-slate-800 rounded-3xl p-7 text-center shadow-2xl animate-card-enter">
                  <div className="text-4xl mb-3 animate-pulse">⏳</div>
                  <h3 className="text-lg font-extrabold text-white">
                    Menunggu Giliran{" "}
                    {gameStage === "consequence" || gameStage === "negotiate1"
                      ? cardPartner.name
                      : responder.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                    {gameStage === "consequence"
                      ? `${cardPartner.name} sedang mengaudit apakah kamu beneran berkomitmen atau cuma pencitraan...`
                      : gameStage === "negotiate1"
                      ? `${cardPartner.name} sedang diberi tahu bahwa kartunya ditolak & memilih opsi jalan tengah...`
                      : `${responder.name} sedang meninjau opsi jalan tengah yang diajukan...`}
                  </p>
                </div>
              ) : (
                <>
                  {gameStage === "dilemma" && (
                    <div
                      key={`dilemma-${round}`}
                      className={`bg-cardbg/95 backdrop-blur-xl border-2 ${
                        currentCard.isWildcard
                          ? "border-amber-500/50"
                          : "border-slate-800"
                      } rounded-3xl p-5 sm:p-6 shadow-2xl animate-card-enter`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          {currentCard.category}
                        </span>
                        {currentCard.isWildcard ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            ⚡ KARTU JEBAKAN (WILDCARD)
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-slate-800 text-slate-400">
                            🔥 MASALAH UTAMA
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/90 mb-4">
                        <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-base shrink-0">
                          {cardPartner.emoji ||
                            (cardPartner.gender === "Perempuan" ? "👩" : "👨")}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-white truncate">
                            Pengakuan {cardPartner.name} ({cardPartner.age} thn)
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {currentCard.isWildcard
                              ? 'Dia sempat ragu menjawab "Kayanya sih" soal ini...'
                              : 'Dia ngaku jujur "Iya lagi" soal masalah ini:'}
                          </p>
                        </div>
                      </div>

                      <div className="my-4">
                        <p className="text-base sm:text-lg font-bold text-white leading-relaxed">
                          &ldquo;{currentCard.partnerPrompt}&rdquo;
                        </p>
                        <p className="text-xs text-slate-400 italic mt-2.5 pl-3 border-l-2 border-slate-700">
                          Pengakuan asli: &ldquo;{currentCard.statement}&rdquo;
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 mb-5">
                        <p className="text-xs font-bold text-slate-300">
                          👉{" "}
                          <span className="text-rose-400">
                            {responder.name}
                          </span>
                          , kamu siap hidup bareng pasangan yang punya
                          sifat/ketakutan ini?
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={chooseAcceptCard}
                          className="py-4 px-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border-2 border-emerald-500/70 hover:border-emerald-400 text-center group btn-tactile"
                        >
                          <span className="block text-base sm:text-lg font-extrabold text-emerald-400">
                            💚 TERIMA
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            Uji Pencitraan (+10% / -15%)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={chooseRejectCard}
                          className="py-4 px-4 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border-2 border-rose-500/70 hover:border-rose-400 text-center group btn-tactile"
                        >
                          <span className="block text-base sm:text-lg font-extrabold text-rose-400">
                            🛑 TOLAK
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            Cari Jalan Tengah (+5% / -15%)
                          </span>
                        </button>
                      </div>

                      {!vetoUsed[currentCard.responderKey] && (
                        <button
                          type="button"
                          onClick={useVetoCard}
                          className="w-full mt-3 py-2.5 px-4 rounded-2xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center justify-center gap-2 transition btn-tactile"
                        >
                          <span>
                            🛡️ Pakai 1x Kartu Veto (Skip Tanpa Debat • -5%)
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {gameStage === "consequence" && mode !== "solo" && (
                    <div
                      key={`conseq-${round}`}
                      className="bg-cardbg/95 backdrop-blur-xl border-2 border-amber-500/60 rounded-3xl p-5 sm:p-6 shadow-2xl animate-card-flip"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          🕵️ DETEKTOR PENCITRAAN • GILIRAN{" "}
                          {cardPartner.name.toUpperCase()}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 mb-4">
                        <p className="text-xs text-amber-300 font-bold mb-1">
                          {responder.name} menekan TERIMA untuk masalahmu:
                        </p>
                        <p className="text-sm sm:text-base font-extrabold text-white leading-relaxed">
                          &ldquo;{currentCard.consequenceQuestion}&rdquo;
                        </p>
                      </div>

                      <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                        Menurut <strong className="text-emerald-400">{cardPartner.name}</strong>, apakah{" "}
                        <strong className="text-rose-400">{responder.name}</strong>{" "}
                        beneran siap menerima konsekuensi ini atau cuma{" "}
                        <strong>pencitraan di awal</strong>?
                      </p>

                      <div className="space-y-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            glitterBurst(e);
                            resolveConsequenceAudit(true);
                          }}
                          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-between btn-tactile"
                        >
                          <span>🤝 Percaya Komitmennya</span>
                          <span className="font-mono bg-black/25 px-2.5 py-1 rounded-lg text-emerald-200">
                            +10%
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => resolveConsequenceAudit(false)}
                          className="w-full py-3.5 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border-2 border-red-500/60 text-red-300 font-extrabold text-xs sm:text-sm flex items-center justify-between btn-tactile"
                        >
                          <span>
                            🕵️ Tuduh Pencitraan! (Audit 20 Jawaban Awal)
                          </span>
                          <span className="font-mono bg-red-500/20 px-2.5 py-1 rounded-lg text-red-300">
                            -15% / +10%
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {gameStage === "negotiate1" && mode === "solo" && (
                    <div
                      key={`neg-solo-${round}`}
                      className="bg-cardbg/95 backdrop-blur-xl border-2 border-rose-500/50 rounded-3xl p-5 sm:p-6 shadow-2xl animate-card-flip"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          🚨 KARTU DITOLAK — USULKAN KOMPROMI
                        </span>
                        <span className="text-xs text-slate-400">
                          Sepakat:{" "}
                          <strong className="text-emerald-400">+5%</strong> |
                          Beda: <strong className="text-red-400">-15%</strong>
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40 mb-4">
                        <span className="block text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold mb-1">
                          📌 MASALAH YANG DITOLAK OLEH{" "}
                          {responder?.name.toUpperCase()}:
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                          &ldquo;{currentCard.partnerPrompt}&rdquo;
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">{cardPartner.emoji}</span>
                          <span className="text-xs font-extrabold text-white">
                            {cardPartner.name} ({cardPartner.age} thn)
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                            {cardPartner.vibe}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          &ldquo;{cardPartner.reactReject}&rdquo;
                        </p>
                        <p className="text-[11px] text-amber-400/90 mt-1.5 font-medium">
                          💡 Petunjuk gaya kompromi:{" "}
                          {cluePhrases[cardPartner.tier || "mid"]}
                        </p>
                      </div>

                      <p className="text-xs font-bold text-slate-300 mb-2.5">
                        Pilih 1 opsi kompromi untuk ditawarkan ke{" "}
                        {cardPartner.name}:
                      </p>

                      <div className="space-y-2.5">
                        {currentCard.compromises.map((opt, idx) => {
                          const botPrefIdx =
                            currentCard.botPref[cardPartner.tier || "mid"] ?? 0;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                resolveSoloNegotiation(idx, botPrefIdx)
                              }
                              className="w-full p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-400 text-left flex items-start gap-3 transition btn-tactile"
                            >
                              <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center font-mono font-bold text-xs text-amber-400 shrink-0 mt-0.5">
                                {String.fromCharCode(65 + idx)}
                              </span>
                              <span className="text-xs sm:text-sm font-semibold text-slate-200 leading-snug">
                                {opt}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {gameStage === "negotiate1" && mode !== "solo" && (
                    <div
                      key={`neg-c1-${round}`}
                      className="bg-cardbg/95 backdrop-blur-xl border-2 border-rose-500/50 rounded-3xl p-5 sm:p-6 shadow-2xl animate-card-flip"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          🚨 KARTU DITOLAK OLEH {responder.name.toUpperCase()}
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40 mb-4">
                        <span className="block text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold mb-1">
                          📌 NOTIFIKASI PENOLAKAN DARI{" "}
                          {responder.name.toUpperCase()}:
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                          &ldquo;
                          {formatRejectedProblemForOwner(
                            responder.name,
                            currentCard.statement
                          )}
                          &rdquo;
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 mb-4">
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Sebagai pemilik kartu (
                          <strong className="text-emerald-400">
                            {cardPartner.name}
                          </strong>
                          ), pilih 1 opsi jalan tengah / kompromi untuk
                          ditawarkan kembali ke{" "}
                          <strong className="text-rose-400">
                            {responder.name}
                          </strong>
                          :
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {currentCard.compromises.map((opt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => submitNegotiateOwnerChoice(idx)}
                            className="w-full p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-rose-400 text-left flex items-start gap-3 transition btn-tactile"
                          >
                            <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center font-mono font-bold text-xs text-rose-400 shrink-0 mt-0.5">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold text-slate-200 leading-snug">
                              {opt}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {gameStage === "negotiate2" && mode !== "solo" && (
                    <div
                      key={`neg-c2-${round}`}
                      className="bg-cardbg/95 backdrop-blur-xl border-2 border-emerald-500/50 rounded-3xl p-5 sm:p-6 shadow-2xl animate-card-flip"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          📲 GILIRAN {responder.name.toUpperCase()} (KONFIRMASI
                          JALAN TENGAH)
                        </span>
                      </div>

                      <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 mb-4">
                        <span className="block text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold mb-1">
                          📌 MASALAH YANG KAMU TOLAK SEBELUMNYA:
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                          &ldquo;{currentCard.partnerPrompt}&rdquo;
                        </p>
                      </div>

                      <p className="text-xs text-slate-300 mb-3">
                        <strong className="text-emerald-400">
                          {cardPartner.name}
                        </strong>{" "}
                        sudah mengajukan opsi jalan tengah. Sekarang{" "}
                        <strong className="text-rose-400">
                          {responder.name}
                        </strong>{" "}
                        pilih opsi yang sama agar sepakat (+5%):
                      </p>

                      <div className="space-y-2.5">
                        {currentCard.compromises.map((opt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => resolveCoupleNegotiation(idx)}
                            className="w-full p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-emerald-400 text-left flex items-start gap-3 transition btn-tactile"
                          >
                            <span className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center font-mono font-bold text-xs text-emerald-400 shrink-0 mt-0.5">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold text-slate-200 leading-snug">
                              {opt}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between px-2 pt-1">
                <span className="text-[11px] font-mono text-slate-500">
                  AFK Berturut-turut: {consecutiveTimeouts}/3
                </span>
                <span className="text-[11px] text-slate-500">
                  {DECK_THEME_META[deckTheme].emoji}{" "}
                  {DECK_THEME_META[deckTheme].label}
                </span>
              </div>
            </section>
          )}

        {screen === "ending" && player1 && player2 && (
          <section key={animKey} className="animate-card-enter space-y-5">
            <div
              className={`bg-cardbg/95 border-2 rounded-3xl p-6 sm:p-7 text-center shadow-2xl relative overflow-hidden ${
                battery >= 80
                  ? "border-emerald-500/60 shadow-emerald-500/15"
                  : battery >= 45
                  ? "border-amber-500/60 shadow-amber-500/10"
                  : "border-red-500/60 shadow-red-500/15"
              }`}
            >
              <div
                className={`w-16 h-16 mx-auto rounded-2xl border flex items-center justify-center text-4xl mb-4 shadow-lg ${
                  battery >= 80
                    ? "bg-emerald-500/20 border-emerald-500/40"
                    : battery >= 45
                    ? "bg-amber-500/20 border-amber-500/40"
                    : "bg-red-500/20 border-red-500/40"
                }`}
              >
                {battery >= 80 ? "💍" : battery >= 45 ? "⏳" : "🚨"}
              </div>

              <span
                className={`inline-block px-3.5 py-1 rounded-full text-xs font-mono font-extrabold uppercase tracking-widest border mb-2 ${
                  battery >= 80
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : battery >= 45
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-red-500/20 text-red-300 border-red-500/40"
                }`}
              >
                BATERAI CINTA AKHIR: {battery}%
              </span>

              <h1
                className={`text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 ${
                  battery >= 80
                    ? "text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-300 to-amber-300"
                    : battery >= 45
                    ? "text-amber-400"
                    : "text-red-500"
                }`}
              >
                {battery >= 80
                  ? "SEFREKUENSI!"
                  : battery >= 45
                  ? "PACARAN DULU AJA"
                  : "STOP THE WEDDING"}
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 mt-3 leading-relaxed max-w-md mx-auto">
                {battery >= 80
                  ? "Red flag kalian berdua ternyata saling mengunci kayak puzzle! Kesiapan mental dan kompromi kalian udah matang. Langsung booking KUA dan sebar undangan!"
                  : battery >= 45
                  ? "Rasa sayang sih ada, tapi masih banyak kompromi yang gantung dan ego yang belum kelar. Jangan buru-buru DP gedung — pacaran dulu aja sambil benerin komunikasi!"
                  : endingCustomReason
                  ? `${endingCustomReason} Terlalu banyak deadlock dan penyesalan. Mending batalin sekarang daripada jadi drama di pengadilan agama!`
                  : "Terlalu banyak pencitraan, deadlock ego, dan bom waktu kebiasaan buruk. Mending stop sekarang sebelum jadi beban pikiran seumur hidup!"}
              </p>

              <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-400">
                <span className="font-bold text-white">
                  {player1.name} ({player1.age})
                </span>
                <span>⚡</span>
                <span className="font-bold text-rose-400">
                  {player2.name} ({player2.age})
                </span>
              </div>
            </div>

            <div
              className={`p-4 rounded-3xl border ${
                battery >= 80
                  ? "bg-emerald-500/10 border-emerald-500/40"
                  : "bg-amber-500/10 border-amber-500/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] font-mono font-extrabold uppercase tracking-wider ${
                    battery >= 80 ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {battery >= 80
                    ? "🎯 TARUHAN NYATA • LULUS TANTANGAN (>= 80%)"
                    : "🎯 TARUHAN NYATA • WAJIB DILAKSANAKAN (< 80%)"}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-bold text-white">
                {customStake || STAKE_PRESETS[0]}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-emerald-400">
                  {stats.terimaMantap}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Dipercaya (+10%)
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-rose-400">
                  {stats.pencitraanTerbongkar}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Pencitraan (-15%)
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-amber-400">
                  {stats.kompromiSepakat}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Kompromi (+5%/15%)
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-red-400">
                  {stats.deadlockOrAfk}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Gagal/AFK (-15%)
                </span>
              </div>
            </div>

            <div className="bg-cardbg/95 border border-slate-800 rounded-3xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-white">
                  📋 Rapor Kecocokan Tiap Ronde
                </h3>
                <button
                  type="button"
                  onClick={copyMatchReport}
                  className="text-xs font-bold text-rose-400 hover:text-rose-300 underline underline-offset-4"
                >
                  Salin Rapor
                </button>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {history.map((item, idx) => {
                  const deltaColor =
                    item.delta > 0
                      ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                      : "text-red-400 bg-red-500/15 border-red-500/30";
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800/90 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-mono text-[10px] font-bold text-slate-500">
                            R{item.round}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {item.category}
                          </span>
                          {item.isWildcard && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                              WILDCARD
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-200 font-medium line-clamp-2">
                          {item.problem}
                        </p>
                        <p className="text-[11px] font-bold text-slate-400 mt-1">
                          → {item.outcomeLabel}
                        </p>
                      </div>
                      <span
                        className={`font-mono font-extrabold text-xs px-2 py-1 rounded-lg border shrink-0 ${deltaColor}`}
                      >
                        {item.delta > 0 ? `+${item.delta}%` : `${item.delta}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pb-6">
              <button
                type="button"
                disabled={isDownloadingImage}
                onClick={downloadReportImage}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-500/25 btn-tactile flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>
                  {isDownloadingImage
                    ? "Menyiapkan Gambar Rapor..."
                    : "📸 Download Gambar Rapor (.PNG)"}
                </span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleSecondChance}
                  className="py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-sm border border-slate-700 btn-tactile disabled:opacity-50"
                >
                  {isBusy ? "Memulai Ulang..." : "🔄 Kesempatan Kedua"}
                </button>
                <button
                  type="button"
                  onClick={fullResetGame}
                  className="py-3.5 px-5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-extrabold text-sm shadow-lg shadow-rose-500/25 btn-tactile"
                >
                  ✨ Main Ulang Dari Awal
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="w-full py-4 text-center text-[11px] text-slate-600">
        SEFREKUENSI • Krisna Oktaria
      </footer>
    </>
  );
}
