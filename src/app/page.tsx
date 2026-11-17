"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { QuestionItem, build20QuestionsForProfile } from "./questions";

interface PlayerProfile {
  name: string;
  email: string;
  gender: "Laki-laki" | "Perempuan";
  age: number;
  questions: QuestionItem[];
  answers: Record<string, "iya" | "kayanya" | "engga">;
  emoji?: string;
  tier?: "young" | "mid" | "mature";
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

// Pola melodi & akor piano romantis (Fmaj7 -> Em7 -> Dm7 -> Cmaj7/G)
const ROMANTIC_BGM_STEPS: {
  bass?: number;
  chord?: number[];
  melody?: number;
  dur?: number;
}[] = [
  { bass: 174.61, chord: [261.63, 329.63], melody: 440.0, dur: 1.5 },
  { chord: [329.63], melody: 392.0, dur: 0.9 },
  { melody: 329.63, dur: 0.9 },
  { chord: [261.63], melody: 293.66, dur: 1.1 },
  { bass: 164.81, chord: [246.94, 293.66], melody: 392.0, dur: 1.5 },
  { chord: [293.66], melody: 493.88, dur: 0.9 },
  { melody: 587.33, dur: 1.1 },
  { chord: [246.94], melody: 493.88, dur: 0.9 },
  { bass: 146.83, chord: [220.0, 261.63], melody: 523.25, dur: 1.5 },
  { chord: [261.63], melody: 440.0, dur: 0.9 },
  { melody: 349.23, dur: 0.9 },
  { chord: [220.0], melody: 329.63, dur: 1.1 },
  { bass: 130.81, chord: [196.0, 246.94], melody: 329.63, dur: 1.4 },
  { melody: 392.0, dur: 0.9 },
  { bass: 123.47, chord: [196.0, 293.66], melody: 493.88, dur: 1.1 },
  { melody: 523.25, dur: 1.2 },
];

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

export default function BesokKawinGame() {
  // PWA Install Prompt State
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);

