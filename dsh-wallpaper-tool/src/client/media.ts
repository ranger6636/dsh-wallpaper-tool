/**
 * Media helpers: probing uploaded files, extracting preview thumbnails, and the
 * small canvas utilities shared by the crop editor.
 */

export interface Probe {
  width: number;
  height: number;
  duration: number | null;
  thumb: string | null;
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
    } catch {
      resolve(null);
    }
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image decode failed'));
    image.src = url;
  });
}

function drawThumb(source: CanvasImageSource, width: number, height: number, max: number): string | null {
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL('image/webp', 0.72);
  } catch {
    try {
      return canvas.toDataURL('image/jpeg', 0.72);
    } catch {
      return null;
    }
  }
}

/** Probe an uploaded image: natural size plus a grid thumbnail. */
export async function probeImage(file: Blob, max: number): Promise<Probe> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      duration: null,
      thumb: drawThumb(image, image.naturalWidth || image.width, image.naturalHeight || image.height, max),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Probe an uploaded video: size, duration and a frame captured near the start. */
export function probeVideo(file: Blob, max: number, timeoutMs: number): Promise<Probe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const finish = (probe: Probe) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
      resolve(probe);
    };
    const timer = window.setTimeout(() => {
      finish({ width: 0, height: 0, duration: null, thumb: null });
    }, timeoutMs);

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      // Seek a little way in: the very first frame is often black.
      const target = duration && duration > 0.4 ? Math.min(duration * 0.1, 2) : 0;
      const grab = () => {
        window.clearTimeout(timer);
        let thumb: string | null = null;
        try {
          thumb = drawThumb(video, width, height, max);
        } catch {
          thumb = null;
        }
        finish({ width, height, duration, thumb });
      };
      if (target > 0) {
        video.onseeked = grab;
        try {
          video.currentTime = target;
        } catch {
          grab();
        }
      } else {
        grab();
      }
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      finish({ width: 0, height: 0, duration: null, thumb: null });
    };
    video.src = url;
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
