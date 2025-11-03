import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Html5Qrcode } from "html5-qrcode";
import { Check, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient"; // FIX: Import apiRequest

export default function QRScannerPage() {
  const [status, setStatus] = useState<"scanning" | "success" | "error">("scanning");
  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string>("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [pathname] = useLocation();

  useEffect(() => {
    // Only start if on /verificar path
    if (pathname === "/verificar") {
      startScanner();
    } else {
      // Stop scanner when navigating away
      stopScanner();
    }

    // Cleanup function - runs when component unmounts
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      stopScanner();
    };
  }, [pathname]); // Re-run when pathname changes

  const startScanner = async () => {
    // Check if scanner exists and is already scanning
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        // Html5QrcodeState.SCANNING = 2
        if (state === 2) {
          console.log("Scanner already running");
          return;
        }
      } catch (e) {
        // If getState fails, try to clean up and restart
        console.log("Cleaning up previous scanner instance");
      }
    }

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      };

      await scanner.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanError
      );
      
      setCameraStarted(true);
      console.log("Scanner started successfully");
    } catch (err) {
      console.error("Error starting scanner:", err);
      setStatus("error");
      setMessage("Erro ao acessar câmera");
      setCameraStarted(false);
    }
  };

  const stopScanner = async () => {
    if (!scannerRef.current) {
      return;
    }

    try {
      const scanner = scannerRef.current;
      const state = scanner.getState();
      
      // Html5QrcodeState.SCANNING = 2
      if (state === 2) {
        console.log("Stopping scanner...");
        await scanner.stop();
        console.log("Scanner stopped");
      }
      
      // Clear the scanner UI
      await scanner.clear();
      console.log("Scanner cleared");
    } catch (err) {
      console.warn("Error during scanner cleanup:", err);
    } finally {
      // Always reset state and ref
      scannerRef.current = null;
      setCameraStarted(false);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    // Prevent processing if already processing or same code scanned within 3 seconds
    if (isProcessing || lastScannedRef.current === decodedText) {
      return;
    }

    setIsProcessing(true);
    lastScannedRef.current = decodedText;

    try {
      // FIX: Use apiRequest instead of native fetch
      const response = await apiRequest(
        "POST",
        "/api/tickets/verify-ticket/",
        { qr_code_data: decodedText } // Already correctly using snake_case
      );
      
      const result = await response.json();
      
      if (result.success) {
        setStatus("success");
        setMessage(`✓ ${result.userName || "Verificado"}`);
      } else {
        setStatus("error");
        setMessage(result.message || "Erro");
      }
    } catch (error) {
      setStatus("error");
      // apiRequest throws an Error object, so we can use error.message
      setMessage(error instanceof Error ? error.message : "QR Code inválido");
    }

    // Reset quickly - only 800ms for success, 1.5s for error
    const delay = status === "error" ? 1500 : 800;
    
    timeoutRef.current = setTimeout(() => {
      setStatus("scanning");
      setMessage("");
      setIsProcessing(false);
      // Clear last scanned after 3 seconds to allow re-scanning same code
      setTimeout(() => {
        lastScannedRef.current = "";
      }, 3000);
    }, delay);
  };

  const onScanError = (error: any) => {
    // Ignore scan errors silently
  };

  // Don't render if not on the correct path
  if (pathname !== "/verificar") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Verificar Ingresso</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-4 relative min-h-[400px]">
          {/* Camera view */}
          <div id="qr-reader" className="w-full" style={{ display: status === "scanning" ? "block" : "none" }} />
          
          {/* Status overlays */}
          {status === "scanning" && !cameraStarted && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-gray-600">Iniciando câmera...</p>
              </div>
            </div>
          )}
          
          {status === "success" && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-50/95">
              <div className="text-center">
                <Check className="h-16 w-16 text-green-500 mx-auto mb-2" />
                <h2 className="text-xl font-bold text-green-700">{message}</h2>
              </div>
            </div>
          )}
          
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-50/95">
              <div className="text-center">
                <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-2" />
                <p className="text-red-600 font-semibold">{message}</p>
              </div>
            </div>
          )}
          
          {isProcessing && status === "scanning" && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          )}
        </div>
        
        <p className="text-center text-gray-600 mt-4 text-sm">
          Aponte a câmera para o QR Code do ingresso
        </p>
      </div>
    </div>
  );
}