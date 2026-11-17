'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  Heart,
  Flame,
  ShieldAlert,
  Clock,
  Users,
  Bot,
  CheckCircle2,
  XCircle,
  Sparkles,
  Copy,
  RefreshCw,
  LogIn,
  LogOut,
  History,
} from 'lucide-react';
import {
  ActiveTurn,
  AnswerChoice,
  GameRoom,
  Gender,
  MatchHistoryItem,
  PlayerAnswer,
  PlayerProfile,
  QuestionItem,
  TurnLog,
} from '@/types/game';
import { getQuestionsForProfile } from '@/data/questions';
import {
  appendMatchHistory,
  createCoupleRoom,
  getUserProfileDoc,
  isFirebaseConfigured,
  joinCoupleRoom,
  loginWithEmail,
  loginWithGoogle,
  logoutAccount,
  mapAuthError,
  registerWithEmail,
  submitGuestAnswersAndStart,
  subscribeToAuth,
  subscribeToRoom,
  syncRoomState,
  upsertUserBasicProfile,
} from '@/lib/firebase';
import StoryCardGenerator from '@/components/StoryCardGenerator';

type ScreenStep = 'auth' | 'questions' | 'lobby' | 'playing' | 'ending';

function computeEnding(battery: number): NonNullable<GameRoom['ending']> {
  if (battery >= 80) {
    return {
      title: 'BESOK KAWIN',
      subtitle: 'Red flag kalian sudah saling mengunci. Siapin berkas KUA sekarang juga.',
    };
  }
  if (battery >= 45) {
    return {
      title: 'PACARAN DULU AJA',
      subtitle: 'Masih banyak kompromi yang menggantung. Jangan buru-buru DP gedung.',
    };
  }
  return {
    title: 'STOP THE WEDDING',
    subtitle: 'Terlalu banyak penyesalan dan deadlock. Bubar sebelum jadi beban pikiran.',
  };
}

function buildGameDeck(
  p1: PlayerProfile,
  p2: PlayerProfile
): { card: PlayerAnswer; ownerId: string }[] {
  const p1Cards = p1.answers
    .filter((a) => a.choice !== 'engga')
    .sort((a) => (a.choice === 'iya_lagi' ? -1 : 1))
    .slice(0, 4)
    .map((card) => ({ card, ownerId: p1.id }));

  const p2Cards = p2.answers
    .filter((a) => a.choice !== 'engga')
    .sort((a) => (a.choice === 'iya_lagi' ? -1 : 1))
    .slice(0, 4)
    .map((card) => ({ card, ownerId: p2.id }));

  const combined: { card: PlayerAnswer; ownerId: string }[] = [];
  const maxLen = Math.max(p1Cards.length, p2Cards.length, 1);

  for (let i = 0; i < maxLen; i++) {
    if (p2Cards[i]) combined.push(p2Cards[i]);
    if (p1Cards[i]) combined.push(p1Cards[i]);
  }

  if (combined.length === 0) {
    combined.push({ card: p2.answers[0], ownerId: p2.id });
    combined.push({ card: p1.answers[0], ownerId: p1.id });
  }

  return combined;
}

