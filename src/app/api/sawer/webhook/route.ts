import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const {
      transaction_status,
      fraud_status,
      custom_field1: roomCode,
      custom_field2: payerName,
    } = payload;

    const isPaid =
      (transaction_status === "capture" && fraud_status === "accept") ||
      transaction_status === "settlement";

    if (!isPaid || !roomCode) {
      return NextResponse.json({ received: true, unlocked: false });
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    if (!projectId || !apiKey) {
      return NextResponse.json(
        { error: "Firebase env belum lengkap" },
        { status: 500 }
      );
    }

    // Update dokumen Firestore rooms/{roomCode} via REST API agar tanpa dependency tambahan
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rooms/${encodeURIComponent(
      roomCode
    )}?updateMask.fieldPaths=chatUnlocked&updateMask.fieldPaths=unlockedBy&updateMask.fieldPaths=unlockedAt&key=${apiKey}`;

    const patchRes = await fetch(firestoreUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          chatUnlocked: { booleanValue: true },
          unlockedBy: { stringValue: payerName || "Pasangan" },
          unlockedAt: { integerValue: String(Date.now()) },
        },
      }),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      return NextResponse.json(
        { error: "Gagal update Firestore", detail: errText },
        { status: 500 }
      );
    }

    return NextResponse.json({ received: true, unlocked: true, roomCode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
