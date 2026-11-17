"use client";

import React, { useState, useEffect, useRef } from "react";
import { db, isFirebaseReady } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  orderBy,
  limit,
  doc,
  updateDoc,
} from "firebase/firestore";
import {
  PublicMatchProfile,
  MatchThread,
  DirectMessageItem,
  upgradeUserAccountInDb,
} from "@/lib/matchmaking";

interface ProfileDashboardProps {
  profile: PublicMatchProfile;
  onClose: () => void;
  onGoBursa: () => void;
  showToast: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
}

export default function ProfileDashboard({
  profile,
  onClose,
  onGoBursa,
  showToast,
}: ProfileDashboardProps) {
  const [threads, setThreads] = useState<MatchThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [textInput, setTextInput] = useState("");
  const [sending, setSending] = useState(false);

  // State Modal Upgrade VIP Rp10.000
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<"live_qris" | "sandbox_demo">("sandbox_demo");

  const endRef = useRef<HTMLDivElement | null>(null);
  const isVip = Boolean(profile.isUpgraded);

  // Dengarkan daftar pasangan yang sudah Match
  useEffect(() => {
    if (!isFirebaseReady || !db) return;
    const q = query(
      collection(db, "match_threads"),
      where("participants", "array-contains", profile.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: MatchThread[] = [];
      snap.forEach((d) => list.push(d.data() as MatchThread));
      list.sort(
        (a, b) =>
          (b.lastMessageAt || b.createdAt || 0) -
          (a.lastMessageAt || a.createdAt || 0)
      );
      setThreads(list);
    });
    return () => unsub();
  }, [profile.id]);

  // Dengarkan isi chat pada thread yang dibuka
  useEffect(() => {
    if (!activeThreadId || !isFirebaseReady || !db) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, "match_threads", activeThreadId, "messages"),
      orderBy("createdAt", "asc"),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: DirectMessageItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          senderId: data.senderId,
          senderName: data.senderName,
          text: data.text,
          createdAt: data.createdAt || Date.now(),
        });
      });
      setMessages(list);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    });
    return () => unsub();
  }, [activeThreadId]);

  const startUpgradeQris = async () => {
    setShowUpgradeModal(true);
    setLoadingQr(true);
    try {
      const res = await fetch("/api/sawer/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile.id,
          payerName: profile.name,
          payerEmail: profile.email,
        }),
      });
      const data = await res.json();
      setPayMode(data.mode || "sandbox_demo");
      setQrImageUrl(data.qrImageUrl || null);
    } catch {
      setPayMode("sandbox_demo");
    } finally {
      setLoadingQr(false);
    }
  };

  const confirmSandboxUpgrade = async () => {
    try {
      await upgradeUserAccountInDb(profile.id);
      setShowUpgradeModal(false);
      showToast("🎉 Akun resmi VIP! Semua pesan masuk kini terbuka.", "success");
    } catch {
      showToast("Gagal memproses upgrade.", "error");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVip) {
      startUpgradeQris();
      return;
    }
    const trimmed = textInput.trim();
    if (!trimmed || !activeThreadId || !db) return;

    setSending(true);
    setTextInput("");
    try {
      await addDoc(collection(db, "match_threads", activeThreadId, "messages"), {
        senderId: profile.id,
        senderName: profile.name,
        text: trimmed,
        createdAt: Date.now(),
      });
      await updateDoc(doc(db, "match_threads", activeThreadId), {
        lastMessage: trimmed,
        lastMessageAt: Date.now(),
        lastSenderId: profile.id,
      });
    } catch {
      showToast("Gagal mengirim pesan.", "error");
    } finally {
      setSending(false);
    }
  };

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;
  const partnerId = activeThread?.participants.find((id) => id !== profile.id);
  const partnerInfo = partnerId ? activeThread?.participantDetails?.[partnerId] : null;

  return (
    <section className="animate-card-enter space-y-3 py-1">
      {/* KARTU IDENTITAS & STATUS AKUN */}
      <div className="bg-[#111827]/95 border border-slate-800 rounded-3xl p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white">
                {profile.gender === "Laki-laki" ? "👨" : "👩"} {profile.name},{" "}
                {profile.age}
              </h2>
              {isVip ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  👑 AKUN VIP
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  AKUN GRATIS
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              📍 {profile.city} • {profile.email}
            </p>
            <p className="text-xs text-slate-300 mt-1.5 italic">
              &ldquo;{profile.bio}&rdquo;
            </p>
          </div>

          <button
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700"
          >
            ← Kembali
          </button>
        </div>

        {!isVip && (
          <div className="mt-3 p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 to-rose-500/15 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="text-xs text-amber-100">
              <strong>Buka Akses Chat Selamanya:</strong> Kirim pesan & baca
              balasan dari semua pasangan Match tanpa sensor blur.
            </div>
            <button
              onClick={startUpgradeQris}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950 font-extrabold text-xs shrink-0 btn-tactile"
            >
              💸 Upgrade VIP Rp10.000
            </button>
          </div>
        )}
      </div>

      {/* DAFTAR MATCH ATAU RUANG CHAT */}
      {!activeThread ? (
        <div className="bg-[#111827]/95 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-extrabold text-white">
              💌 Kotak Masuk Pasangan Match ({threads.length})
            </h3>
            <button
              onClick={onGoBursa}
              className="text-[11px] font-bold text-emerald-400 hover:underline"
            >
              + Cari Match Baru
            </button>
          </div>

          {threads.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <p className="text-xs font-bold text-slate-300">
                Belum ada pasangan Match di daftar kamu.
              </p>
              <p className="text-[11px] text-slate-400">
                Masuk ke Bursa Mabar dan pilih lawan jenis untuk mulai!
              </p>
              <button
                onClick={onGoBursa}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs"
              >
                Buka Bursa Mabar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {threads.map((t) => {
                const otherId = t.participants.find((id) => id !== profile.id);
                const other = otherId ? t.participantDetails?.[otherId] : null;
                const hasUnreadFromOther =
                  Boolean(t.lastMessage) && t.lastSenderId !== profile.id;

                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveThreadId(t.id)}
                    className="w-full p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-left transition btn-tactile"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-extrabold text-white">
                          {other?.gender === "Laki-laki" ? "👨" : "👩"}{" "}
                          {other?.name || "Pasangan"}, {other?.age}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          📍 {other?.city}
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 truncate mt-1">
                        {!t.lastMessage ? (
                          <span className="italic text-slate-500">
                            Belum ada obrolan. Ketuk untuk menyapa!
                          </span>
                        ) : hasUnreadFromOther && !isVip ? (
                          <span className="text-amber-400 font-bold">
                            🔒 Mengirim pesan rahasia (Ketuk untuk buka)
                          </span>
                        ) : (
                          t.lastMessage
                        )}
                      </p>
                    </div>

                    <span className="px-2.5 py-1 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-bold shrink-0">
                      Chat →
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* TAMPILAN OBROLAN 1-ON-1 DENGAN SENSOR BLUR UNTUK NON-VIP */
        <div className="bg-[#111827]/95 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white">
                {partnerInfo?.name || "Pasangan"} ({partnerInfo?.city})
              </h3>
              <span className="text-[10px] text-emerald-400">
                Room Match: {activeThread.roomCode}
              </span>
            </div>
            <button
              onClick={() => setActiveThreadId(null)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 text-[11px] font-bold text-slate-300"
            >
              Daftar Match
            </button>
          </div>

          <div className="h-60 overflow-y-auto space-y-2.5 p-2.5 rounded-2xl bg-slate-950 border border-slate-800">
            {messages.length === 0 ? (
              <p className="text-[11px] text-slate-500 text-center my-20">
                Belum ada pesan. Mulai obrolan duluan!
              </p>
            ) : (
              messages.map((m) => {
                const isMine = m.senderId === profile.id;
                const shouldBlur = !isMine && !isVip;

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      isMine ? "items-end" : "items-start"
                    }`}
                  >
                    <span className="text-[9px] text-slate-500 mb-0.5 px-1">
                      {m.senderName}
                    </span>

                    {shouldBlur ? (
                      <div
                        onClick={startUpgradeQris}
                        className="cursor-pointer px-3 py-2 rounded-2xl rounded-bl-sm bg-slate-900 border border-amber-500/40 max-w-[85%] relative overflow-hidden"
                      >
                        <p className="text-xs text-slate-200 select-none blur-[5px] pointer-events-none">
                          Halo salam kenal! Boleh minta kontak WA kamu nggak?
                        </p>
                        <div className="mt-1 flex items-center gap-1 text-[10px] font-extrabold text-amber-400">
                          <span>🔒 Pesan disensor • Ketuk untuk Upgrade VIP</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`px-3 py-1.5 rounded-2xl text-xs max-w-[82%] ${
                          isMine
                            ? "bg-rose-500 text-white rounded-br-sm"
                            : "bg-slate-800 text-slate-100 rounded-bl-sm"
                        }`}
                      >
                        {m.text}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>

          {isVip ? (
            <form onSubmit={handleSendMessage} className="flex gap-1.5">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Ketik pesan atau kirim IG/WA..."
                className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs btn-tactile"
              >
                Kirim
              </button>
            </form>
          ) : (
            <button
              onClick={startUpgradeQris}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950 font-extrabold text-xs btn-tactile"
            >
              🔒 Upgrade VIP Rp10.000 untuk Baca & Balas Pesan
            </button>
          )}
        </div>
      )}

      {/* MODAL PEMBAYARAN QRIS VIP */}
      {showUpgradeModal && (
        <div
          onClick={() => setShowUpgradeModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#111827] border-2 border-amber-500/60 rounded-3xl p-5 shadow-2xl text-center"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-500/20 text-amber-300">
                AKUN VIP PERMANEN
              </span>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <h3 className="text-base font-extrabold text-white">
              Upgrade Akun VIP — Rp10.000
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Bayar sekali, akun <strong>{profile.name}</strong> bebas kirim &
              baca pesan ke semua pasangan Match tanpa sensor blur.
            </p>

            {loadingQr ? (
              <div className="my-6 py-8 rounded-2xl bg-slate-950 text-xs text-amber-400 font-bold">
                ⏳ Menyiapkan QRIS...
              </div>
            ) : payMode === "live_qris" && qrImageUrl ? (
              <div className="my-4 p-4 rounded-2xl bg-white inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl}
                  alt="QRIS Upgrade VIP"
                  className="w-48 h-48 mx-auto"
                />
                <p className="text-[11px] font-bold text-slate-900 mt-2">
                  Scan QRIS di atas — status VIP aktif otomatis setelah lunas
                </p>
              </div>
            ) : (
              <div className="my-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-2">
                <p className="text-[11px] text-slate-400">
                  Mode Sandbox terdeteksi. Klik tombol di bawah untuk
                  mensimulasikan pembayaran lunas:
                </p>
                <button
                  onClick={confirmSandboxUpgrade}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs"
                >
                  ✅ Simulasi Bayar Rp10.000 Lunas
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