export default function BesokKawinApp() {
  const [step, setStep] = useState<ScreenStep>('auth');
  const [playTab, setPlayTab] = useState<'register' | 'join'>('register');

  // State Firebase Auth & Riwayat User
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historySavedFlag, setHistorySavedFlag] = useState(false);
  const savedMatchKeyRef = useRef<string | null>(null);

  // Form Profil Bermain
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<Gender>('Laki-laki');
  const [age, setAge] = useState<string>('24');
  const [inviteInput, setInviteInput] = useState('');
  const [formError, setFormError] = useState('');

  // State Pemain Lokal & 20 Pertanyaan
  const [localPlayer, setLocalPlayer] = useState<PlayerProfile | null>(null);
  const [questionList, setQuestionList] = useState<QuestionItem[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [collectedAnswers, setCollectedAnswers] = useState<PlayerAnswer[]>([]);

  // State Room & Gameplay
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [botAge, setBotAge] = useState<number>(23);
  const [loadingAI, setLoadingAI] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [botVoteMemory, setBotVoteMemory] = useState<number>(0);

  // Pantau status Login Firebase & tarik data profil + riwayat dari Firestore
  useEffect(() => {
    const unsub = subscribeToAuth(async (user) => {
      setAuthUser(user);
      if (user) {
        setEmail(user.email || '');
        if (user.displayName) {
          setName((prev) => prev || user.displayName || '');
        }
        const docData = await getUserProfileDoc(user.uid);
        if (docData) {
          if (docData.name) setName(docData.name);
          if (docData.gender) setGender(docData.gender);
          if (docData.age) setAge(String(docData.age));
          if (Array.isArray(docData.history)) {
            setMatchHistory([...docData.history].reverse());
          }
        }
      } else {
        setMatchHistory([]);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe ke Firestore jika mode multiplayer
  useEffect(() => {
    if (!room || room.mode !== 'couple') return;
    const unsub = subscribeToRoom(room.roomCode, (updatedRoom) => {
      setRoom(updatedRoom);
      if (updatedRoom.status === 'playing' && step !== 'playing') {
        setStep('playing');
      }
      if (updatedRoom.status === 'finished' && step !== 'ending') {
        setStep('ending');
      }
    });
    return () => unsub();
  }, [room?.roomCode, room?.mode, step]);

  // Simpan otomatis riwayat pertandingan ke users/{uid} saat mencapai Ending
  useEffect(() => {
    if (step !== 'ending' || !room?.ending || !authUser || !localPlayer) return;

    const matchKey = `${room.roomCode}_${room.logs.length}_${room.loveBattery}`;
    if (savedMatchKeyRef.current === matchKey) return;
    savedMatchKeyRef.current = matchKey;

    const partner = room.host.id === localPlayer.id ? room.guest : room.host;

    const newItem: MatchHistoryItem = {
      id: `match_${Date.now()}`,
      roomCode: room.roomCode,
      mode: room.mode,
      partnerName: partner ? partner.name : 'Bot AI',
      partnerAge: partner ? partner.age : room.botAge || 24,
      loveBattery: room.loveBattery,
      endingTitle: room.ending.title,
      endingSubtitle: room.ending.subtitle,
      totalRounds: room.logs.length,
      playedAt: Date.now(),
    };

    appendMatchHistory(authUser.uid, newItem).then(() => {
      setHistorySavedFlag(true);
      setMatchHistory((prev) => [newItem, ...prev]);
    });
  }, [step, room, authUser, localPlayer]);

  // HANDLER AUTH: GOOGLE & EMAIL
  const handleGoogleSignIn = async () => {
    setAuthMessage('');
    setAuthLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setAuthMessage(mapAuthError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage('');
    if (!authEmail.trim() || !authPassword) {
      setAuthMessage('Isi email dan password terlebih dahulu.');
      return;
    }
    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        await loginWithEmail(authEmail, authPassword);
      } else {
        await registerWithEmail(authEmail, authPassword);
      }
      setAuthPassword('');
    } catch (err) {
      setAuthMessage(mapAuthError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  // 1. VALIDASI PENDAFTARAN BERMAIN & KODE UNDANGAN (WAJIB 18+ & LAWAN JENIS)
  const handleStartProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const numericAge = parseInt(age, 10);
    const activeEmail = authUser?.email || email.trim();

    if (!name.trim() || !activeEmail) {
      setFormError('Nama panggilan dan email wajib diisi.');
      return;
    }
    if (isNaN(numericAge) || numericAge < 18) {
      setFormError('Akses ditolak: Aplikasi ini khusus pengguna berusia 18 tahun ke atas.');
      return;
    }

    const playerId =
      authUser?.uid || `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (authUser) {
      await upsertUserBasicProfile(authUser.uid, {
        email: activeEmail,
        name: name.trim(),
        gender,
        age: numericAge,
      });
    }

    const baseProfile: PlayerProfile = {
      id: playerId,
      name: name.trim(),
      email: activeEmail,
      gender,
      age: numericAge,
      answers: [],
      isReady: false,
    };

    if (playTab === 'join') {
      if (!inviteInput.trim()) {
        setFormError('Masukkan kode undangan dari pasanganmu.');
        return;
      }
      const res = await joinCoupleRoom(inviteInput, baseProfile);
      if (!res.ok || !res.room) {
        setFormError(res.error || 'Gagal bergabung ke room.');
        return;
      }
      setRoom(res.room);
    }

    savedMatchKeyRef.current = null;
    setHistorySavedFlag(false);
    setLocalPlayer(baseProfile);
    setQuestionList(getQuestionsForProfile(gender, numericAge));
    setQIndex(0);
    setCollectedAnswers([]);
    setStep('questions');
  };

  // 2. MENJAWAB 20 PERTANYAAN KEHIDUPAN
  const handleAnswerQuestion = async (choice: AnswerChoice) => {
    if (!localPlayer) return;
    const currentQ = questionList[qIndex];
    const newEntry: PlayerAnswer = {
      questionId: currentQ.id,
      statement: currentQ.statement,
      category: currentQ.category,
      consequenceSeed: currentQ.consequenceSeed,
      choice,
    };

    const updated = [...collectedAnswers, newEntry];
    setCollectedAnswers(updated);

    if (qIndex + 1 < questionList.length) {
      setQIndex(qIndex + 1);
      return;
    }

    const finishedPlayer: PlayerProfile = {
      ...localPlayer,
      answers: updated,
      isReady: true,
    };
    setLocalPlayer(finishedPlayer);

    if (room && room.mode === 'couple' && room.host.id !== finishedPlayer.id) {
      const deck = buildGameDeck(room.host, finishedPlayer);
      const firstCard = deck[0];
      const firstTurn: ActiveTurn = {
        round: 1,
        activePlayerId: firstCard.ownerId === room.host.id ? finishedPlayer.id : room.host.id,
        sourcePlayerId: firstCard.ownerId,
        card: firstCard.card,
        phase: 'decision',
        votes: {},
        turnStartedAt: Date.now(),
      };

      const startedRoom: GameRoom = {
        ...room,
        guest: finishedPlayer,
        status: 'playing',
        deck,
        currentTurn: firstTurn,
      };
      setRoom(startedRoom);
      await submitGuestAnswersAndStart(room.roomCode, updated, {
        status: 'playing',
        deck,
        currentTurn: firstTurn,
      });
      setStep('playing');
    } else {
      setStep('lobby');
    }
  };

  // 3A. MULAI MODE SOLO VS BOT AI
  const handleStartSolo = async () => {
    if (!localPlayer) return;
    setLoadingAI(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_bot',
          userProfile: localPlayer,
          botAge,
        }),
      });
      const data = await res.json();
      const botProfile: PlayerProfile = {
        id: 'ai_bot',
        name: data.botName,
        email: 'bot@besokkawin.ai',
        gender: data.botGender,
        age: botAge,
        answers: data.answers,
        isReady: true,
      };

      const soloDeck = botProfile.answers
        .filter((a) => a.choice !== 'engga')
        .slice(0, 6)
        .map((card) => ({ card, ownerId: botProfile.id }));

      const deckToUse =
        soloDeck.length > 0 ? soloDeck : [{ card: botProfile.answers[0], ownerId: botProfile.id }];

      const newRoom: GameRoom = {
        roomCode: 'SOLO-AI',
        mode: 'solo',
        status: 'playing',
        loveBattery: 50,
        consecutiveTimeouts: 0,
        host: localPlayer,
        guest: botProfile,
        botAge,
        deck: deckToUse,
        currentTurn: {
          round: 1,
          activePlayerId: localPlayer.id,
          sourcePlayerId: botProfile.id,
          card: deckToUse[0].card,
          phase: 'decision',
          votes: {},
          turnStartedAt: Date.now(),
        },
        logs: [],
      };
      setRoom(newRoom);
      setStep('playing');
    } finally {
      setLoadingAI(false);
    }
  };

  // 3B. BUAT KODE UNDANGAN PASANGAN
  const handleCreateInvite = async () => {
    if (!localPlayer) return;
    const created = await createCoupleRoom(localPlayer);
    setRoom(created);
  };

  // HELPER PINDAH RONDE / SELESAI GAME
  const advanceRound = useCallback(
    async (
      currentRoom: GameRoom,
      delta: number,
      action: TurnLog['action'],
      note: string,
      isTimeout = false
    ) => {
      if (!currentRoom.currentTurn || !currentRoom.guest) return;

      const nextBattery = Math.max(0, Math.min(100, currentRoom.loveBattery + delta));
      const nextTimeouts = isTimeout ? currentRoom.consecutiveTimeouts + 1 : 0;
      const actorName =
        currentRoom.currentTurn.activePlayerId === currentRoom.host.id
          ? currentRoom.host.name
          : currentRoom.guest.name;

      const newLog: TurnLog = {
        round: currentRoom.currentTurn.round,
        actorName,
        cardStatement: currentRoom.currentTurn.card.statement,
        action,
        delta,
        note,
      };

      const updatedLogs = [...currentRoom.logs, newLog];
      const nextIndex = currentRoom.currentTurn.round;

      if (nextTimeouts >= 3 || nextIndex >= currentRoom.deck.length) {
        const finalBattery = nextTimeouts >= 3 ? Math.min(nextBattery, 30) : nextBattery;
        const ending = computeEnding(finalBattery);
        const finishedRoom: GameRoom = {
          ...currentRoom,
          loveBattery: finalBattery,
          consecutiveTimeouts: nextTimeouts,
          logs: updatedLogs,
          status: 'finished',
          currentTurn: null,
          ending,
        };
        setRoom(finishedRoom);
        if (currentRoom.mode === 'couple') {
          await syncRoomState(currentRoom.roomCode, {
            loveBattery: finalBattery,
            consecutiveTimeouts: nextTimeouts,
            logs: updatedLogs,
            status: 'finished',
            currentTurn: null,
            ending,
          });
        }
        setStep('ending');
        return;
      }

      const nextCardItem = currentRoom.deck[nextIndex];
      const nextActorId =
        nextCardItem.ownerId === currentRoom.host.id
          ? currentRoom.guest.id
          : currentRoom.host.id;

      const nextTurn: ActiveTurn = {
        round: nextIndex + 1,
        activePlayerId: nextActorId,
        sourcePlayerId: nextCardItem.ownerId,
        card: nextCardItem.card,
        phase: 'decision',
        votes: {},
        turnStartedAt: Date.now(),
      };

      const nextRoom: GameRoom = {
        ...currentRoom,
        loveBattery: nextBattery,
        consecutiveTimeouts: nextTimeouts,
        logs: updatedLogs,
        currentTurn: nextTurn,
      };

      setRoom(nextRoom);
      if (currentRoom.mode === 'couple') {
        await syncRoomState(currentRoom.roomCode, {
          loveBattery: nextBattery,
          consecutiveTimeouts: nextTimeouts,
          logs: updatedLogs,
          currentTurn: nextTurn,
        });
      }
    },
    []
  );

  // TIMER 60 DETIK ANTI-AFK
  useEffect(() => {
    if (step !== 'playing' || !room?.currentTurn) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - room.currentTurn!.turnStartedAt) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        advanceRound(
          room,
          -15,
          'timeout',
          'Waktu habis (60 detik)! Dihitung otomatis sebagai Tolak & Gagal Kompromi.',
          true
        );
      }
    }, 500);

    return () => clearInterval(interval);
  }, [step, room, advanceRound]);

  // AKSI 1: KLIK "TERIMA"
  const handleChooseTerima = async () => {
    if (!room?.currentTurn || !localPlayer) return;
    setLoadingAI(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_consequence',
          actorAnswers: localPlayer.answers,
          card: room.currentTurn.card,
        }),
      });
      const data = await res.json();

      const updatedTurn: ActiveTurn = {
        ...room.currentTurn,
        phase: 'consequence',
        consequenceText: data.consequenceText,
        turnStartedAt: Date.now(),
      };
      setRoom({ ...room, currentTurn: updatedTurn });
      if (room.mode === 'couple') {
        await syncRoomState(room.roomCode, { currentTurn: updatedTurn });
      }
    } finally {
      setLoadingAI(false);
    }
  };

  // AKSI 2: KLIK "TOLAK"
  const handleChooseTolak = async () => {
    if (!room?.currentTurn) return;
    setLoadingAI(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_compromise',
          card: room.currentTurn.card,
          botAge: room.botAge,
        }),
      });
      const data = await res.json();
      setBotVoteMemory(data.botVoteIndex ?? 0);

      const updatedTurn: ActiveTurn = {
        ...room.currentTurn,
        phase: 'negotiating',
        compromiseOptions: data.options,
        votes: {},
        turnStartedAt: Date.now(),
      };
      setRoom({ ...room, currentTurn: updatedTurn });
      if (room.mode === 'couple') {
        await syncRoomState(room.roomCode, { currentTurn: updatedTurn });
      }
    } finally {
      setLoadingAI(false);
    }
  };

  // AKSI 3: VOTE JALAN TENGAH
  const handleVoteCompromise = async (optionIdx: number) => {
    if (!room?.currentTurn || !localPlayer || !room.guest) return;

    if (room.mode === 'solo') {
      const agreed = optionIdx === botVoteMemory;
      await advanceRound(
        room,
        agreed ? 5 : -15,
        agreed ? 'tolak_sepakat' : 'tolak_deadlock',
        agreed
          ? `Sepakat jalan tengah: "${room.currentTurn.compromiseOptions?.[optionIdx]}"`
          : `Deadlock! Kamu dan ${room.guest.name} memilih kompromi yang berbeda.`
      );
      return;
    }

    const updatedVotes = {
      ...room.currentTurn.votes,
      [localPlayer.id]: optionIdx,
    };

    const hostVote = updatedVotes[room.host.id];
    const guestVote = updatedVotes[room.guest.id];

    if (hostVote !== undefined && guestVote !== undefined) {
      const agreed = hostVote === guestVote;
      await advanceRound(
        room,
        agreed ? 5 : -15,
        agreed ? 'tolak_sepakat' : 'tolak_deadlock',
        agreed
          ? `Sepakat jalan tengah: "${room.currentTurn.compromiseOptions?.[optionIdx]}"`
          : 'Deadlock! Pilihan jalan tengah kalian berdua tidak cocok.'
      );
    } else {
      const updatedTurn: ActiveTurn = {
        ...room.currentTurn,
        votes: updatedVotes,
      };
      setRoom({ ...room, currentTurn: updatedTurn });
      await syncRoomState(room.roomCode, { currentTurn: updatedTurn });
    }
  };

  const resetToLobbyOrHome = () => {
    setRoom(null);
    setStep('auth');
  };

  // ==================== RENDER UI ====================

  // SCREEN 1: AUTH (GOOGLE / EMAIL) + FORM PROFIL 18+ + RIWAYAT MAIN
  if (step === 'auth') {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-rose-500 font-bold text-xs uppercase tracking-wider">
                <Flame className="w-4 h-4" /> 18+ Relationship Reality Game
              </div>
              {authUser && (
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-amber-300 transition"
                >
                  <History className="w-3.5 h-3.5" /> Riwayat ({matchHistory.length})
                </button>
              )}
            </div>

            <h1 className="text-3xl font-black tracking-tight mb-1">BESOK KAWIN?</h1>
            <p className="text-zinc-400 text-xs mb-5">
              Buka semua borok dan red flag sebelum terlanjur sebar undangan.
            </p>

            {/* BLOK FIREBASE AUTHENTICATION */}
            {isFirebaseConfigured && (
              <div className="mb-5 p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                {authUser ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-emerald-400 font-bold uppercase">
                        Akun Terhubung (Riwayat Tersimpan)
                      </p>
                      <p className="text-xs text-zinc-300 truncate">{authUser.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={logoutAccount}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 flex items-center gap-1 shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Keluar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={handleGoogleSignIn}
                      className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 transition"
                    >
                      <LogIn className="w-4 h-4" /> Masuk dengan Google
                    </button>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase">
                      <div className="h-px bg-zinc-800 flex-1" />
                      <span>atau pakai email</span>
                      <div className="h-px bg-zinc-800 flex-1" />
                    </div>

                    <form onSubmit={handleEmailAuth} className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="email"
                          placeholder="Email akun"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-rose-500"
                        />
                        <input
                          type="password"
                          placeholder="Password (min. 6)"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-rose-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={authLoading}
                          onClick={() => setAuthMode('login')}
                          className="flex-1 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold transition"
                        >
                          Masuk Email
                        </button>
                        <button
                          type="submit"
                          disabled={authLoading}
                          onClick={() => setAuthMode('signup')}
                          className="flex-1 py-2 rounded-lg bg-rose-950/70 hover:bg-rose-900/70 border border-rose-800/50 text-rose-200 text-xs font-bold transition"
                        >
                          Daftar Akun
                        </button>
                      </div>
                    </form>

                    {authMessage && (
                      <p className="text-[11px] text-rose-400">{authMessage}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PANEL RIWAYAT MAIN */}
            {authUser && showHistory && (
              <div className="mb-5 p-4 rounded-2xl bg-zinc-950 border border-amber-500/30 space-y-2 max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 uppercase">
                    Riwayat Skor & Ending
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300"
                  >
                    Tutup
                  </button>
                </div>
                {matchHistory.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">
                    Belum ada riwayat main. Selesaikan 1 sesi untuk menyimpan skor.
                  </p>
                ) : (
                  matchHistory.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-bold truncate">
                          vs {m.partnerName} ({m.mode === 'solo' ? 'Solo AI' : 'Couple'})
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {m.endingTitle} •{' '}
                          {new Date(m.playedAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <span
                        className={`font-mono font-black text-sm shrink-0 ${
                          m.loveBattery >= 80
                            ? 'text-emerald-400'
                            : m.loveBattery >= 45
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {m.loveBattery}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB MODE MULAI BERMAIN */}
            <div className="grid grid-cols-2 bg-zinc-950 p-1 rounded-xl mb-4 border border-zinc-800">
              <button
                type="button"
                onClick={() => setPlayTab('register')}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  playTab === 'register' ? 'bg-rose-600 text-white' : 'text-zinc-400'
                }`}
              >
                Mulai Sesi Baru
              </button>
              <button
                type="button"
                onClick={() => setPlayTab('join')}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  playTab === 'join' ? 'bg-rose-600 text-white' : 'text-zinc-400'
                }`}
              >
                Punya Kode Undangan
              </button>
            </div>

            <form onSubmit={handleStartProfile} className="space-y-3.5">
              {playTab === 'join' && (
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    KODE UNDANGAN PASANGAN
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Contoh: KWN842"
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                    className="w-full bg-zinc-950 border border-rose-500/50 rounded-xl px-4 py-2.5 font-mono text-base tracking-widest uppercase focus:outline-none focus:border-rose-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                  NAMA PANGGILAN
                </label>
                <input
                  type="text"
                  placeholder="Nama panggilanmu"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
                />
              </div>

              {!authUser && (
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    EMAIL (MODE TAMU)
                  </label>
                  <input
                    type="email"
                    placeholder="email@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    JENIS KELAMIN
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500"
                  >
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                    USIA (MIN. 18)
                  </label>
                  <input
                    type="number"
                    min={12}
                    max={70}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-rose-600/20"
              >
                {playTab === 'join'
                  ? 'Gabung & Jawab 20 Pertanyaan'
                  : 'Lanjut Jawab 20 Pertanyaan'}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 2: 20 PERTANYAAN KEHIDUPAN
  if (step === 'questions' && questionList[qIndex]) {
    const currentQ = questionList[qIndex];
    const progress = ((qIndex + 1) / questionList.length) * 100;

    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex justify-between text-xs text-zinc-400 mb-2">
            <span>
              Pertanyaan {qIndex + 1} dari {questionList.length}
            </span>
            <span className="text-rose-400 font-semibold">{currentQ.category}</span>
          </div>
          <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-rose-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7 min-h-[240px] flex flex-col justify-between shadow-xl mb-6">
            <span className="inline-block w-fit text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300">
              Pengakuan Jujur
            </span>
            <p className="text-xl font-bold leading-snug my-4">&ldquo;{currentQ.statement}&rdquo;</p>
            <p className="text-xs text-zinc-500">
              Jawaban jujurmu menentukan kartu dilema yang akan dihadapi pasanganmu.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleAnswerQuestion('iya_lagi')}
              className="w-full py-3.5 px-5 rounded-2xl bg-rose-600 hover:bg-rose-500 font-bold text-left flex justify-between items-center transition"
            >
              <span>Iya lagi</span>
              <span className="text-xs font-normal text-rose-200">Setuju banget</span>
            </button>
            <button
              onClick={() => handleAnswerQuestion('kayanya_sih')}
              className="w-full py-3.5 px-5 rounded-2xl bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-200 font-bold text-left flex justify-between items-center transition"
            >
              <span>Kayanya sih</span>
              <span className="text-xs font-normal text-amber-300/80">Ragu / kadang-kadang</span>
            </button>
            <button
              onClick={() => handleAnswerQuestion('engga')}
              className="w-full py-3.5 px-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-bold text-left flex justify-between items-center transition"
            >
              <span>Engga</span>
              <span className="text-xs font-normal text-zinc-500">Bukan gua banget</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 3: PILIH MODE (SOLO BOT AI VS AJAK PASANGAN)
  if (step === 'lobby' && localPlayer) {
    const oppositeGender: Gender = localPlayer.gender === 'Laki-laki' ? 'Perempuan' : 'Laki-laki';

    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <h2 className="text-xl font-black mb-1">20 Pengakuan Terkunci</h2>
            <p className="text-xs text-zinc-400 mb-5">
              Pilih mau uji mental lawan Bot AI atau ajak pasangan aslimu.
            </p>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 mb-4">
              <div className="flex items-center gap-2 font-bold text-rose-400 mb-2">
                <Bot className="w-5 h-5" /> Main Sendiri (Bot AI {oppositeGender})
              </div>
              <p className="text-xs text-zinc-400 mb-3">
                Bot akan membentuk masalah hidupnya sendiri berdasarkan 20 jawabanmu.
              </p>
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-xs text-zinc-300">Pilih Usia Bot AI:</span>
                <input
                  type="number"
                  min={18}
                  max={45}
                  value={botAge}
                  onChange={(e) => setBotAge(Math.max(18, parseInt(e.target.value || '18', 10)))}
                  className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-center font-bold text-sm"
                />
              </div>
              <button
                disabled={loadingAI}
                onClick={handleStartSolo}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-sm transition disabled:opacity-50"
              >
                {loadingAI ? 'Menyiapkan Persona Bot AI...' : 'Mulai Main Lawan Bot AI'}
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
              <div className="flex items-center gap-2 font-bold text-emerald-400 mb-2">
                <Users className="w-5 h-5" /> Ajak Pasangan (Wajib {oppositeGender})
              </div>
              {!room ? (
                <button
                  onClick={handleCreateInvite}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-sm transition"
                >
                  Buat Kode Undangan Pasangan
                </button>
              ) : (
                <div className="text-center space-y-2 py-2">
                  <p className="text-xs text-zinc-400">Kirim kode ini ke pasanganmu:</p>
                  <div className="flex items-center justify-center gap-2 bg-zinc-900 border border-emerald-500/40 rounded-xl py-3 px-4">
                    <span className="font-mono text-2xl font-black tracking-widest text-emerald-400">
                      {room.roomCode}
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(room.roomCode)}
                      className="p-1.5 text-zinc-400 hover:text-white"
                      title="Salin Kode"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-amber-400 animate-pulse">
                    Menunggu pasangan masuk & menjawab 20 pertanyaan...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 4: ARENA BERMAIN & BATERAI CINTA
  if (step === 'playing' && room && room.currentTurn && localPlayer && room.guest) {
    const turn = room.currentTurn;
    const isMyTurnToDecide = turn.activePlayerId === localPlayer.id;
    const partnerName = room.host.id === localPlayer.id ? room.guest.name : room.host.name;

    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex justify-between items-center text-xs mb-2">
              <span className="font-bold flex items-center gap-1.5 text-rose-400">
                <Heart className="w-4 h-4 fill-rose-500" /> Baterai Cinta: {room.loveBattery}%
              </span>
              <span
                className={`font-mono font-bold flex items-center gap-1 ${
                  timeLeft <= 15 ? 'text-red-400 animate-pulse' : 'text-zinc-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> {timeLeft}s
              </span>
            </div>
            <div className="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
              <div
                className={`h-full transition-all duration-500 ${
                  room.loveBattery >= 80
                    ? 'bg-emerald-500'
                    : room.loveBattery >= 45
                    ? 'bg-amber-500'
                    : 'bg-rose-600'
                }`}
                style={{ width: `${room.loveBattery}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-zinc-500 mt-1.5">
              <span>
                Ronde {turn.round} / {room.deck.length}
              </span>
              <span>Lawan: {partnerName}</span>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-800/50">
                Masalah {partnerName} • {turn.card.category}
              </span>
              <span className="text-xs text-zinc-500">
                {turn.card.choice === 'iya_lagi' ? 'Red Flag Utama' : 'Wildcard'}
              </span>
            </div>

            <p className="text-lg font-bold leading-relaxed mb-4">
              &ldquo;{turn.card.statement}&rdquo;
            </p>

            {turn.phase === 'decision' && (
              <>
                {isMyTurnToDecide ? (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      disabled={loadingAI}
                      onClick={handleChooseTerima}
                      className="py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-black flex items-center justify-center gap-2 transition"
                    >
                      <CheckCircle2 className="w-5 h-5" /> Terima
                    </button>
                    <button
                      disabled={loadingAI}
                      onClick={handleChooseTolak}
                      className="py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black flex items-center justify-center gap-2 transition"
                    >
                      <XCircle className="w-5 h-5" /> Tolak
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-sm text-amber-400 py-4 animate-pulse">
                    Menunggu {partnerName} memutuskan Terima atau Tolak...
                  </p>
                )}
              </>
            )}

            {turn.phase === 'consequence' && (
              <div className="mt-2 p-4 rounded-2xl bg-amber-950/40 border border-amber-700/50 space-y-4">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase">
                  <ShieldAlert className="w-4 h-4" /> Konsekuensi Kehidupanmu
                </div>
                <p className="text-sm text-amber-100 leading-relaxed">{turn.consequenceText}</p>
                {isMyTurnToDecide ? (
                  <div className="space-y-2">
                    <button
                      onClick={() =>
                        advanceRound(
                          room,
                          10,
                          'terima_mantap',
                          'Tetap menerima masalah pasangan beserta konsekuensinya (+10%).'
                        )
                      }
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs"
                    >
                      Tetap Terima & Tanggung (+10% Baterai)
                    </button>
                    <button
                      onClick={() =>
                        advanceRound(
                          room,
                          -12,
                          'terima_menyesal',
                          'Ragu dan menyesal setelah melihat konsekuensi (-12%).'
                        )
                      }
                      className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-rose-300 font-bold text-xs"
                    >
                      Ragu / Nyesel Pilih Terima (-12% Baterai)
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 text-center">
                    {partnerName} sedang menimbang konsekuensi...
                  </p>
                )}
              </div>
            )}

            {turn.phase === 'negotiating' && turn.compromiseOptions && (
              <div className="mt-2 p-4 rounded-2xl bg-indigo-950/40 border border-indigo-700/50 space-y-3">
                <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase">
                  <Sparkles className="w-4 h-4" /> Ditolak! Pilih Jalan Tengah yang Sama
                </div>
                <p className="text-xs text-zinc-300">
                  Sepakat (+5% baterai) • Beda pilihan / Deadlock (-15% baterai)
                </p>
                {turn.votes[localPlayer.id] !== undefined ? (
                  <p className="text-xs text-emerald-400 font-semibold py-2">
                    Pilihanmu terkunci. Menunggu pilihan {partnerName}...
                  </p>
                ) : (
                  <div className="space-y-2">
                    {turn.compromiseOptions.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleVoteCompromise(idx)}
                        className="w-full text-left p-3 rounded-xl bg-zinc-950 hover:bg-indigo-900/40 border border-zinc-800 text-xs leading-relaxed transition"
                      >
                        {idx + 1}. {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // SCREEN 5: HASIL AKHIR + STORY CARD GENERATOR + STATUS SIMPAN RIWAYAT
  if (step === 'ending' && room?.ending) {
    const badgeColor =
      room.ending.title === 'BESOK KAWIN'
        ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30'
        : room.ending.title === 'PACARAN DULU AJA'
        ? 'text-amber-400 border-amber-500/40 bg-amber-950/30'
        : 'text-rose-500 border-rose-500/40 bg-rose-950/30';

    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5 shadow-2xl">
          <div className={`p-5 rounded-2xl border text-center ${badgeColor}`}>
            <p className="text-xs font-bold uppercase tracking-widest mb-1">
              Baterai Cinta Akhir: {room.loveBattery}%
            </p>
            <h1 className="text-3xl font-black tracking-tight mb-2">{room.ending.title}</h1>
            <p className="text-xs opacity-90">{room.ending.subtitle}</p>
          </div>

          {authUser ? (
            <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 py-2 px-3 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {historySavedFlag
                  ? `Riwayat tersimpan ke akun ${authUser.email}`
                  : 'Menyimpan riwayat ke akun...'}
              </span>
            </div>
          ) : (
            <p className="text-center text-[11px] text-zinc-500">
              Mode Tamu: Login Google/Email di layar awal agar riwayat skor tersimpan permanen.
            </p>
          )}

          <StoryCardGenerator room={room} />

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1 pt-2 border-t border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 uppercase">Detail Semua Ronde</h3>
            {room.logs.map((log, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs space-y-1"
              >
                <div className="flex justify-between font-bold">
                  <span>
                    Ronde {log.round} • {log.actorName}
                  </span>
                  <span className={log.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {log.delta >= 0 ? `+${log.delta}%` : `${log.delta}%`}
                  </span>
                </div>
                <p className="text-zinc-400">{log.note}</p>
              </div>
            ))}
          </div>

          <button
            onClick={resetToLobbyOrHome}
            className="w-full py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-sm flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Main Lagi & Lihat Riwayat
          </button>
        </div>
      </main>
    );
  }

  return null;
}
