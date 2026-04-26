/**
 * Client-side image utilities for GPS watermarking and compression.
 * All processing happens in the browser — zero server compute cost.
 */

export interface WatermarkOptions {
  agentName: string;
  employeeId: string;
  siteName?: string;
  siteAddress?: string;
  lat?: number;
  lng?: number;
}

/**
 * Draw a GPS/timestamp watermark on a photo using an HTML5 Canvas,
 * then compress it to WebP at ~500KB.
 *
 * @param file  The raw File from the camera input
 * @param opts  Watermark metadata
 * @returns     A new compressed File with the watermark burned in
 */
export async function watermarkAndCompress(file: File, opts: WatermarkOptions): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      // Limit max dimension to 1920px to keep file size small
      const MAX = 1920;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // --- Build watermark text lines ---
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      const lines: string[] = [];
      if (opts.siteName) lines.push(`📍 ${opts.siteName}`);
      if (opts.siteAddress) lines.push(opts.siteAddress);
      if (opts.lat !== undefined && opts.lng !== undefined) {
        lines.push(`GPS: ${opts.lat.toFixed(6)}, ${opts.lng.toFixed(6)}`);
      }
      lines.push(`${dateStr}  ${timeStr}`);
      lines.push(`${opts.agentName}  (${opts.employeeId})`);
      lines.push("SPD Field Sales");

      // --- Draw semi-transparent bar at bottom ---
      const fontSize = Math.max(12, Math.round(canvas.height * 0.022));
      const lineHeight = fontSize * 1.5;
      const padding = fontSize * 0.8;
      const barHeight = lines.length * lineHeight + padding * 2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.60)";
      ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

      // --- Draw text ---
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `${fontSize}px monospace`;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 3;

      lines.forEach((line, i) => {
        const y = canvas.height - barHeight + padding + (i + 0.75) * lineHeight;
        ctx.fillText(line, padding, y);
      });

      // --- Convert to WebP, target ~0.75 quality for ~500KB ---
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"));
            return;
          }
          const outFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
            type: "image/webp",
            lastModified: Date.now(),
          });
          resolve(outFile);
        },
        "image/webp",
        0.75,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Get the current GPS position from the browser.
 * Returns null if permission is denied or unavailable.
 */
export function getCurrentPosition(): Promise<GeolocationCoordinates | null> {
  return new Promise((resolve) => {
    if (!navigator?.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/**
 * Reverse geocode GPS coordinates using the free OpenStreetMap Nominatim API.
 * No API key required, but limited to ~1 request/second.
 * Returns a human-readable address string or null on failure.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}
