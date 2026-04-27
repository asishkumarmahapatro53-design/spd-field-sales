"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentPosition, reverseGeocode, watermarkAndCompress, type CompressionOptions } from "@/lib/image-utils";

interface GpsCameraProps {
  label?: string;
  onCapture: (file: File, coords: { lat: number; lng: number } | null) => void;
  siteName?: string;
  agentName: string;
  employeeId: string;
  compression?: CompressionOptions;
  disabled?: boolean;
}

type CameraState = "idle" | "acquiring-gps" | "processing" | "ready" | "error";

export function GpsCamera({
  label = "Take Photo",
  onCapture,
  siteName,
  agentName,
  employeeId,
  compression,
  disabled,
}: GpsCameraProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.files?.[0];
    if (!raw) {
      return;
    }

    event.target.value = "";
    clearPreview();
    setErrorMsg("");
    setCapturedFile(null);
    setState("acquiring-gps");

    try {
      const position = await getCurrentPosition();
      const gpsCoords = position ? { lat: position.latitude, lng: position.longitude } : null;
      setCoords(gpsCoords);
      setState("processing");

      let siteAddress: string | undefined;
      if (gpsCoords) {
        const geocoded = await reverseGeocode(gpsCoords.lat, gpsCoords.lng);
        siteAddress = geocoded ?? undefined;
      }

      const processedFile = await watermarkAndCompress(raw, {
        agentName,
        employeeId,
        siteName,
        siteAddress,
        lat: gpsCoords?.lat,
        lng: gpsCoords?.lng,
        compression,
      });

      const previewUrl = URL.createObjectURL(processedFile);
      setPreview(previewUrl);
      setCapturedFile(processedFile);
      setState("ready");
    } catch (error) {
      console.error("GpsCamera error:", error);
      setErrorMsg("Failed to process photo. Please try again.");
      setState("error");
    }
  }

  function handleConfirm() {
    if (!capturedFile) {
      return;
    }

    onCapture(capturedFile, coords);
    clearPreview();
    setCapturedFile(null);
    setState("idle");
  }

  function handleRetake() {
    clearPreview();
    setCapturedFile(null);
    setErrorMsg("");
    setState("idle");
    inputRef.current?.click();
  }

  function clearPreview() {
    setPreview((currentPreview) => {
      if (currentPreview) {
        URL.revokeObjectURL(currentPreview);
      }

      return null;
    });
  }

  const stateLabels: Record<CameraState, string> = {
    idle: label,
    "acquiring-gps": "Getting GPS...",
    processing: "Watermarking...",
    ready: "Photo Ready",
    error: "Retry",
  };

  return (
    <div className="gps-camera">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="gps-camera-input"
        onChange={handleFileChange}
        disabled={disabled || state === "acquiring-gps" || state === "processing"}
      />

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
            <span className="camera-icon" aria-hidden="true">
              [CAM]
            </span>
          )}
          {stateLabels[state]}
        </button>
      )}

      {errorMsg ? <p className="error-text">{errorMsg}</p> : null}

      {state === "ready" && preview ? (
        <div className="gps-camera-preview">
          <img src={preview} alt="Watermarked preview" className="gps-preview-img" />
          {coords ? (
            <p className="gps-coords-label">GPS: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
          ) : (
            <p className="gps-coords-label gps-coords-warn">GPS unavailable - location not embedded</p>
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
      ) : null}
    </div>
  );
}
