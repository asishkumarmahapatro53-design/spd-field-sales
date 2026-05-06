/**
 * Client-side image utilities for GPS watermarking and compression.
 * All processing happens in the browser, so uploads stay smaller.
 */

export interface CompressionOptions {
  maxDimension?: number;
  minDimension?: number;
  targetMaxBytes?: number;
  initialQuality?: number;
  minimumQuality?: number;
  qualityStep?: number;
}

export interface WatermarkOptions {
  agentName: string;
  employeeId: string;
  siteName?: string;
  siteAddress?: string;
  lat?: number;
  lng?: number;
  capturedAtIso?: string | null;
  includeWatermark?: boolean;
  compression?: CompressionOptions;
}

/**
 * Draw a GPS/timestamp watermark on a photo and compress it to WebP.
 */
export async function watermarkAndCompress(file: File, opts: WatermarkOptions): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      void compressWithWatermark(img, file, opts)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          URL.revokeObjectURL(url);
        });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load selected image."));
    };

    img.src = url;
  });
}

async function compressWithWatermark(img: HTMLImageElement, file: File, opts: WatermarkOptions) {
  const compression = opts.compression ?? {};
  const maxDimension = compression.maxDimension ?? 1920;
  const minDimension = Math.min(compression.minDimension ?? 960, maxDimension);
  const targetMaxBytes = compression.targetMaxBytes ?? 500 * 1024;
  const initialQuality = clampQuality(compression.initialQuality ?? 0.75);
  const minimumQuality = clampQuality(compression.minimumQuality ?? 0.42);
  const qualityStep = Math.max(0.04, compression.qualityStep ?? 0.08);

  const watermarkTimestamp = resolveWatermarkTimestamp(file, opts);
  let dimension = maxDimension;
  let canvas = opts.includeWatermark === false ? drawPlainCanvas(img, dimension) : drawWatermarkedCanvas(img, opts, dimension, watermarkTimestamp);
  let bestBlob = await canvasToWebpBlob(canvas, initialQuality);

  while (bestBlob.size > targetMaxBytes) {
    let quality = initialQuality;
    let matchedTarget = false;

    while (quality >= minimumQuality) {
      const candidate = await canvasToWebpBlob(canvas, quality);

      if (candidate.size <= bestBlob.size) {
        bestBlob = candidate;
      }

      if (candidate.size <= targetMaxBytes) {
        bestBlob = candidate;
        matchedTarget = true;
        break;
      }

      quality = roundQuality(quality - qualityStep);
    }

    if (matchedTarget) {
      break;
    }

    const nextDimension = Math.max(minDimension, Math.round(dimension * 0.82));
    if (nextDimension >= dimension) {
      break;
    }

    dimension = nextDimension;
    canvas = opts.includeWatermark === false ? drawPlainCanvas(img, dimension) : drawWatermarkedCanvas(img, opts, dimension, watermarkTimestamp);
    bestBlob = await canvasToWebpBlob(canvas, Math.min(initialQuality, 0.68));
  }

  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^\w.-]/g, "_").slice(0, 80) || "photo";
  const stampedName = `${baseName}_${formatCompactTimestamp(watermarkTimestamp)}.webp`;

  return new File([bestBlob], stampedName, {
    type: "image/webp",
    lastModified: watermarkTimestamp.getTime(),
  });
}

function createScaledCanvas(img: HTMLImageElement, maxDimension: number) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context is unavailable.");
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function drawPlainCanvas(img: HTMLImageElement, maxDimension: number) {
  return createScaledCanvas(img, maxDimension).canvas;
}

function drawWatermarkedCanvas(img: HTMLImageElement, opts: WatermarkOptions, maxDimension: number, capturedAt: Date) {
  const { canvas, ctx } = createScaledCanvas(img, maxDimension);

  const dateStr = capturedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = capturedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const lines: string[] = [];
  if (opts.siteName) {
    lines.push(`[GPS] ${opts.siteName}`);
  }
  if (opts.siteAddress) {
    lines.push(opts.siteAddress);
  }
  if (opts.lat !== undefined && opts.lng !== undefined) {
    lines.push(`GPS: ${opts.lat.toFixed(6)}, ${opts.lng.toFixed(6)}`);
  }
  lines.push(`${dateStr}  ${timeStr}`);
  lines.push(`${opts.agentName}  (${opts.employeeId})`);
  lines.push("SPD Field Sales");

  const fontSize = Math.max(12, Math.round(canvas.height * 0.022));
  const lineHeight = fontSize * 1.5;
  const padding = fontSize * 0.8;
  const barHeight = lines.length * lineHeight + padding * 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.60)";
  ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `${fontSize}px monospace`;
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 3;

  lines.forEach((line, index) => {
    const y = canvas.height - barHeight + padding + (index + 0.75) * lineHeight;
    ctx.fillText(line, padding, y);
  });

  return canvas;
}

function resolveWatermarkTimestamp(file: File, opts: WatermarkOptions) {
  const fromInput = opts.capturedAtIso ? new Date(opts.capturedAtIso) : null;
  if (fromInput && !Number.isNaN(fromInput.getTime())) {
    return fromInput;
  }

  if (Number.isFinite(file.lastModified) && file.lastModified > 0) {
    const fromFile = new Date(file.lastModified);
    if (!Number.isNaN(fromFile.getTime())) {
      return fromFile;
    }
  }

  return new Date();
}

function formatCompactTimestamp(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  const second = String(value.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob failed"));
          return;
        }

        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

function clampQuality(value: number) {
  return Math.max(0.1, Math.min(0.95, roundQuality(value)));
}

function roundQuality(value: number) {
  return Math.round(value * 100) / 100;
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
