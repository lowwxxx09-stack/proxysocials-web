import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      email,
      amount,
      customerName,
      whatsappNumber,
      serviceId,
      note,
      userId,
      orderContent,
    } = body;

    const numericAmount = Number(amount);

    if (!email || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        {
          status: false,
          message: "Email and a valid amount are required.",
        },
        { status: 400 }
      );
    }

    const paymentType = serviceId ? "order" : "wallet";

    // Flutterwave requires a unique tx_ref for every transaction.
    const txRef = `PROXY-${paymentType.toUpperCase()}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;

    const meta = {
      payment_type: paymentType,
      customerName: customerName || "",
      whatsappNumber: whatsappNumber || "",
      serviceId: serviceId || "",
      note: note || "",
      email,
      amount: numericAmount,
      userId: userId || "",
      orderContent: orderContent || {},
    };

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const response = await fetch(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: txRef,
          amount: numericAmount,
          currency: "NGN",
redirect_url: `${siteUrl}/payment/callback`,
payment_options: "card, banktransfer, ussd, account, internetbanking, nqr, enaira, opay",
customer: {
            email,
            name: customerName || undefined,
            phonenumber: whatsappNumber || undefined,
          },
          meta,
          customizations: {
            title: "ProxySocials",
            description:
              paymentType === "wallet"
                ? "Fund your ProxySocials wallet"
                : "ProxySocials order payment",
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      console.error("Flutterwave initialization failed:", data);

      return NextResponse.json(
        {
          status: false,
          message:
            data.message || "Unable to initialize Flutterwave payment.",
        },
        { status: response.status || 500 }
      );
    }

    return NextResponse.json({
      status: true,
      message: "Payment initialized successfully.",
      data: {
        link: data.data?.link,
        tx_ref: txRef,
      },
    });
  } catch (error) {
    console.error("Flutterwave Initialize Error:", error);

    return NextResponse.json(
      {
        status: false,
        message: "Unable to initialize payment.",
      },
      { status: 500 }
    );
  }
}
