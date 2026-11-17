'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Download, Share2, Palette, Check } from 'lucide-react';
import { GameRoom } from '@/types/game';

type CardTheme = 'dark' | 'kua_receipt' | 'toxic';

interface StoryCardGeneratorProps {
  room: GameRoom;
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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
      if (lines.length === maxLines) {
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,!?]$/, '')}…`;
        return lines;
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  return lines;
}

export default function StoryCardGenerator({ room }: StoryCardGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState<CardTheme>('dark');
  const [downloaded, setDownloaded] = useState(false);
  const [shareStatus, setShareStatus] = useState<string>('');

  const renderCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !room.ending) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1080;
    const H = 1920;
    canvas.width = W;
    canvas.height = H;

    const palettes: Record<
      CardTheme,
      {
        bgTop: string;
        bgBottom: string;
        surface: string;
        border: string;
        textPrimary: string;
        textSecondary: string;
        muted: string;
        isReceipt?: boolean;
      }
    > = {
      dark: {
        bgTop: '#09090b',
        bgBottom: '#18181b',
        surface: '#121215',
        border: '#27272a',
        textPrimary: '#fafafa',
        textSecondary: '#a1a1aa',
        muted: '#52525b',
      },
      kua_receipt: {
        bgTop: '#f5f0e6',
        bgBottom: '#eae2d0',
        surface: '#fffdf9',
        border: '#cfc5b0',
        textPrimary: '#1c1917',
        textSecondary: '#57534e',
        muted: '#78716c',
        isReceipt: true,
      },
      toxic: {
        bgTop: '#0f0720',
        bgBottom: '#1c0d36',
        surface: '#170c2e',
        border: '#3b1d6e',
        textPrimary: '#f8fafc',
        textSecondary: '#c4b5fd',
        muted: '#7c3aed',
      },
    };

    const pal = palettes[theme];

    const endingAccent =
      room.ending.title === 'BESOK KAWIN'
        ? '#10b981'
        : room.ending.title === 'PACARAN DULU AJA'
        ? '#f59e0b'
        : '#f43f5e';

    // 1. BACKGROUND GRADIENT
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, pal.bgTop);
    grad.addColorStop(1, pal.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    if (!pal.isReceipt) {
      const radial = ctx.createRadialGradient(W / 2, 540, 40, W / 2, 540, 520);
      radial.addColorStop(0, `${endingAccent}33`);
      radial.addColorStop(1, 'transparent');
      ctx.fillStyle = radial;
      ctx.fillRect(0, 100, W, 900);
    }

    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, 48, 48, W - 96, H - 96, 48);
    ctx.stroke();

    // 2. HEADER BRANDING
    ctx.fillStyle = endingAccent;
    drawRoundedRect(ctx, 96, 104, 420, 48, 24);
    ctx.fill();

    ctx.fillStyle = pal.isReceipt ? '#ffffff' : '#09090b';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('18+ REALITY & RED FLAG CHECK', 306, 136);

    ctx.textAlign = 'left';
    ctx.fillStyle = pal.textPrimary;
    ctx.font = '900 72px sans-serif';
    ctx.fillText('BESOK KAWIN?', 96, 232);

    const p1Label = `${room.host.name.toUpperCase()} (${room.host.age})`;
    const p2Label = room.guest
      ? `${room.guest.name.toUpperCase()} (${room.guest.age})`
      : 'BOT AI';
    ctx.fillStyle = pal.textSecondary;
    ctx.font = 'bold 28px monospace';
    ctx.fillText(`${p1Label}  ×  ${p2Label}`, 96, 286);

    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(96, 326);
    ctx.lineTo(W - 96, 326);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. KARTU VERDICT & BATERAI CINTA
    ctx.fillStyle = pal.surface;
    ctx.strokeStyle = endingAccent;
    ctx.lineWidth = 5;
    drawRoundedRect(ctx, 96, 366, W - 192, 430, 36);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pal.textSecondary;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BATERAI CINTA AKHIR', W / 2, 432);

    ctx.fillStyle = endingAccent;
    ctx.font = '900 132px sans-serif';
    ctx.fillText(`${room.loveBattery}%`, W / 2, 562);

    const barX = 160;
    const barY = 596;
    const barW = W - 320;
    const barH = 28;
    ctx.fillStyle = pal.border;
    drawRoundedRect(ctx, barX, barY, barW, barH, 14);
    ctx.fill();

    const fillW = Math.max(28, (barW * room.loveBattery) / 100);
    ctx.fillStyle = endingAccent;
    drawRoundedRect(ctx, barX, barY, fillW, barH, 14);
    ctx.fill();

    ctx.fillStyle = pal.textPrimary;
    ctx.font = '900 54px sans-serif';
    ctx.fillText(room.ending.title, W / 2, 696);

    ctx.fillStyle = pal.textSecondary;
    ctx.font = '26px sans-serif';
    const subLines = wrapText(ctx, room.ending.subtitle, W - 280, 2);
    subLines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, 742 + idx * 34);
    });

    // 4. STATISTIK RINGKAS (3 KOLOM)
    const terimaCount = room.logs.filter((l) => l.action === 'terima_mantap').length;
    const kompromiCount = room.logs.filter((l) => l.action === 'tolak_sepakat').length;
    const dramaCount = room.logs.filter((l) =>
      ['terima_menyesal', 'tolak_deadlock', 'timeout'].includes(l.action)
    ).length;

    const stats = [
      { label: 'TERIMA MANTAP', value: `${terimaCount}×`, color: '#10b981' },
      { label: 'JALAN TENGAH', value: `${kompromiCount}×`, color: '#f59e0b' },
      { label: 'NYESEL / DRAMA', value: `${dramaCount}×`, color: '#f43f5e' },
    ];

    const boxW = (W - 192 - 32) / 3;
    stats.forEach((st, i) => {
      const bx = 96 + i * (boxW + 16);
      const by = 830;
      ctx.fillStyle = pal.surface;
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, bx, by, boxW, 140, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = st.color;
      ctx.font = '900 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.value, bx + boxW / 2, by + 72);

      ctx.fillStyle = pal.textSecondary;
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(st.label, bx + boxW / 2, by + 112);
    });

    // 5. TOP 3 SOROTAN RAPOR RED FLAG
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.textPrimary;
    ctx.font = '900 32px sans-serif';
    ctx.fillText('SOROTAN RAPOR KEPUTUSAN', 96, 1042);

    const highlightedLogs = [...room.logs]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);

    highlightedLogs.forEach((log, idx) => {
      const cardY = 1074 + idx * 212;
      ctx.fillStyle = pal.surface;
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, 96, cardY, W - 192, 190, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pal.textSecondary;
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`RONDE ${log.round} • ${log.actorName.toUpperCase()}`, 128, cardY + 42);

      const deltaText = log.delta >= 0 ? `+${log.delta}%` : `${log.delta}%`;
      ctx.fillStyle = log.delta >= 0 ? '#10b981' : '#f43f5e';
      ctx.font = '900 28px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(deltaText, W - 128, cardY + 44);

      ctx.textAlign = 'left';
      ctx.fillStyle = pal.textPrimary;
      ctx.font = 'bold 25px sans-serif';
      const quoteLines = wrapText(ctx, `"${log.cardStatement}"`, W - 260, 2);
      quoteLines.forEach((ql, lineIdx) => {
        ctx.fillText(ql, 128, cardY + 86 + lineIdx * 34);
      });

      ctx.fillStyle = pal.textSecondary;
      ctx.font = '21px sans-serif';
      const noteLines = wrapText(ctx, log.note, W - 260, 1);
      if (noteLines[0]) {
        ctx.fillText(noteLines[0], 128, cardY + 162);
      }
    });

    // 6. FOOTER VIRAL HOOK
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(96, 1742);
    ctx.lineTo(W - 96, 1742);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.fillStyle = pal.textPrimary;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Berani buka borok sebelum sebar undangan?', W / 2, 1796);

    ctx.fillStyle = endingAccent;
    ctx.font = '900 26px monospace';
    ctx.fillText('MAIN SEKARANG • BESOK KAWIN?', W / 2, 1840);
  }, [room, theme]);

  useEffect(() => {
    renderCard();
  }, [renderCard]);

  const handleDownloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.download = `rapor-besok-kawin-${room.loveBattery}persen.png`;
    link.href = dataUrl;
    link.click();

    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2500);
  };

  const handleShareStory = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'rapor-besok-kawin.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Rapor BESOK KAWIN?',
            text: `Baterai Cinta kami ${room.loveBattery}% — Hasilnya: ${room.ending?.title}!`,
          });
          setShareStatus('Berhasil membuka menu share!');
        } catch {
          setShareStatus('');
        }
      } else {
        handleDownloadPNG();
        setShareStatus('Gambar terunduh! Siap diunggah ke Instagram Story.');
        setTimeout(() => setShareStatus(''), 3500);
      }
    }, 'image/png');
  };

  return (
    <div className="space-y-3 pt-2 border-t border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400 uppercase flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-rose-400" /> Kartu IG Story (9:16)
        </span>

        <div className="flex gap-1.5">
          {(
            [
              { id: 'dark', label: 'Dark' },
              { id: 'kua_receipt', label: 'Struk KUA' },
              { id: 'toxic', label: 'Neon' },
            ] as { id: CardTheme; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                theme === t.id
                  ? 'bg-rose-600 text-white'
                  : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[240px] aspect-[9/16] rounded-2xl overflow-hidden border border-zinc-700 shadow-2xl bg-zinc-950">
        <canvas ref={canvasRef} className="w-full h-full object-contain block" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={handleDownloadPNG}
          className="py-3 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs flex items-center justify-center gap-1.5 transition"
        >
          {downloaded ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" /> Tersimpan!
            </>
          ) : (
            <>
              <Download className="w-4 h-4" /> Unduh PNG
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleShareStory}
          className="py-3 px-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-rose-600/20"
        >
          <Share2 className="w-4 h-4" /> Share IG Story
        </button>
      </div>

      {shareStatus && (
        <p className="text-center text-[11px] text-emerald-400 font-medium">{shareStatus}</p>
      )}
    </div>
  );
}
