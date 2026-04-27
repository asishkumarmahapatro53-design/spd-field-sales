"use client";

import { useRef, useState } from "react";
import { watermarkAndCompress, getCurrentPosition, reverseGeocode } from "@/lib/image-utils";

interface GpsCameraProps {
  /** Label shown on the capture button */
  label?: string;
  /** Called with the final watermarked File ready to upload */
  onCapture: (file: File, coords: { lat: number; lng: number } | null) => void;
  /** Optional: pre-fill site name in watermark */
  siteName?: string;
  /** Agent name for watermark */
  agentName: string;
  /** Employee ID for watermark */
  employeeId: string;
  disabled?: boolean;
}

type CameraState = "idle" | "acquiring-gps" | "processing" | "ready" | "error";

export function GpsCamera({ label = "Take Photo", onCapture, siteName, agentName, employeeId, disabled }: GpsCameraProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;

    // Reset input so same photo can be retaken
    e.target.value = "";
    setErrorMsg("");
    setPreview(null);
    setCapturedFile(null);
    setState("acquiring-gps");

    try {
      // 1. Get GPS (parallel with processing, to feel fast)
      const position = await getCurrentPosition();
      const gpsCoords = position
        ? { lat: position.latitude, lng: position.longitude }
        : null;
      setCoords(gpsCoords);

      setState("processing");

      // 2. Reverse geocode if we have coords (for address watermark)
      let siteAddress: string | undefined;
      if (gpsCoords) {
        const geocoded = await reverseGeocode(gpsCoords.lat, gpsCoords.lng);
        siteAddress = geocoded ?? undefined;
      }

      // 3. Watermark + compress
      const processedFile = await watermarkAndCompress(raw, {
        agentName,
        employeeId,
        siteName,
        siteAddress,
        lat: gpsCoords?.lat,
        lng: gpsCoords?.lng,
      });

      // 4. Generate preview
      const previewUrl = URL.createObjectURL(processedFile);
      setPreview(previewUrl);
      setCapturedFile(processedFile);
      setState("ready");
    } catch (err) {
      console.error("GpsCamera error:", err);
      setErrorMsg("Failed to process photo. Please try again.");
      setState("error");
    }
  }

  function handleConfirm() {
    if (capturedFile) {
      onCapture(capturedFile, coords);
      setState("idle");
      setPreview(null);
      setCapturedFile(null);
    }
  }

  function handleRetake() {
    setPreview(null);
    setCapturedFile(null);
    setState("idle");
    inputRef.current?.click();
  }

  const stateLabels: Record<CameraState, string> = {
    idle: label,
    "acquiring-gps": "Getting GPS…",
    processing: "Watermarking…",
    ready: "Photo Ready",
    error: "Retry",
  };

  return (
    <div className="gps-camera">
      {/* Hidden file input — capture="environment" forces rear camera, no gallery */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="gps-camera-input"
        onChange={handleFileChange}
        disabled={disabled || state === "acquiring-gps" || state === "processing"}
      />

      {/* Button to trigger camera */}
      {state !== "ready" && (
        <button
          className={`button gps-camera-btn ${state === "error" ? "button-danger" : ""}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || state === "acquiring-gps" || state === "processing"}
        >
          {state === "acquiring-gps" || state === "processing" ? (
            <span className="spinner" />
          ) : (
            <span className="camera-icon">📷</span>
          )}
          {stateLabels[state]}
        </button>
      )}

      {/* Error message */}
      {errorMsg && <p className="error-text">{errorMsg}</p>}

      {/* Preview + confirm/retake */}
      {state === "ready" && preview && (
        <div className="gps-camera-preview">
          <img src={preview} alt="Watermarked preview" className="gps-preview-img" />
          {coords && (
            <p className="gps-coords-label">
              📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </p>
          )}
          {!coords && (
            <p className="gps-coords-label gps-coords-warn">
              ⚠ GPS unavailable — location not embedded
            </p>
          )}
          <div className="button-row">
            <button className="button button-secondary" type="button" onClick={handleRetake}>
              Retake
            </button>
            <button className="button" type="button" onClick={handleConfirm}>
              Use This Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
