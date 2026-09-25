import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const userId = String(body.userId || "");
    const transactionId = String(body.transactionId || "");
    const txRef = String(body.txRef || "");

    if (!userId || !transactionId || !txRef) {
      return NextResponse.json(
        {
          status: false,
          message:
            "User ID, transaction ID and transaction reference are required.",
        },
        { status: 400 }
      );
    }

    const verifyResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(
        transactionId
      )}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const verifyData = await verifyResponse.json();

    if (
      !verifyResponse.ok ||
      verifyData.status !== "success"
    ) {
      return NextResponse.json(
        {
          status: false,
          message:
            verifyData.message ||
            "Unable to verify Flutterwave transaction.",
        },
        { status: 400 }
      );
    }

    const transaction = verifyData.data;

    if (
      !transaction ||
      transaction.status !== "successful" ||
      transaction.tx_ref !== txRef ||
      transaction.currency !== "NGN"
    ) {
      return NextResponse.json(
        {
          status: false,
          message: "Flutterwave payment was not successful.",
        },
        { status: 400 }
      );
    }

    const verifiedAmount = Number(transaction.amount);

    if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
      return NextResponse.json(
        {
          status: false,
          message: "Invalid payment amount from Flutterwave.",
        },
        { status: 400 }
      );
    }

    const metadataUserId = transaction.meta?.userId
      ? String(transaction.meta.userId)
      : null;

    if (metadataUserId && metadataUserId !== userId) {
      return NextResponse.json(
        {
          status: false,
          message: "Payment does not belong to this user.",
        },
        { status: 403 }
      );
    }

    // This RPC is the same atomic wallet-credit mechanism used by the
    // previous payment integration. The supplied SQL migration renames it
    // to a provider-neutral name.
    const { data: creditResult, error: creditError } =
      await supabase.rpc("credit_wallet_from_payment", {
        p_user_id: userId,
        p_reference: txRef,
        p_amount: verifiedAmount,
        p_payment_transaction_id: String(transaction.id),
      });

    if (creditError) {
      console.error("WALLET CREDIT RPC ERROR:", creditError);

      return NextResponse.json(
        {
          status: false,
          message:
            creditError.message || "Unable to credit wallet.",
        },
        { status: 500 }
      );
    }

    if (!creditResult?.success) {
      return NextResponse.json(
        {
          status: false,
          message:
            creditResult?.message || "Unable to credit wallet.",
        },
        { status: 500 }
      );
    }

    if (creditResult.already_credited) {
      return NextResponse.json({
        status: true,
        message: "Wallet already credited.",
        alreadyCredited: true,
        amount: Number(creditResult.amount),
        reference: txRef,
      });
    }

    const newBalance = Number(creditResult.new_balance);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", userId)
        .single();

      const telegramMessage =
        "💰 NEW PROXYSOCIALS DEPOSIT\n\n" +
        "👤 Customer: " +
        (profile?.full_name || "Unknown") +
        "\n" +
        "📱 WhatsApp: " +
        (profile?.phone || "Unknown") +
        "\n\n" +
        "💵 Amount: ₦" +
        Number(verifiedAmount).toLocaleString() +
        "\n" +
        "💳 Payment: Flutterwave\n" +
        "🔖 Reference: " +
        txRef +
        "\n" +
        "💰 New Balance: ₦" +
        Number(newBalance).toLocaleString() +
        "\n" +
        "📦 Status: ✅ CREDITED";

      await sendTelegramMessage(telegramMessage);
    } catch (telegramError) {
      console.error("DEPOSIT TELEGRAM ERROR:", telegramError);
    }

    return NextResponse.json({
      status: true,
      message: "Wallet credited successfully.",
      amount: verifiedAmount,
      newBalance,
      reference: txRef,
      alreadyCredited: false,
    });
  } catch (error) {
    console.error("WALLET CREDIT SERVER ERROR:", error);

    return NextResponse.json(
      {
        status: false,
        message: "Something went wrong while crediting wallet.",
      },
      { status: 500 }
    );
  }
}
