import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { roomCode, payerName, payerEmail } = body as {
      roomCode?: string;
      payerName?: string;
      payerEmail?: string;
    };

    if (!roomCode || !payerName) {
      return NextResponse.json(
        { error: "Data roomCode dan payerName wajib diisi" },
        { status: 400 }
      );
    }

    const orderId = `SAWER-${roomCode}-${Date.now()}`;
    const amount = 10000;
    const midtransServerKey = process.env.MIDTRANS_SERVER_KEY;

    // Jika MIDTRANS_SERVER_KEY sudah dipasang di Vercel, buat transaksi QRIS asli
    if (midtransServerKey) {
      const authHeader = Buffer.from(`${midtransServerKey}:`).toString("base64");
      const isProd = process.env.MIDTRANS_IS_PRODUCTION === "true";
      const baseUrl = isProd
        ? "https://api.midtrans.com/v2/charge"
        : "https://api.sandbox.midtrans.com/v2/charge";

      const mtRes = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${authHeader}`,
        },
        body: JSON.stringify({
          payment_type: "qris",
          transaction_details: {
            order_id: orderId,
            gross_amount: amount,
          },
          customer_details: {
            first_name: payerName,
            email: payerEmail || "player@besokkawin.id",
          },
          custom_field1: roomCode,
          custom_field2: payerName,
        }),
      });

      const mtData = await mtRes.json();
      const qrAction = Array.isArray(mtData.actions)
        ? mtData.actions.find(
            (a: { name: string; url: string }) => a.name === "generate-qr-code"
          )
        : null;

      return NextResponse.json({
        mode: "live_qris",
        orderId,
        amount,
        qrImageUrl: qrAction?.url || null,
        raw: mtData,
      });
    }

    // Mode Sandbox / Simulasi Lokal (jika MIDTRANS_SERVER_KEY belum diisi)
    return NextResponse.json({
      mode: "sandbox_demo",
      orderId,
      amount,
      qrImageUrl: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
