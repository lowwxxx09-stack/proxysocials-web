import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const transactionId =
    request.nextUrl.searchParams.get("transaction_id");

  const txRef = request.nextUrl.searchParams.get("tx_ref");

  if (!transactionId || !txRef) {
    return NextResponse.json(
      {
        status: false,
        message: "Transaction ID and transaction reference are required.",
      },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
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

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      return NextResponse.json(
        {
          status: false,
          message:
            data.message || "Unable to verify Flutterwave transaction.",
        },
        { status: response.status || 400 }
      );
    }

    // Do not trust the browser's status alone. The server response is the
    // source of truth for the transaction.
    const transaction = data.data;

    if (
      transaction?.status !== "successful" ||
      transaction?.tx_ref !== txRef ||
      transaction?.currency !== "NGN"
    ) {
      return NextResponse.json(
        {
          status: false,
          message: "Flutterwave payment verification failed.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: true,
      data: transaction,
    });
  } catch (error) {
    console.error("Flutterwave Verify Error:", error);

    return NextResponse.json(
      {
        status: false,
        message: "Unable to verify payment.",
      },
      { status: 500 }
    );
  }
}
