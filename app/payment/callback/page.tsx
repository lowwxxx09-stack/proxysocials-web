"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const transactionId = searchParams.get("transaction_id");
  const txRef = searchParams.get("tx_ref");
  const status = searchParams.get("status");

  const [message, setMessage] = useState(
    "Verifying your payment..."
  );

  const processingRef = useRef(false);

  useEffect(() => {
    if (processingRef.current) return;

    if (transactionId === null || txRef === null) {
      setMessage("No Flutterwave transaction information found.");
      return;
    }

    // Explicitly create strings so TypeScript knows these
    // values cannot be null inside the async function.
    const verifiedTransactionId: string = transactionId;
    const verifiedTxRef: string = txRef;

    processingRef.current = true;

    async function processPayment() {
      try {
        if (status === "cancelled" || status === "failed") {
          setMessage("Payment was cancelled or failed.");
          return;
        }

        const verifyResponse = await fetch(
          `/api/flutterwave/verify?transaction_id=${encodeURIComponent(
            verifiedTransactionId
          )}&tx_ref=${encodeURIComponent(verifiedTxRef)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const verifyData = await verifyResponse.json();

        if (!verifyData.status) {
          setMessage(
            verifyData.message || "Payment verification failed."
          );
          return;
        }

        const paymentType =
          verifyData.data?.meta?.payment_type;

        if (paymentType === "order") {
          const completeResponse = await fetch(
            "/api/flutterwave/complete",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                transactionId: verifiedTransactionId,
                txRef: verifiedTxRef,
              }),
            }
          );

          const completeData = await completeResponse.json();

          if (!completeData.status) {
            setMessage(
              completeData.message || "Order creation failed."
            );
            return;
          }

          setMessage(
            "Payment successful! Order created 🎉 Redirecting to your orders..."
          );

          setTimeout(() => {
            router.push("/order-history");
            router.refresh();
          }, 2000);

          return;
        }

        if (paymentType === "wallet") {
          const metadataUserId =
            verifyData.data?.meta?.userId;

          if (!metadataUserId) {
            setMessage(
              "Payment user information is missing."
            );
            return;
          }

          const walletResponse = await fetch(
            "/api/wallet/credit",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                userId: metadataUserId,
                transactionId: verifiedTransactionId,
                txRef: verifiedTxRef,
              }),
              cache: "no-store",
            }
          );

          const walletData = await walletResponse.json();

          if (!walletData.status) {
            setMessage(
              walletData.message || "Unable to credit wallet."
            );
            return;
          }

          setMessage(
            walletData.alreadyCredited
              ? "This payment has already been credited to your wallet."
              : "Wallet funded successfully! 🎉"
          );

          setTimeout(() => {
            router.push("/dashboard");
            router.refresh();
          }, 2000);

          return;
        }

        setMessage("Unable to determine payment type.");
      } catch (error) {
        console.error("Payment processing error:", error);

        setMessage(
          "Something went wrong while processing payment."
        );
      }
    }

    processPayment();
  }, [router, status, transactionId, txRef]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-sky-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-lg">
        <h1 className="text-3xl font-bold text-sky-700">
          Payment Status
        </h1>

        <p className="mt-5 text-lg">{message}</p>
      </div>
    </main>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          Loading...
        </main>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}