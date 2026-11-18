"use client";"use client";

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
      }, 2800);
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
  const [registerError, setRegisterError] = useState<{
    title: string;
    text: string;
    key: number;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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
    "dilemma" | "consequence" | "negotiate1" | "negotiate2"
  >("dilemma");

  const [negotiateOwnerChoice, setNegotiateOwnerChoice] = useState<
    number | null
  >(null);

  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState({
    terimaMantap: 0,
    menyesal: 0,
    kompromiSepakat: 0,
    deadlockOrAfk: 0,
  });
  const [endingCustomReason, setEndingCustomReason] = useState("");

  const prevBatteryRef = useRef(50);
  const syncedStepRef = useRef("");

  const triggerBatteryDelta = useCallback((delta: number) => {
    if (delta === 0) return;
    setDeltaBadge({ val: delta, key: Date.now() + Math.random() });
    if (delta < 0) {
      setHudShakeKey((k) => k + 1);
    }
  }, []);

  const publishOnlineRoom = useCallback(
    async (code: string, hostProfile: PlayerProfile, status: string) => {
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
            player1: hostProfile,
            player2: null,
            status,
            round: 1,
            battery: 50,
            stage: "dilemma",
            negotiateOwnerChoice: null,
            consecutiveTimeouts: 0,
            history: [],
            stats: {
              terimaMantap: 0,
              menyesal: 0,
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

  useEffect(() => {
    if (!inviteCode || !isFirebaseReady || !db) return;
    if (mode !== "online") return;

    const roomRef = doc(db, "rooms", inviteCode);
    const unsubscribe = onSnapshot(
      roomRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        if (data.player1) setPlayer1(data.player1);
        if (data.player2) setPlayer2(data.player2);
        if (data.deck) setDeck(data.deck);
        if (data.stage) setGameStage(data.stage);
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
    !currentCard ||
    (gameStage === "negotiate1"
      ? currentCard.responderKey !== myOnlineRole
      : gameStage === "negotiate2"
      ? currentCard.responderKey === myOnlineRole
      : currentCard.responderKey === myOnlineRole);

  useEffect(() => {
    if (screen !== "game" || !timerRunning) return;
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
        "Akses Ditolak! Minimal usia 18 tahun untuk mengurus drama hubungan.",
        `Usiamu baru ${
          isNaN(age) ? "belum jelas" : age + " tahun"
        }. Kelarin dulu urusan sekolah/kuliah sebelum uji nyali soal KUA!`
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
          questions: build20QuestionsForProfile(regGender, age),
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
        setInviteCode(code);
        setMode("online");
        setMyOnlineRole("player2");
        setPlayer1(hostProfile);
        setPlayer2(p2Profile);
        setQuizTarget("player2");
        setQuizIndex(0);
        setIsBusy(false);
        sfxTap();
        showToast(`Terhubung ke room ${hostProfile.name}!`, "success");
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
      questions: build20QuestionsForProfile(regGender, age),
      answers: {},
    };

    setMode("online");
    setMyOnlineRole("player1");
    setInviteCode(newCode);
    setPlayer1(newHostProfile);
    setPlayer2(null);
    setQuizTarget("player1");
    setQuizIndex(0);

    publishOnlineRoom(newCode, newHostProfile, "p1_quiz");
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
                consecutiveTimeouts: 0,
                history: [],
                stats: {
                  terimaMantap: 0,
                  menyesal: 0,
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
                consecutiveTimeouts: 0,
                history: [],
                stats: {
                  terimaMantap: 0,
                  menyesal: 0,
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
    const botQuestions = build20QuestionsForProfile(botGender, botAgeSlider);

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
        title: "Akses Ditolak! Minimal Usia",
        text: "Pasangan harus berusia minimal untuk bermain.",
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
      questions: build20QuestionsForProfile(partnerGenderInput, pAge),
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
    setConsecutiveTimeouts(0);
    setHistory([]);
    setStats({
      terimaMantap: 0,
      menyesal: 0,
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
    isTimeout = false
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
      const nextAfk = isTimeout ? curAfk + 1 : 0;
      const nextBattery = Math.max(0, Math.min(100, curBattery + delta));
      const prevHist = (data.history as HistoryItem[]) || [];
      const prevStats = (data.stats as typeof stats) || {
        terimaMantap: 0,
        menyesal: 0,
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
        round: isFinished ? curRound : curRound + 1,
        stage: "dilemma",
        negotiateOwnerChoice: null,
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
      setRound((r) => r + 1);
      setGameStage("dilemma");
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
      await syncOnlineRoundOutcome(-15, item, "deadlockOrAfk", true);
    } else {
      applyLocalRoundOutcome(-15, item, "deadlockOrAfk", nextAfk);
    }
  };

  const chooseAcceptCard = async (ev: React.MouseEvent<HTMLButtonElement>) => {
    glitterBurst(ev);
    sfxFlip();
    setConsecutiveTimeouts(0);
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

  const resolveConsequence = async (isFirm: boolean) => {
    if (!currentCard || !player1 || !player2) return;
    setTimerRunning(false);
    const responder =
      currentCard.responderKey === "player1" ? player1 : player2;

    if (isFirm) {
      sfxCharge();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `${responder.name}: Terima Konsekuensi Mantap`,
        delta: 10,
        type: "good",
      };
      showToast("Komitmen penuh! Baterai Cinta +10%", "success");
      if (mode === "online") {
        await syncOnlineRoundOutcome(10, item, "terimaMantap", false);
      } else {
        applyLocalRoundOutcome(10, item, "terimaMantap", 0);
      }
    } else {
      sfxPenalty();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `${responder.name}: Menyesal Pilih Terima`,
        delta: -12,
        type: "bad",
      };
      showToast("Asal mengiyakan lalu menyesal! Penalti berat -12%", "error");
      if (mode === "online") {
        await syncOnlineRoundOutcome(-12, item, "menyesal", false);
      } else {
        applyLocalRoundOutcome(-12, item, "menyesal", 0);
      }
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
        await syncOnlineRoundOutcome(5, item, "kompromiSepakat", false);
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
        await syncOnlineRoundOutcome(-15, item, "deadlockOrAfk", false);
      } else {
        applyLocalRoundOutcome(-15, item, "deadlockOrAfk", 0);
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
    const summary = [
      `=== HASIL SEFREKUENSI ===`,
      `Pasangan: ${player1.name} & ${player2.name}`,
      `Baterai Cinta Akhir: ${battery}% -> ${title}`,
      `Statistik: Terima Mantap (${stats.terimaMantap}), Menyesal (${stats.menyesal}), Sepakat Kompromi (${stats.kompromiSepakat}), Deadlock/AFK (${stats.deadlockOrAfk})`,
      `Mainkan sekarang untuk uji red flag hubunganmu!`,
    ].join("\n");
    copyTextSafe(summary, "Rapor kecocokan berhasil disalin!");
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
            consecutiveTimeouts: 0,
            history: [],
            stats: {
              terimaMantap: 0,
              menyesal: 0,
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

  const responderConfessions =
    responder?.questions.filter(
      (q) =>
        responder.answers[q.id] === "iya" ||
        responder.answers[q.id] === "kayanya"
    ) || [];
  const personalTrap =
    responderConfessions.length > 0
      ? responderConfessions[round % responderConfessions.length]
      : responder?.questions[0];

  const cluePhrases: Record<"young" | "mid" | "mature", string> = {
    young: "Aku maunya yang tetep ngejaga perasaan & perhatian kita sih...",
    mid: "Menurutku kita butuh aturan yang realistis dan adil buat masing-masing.",
    mature:
      "Pilih opsi yang paling praktis, terukur, dan minim drama ke depannya.",
  };

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
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-none">
                Dating &amp; Red Flag Card Game
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
                    *Sistem otomatis memblokir jika jenis kelaminmu sama dengan
                    pengirim kode.
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
                      Usia
                    </label>
                    <input
                      type="number"
                      id="regAge"
                      required
                      min={10}
                      max={80}
                      value={regAge}
                      onChange={(e) => setRegAge(e.target.value)}
                      placeholder="Contoh: 24"
                      className="w-full bg-slate-950/90 border border-slate-700/90 focus:border-rose-500 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>
                </div>

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
                    {activeQuizQuestion.segmentLabel}
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
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wide border ${
                      activeQuizQuestion.category === "Ketakutan Hidup"
                        ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                        : activeQuizQuestion.category === "Kebiasaan Buruk"
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    }`}
                  >
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
                <span>Jawab jujur — ini bakal jadi dek kartu pasanganmu!</span>
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
            </div>
          </section>
        )}

        {screen === "mode" && player1 && (
          <section key={animKey} className="animate-card-enter space-y-5">
            <div className="bg-cardbg/95 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                    Hasil Profiling Jujur
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

            <div className="text-center">
              <h3 className="text-base font-extrabold text-white">
                Pilih Lawan Main Uji Kecocokan
              </h3>
              <p className="text-xs text-slate-400">
                Baterai Cinta dimulai dari{" "}
                <span className="text-amber-400 font-bold">50%</span>. Sanggup
                tembus 80%?
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
                  min={18}
                  max={45}
                  value={botAgeSlider}
                  onChange={(e) =>
                    setBotAgeSlider(parseInt(e.target.value, 10))
                  }
                  className="w-full my-2"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-3">
                  <span>18 (Dramatis)</span>
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
                mengundangmu uji kecocokan. Masukkan datamu (wajib lawan jenis)
                &amp;.
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
                      Usia Pasangan
                    </label>
                    <input
                      type="number"
                      required
                      min={10}
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
                    <span className="text-[11px] font-semibold text-slate-400 truncate max-w-[140px] sm:max-w-[200px]">
                      Giliran:{" "}
                      {gameStage === "negotiate1"
                        ? cardPartner.name
                        : gameStage === "negotiate2"
                        ? responder.name
                        : responder.name}
                    </span>
                  </div>

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
                </div>
              </div>

              {mode === "online" && !isMyOnlineTurn ? (
                <div className="bg-cardbg/95 backdrop-blur-xl border-2 border-slate-800 rounded-3xl p-7 text-center shadow-2xl animate-card-enter">
                  <div className="text-4xl mb-3 animate-pulse">⏳</div>
                  <h3 className="text-lg font-extrabold text-white">
                    Menunggu Giliran{" "}
                    {gameStage === "negotiate1"
                      ? cardPartner.name
                      : gameStage === "negotiate2"
                      ? responder.name
                      : responder.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                    {gameStage === "negotiate1"
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
                              : 'Dia ngaku jujur "Iya lagi" soal borok ini:'}
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
                            Uji Konsekuensi (+10% / -12%)
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
                    </div>
                  )}

                  {gameStage === "consequence" && (
                    <div
                      key={`conseq-${round}`}
                      className="bg-cardbg/95 backdrop-blur-xl border-2 border-amber-500/60 rounded-3xl p-5 sm:p-6 shadow-2xl animate-card-flip"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ⚠️ KARTU KONSEKUENSI TERBUKA
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {responder.name}
                        </span>
                      </div>

                      {mode === "solo" && cardPartner.reactAccept && (
                        <div className="mb-4 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200">
                          <span className="font-bold text-indigo-300">
                            {cardPartner.name} ({cardPartner.age} thn):
                          </span>{" "}
                          &ldquo;{cardPartner.reactAccept}&rdquo;
                        </div>
                      )}

                      <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 mb-4">
                        <p className="text-sm sm:text-base font-extrabold text-white leading-relaxed">
                          &ldquo;{currentCard.consequenceQuestion}&rdquo;
                        </p>
                        {personalTrap && (
                          <div className="mt-3 pt-3 border-t border-slate-800/90">
                            <span className="block text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold mb-1">
                              🪞 Cermin Pengakuanmu Sendiri di Awal:
                            </span>
                            <p className="text-xs text-slate-300 italic">
                              Padahal di awal {responder.name} sendiri ngaku:
                              &ldquo;{personalTrap.statement}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 mb-4 text-center">
                        Setelah sadar tabrakan sifat ini, kamu beneran sanggup
                        atau mulai nyesel?
                      </p>

                      <div className="space-y-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            glitterBurst(e);
                            resolveConsequence(true);
                          }}
                          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-between btn-tactile"
                        >
                          <span>💪 Tetap Terima Konsekuensinya</span>
                          <span className="font-mono bg-black/25 px-2.5 py-1 rounded-lg text-emerald-200">
                            +10%
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => resolveConsequence(false)}
                          className="w-full py-3.5 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border-2 border-red-500/60 text-red-300 font-extrabold text-xs sm:text-sm flex items-center justify-between btn-tactile"
                        >
                          <span>😰 Ragu / Menyesal Pilih Terima</span>
                          <span className="font-mono bg-red-500/20 px-2.5 py-1 rounded-lg text-red-300">
                            -12%
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
                        Sebagai pemilik masalah, pilih 1 opsi kompromi untuk
                        ditawarkan ke {responder.name}:
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
                          📌 MASALAH YANG DITOLAK OLEH{" "}
                          {responder.name.toUpperCase()}:
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                          &ldquo;{currentCard.partnerPrompt}&rdquo;
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 mb-4">
                        <p className="text-xs text-slate-300 leading-relaxed">
                          <strong className="text-rose-400">
                            {responder.name}
                          </strong>{" "}
                          menolak masalahmu. Sebagai pemilik kartu (
                          <strong className="text-emerald-400">
                            {cardPartner.name}
                          </strong>
                          ), pilih 1 opsi jalan tengah / kompromi untuk
                          ditawarkan kembali ke {responder.name}:
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
                  : "Terlalu banyak penyesalan, deadlock ego, dan bom waktu kebiasaan buruk. Mending stop sekarang sebelum jadi beban pikiran seumur hidup!"}
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

            <div className="grid grid-cols-4 gap-2">
              <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-emerald-400">
                  {stats.terimaMantap}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Terima (+10%)
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-rose-400">
                  {stats.menyesal}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Nyesel (-12%)
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-amber-400">
                  {stats.kompromiSepakat}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Sepakat (+5%)
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-6">
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
          </section>
        )}
      </main>

      <footer className="w-full py-4 text-center text-[11px] text-slate-600">
        SEFREKUENSI • Krisna Oktaria
      </footer>
    </>
  );
}


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
      }, 2800);
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
  const [registerError, setRegisterError] = useState<{
    title: string;
    text: string;
    key: number;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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
    "dilemma" | "consequence" | "negotiate1" | "negotiate2"
  >("dilemma");

  const [negotiateOwnerChoice, setNegotiateOwnerChoice] = useState<
    number | null
  >(null);

  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState({
    terimaMantap: 0,
    menyesal: 0,
    kompromiSepakat: 0,
    deadlockOrAfk: 0,
  });
  const [endingCustomReason, setEndingCustomReason] = useState("");

  const prevBatteryRef = useRef(50);
  const syncedStepRef = useRef("");

  const triggerBatteryDelta = useCallback((delta: number) => {
    if (delta === 0) return;
    setDeltaBadge({ val: delta, key: Date.now() + Math.random() });
    if (delta < 0) {
      setHudShakeKey((k) => k + 1);
    }
  }, []);

  const publishOnlineRoom = useCallback(
    async (code: string, hostProfile: PlayerProfile, status: string) => {
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
            player1: hostProfile,
            player2: null,
            status,
            round: 1,
            battery: 50,
            stage: "dilemma",
            negotiateOwnerChoice: null,
            consecutiveTimeouts: 0,
            history: [],
            stats: {
              terimaMantap: 0,
              menyesal: 0,
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

  useEffect(() => {
    if (!inviteCode || !isFirebaseReady || !db) return;
    if (mode !== "online") return;

    const roomRef = doc(db, "rooms", inviteCode);
    const unsubscribe = onSnapshot(
      roomRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        if (data.player1) setPlayer1(data.player1);
        if (data.player2) setPlayer2(data.player2);
        if (data.deck) setDeck(data.deck);
        if (data.stage) setGameStage(data.stage);
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
        if (data.endingReason) setEndingCustomReason(data.endingReason);

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
            screenRef.current === "quiz")
        ) {
          prevBatteryRef.current = data.battery ?? 50;
          setTimerSeconds(60);
          setTimerRunning(true);
          sfxCharge();
          showToast(
            `${data.player1.name} & ${data.player2.name} siap! Memulai permainan...`,
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
    !currentCard ||
    (gameStage === "negotiate1"
      ? currentCard.responderKey !== myOnlineRole
      : gameStage === "negotiate2"
      ? currentCard.responderKey === myOnlineRole
      : currentCard.responderKey === myOnlineRole);

  useEffect(() => {
    if (screen !== "game" || !timerRunning) return;
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
        "Akses Ditolak! Minimal usia 18 tahun untuk mengurus drama hubungan.",
        `Usiamu baru ${
          isNaN(age) ? "belum jelas" : age + " tahun"
        }. Kelarin dulu urusan sekolah/kuliah sebelum uji nyali soal KUA!`
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
          questions: build20QuestionsForProfile(regGender, age),
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
        setInviteCode(code);
        setMode("online");
        setMyOnlineRole("player2");
        setPlayer1(hostProfile);
        setPlayer2(p2Profile);
        setQuizTarget("player2");
        setQuizIndex(0);
        setIsBusy(false);
        sfxTap();
        showToast(`Terhubung ke room ${hostProfile.name}!`, "success");
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
      questions: build20QuestionsForProfile(regGender, age),
      answers: {},
    };

    setMode("online");
    setMyOnlineRole("player1");
    setInviteCode(newCode);
    setPlayer1(newHostProfile);
    setPlayer2(null);
    setQuizTarget("player1");
    setQuizIndex(0);

    publishOnlineRoom(newCode, newHostProfile, "p1_quiz");
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
                consecutiveTimeouts: 0,
                history: [],
                stats: {
                  terimaMantap: 0,
                  menyesal: 0,
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
                consecutiveTimeouts: 0,
                history: [],
                stats: {
                  terimaMantap: 0,
                  menyesal: 0,
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
    const botQuestions = build20QuestionsForProfile(botGender, botAgeSlider);

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
        title: "Akses Ditolak!",
        text: "Pasangan harus berusia minimal untuk bermain.",
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
      questions: build20QuestionsForProfile(partnerGenderInput, pAge),
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
    setConsecutiveTimeouts(0);
    setHistory([]);
    setStats({
      terimaMantap: 0,
      menyesal: 0,
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
    isTimeout = false
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
      const nextAfk = isTimeout ? curAfk + 1 : 0;
      const nextBattery = Math.max(0, Math.min(100, curBattery + delta));
      const prevHist = (data.history as HistoryItem[]) || [];
      const prevStats = (data.stats as typeof stats) || {
        terimaMantap: 0,
        menyesal: 0,
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
        round: isFinished ? curRound : curRound + 1,
        stage: "dilemma",
        negotiateOwnerChoice: null,
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
      setRound((r) => r + 1);
      setGameStage("dilemma");
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
      await syncOnlineRoundOutcome(-15, item, "deadlockOrAfk", true);
    } else {
      applyLocalRoundOutcome(-15, item, "deadlockOrAfk", nextAfk);
    }
  };

  const chooseAcceptCard = async (ev: React.MouseEvent<HTMLButtonElement>) => {
    glitterBurst(ev);
    sfxFlip();
    setConsecutiveTimeouts(0);
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

  const resolveConsequence = async (isFirm: boolean) => {
    if (!currentCard || !player1 || !player2) return;
    setTimerRunning(false);
    const responder =
      currentCard.responderKey === "player1" ? player1 : player2;

    if (isFirm) {
      sfxCharge();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `${responder.name}: Terima Konsekuensi Mantap`,
        delta: 10,
        type: "good",
      };
      showToast("Komitmen penuh! Baterai Cinta +10%", "success");
      if (mode === "online") {
        await syncOnlineRoundOutcome(10, item, "terimaMantap", false);
      } else {
        applyLocalRoundOutcome(10, item, "terimaMantap", 0);
      }
    } else {
      sfxPenalty();
      const item: HistoryItem = {
        round,
        category: currentCard.category,
        isWildcard: currentCard.isWildcard,
        problem: currentCard.partnerPrompt,
        outcomeLabel: `${responder.name}: Menyesal Pilih Terima`,
        delta: -12,
        type: "bad",
      };
      showToast("Asal mengiyakan lalu menyesal! Penalti berat -12%", "error");
      if (mode === "online") {
        await syncOnlineRoundOutcome(-12, item, "menyesal", false);
      } else {
        applyLocalRoundOutcome(-12, item, "menyesal", 0);
      }
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
        await syncOnlineRoundOutcome(5, item, "kompromiSepakat", false);
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
        await syncOnlineRoundOutcome(-15, item, "deadlockOrAfk", false);
      } else {
        applyLocalRoundOutcome(-15, item, "deadlockOrAfk", 0);
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
    const summary = [
      `=== HASIL SEFREKUENSI ===`,
      `Pasangan: ${player1.name} & ${player2.name}`,
      `Baterai Cinta Akhir: ${battery}% -> ${title}`,
      `Statistik: Terima Mantap (${stats.terimaMantap}), Menyesal (${stats.menyesal}), Sepakat Kompromi (${stats.kompromiSepakat}), Deadlock/AFK (${stats.deadlockOrAfk})`,
      `Mainkan sekarang untuk uji red flag hubunganmu!`,
    ].join("\n");
    copyTextSafe(summary, "Rapor kecocokan berhasil disalin!");
  };

  const replaySameProfile = () => {
    sfxTap();
    setTimerRunning(false);
    setPlayer2(null);
    const nextCode = "SEFREK-" + Math.floor(100 + Math.random() * 899);
    setMode("online");
    setMyOnlineRole("player1");
    setInviteCode(nextCode);
    if (player1) {
      publishOnlineRoom(nextCode, player1, "waiting");
    }
    goScreen("mode");
  };

  const fullResetGame = () => {
    sfxTap();
    setTimerRunning(false);
    setPlayer1(null);
    setPlayer2(null);
    setHistory([]);
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

  const responderConfessions =
    responder?.questions.filter(
      (q) =>
        responder.answers[q.id] === "iya" ||
        responder.answers[q.id] === "kayanya"
    ) || [];
  const personalTrap =
    responderConfessions.length > 0
      ? responderConfessions[round % responderConfessions.length]
      : responder?.questions[0];

  const cluePhrases: Record<"young" | "mid" | "mature", string> = {
    young: "Aku maunya yang tetep ngejaga perasaan & perhatian kita sih...",
    mid: "Menurutku kita butuh aturan yang realistis dan adil buat masing-masing.",
    mature:
      "Pilih opsi yang paling praktis, terukur, dan minim drama ke depannya.",
  };

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
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-none">
                Dating &amp; Red Flag Card Game
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
                    *Sistem otomatis memblokir jika jenis kelaminmu sama dengan
                    pengirim kode.
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
                    </label>
                    <input
                      type="number"
                      id="regAge"
                      required
                      min={10}
                      max={80}
                      value={regAge}
                      onChange={(e) => setRegAge(e.target.value)}
                      placeholder="Contoh: 24"
                      className="w-full bg-slate-950/90 border border-slate-700/90 focus:border-rose-500 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>
                </div>

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
                    {activeQuizQuestion.segmentLabel}
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
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tracking-wide border ${
                      activeQuizQuestion.category === "Ketakutan Hidup"
                        ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                        : activeQuizQuestion.category === "Kebiasaan Buruk"
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    }`}
                  >
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
                <span>Jawab jujur — ini bakal jadi dek kartu pasanganmu!</span>
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
            </div>
          </section>
        )}

        {screen === "mode" && player1 && (
          <section key={animKey} className="animate-card-enter space-y-5">
            <div className="bg-cardbg/95 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                    Hasil Profiling Jujur
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

            <div className="text-center">
              <h3 className="text-base font-extrabold text-white">
                Pilih Lawan Main Uji Kecocokan
              </h3>
              <p className="text-xs text-slate-400">
                Baterai Cinta dimulai dari{" "}
                <span className="text-amber-400 font-bold">50%</span>. Sanggup
                tembus 80%?
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
                  min={18}
                  max={45}
                  value={botAgeSlider}
                  onChange={(e) =>
                    setBotAgeSlider(parseInt(e.target.value, 10))
                  }
                  className="w-full my-2"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-3">
                  <span>18 (Dramatis)</span>
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
                mengundangmu uji kecocokan. Masukkan datamu (wajib lawan jenis)
                &amp;.
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
                      Usia Pasangan
                    </label>
                    <input
                      type="number"
                      required
                      min={10}
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
                    <span className="text-[11px] font-semibold text-slate-400 truncate max-w-[140px] sm:max-w-[200px]">
                      Giliran:{" "}
                      {gameStage === "negotiate1"
                        ? cardPartner.name
                        : gameStage === "negotiate2"
                        ? responder.name
                        : responder.name}
                    </span>
                  </div>

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
                </div>
              </div>

              {mode === "online" && !isMyOnlineTurn ? (
                <div className="bg-cardbg/95 backdrop-blur-xl border-2 border-slate-800 rounded-3xl p-7 text-center shadow-2xl animate-card-enter">
                  <div className="text-4xl mb-3 animate-pulse">⏳</div>
                  <h3 className="text-lg font-extrabold text-white">
                    Menunggu Giliran{" "}
                    {gameStage === "negotiate1"
                      ? cardPartner.name
                      : gameStage === "negotiate2"
                      ? responder.name
                      : responder.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto leading-relaxed">
                    {gameStage === "negotiate1"
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
                              : 'Dia ngaku jujur "Iya lagi" soal borok ini:'}
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
                            Uji Konsekuensi (+10% / -12%)
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
                    </div>
                  )}

                  {gameStage === "consequence" && (
                    <div
                      key={`conseq-${round}`}
                      className="bg-cardbg/95 backdrop-blur-xl border-2 border-amber-500/60 rounded-3xl p-5 sm:p-6 shadow-2xl animate-card-flip"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-3 py-1 rounded-full text-xs font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ⚠️ KARTU KONSEKUENSI TERBUKA
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {responder.name}
                        </span>
                      </div>

                      {mode === "solo" && cardPartner.reactAccept && (
                        <div className="mb-4 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-200">
                          <span className="font-bold text-indigo-300">
                            {cardPartner.name} ({cardPartner.age} thn):
                          </span>{" "}
                          &ldquo;{cardPartner.reactAccept}&rdquo;
                        </div>
                      )}

                      <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 mb-4">
                        <p className="text-sm sm:text-base font-extrabold text-white leading-relaxed">
                          &ldquo;{currentCard.consequenceQuestion}&rdquo;
                        </p>
                        {personalTrap && (
                          <div className="mt-3 pt-3 border-t border-slate-800/90">
                            <span className="block text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold mb-1">
                              🪞 Cermin Pengakuanmu Sendiri di Awal:
                            </span>
                            <p className="text-xs text-slate-300 italic">
                              Padahal di awal {responder.name} sendiri ngaku:
                              &ldquo;{personalTrap.statement}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 mb-4 text-center">
                        Setelah sadar tabrakan sifat ini, kamu beneran sanggup
                        atau mulai nyesel?
                      </p>

                      <div className="space-y-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            glitterBurst(e);
                            resolveConsequence(true);
                          }}
                          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-between btn-tactile"
                        >
                          <span>💪 Tetap Terima Konsekuensinya</span>
                          <span className="font-mono bg-black/25 px-2.5 py-1 rounded-lg text-emerald-200">
                            +10%
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => resolveConsequence(false)}
                          className="w-full py-3.5 px-4 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border-2 border-red-500/60 text-red-300 font-extrabold text-xs sm:text-sm flex items-center justify-between btn-tactile"
                        >
                          <span>😰 Ragu / Menyesal Pilih Terima</span>
                          <span className="font-mono bg-red-500/20 px-2.5 py-1 rounded-lg text-red-300">
                            -12%
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
                        Sebagai pemilik masalah, pilih 1 opsi kompromi untuk
                        ditawarkan ke {responder.name}:
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
                          📌 MASALAH YANG DITOLAK OLEH{" "}
                          {responder.name.toUpperCase()}:
                        </span>
                        <p className="text-xs sm:text-sm font-bold text-white leading-relaxed">
                          &ldquo;{currentCard.partnerPrompt}&rdquo;
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 mb-4">
                        <p className="text-xs text-slate-300 leading-relaxed">
                          <strong className="text-rose-400">
                            {responder.name}
                          </strong>{" "}
                          menolak masalahmu. Sebagai pemilik kartu (
                          <strong className="text-emerald-400">
                            {cardPartner.name}
                          </strong>
                          ), pilih 1 opsi jalan tengah / kompromi untuk
                          ditawarkan kembali ke {responder.name}:
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
                  : "Terlalu banyak penyesalan, deadlock ego, dan bom waktu kebiasaan buruk. Mending stop sekarang sebelum jadi beban pikiran seumur hidup!"}
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

            <div className="grid grid-cols-4 gap-2">
              <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-emerald-400">
                  {stats.terimaMantap}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Terima (+10%)
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-rose-400">
                  {stats.menyesal}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Nyesel (-12%)
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center">
                <span className="block font-mono font-extrabold text-lg text-amber-400">
                  {stats.kompromiSepakat}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Sepakat (+5%)
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-6">
              <button
                type="button"
                onClick={replaySameProfile}
                className="py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-sm border border-slate-700 btn-tactile"
              >
                🔄 Ganti Pasangan / Buat Kode Baru
              </button>
              <button
                type="button"
                onClick={fullResetGame}
                className="py-3.5 px-5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-extrabold text-sm shadow-lg shadow-rose-500/25 btn-tactile"
              >
                ✨ Main Ulang Dari Awal
              </button>
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