  // Audio FX & Romantic BGM State
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [bgmPlaying, setBgmPlaying] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgmStepRef = useRef(0);
  const bgmEnabledRef = useRef(true);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    bgmEnabledRef.current = bgmEnabled;
  }, [bgmEnabled]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

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
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) {
      showToast(
        "Gunakan menu browser (titik tiga) lalu pilih 'Add to Home Screen'.",
        "info"
      );
      return;
    }
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === "accepted") {
      showToast("Terima kasih telah menginstal Besok Kawin!", "success");
      setInstallPromptEvent(null);
    }
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

  const playPianoVoice = useCallback(
    (freq: number, dur: number, peakGain: number) => {
      const ctx = getOrCreateAudioContext();
      if (!ctx || ctx.state !== "running") return;

      const now = ctx.currentTime;
      const oscMain = ctx.createOscillator();
      const oscWarm = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      oscMain.type = "sine";
      oscMain.frequency.setValueAtTime(freq, now);

      oscWarm.type = "triangle";
      oscWarm.frequency.setValueAtTime(freq, now);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(920, now);
      filter.Q.setValueAtTime(0.8, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      const warmSubGain = ctx.createGain();
      warmSubGain.gain.setValueAtTime(0.32, now);

      oscMain.connect(filter);
      oscWarm.connect(warmSubGain);
      warmSubGain.connect(filter);

      filter.connect(gain);
      gain.connect(ctx.destination);

      oscMain.start(now);
      oscWarm.start(now);
      oscMain.stop(now + dur + 0.05);
      oscWarm.stop(now + dur + 0.05);
    },
    [getOrCreateAudioContext]
  );

  const stopRomanticBgm = useCallback(() => {
    if (bgmTimerRef.current) {
      clearInterval(bgmTimerRef.current);
      bgmTimerRef.current = null;
    }
    setBgmPlaying(false);
  }, []);

  const startRomanticBgm = useCallback(() => {
    if (!bgmEnabledRef.current) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    if (bgmTimerRef.current) return;

    const triggerStep = () => {
      if (!bgmEnabledRef.current) return;
      const activeCtx = getOrCreateAudioContext();
      if (!activeCtx || activeCtx.state !== "running") return;

      setBgmPlaying(true);
      const stepData =
        ROMANTIC_BGM_STEPS[bgmStepRef.current % ROMANTIC_BGM_STEPS.length];
      const dur = stepData.dur ?? 1.1;

      if (stepData.bass) {
        playPianoVoice(stepData.bass, dur * 1.35, 0.028);
      }
      if (stepData.chord) {
        stepData.chord.forEach((f) => playPianoVoice(f, dur * 1.2, 0.017));
      }
      if (stepData.melody) {
        playPianoVoice(stepData.melody, dur * 1.15, 0.032);
      }

      bgmStepRef.current =
        (bgmStepRef.current + 1) % ROMANTIC_BGM_STEPS.length;
    };

    triggerStep();
    bgmTimerRef.current = setInterval(triggerStep, 440);
  }, [getOrCreateAudioContext, playPianoVoice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlockAudio = () => {
      if (bgmEnabledRef.current) {
        startRomanticBgm();
      }
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [startRomanticBgm]);

  useEffect(() => {
    return () => stopRomanticBgm();
  }, [stopRomanticBgm]);

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
    } catch {
      // Ignore autoplay errors
    }
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
  const showToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };

  const toggleRomanticBgm = () => {
    const next = !bgmEnabled;
    setBgmEnabled(next);
    bgmEnabledRef.current = next;
    if (next) {
      startRomanticBgm();
      showToast("🎹 Musik latar romantis dinyalakan", "info");
    } else {
      stopRomanticBgm();
      showToast("🔇 Musik latar dimatikan", "info");
    }
  };

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
      showToast("Gagal menyalin otomatis, silakan salin manual.", "warning");
    }
    document.body.removeChild(ta);
  };

  const [screen, setScreen] = useState<
    "register" | "quiz" | "mode" | "game" | "ending"
  >("register");

  const goScreen = (next: typeof screen) => {
    setScreen(next);
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const [landingTab, setLandingTab] = useState<"new" | "invite">("new");
  const [inviteCode, setInviteCode] = useState("");
  const [inputJoinCode, setInputJoinCode] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regGender, setRegGender] = useState<"Laki-laki" | "Perempuan">(
    "Laki-laki"
  );
  const [regAge, setRegAge] = useState("");
  const [regError, setRegError] = useState<{
    title: string;
    text: string;
    key: number;
  } | null>(null);

  const [player1, setPlayer1] = useState<PlayerProfile | null>(null);
  const [player2, setPlayer2] = useState<PlayerProfile | null>(null);
  const [mode, setMode] = useState<"solo" | "couple">("solo");
  const [quizTarget, setQuizTarget] = useState<"player1" | "player2">(
    "player1"
  );
  const [quizIndex, setQuizIndex] = useState(0);

  const [botAgeSlider, setBotAgeSlider] = useState(25);

  const [battery, setBattery] = useState(50);
  const [deltaPop, setDeltaPop] = useState<{ val: number; key: number } | null>(
    null
  );
  const [shakeHud, setShakeHud] = useState(0);
  const [round, setRound] = useState(1);
  const maxRounds = 8;
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [gameStage, setGameStage] = useState<
    | "dilemma"
    | "consequence"
    | "negotiate-solo"
    | "negotiate-couple-1"
    | "negotiate-couple-2"
  >("dilemma");
  const [coupleP1Choice, setCoupleP1Choice] = useState<number | null>(null);
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

  const applyBatteryDelta = (delta: number) => {
    setBattery((prev) => Math.max(0, Math.min(100, prev + delta)));
    if (delta !== 0) {
      setDeltaPop({ val: delta, key: Date.now() + Math.random() });
      if (delta < 0) setShakeHud((prev) => prev + 1);
    }
  };

  useEffect(() => {
    if (screen !== "game" || !timerActive) return;
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
  }, [screen, timerActive, round]);

  const handleRegistration = (e: React.FormEvent) => {
    e.preventDefault();
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

    if (landingTab === "invite") {
      const code = inputJoinCode.trim().toUpperCase();
      if (!code || code.length < 4) {
        sfxPenalty();
        setRegError({
          title: "Kode Undangan Kosong!",
          text: "Masukkan kode undangan pasanganmu (atau klik tombol Kode Demo).",
          key: Date.now(),
        });
        return;
      }

      const hostQuestions = build20QuestionsForProfile("Laki-laki", 26);
      const hostAnswers: PlayerProfile["answers"] = {};
      hostQuestions.forEach((q, idx) => {
        hostAnswers[q.id] =
          idx % 3 === 0 ? "iya" : idx % 3 === 1 ? "kayanya" : "engga";
      });

      const simulatedHost: PlayerProfile = {
        name: "Arkan (Pengundang)",
        email: "arkan@host.id",
        gender: "Laki-laki",
        age: 26,
        questions: hostQuestions,
        answers: hostAnswers,
      };

      if (regGender === simulatedHost.gender) {
        sfxPenalty();
        setRegError({
          title:
            "Ditolak! Kode undangan hanya berlaku untuk pasangan lawan jenis.",
          text: `Kode ${code} dibuat oleh ${simulatedHost.name} (${simulatedHost.gender}). Kamu tidak bisa bergabung dengan jenis kelamin yang sama.`,
          key: Date.now(),
        });
        return;
      }

      sfxTap();
      setRegError(null);
      setInviteCode(code);
      setMode("couple");
      setPlayer1(simulatedHost);
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
      goScreen("quiz");
      return;
    }

    sfxTap();
    setRegError(null);
    setMode("solo");
    setInviteCode("KAWIN-" + Math.floor(100 + Math.random() * 899));
    setPlayer1({
      name: regName.trim(),
      email: regEmail.trim(),
      gender: regGender,
      age: ageNum,
      questions: build20QuestionsForProfile(regGender, ageNum),
      answers: {},
    });
    setPlayer2(null);
    setQuizTarget("player1");
    setQuizIndex(0);
    goScreen("quiz");
  };

  const answerQuiz = (choice: "iya" | "kayanya" | "engga") => {
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
      finishQuizPhase(updatedProfile);
    }
  };

  const finishQuizPhase = (completedProfile: PlayerProfile) => {
    if (quizTarget === "player2" && player1) {
      showToast(
        `Dek masalah ${completedProfile.name} siap! Memulai permainan pasangan...`,
        "success"
      );
      initMatchArena(player1, completedProfile, "couple");
      return;
    }
    goScreen("mode");
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

    setMode("solo");
    setPlayer2(botProfile);
    initMatchArena(player1, botProfile, "solo");
  };

  const initMatchArena = (
    p1: PlayerProfile,
    p2: PlayerProfile,
    matchMode: "solo" | "couple"
  ) => {
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
      if (matchMode === "solo") {
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

    setBattery(50);
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
    setDeck(matchDeck);
    setGameStage("dilemma");
    setTimerSeconds(60);
    setTimerActive(true);
    goScreen("game");
  };

  const advanceToNextRound = (projectedBattery: number) => {
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

  const handleTimeoutPenalty = () => {
    sfxPenalty();
    const currentCard = deck[round - 1];
    if (!currentCard) return;
    const responder =
      currentCard.responderKey === "player1" ? player1 : player2;
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
        outcomeLabel: `Timeout / AFK (${responder?.name || "Pemain"})`,
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
        setEndingReason("3x Timeout / Pasangan Ghosting Berturut-turut!");
        goScreen("ending");
      }, 900);
      return;
    }

    setTimeout(() => advanceToNextRound(nextBattery), 950);
  };

  const chooseAcceptCard = () => {
    sfxFlip();
    setConsecutiveTimeouts(0);
    setGameStage("consequence");
  };

  const resolveConsequence = (isFirm: boolean) => {
    setTimerActive(false);
    const currentCard = deck[round - 1];
    const responder =
      currentCard.responderKey === "player1" ? player1 : player2;

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
          outcomeLabel: `${responder?.name}: Terima Konsekuensi Mantap`,
          delta: 10,
          type: "good",
        },
      ]);
      showToast("Komitmen penuh! Baterai Cinta +10%", "success");
      setTimeout(() => advanceToNextRound(nextBattery), 800);
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
          outcomeLabel: `${responder?.name}: Menyesal Pilih Terima`,
          delta: -12,
          type: "bad",
        },
      ]);
      showToast("Asal mengiyakan lalu menyesal! Penalti berat -12%", "error");
      setTimeout(() => advanceToNextRound(nextBattery), 800);
    }
  };

  const chooseRejectCard = () => {
    sfxFlip();
    setConsecutiveTimeouts(0);
    setCoupleP1Choice(null);
    if (mode === "solo") setGameStage("negotiate-solo");
    else setGameStage("negotiate-couple-1");
  };

  const resolveSoloNegotiation = (playerIdx: number, botIdx: number) => {
    setTimerActive(false);
    const currentCard = deck[round - 1];
    const isAgreed = playerIdx === botIdx;

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
            65 + playerIdx
          )})`,
          delta: 5,
          type: "neutral",
        },
      ]);
      showToast(
        `Sepakat sama ${player2?.name} di Opsi ${String.fromCharCode(
          65 + playerIdx
        )}! Baterai +5%`,
        "success"
      );
      setTimeout(() => advanceToNextRound(nextBattery), 950);
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
            65 + playerIdx
          )}, ${player2?.name}: ${String.fromCharCode(65 + botIdx)})`,
          delta: -15,
          type: "bad",
        },
      ]);
      showToast(
        `Deadlock! Kamu pilih ${String.fromCharCode(65 + playerIdx)}, ${
          player2?.name
        } maunya ${String.fromCharCode(65 + botIdx)} (-15%)`,
        "error"
      );
      setTimeout(() => advanceToNextRound(nextBattery), 950);
    }
  };

  const resolveCoupleNegotiation = (partnerChoiceIdx: number) => {
    setTimerActive(false);
    const currentCard = deck[round - 1];
    const firstIdx = coupleP1Choice ?? 0;
    const isAgreed = firstIdx === partnerChoiceIdx;

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
            65 + firstIdx
          )})`,
          delta: 5,
          type: "neutral",
        },
      ]);
      showToast(
        `Kalian berdua sepakat di Opsi ${String.fromCharCode(
          65 + firstIdx
        )}! Baterai +5%`,
        "success"
      );
      setTimeout(() => advanceToNextRound(nextBattery), 950);
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
          outcomeLabel: `Tolak → Deadlock (${String.fromCharCode(
            65 + firstIdx
          )} vs ${String.fromCharCode(65 + partnerChoiceIdx)})`,
          delta: -15,
          type: "bad",
        },
      ]);
      showToast(
        `Beda pilihan kompromi (${String.fromCharCode(
          65 + firstIdx
        )} vs ${String.fromCharCode(65 + partnerChoiceIdx)})! Deadlock -15%`,
        "error"
      );
      setTimeout(() => advanceToNextRound(nextBattery), 950);
    }
  };

  const endingVerdict =
    battery >= 80
      ? {
          emoji: "💍",
          title: "BESOK KAWIN!",
          subtitle:
            "Red flag kalian berdua ternyata saling mengunci kayak puzzle! Kesiapan mental dan kompromi kalian udah matang. Langsung booking KUA dan sebar undangan!",
          border: "border-emerald-500/60 shadow-emerald-500/15",
          iconBg: "bg-emerald-500/20 border-emerald-500/40",
          badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
          titleClass:
            "text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-300 to-amber-300",
        }
      : battery >= 45
      ? {
          emoji: "⏳",
          title: "PACARAN DULU AJA",
          subtitle:
            "Rasa sayang sih ada, tapi masih banyak kompromi yang gantung dan ego yang belum kelar. Jangan buru-buru DP gedung — pacaran dulu aja sambil benerin komunikasi!",
          border: "border-amber-500/60 shadow-amber-500/10",
          iconBg: "bg-amber-500/20 border-amber-500/40",
          badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
          titleClass: "text-amber-400",
        }
      : {
          emoji: "🚨",
          title: "STOP THE WEDDING",
          subtitle: endingReason
            ? `${endingReason} Terlalu banyak deadlock dan penyesalan. Mending batalin sekarang daripada jadi drama di pengadilan agama!`
            : "Terlalu banyak penyesalan, deadlock ego, dan bom waktu kebiasaan buruk. Mending stop sekarang sebelum jadi beban pikiran seumur hidup!",
          border: "border-red-500/60 shadow-red-500/15",
          iconBg: "bg-red-500/20 border-red-500/40",
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

    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= 1080; x += 54) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1920);
      ctx.stroke();
    }
    for (let y = 0; y <= 1920; y += 54) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1080, y);
      ctx.stroke();
    }

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
      {
        label: "TERIMA MANTAP",
        val: `${stats.terimaMantap}x (+10%)`,
        color: "#10b981",
      },
      {
        label: "NYESEL TERIMA",
        val: `${stats.menyesal}x (-12%)`,
        color: "#f43f5e",
      },
      {
        label: "KOMPROMI SEPAKAT",
        val: `${stats.kompromiSepakat}x (+5%)`,
        color: "#f59e0b",
      },
      {
        label: "DEADLOCK / AFK",
        val: `${stats.deadlockOrAfk}x (-15%)`,
        color: "#ef4444",
      },
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
    showToast("📸 Kartu Hasil IG Story (PNG) berhasil diunduh!", "success");
  };

  const fullResetGame = () => {
    sfxTap();
    setTimerActive(false);
    setPlayer1(null);
    setPlayer2(null);
    setHistory([]);
    setRegName("");
    setRegEmail("");
    setRegAge("");
    setRegError(null);
    setLandingTab("new");
    goScreen("register");
  };

  const activeQuizProfile = quizTarget === "player1" ? player1 : player2;
  const activeQuizQuestion = activeQuizProfile?.questions[quizIndex];

  const p1Counts = { iya: 0, kayanya: 0, engga: 0 };
  const p1TopConfessions: { tag: string; text: string }[] = [];
  if (player1) {
    player1.questions.forEach((q) => {
      const ans = player1.answers[q.id];
      if (ans === "iya") {
        p1Counts.iya++;
        p1TopConfessions.push({ tag: "🔥 Masalah", text: q.statement });
      } else if (ans === "kayanya") {
        p1Counts.kayanya++;
        p1TopConfessions.push({ tag: "🤔 Wildcard", text: q.statement });
      } else {
        p1Counts.engga++;
      }
    });
  }

  const botOppositeGender =
    player1?.gender === "Laki-laki" ? "Perempuan" : "Laki-laki";
  const botPreview = getBotPersonaConfig(botOppositeGender, botAgeSlider);

  const currentCard = deck[round - 1];
  const currentResponder =
    currentCard?.responderKey === "player1" ? player1 : player2;
  const currentPartner =
    currentCard?.responderKey === "player1" ? player2 : player1;

  const responderConfessions =
    currentResponder?.questions.filter(
      (q) =>
        currentResponder.answers[q.id] === "iya" ||
        currentResponder.answers[q.id] === "kayanya"
    ) || [];
  const personalTrap =
    responderConfessions.length > 0
      ? responderConfessions[round % responderConfessions.length]
      : currentResponder?.questions[0];

  return (
    <div className="bg-grid-pattern min-h-[100dvh] h-[100dvh] overflow-hidden overscroll-none flex flex-col bg-[#090d16] text-slate-50 selection:bg-rose-500 selection:text-white">
      <style>{`
        html, body {
          height: 100%;
          overflow: hidden;
          overscroll-behavior: none;
        }
        .bg-grid-pattern {
          background-image: 
            radial-gradient(circle at 15% 15%, rgba(244, 63, 94, 0.12), transparent 35%),
            radial-gradient(circle at 85% 80%, rgba(16, 185, 129, 0.08), transparent 40%),
            linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 100% 100%, 100% 100%, 28px 28px, 28px 28px;
        }
        @keyframes cardEnter {
          0% { opacity: 0; transform: translateY(18px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cardFlipIn {
          0% { opacity: 0; transform: rotateY(-14deg) scale(0.95); }
          100% { opacity: 1; transform: rotateY(0deg) scale(1); }
        }
        @keyframes pulseShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes floatUpFade {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-28px) scale(1.15); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-card-enter { animation: cardEnter 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-card-flip { animation: cardFlipIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-shake { animation: pulseShake 0.4s ease-in-out; }
        .animate-delta { animation: floatUpFade 1.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .battery-shimmer::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent);
          animation: shimmer 2.2s infinite;
        }
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
      <header className="w-full shrink-0 border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur-md z-40">
        <div className="max-w-xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5 text-white"
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
                <span className="font-extrabold tracking-tight text-sm sm:text-lg text-white">
                  BESOK KAWIN?
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  18+
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 leading-none">
                Dating & Red Flag Card Game
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isAppInstalled && installPromptEvent && (
              <button
                onClick={handleInstallClick}
                className="px-2.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1 shadow-lg shadow-rose-500/25 transition btn-tactile"
              >
                <span>📱</span>
                <span className="hidden sm:inline">Install</span>
              </button>
            )}

            <button
              onClick={toggleRomanticBgm}
              title="Musik Latar Romantis"
              className={`px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                bgmEnabled
                  ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40"
                  : "bg-slate-800/80 hover:bg-slate-700 text-slate-400 border-slate-700/70"
              }`}
            >
              <span className={bgmEnabled && bgmPlaying ? "animate-pulse" : ""}>
                {bgmEnabled ? "🎹" : "🔇"}
              </span>
              <span className="hidden sm:inline">
                {bgmEnabled ? "BGM" : "Mute"}
              </span>
            </button>

            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                showToast(
                  next ? "Suara efek diaktifkan" : "Suara efek dimatikan",
                  "info"
                );
              }}
              title="Suara Efek"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70 transition"
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

      {/* TOAST CONTAINER */}
      <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md flex flex-col gap-2 pointer-events-none">
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

      {/* MAIN CONTAINER */}
      <main
        ref={mainScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-none w-full flex flex-col"
      >
        <div className="my-auto w-full max-w-xl mx-auto px-4 py-2 sm:py-4 flex flex-col justify-center">
          {/* ==================== SCREEN 1: REGISTER ==================== */}
          {screen === "register" && (
            <section className="animate-card-enter py-2">
              <div className="text-center mb-3 sm:mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-1.5">
                  <span>🔥</span> Uji Nyali Sebelum DP Gedung
                </span>
                <h1 className="text-lg sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
                  Buka Borokmu di Depan,
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-pink-500 to-amber-400">
                    Biar Nggak Nyesel di KUA.
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
                  Jawab 20 pengakuan jujur sesuai usia &amp; gendermu, hadapi kartu
                  masalah pasangan, dan ukur Baterai Cinta kalian.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-900/90 border border-slate-800 mb-2.5">
                <button
                  type="button"
                  onClick={() => {
                    sfxTap();
                    setLandingTab("new");
                    setRegError(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition ${
                    landingTab === "new"
                      ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Daftar Pemain Baru
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sfxTap();
                    setLandingTab("invite");
                    setRegError(null);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition ${
                    landingTab === "invite"
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Punya Kode Undangan?
                </button>
              </div>

              <div className="bg-[#111827]/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl">
                {landingTab === "invite" && (
                  <div className="mb-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                      Masukkan Kode Undangan Pasangan
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputJoinCode}
                        onChange={(e) => setInputJoinCode(e.target.value)}
                        placeholder="Contoh: KAWIN-729"
                        maxLength={12}
                        className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-sm font-mono font-bold uppercase text-white placeholder-slate-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          sfxTap();
                          setInputJoinCode("KAWIN-888");
                          showToast(
                            "Kode demo KAWIN-888 terpasang (Pengundang: Laki-laki, 26 thn).",
                            "info"
                          );
                        }}
                        className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 whitespace-nowrap"
                      >
                        Kode Demo
                      </button>
                    </div>
                  </div>
                )}

                {regError && (
                  <div
                    key={regError.key}
                    className="mb-3 p-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-200 animate-shake"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-sm">🚫</span>
                      </div>
                      <div>
                        <h3 className="text-xs font-extrabold text-red-400">
                          {regError.title}
                        </h3>
                        <p className="text-[11px] text-red-200/90 mt-0.5 leading-relaxed">
                          {regError.text}
                        </p>
                      </div>
                    </div>
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
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Misal: Raka / Nadya"
                      className="w-full bg-slate-950/90 border border-slate-700/90 focus:border-rose-500 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Email Aktif
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full bg-slate-950/90 border border-slate-700/90 focus:border-rose-500 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                            className={`py-2 px-2 rounded-xl border text-xs font-bold text-center transition ${
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
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Usia (Wajib 18+)
                      </label>
                      <input
                        type="number"
                        required
                        min={10}
                        max={80}
                        value={regAge}
                        onChange={(e) => setRegAge(e.target.value)}
                        placeholder="Contoh: 24"
                        className="w-full bg-slate-950/90 border border-slate-700/90 focus:border-rose-500 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-2 py-3 px-5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-extrabold text-sm shadow-lg shadow-rose-500/25 btn-tactile flex items-center justify-center gap-2"
                  >
                    <span>
                      {landingTab === "new"
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

          {/* ==================== SCREEN 2: QUIZ ==================== */}
          {screen === "quiz" && activeQuizProfile && activeQuizQuestion && (
            <section className="py-2">
              <div className="mb-2.5">
                <div className="flex items-center justify-between text-xs mb-1">
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
                    {quizIndex + 1}
                    <span className="text-slate-500">/20</span>
                  </span>
                </div>

                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 via-pink-500 to-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${((quizIndex + 1) / 20) * 100}%` }}
                  />
                </div>
              </div>

              <div
                key={`${quizTarget}-${quizIndex}`}
                className="bg-[#111827]/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl mb-2.5 animate-card-enter"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
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

                <blockquote className="text-sm sm:text-lg font-bold text-white leading-relaxed">
                  &ldquo;{activeQuizQuestion.statement}&rdquo;
                </blockquote>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => answerQuiz("iya")}
                  className="w-full py-2.5 px-3.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border-2 border-rose-500/60 hover:border-rose-500 text-left flex items-center justify-between group btn-tactile"
                >
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-rose-400 group-hover:text-rose-300">
                      🔥 Iya lagi
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      Setuju banget — masuk ke Dek Masalah Utama
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                    MASALAH
                  </span>
                </button>

                <button
                  onClick={() => answerQuiz("kayanya")}
                  className="w-full py-2.5 px-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border-2 border-amber-500/50 hover:border-amber-400 text-left flex items-center justify-between group btn-tactile"
                >
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-amber-400 group-hover:text-amber-300">
                      🤔 Kayanya sih
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      Ragu-ragu — masuk ke Dek Kartu Jebakan (Wildcard)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    WILDCARD
                  </span>
                </button>

                <button
                  onClick={() => answerQuiz("engga")}
                  className="w-full py-2.5 px-3.5 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border-2 border-slate-700/80 hover:border-slate-500 text-left flex items-center justify-between group btn-tactile"
                >
                  <div>
                    <span className="block text-xs sm:text-sm font-extrabold text-slate-200">
                      🛡️ Engga
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      Bukan gua banget — dibuang dari dek permainan
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-700 text-slate-400">
                    BUANG
                  </span>
                </button>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 3: MODE SELECTION ==================== */}
          {screen === "mode" && player1 && (
            <section className="animate-card-enter space-y-3 py-2">
              <div className="bg-[#111827]/95 border border-slate-800 rounded-3xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                      Hasil Profiling Jujur
                    </span>
                    <h2 className="text-sm sm:text-lg font-extrabold text-white">
                      Profil Borok & Red Flag{" "}
                      <span className="text-rose-400">{player1.name}</span>
                    </h2>
                  </div>
                  <span className="text-xs font-mono bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 border border-slate-700">
                    {player1.gender} • {player1.age} thn
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 my-2.5">
                  <div className="p-2 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-center">
                    <span className="block text-lg font-mono font-extrabold text-rose-400">
                      {p1Counts.iya}
                    </span>
                    <span className="text-[10px] font-bold text-slate-300">
                      Iya lagi
                    </span>
                  </div>
                  <div className="p-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center">
                    <span className="block text-lg font-mono font-extrabold text-amber-400">
                      {p1Counts.kayanya}
                    </span>
                    <span className="text-[10px] font-bold text-slate-300">
                      Kayanya
                    </span>
                  </div>
                  <div className="p-2 rounded-2xl bg-slate-800/70 border border-slate-700 text-center">
                    <span className="block text-lg font-mono font-extrabold text-slate-300">
                      {p1Counts.engga}
                    </span>
                    <span className="text-[10px] font-bold text-slate-300">
                      Engga
                    </span>
                  </div>
                </div>
              </div>

              {/* MODE A: SOLO AI */}
              <div className="bg-[#111827]/95 border-2 border-slate-800 hover:border-rose-500/50 rounded-3xl p-4 transition">
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-base shadow-lg shrink-0">
                    🤖
                  </div>
                  <div>
                    <h4 className="font-extrabold text-white text-sm">
                      Mode Solo — Lawan Bot AI
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Lawan jenis ({botOppositeGender}) • Baterai mulai 50%.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 mb-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-300">
                      Pilih Usia Bot AI:
                    </label>
                    <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      {botAgeSlider} Tahun
                    </span>
                  </div>
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
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 mt-2">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-sm shrink-0">
                      {botPreview.emoji}
                    </div>
                    <div className="min-w-0">
                      <span className="font-extrabold text-xs text-white">
                        {botPreview.name} ({botAgeSlider} thn) • {botPreview.vibe}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={startSoloGame}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-rose-500/25 btn-tactile"
                >
                  Mulai Main Lawan Bot AI →
                </button>
              </div>

              {/* MODE B: COUPLE */}
              <div className="bg-[#111827]/95 border-2 border-slate-800 hover:border-emerald-500/50 rounded-3xl p-4 transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-sm shadow-lg shrink-0">
                      💌
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-white text-xs">
                        Mode Ajak Pasangan
                      </h4>
                      <span className="font-mono font-extrabold text-xs text-emerald-400 tracking-wider">
                        {inviteCode}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      copyTextSafe(
                        inviteCode,
                        `Kode undangan ${inviteCode} disalin!`
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold shrink-0 btn-tactile"
                  >
                    Salin Kode
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ==================== SCREEN 4: GAMEPLAY ==================== */}
          {screen === "game" &&
            currentCard &&
            currentResponder &&
            currentPartner && (
              <section className="space-y-2.5 py-1">
                {/* BATERAI CINTA HUD */}
                <div
                  key={shakeHud}
                  className={`bg-[#111827]/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-3 shadow-xl relative overflow-visible ${
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">🔋</span>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                        Baterai Cinta
                      </span>
                    </div>
                    <span
                      className={`font-mono font-extrabold text-base sm:text-xl ${
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

                  <div className="flex items-center gap-1">
                    <div className="flex-1 h-4 bg-slate-950 rounded-lg border-2 border-slate-700 p-0.5 relative overflow-hidden">
                      <div
                        className={`h-full rounded transition-all duration-500 ease-out relative battery-shimmer bg-gradient-to-r ${
                          battery >= 80
                            ? "from-emerald-500 to-teal-400"
                            : battery >= 45
                            ? "from-amber-500 to-yellow-400"
                            : "from-red-600 to-rose-500"
                        }`}
                        style={{ width: `${battery}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/80 text-[11px]">
                    <span className="font-mono font-bold text-slate-300">
                      Ronde <span className="text-rose-400">{round}</span>/8 •{" "}
                      {currentResponder.name}
                    </span>
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded ${
                        timerSeconds <= 10
                          ? "bg-red-500/20 text-red-400 animate-pulse"
                          : "bg-slate-950 text-slate-300"
                      }`}
                    >
                      ⏱️ {timerSeconds}s
                    </span>
                  </div>
                </div>

                {/* STAGE 1: DILEMMA CARD */}
                {gameStage === "dilemma" && (
                  <div
                    key={`dilemma-${round}`}
                    className={`bg-[#111827]/95 backdrop-blur-xl border-2 ${
                      currentCard.isWildcard
                        ? "border-amber-500/50"
                        : "border-slate-800"
                    } rounded-3xl p-4 shadow-2xl animate-card-enter`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        {currentCard.category}
                      </span>
                      {currentCard.isWildcard && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ⚡ WILDCARD
                        </span>
                      )}
                    </div>

                    <div className="mb-2.5">
                      <p className="text-xs sm:text-base font-bold text-white leading-snug">
                        &ldquo;{currentCard.partnerPrompt}&rdquo;
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 mb-3 text-xs">
                      <span className="text-slate-300 font-semibold">
                        👉 {currentResponder.name}, siap hidup bareng sifat ini?
                      </span>
                    </div>

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
                          Cari Kompromi
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* STAGE 2A: CONSEQUENCE CARD */}
                {gameStage === "consequence" && (
                  <div className="bg-[#111827]/95 backdrop-blur-xl border-2 border-amber-500/60 rounded-3xl p-4 shadow-2xl animate-card-flip">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 mb-2">
                      ⚠️ KONSEKUENSI
                    </span>

                    <p className="text-xs sm:text-sm font-extrabold text-white leading-snug mb-3">
                      &ldquo;{currentCard.consequenceQuestion}&rdquo;
                    </p>

                    <div className="space-y-2">
                      <button
                        onClick={() => resolveConsequence(true)}
                        className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-extrabold text-xs flex items-center justify-between btn-tactile"
                      >
                        <span>💪 Tetap Terima</span>
                        <span className="font-mono bg-black/25 px-1.5 py-0.5 rounded text-emerald-200">
                          +10%
                        </span>
                      </button>

                      <button
                        onClick={() => resolveConsequence(false)}
                        className="w-full py-2.5 px-3 rounded-2xl bg-red-500/15 border-2 border-red-500/60 text-red-300 font-extrabold text-xs flex items-center justify-between btn-tactile"
                      >
                        <span>😰 Menyesal / Ragu</span>
                        <span className="font-mono bg-red-500/20 px-1.5 py-0.5 rounded text-red-300">
                          -12%
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* STAGE 2B: SOLO NEGOTIATION */}
                {gameStage === "negotiate-solo" && (
                  <div className="bg-[#111827]/95 backdrop-blur-xl border-2 border-rose-500/50 rounded-3xl p-4 shadow-2xl animate-card-flip">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 mb-2">
                      🤝 JALAN TENGAH
                    </span>

                    <p className="text-xs font-bold text-slate-300 mb-2">
                      Pilih 1 opsi kompromi dengan {currentPartner.name}:
                    </p>

                    <div className="space-y-1.5">
                      {currentCard.compromises.map((opt, idx) => {
                        const tier = currentPartner.tier || "mid";
                        const botPrefIdx = currentCard.botPref[tier] ?? 0;
                        return (
                          <button
                            key={idx}
                            onClick={() =>
                              resolveSoloNegotiation(idx, botPrefIdx)
                            }
                            className="w-full p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-left flex items-start gap-2 transition btn-tactile"
                          >
                            <span className="w-5 h-5 rounded bg-slate-800 border border-slate-600 flex items-center justify-center font-mono font-bold text-[10px] text-amber-400 shrink-0 mt-0.5">
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="text-[11px] sm:text-xs font-semibold text-slate-200 leading-snug">
                              {opt}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* STAGE 2C & 2D: COUPLE NEGOTIATION */}
                {gameStage === "negotiate-couple-1" && (
                  <div className="bg-[#111827]/95 backdrop-blur-xl border-2 border-rose-500/50 rounded-3xl p-4 shadow-2xl animate-card-flip">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-rose-500/20 text-rose-300 mb-2">
                      🤝 NEGOSIASI (1/2)
                    </span>
                    <p className="text-xs text-slate-300 mb-2">
                      {currentResponder.name}, pilih kompromi diam-diam:
                    </p>
                    <div className="space-y-1.5">
                      {currentCard.compromises.map((opt, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            sfxTap();
                            setCoupleP1Choice(idx);
                            setGameStage("negotiate-couple-2");
                          }}
                          className="w-full p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-left flex items-start gap-2 transition btn-tactile"
                        >
                          <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center font-mono font-bold text-[10px] text-rose-400 shrink-0">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="text-[11px] text-slate-200">
                            {opt}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {gameStage === "negotiate-couple-2" && (
                  <div className="bg-[#111827]/95 backdrop-blur-xl border-2 border-emerald-500/50 rounded-3xl p-4 shadow-2xl animate-card-flip">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-500/20 text-emerald-300 mb-2">
                      📲 GILIRAN {currentPartner.name.toUpperCase()} (2/2)
                    </span>
                    <p className="text-xs text-slate-300 mb-2">
                      {currentPartner.name}, pilih opsi yang sama agar sepakat:
                    </p>
                    <div className="space-y-1.5">
                      {currentCard.compromises.map((opt, idx) => (
                        <button
                          key={idx}
                          onClick={() => resolveCoupleNegotiation(idx)}
                          className="w-full p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-left flex items-start gap-2 transition btn-tactile"
                        >
                          <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center font-mono font-bold text-[10px] text-emerald-400 shrink-0">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="text-[11px] text-slate-200">
                            {opt}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

          {/* ==================== SCREEN 5: ENDING ==================== */}
          {screen === "ending" && player1 && player2 && (
            <section className="animate-card-enter space-y-3 py-2">
              <div
                className={`bg-[#111827]/95 border-2 rounded-3xl p-4 sm:p-5 text-center shadow-2xl ${endingVerdict.border}`}
              >
                <div
                  className={`w-12 h-12 mx-auto rounded-2xl border flex items-center justify-center text-2xl mb-2 ${endingVerdict.iconBg}`}
                >
                  {endingVerdict.emoji}
                </div>

                <span
                  className={`inline-block px-3 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase tracking-widest border mb-1 ${endingVerdict.badgeBg}`}
                >
                  BATERAI CINTA: {battery}%
                </span>

                <h1
                  className={`text-xl sm:text-3xl font-extrabold tracking-tight ${endingVerdict.titleClass}`}
                >
                  {endingVerdict.title}
                </h1>

                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed max-w-sm mx-auto">
                  {endingVerdict.subtitle}
                </p>
              </div>

              <button
                onClick={downloadStoryCardPNG}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 btn-tactile"
              >
                <span>📸 Unduh Kartu Hasil IG Story (PNG)</span>
              </button>

              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 pb-2">
                <button
                  onClick={() => {
                    sfxTap();
                    setTimerActive(false);
                    goScreen("mode");
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs border border-slate-700 btn-tactile"
                >
                  🔄 Ganti Pasangan / Mode
                </button>
                <button
                  onClick={fullResetGame}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:brightness-110 text-white font-extrabold text-xs shadow-lg shadow-rose-500/25 btn-tactile"
                >
                  ✨ Main Ulang Dari Awal
                </button>
              </div>
            </section>
          )}
        </div>

        {/* FOOTER */}
        <footer className="w-full pt-2 pb-1 text-center text-[10px] text-slate-600 shrink-0">
          BESOK KAWIN? • Dating & Red Flag Card Game
        </footer>
      </main>
    </div>
  );
}
