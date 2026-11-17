import { NextResponse } from "next/server";
import crypto from "crypto";
import { upgradeUserAccountInDb } from "@/lib/matchmaking";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const serverKey = process.env.MIDTRANS_SERVER_KEY || "";

    const expectedSignature = crypto
      .createHash("sha512")
      .update(
        `${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`
      )
      .digest("hex");

    if (body.signature_key !== expectedSignature) {
      return NextResponse.json({ message: "Invalid signature" }, { status: 403 });
    }

    const status = body.transaction_status;
    const userId = body.custom_field1;

    if ((status === "settlement" || status === "capture") && userId) {
      await upgradeUserAccountInDb(userId);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
