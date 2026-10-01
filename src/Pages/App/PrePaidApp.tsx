

const dev = import.meta.env.DEV;

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { styles } from "./styles";
import { NFC } from "../../Helpers/Nfc";
import { Admin } from "../../Helpers/Admins";
import { KeyPressListener } from "../../Helpers/KeyPressListener";

export { PrePaidApp };

const PrePaidApp = () => {
  const [, navigate] = useLocation();
  const nfcInitializedRef = useRef(false);
  const unlistenNfcAdminRef = useRef<(() => void) | null>(null);
  const unlistenNfcUnknownRef = useRef<(() => void) | null>(null);
  const nfcNotificationTimerRef = useRef<number | null>(null);

  const [nfcNotification, setNfcNotification] = useState<string | null>(null);

  const adminPresentCheck = async (): Promise<void> => {
    const present = await Admin.areAdminsPresent();
    if (!present) {
      !dev && navigate("/setup");
    }
  };

  const showNfcNotification = (message: string) => {
    if (nfcNotificationTimerRef.current) clearTimeout(nfcNotificationTimerRef.current);
    setNfcNotification(message);
    nfcNotificationTimerRef.current = setTimeout(() => {
      setNfcNotification(null);
      nfcNotificationTimerRef.current = null;
    }, 5000) as unknown as number;
  };

  const listenToNfc = async () => {
    if (nfcInitializedRef.current) return;
    nfcInitializedRef.current = true;

    unlistenNfcAdminRef.current = await NFC.listenAdminFound(() => {
      navigate("/admin");
    });

    unlistenNfcUnknownRef.current = await NFC.listenUnknownTag((tagId) => {
      showNfcNotification(`Unknown NFC tag: ${tagId}`);
    });
  };

  useEffect(() => {
    adminPresentCheck();
    listenToNfc();

    return () => {
      if (unlistenNfcAdminRef.current) unlistenNfcAdminRef.current();
      if (unlistenNfcUnknownRef.current) unlistenNfcUnknownRef.current();
      if (nfcNotificationTimerRef.current) clearTimeout(nfcNotificationTimerRef.current);
    };
  }, []);

  return (
    <main style={styles.body}>
      <KeyPressListener />

      {dev && (
        <div
          style={styles.adminTrigger}
          onClick={() => navigate("/admin")}
        />
      )}

      <h1 style={styles.header}>Prepaid App</h1>
      <p style={{ color: "var(--theme-text, #d4d4d4)", marginTop: "1rem" }}>
        Coming soon…
      </p>

      {nfcNotification && (
        <div style={styles.nfcNotification}>{nfcNotification}</div>
      )}
    </main>
  );
};


