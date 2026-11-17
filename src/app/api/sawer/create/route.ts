import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { userId, payerName, payerEmail } = await req.json();
    const serverKey = process.env.MIDTRANS_SERVER_KEY;

    if (!serverKey) {
      return NextResponse.json({ mode: "sandbox_demo", qrImageUrl: null });
    }

    const isProduction = !serverKey.startsWith("SB-");
    const baseUrl = isProduction
      ? "https://api.midtrans.com/v2/charge"
      : "https://api.sandbox.midtrans.com/v2/charge";

    const orderId = `VIP-${String(userId || "USER").slice(0, 10)}-${Date.now()}`;
    const authHeader = Buffer.from(`${serverKey}:`).toString("base64");

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: {
          order_id: orderId,
          gross_amount: 10000,
        },
        customer_details: {
          first_name: payerName || "Pemain",
          email: payerEmail || "player@besokkawin.id",
        },
        custom_field1: userId || "",
      }),
    });

    const data = await response.json();
    const qrAction = Array.isArray(data.actions)
      ? data.actions.find(
          (a: { name: string; url: string }) => a.name === "generate-qr-code"
        )
      : null;

    return NextResponse.json({
      mode: "live_qris",
      orderId,
      qrImageUrl: qrAction?.url || null,
    });
  } catch (err) {
    console.error("Midtrans create error:", err);
    return NextResponse.json(
      { mode: "sandbox_demo", qrImageUrl: null },
      { status: 500 }
    );
  }
}
