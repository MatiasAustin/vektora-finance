export function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

export function formatDateID(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}
