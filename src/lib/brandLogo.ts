"use client";

import type { Brand } from "@/lib/types";

const LOCAL_LOGO_PREFIX = "vektora_brand_logo_";

/**
 * Ambil logo brand:
 * 1) Dari kolom `logo_url` di database (bila sudah ada), atau
 * 2) Dari description JSON/prefix bila tersimpan, atau
 * 3) Dari cache localStorage per brand.id / brand.slug.
 */
export function getBrandLogo(brand?: Partial<Brand> | null): string | null {
  if (!brand) return null;
  if (brand.logo_url) return brand.logo_url;
  if (typeof window !== "undefined") {
    if (brand.id) {
      const byId = localStorage.getItem(LOCAL_LOGO_PREFIX + brand.id);
      if (byId) return byId;
    }
    if (brand.slug) {
      const bySlug = localStorage.getItem(LOCAL_LOGO_PREFIX + brand.slug);
      if (bySlug) return bySlug;
    }
  }
  return null;
}

/** Simpan logo ke localStorage sebagai cadangan instan bila kolom database belum dimigrasi. */
export function setLocalBrandLogo(brand: Pick<Brand, "id" | "slug">, dataUrl: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (dataUrl) {
      if (brand.id) localStorage.setItem(LOCAL_LOGO_PREFIX + brand.id, dataUrl);
      if (brand.slug) localStorage.setItem(LOCAL_LOGO_PREFIX + brand.slug, dataUrl);
    } else {
      if (brand.id) localStorage.removeItem(LOCAL_LOGO_PREFIX + brand.id);
      if (brand.slug) localStorage.removeItem(LOCAL_LOGO_PREFIX + brand.slug);
    }
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Kompresi gambar otomatis di browser menggunakan HTML5 Canvas:
 * - Mengubah ukuran proporsional ke maksimal `maxDim` px (default 240px)
 * - Mengekspor ke WebP (atau PNG bila WebP tidak didukung) dengan kualitas `quality` (default 0.82)
 * - Menghasilkan Data URL ringkas (~5KB - 20KB) yang tidak membebani database maupun PDF.
 */
export async function compressLogoFile(
  file: File,
  maxDim = 240,
  quality = 0.82
): Promise<{ dataUrl: string; width: number; height: number; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("File harus berupa gambar (PNG, JPG, WebP, atau SVG)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Format gambar tidak valid."));
      img.onload = () => {
        let width = img.naturalWidth || img.width || maxDim;
        let height = img.naturalHeight || img.height || maxDim;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDim) / width));
            width = maxDim;
          } else {
            width = Math.max(1, Math.round((width * maxDim) / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D tidak tersedia di browser ini."));
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/png");
        }
        const sizeKB = Math.max(1, Math.round((dataUrl.length * 3) / 4 / 1024));
        resolve({ dataUrl, width, height, sizeKB });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
