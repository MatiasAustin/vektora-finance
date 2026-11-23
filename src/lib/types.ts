export type PaymentStatus = "sudah_dibayar" | "belum_reimburse";
export type TransactionKind = "income" | "expense";

export interface Brand {
  id: string;
  name: string;
  slug: string;
  segment: string | null;
  description: string | null;
  is_active: boolean;
}

export interface Channel {
  id: string;
  brand_id: string | null;
  name: string;
  slug: string;
  is_active: boolean;
}

export interface TransactionRow {
  id: string;
  brand_id: string;
  channel_id: string | null;
  kind: TransactionKind;
  txn_date: string;
  description: string;
  category: string | null;
  amount: number;
  payment_method: string | null;
  ref: string | null;
  notes: string | null;
  payment_status: PaymentStatus;
  reimbursed_at: string | null;
  created_at?: string;
  // Bayar hutang (24 Nov 2026): pembayaran cicilan/pelunasan yang tercatat
  // sebagai transaksi expense terhubung ke liabilities.id.
  liability_id?: string | null;
  brands?: { name: string } | null;
  channels?: { name: string } | null;
  liabilities?: { creditor: string } | null;
}

export interface AssetRow {
  id: string;
  brand_id: string;
  name: string;
  category: string | null;
  qty: number;
  unit_price: number;
  total_price: number;
  purchased_at: string | null;
  condition: string | null;
  notes: string | null;
  brands?: { name: string } | null;
}

export interface LiabilityRow {
  id: string;
  brand_id: string | null;
  creditor: string;
  amount: number;
  remaining_amount: number;
  due_date: string | null;
  monthly_installment: number | null;
  months: number | null;
  paid_by: "company" | "investor";
  status: string;
  notes: string | null;
  // Aset terkait (24 Nov 2026): hutang yang dibayar "menjadi aset" —
  // saat lunas, aset sepenuhnya milik perusahaan.
  asset_id?: string | null;
  brands?: { name: string } | null;
  assets?: { name: string } | null;
}

export interface EmployeeRow {
  id: string;
  brand_id: string;
  name: string;
  role: string | null;
  team: string | null;
  monthly_salary: number;
  is_fixed_cost: boolean;
  is_management: boolean;
  is_active: boolean;
  brands?: { name: string } | null;
}

export interface FeeSplitRow {
  id: string;
  brand_id: string;
  dividend_pct: number;
  management_fee_pct: number;
  retained_pct: number;
  // Penerima fee (24 Nov 2026): tiap penerima boleh terhubung ke seorang
  // employee (employee_id opsional, null bila bukan tim — mis. komisaris
  // eksternal). Tautan ini disimpan di dalam objek jsonb, struktur tabel
  // fee_splits TIDAK berubah.
  dividend_recipients: { name: string; pct_of_dividend: number; employee_id?: string | null }[];
  management_fee_recipients: { name: string; pct_of_fee: number; employee_id?: string | null }[];
  effective_from: string | null;
  brands?: { name: string } | null;
}

/** Aturan inti: Belum reimburse dicatat tapi TIDAK masuk total. */
export function countedAmount(t: { kind: TransactionKind; amount: number; payment_status: PaymentStatus }): number {
  if (t.kind === "expense" && t.payment_status === "belum_reimburse") return 0;
  return t.amount;
}

/**
 * KOREKSI 24 Nov 2026 (Mattin): pembayaran hutang TIDAK BOLEH double count.
 * Aset yang dibeli lewat hutang (mis. printer P2S) SUDAH tercatat sebagai
 * aset. Cicilan yang dibayar HANYA mengurangi hutang — cicilan itu BUKAN
 * pengeluaran operasional: tidak masuk total pengeluaran, tidak mengurangi
 * laba, dan tidak menambah total nilai aset. Ini pergerakan neraca (kas
 * berkurang, hutang berkurang), bukan beban. Karena itu expense yang punya
 * liability_id terisi DIKECUALIKAN dari expense & net — perlakuannya sama
 * seperti Belum reimburse: dicatat, tapi tidak masuk hitungan. View SQL
 * v_brand_monthly_summary mengikuti aturan yang sama.
 */
export function summarize(transactions: TransactionRow[]) {
  const income = transactions
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expenseCounted = transactions
    .filter((t) => t.kind === "expense" && !t.liability_id)
    .reduce((s, t) => s + countedAmount(t), 0);
  const belumReimburse = transactions
    .filter((t) => t.kind === "expense" && t.payment_status === "belum_reimburse")
    .reduce((s, t) => s + t.amount, 0);
  const net = income - expenseCounted;
  return { income, expense: expenseCounted, belumReimburse, net };
}

/**
 * Pembagian fee: hanya bila laba bersih > 0, kalau negatif distribusi = 0.
 * Mengembalikan rupiah per komponen + per penerima.
 */
export function computeFeeSplit(
  netProfit: number,
  split: FeeSplitRow
): {
  dividend: number;
  managementFee: number;
  retained: number;
  dividendBreakdown: { name: string; amount: number; pct: number; employee_id?: string | null }[];
  feeBreakdown: { name: string; amount: number; pct: number; employee_id?: string | null }[];
} {
  if (netProfit <= 0) {
    return {
      dividend: 0,
      managementFee: 0,
      retained: 0,
      dividendBreakdown: (split.dividend_recipients ?? []).map((r) => ({ name: r.name, amount: 0, pct: r.pct_of_dividend, employee_id: r.employee_id ?? null })),
      feeBreakdown: (split.management_fee_recipients ?? []).map((r) => ({ name: r.name, amount: 0, pct: r.pct_of_fee, employee_id: r.employee_id ?? null })),
    };
  }
  const dividend = Math.round((netProfit * split.dividend_pct) / 100);
  const managementFee = Math.round((netProfit * split.management_fee_pct) / 100);
  const retained = netProfit - dividend - managementFee;
  return {
    dividend,
    managementFee,
    retained,
    dividendBreakdown: (split.dividend_recipients ?? []).map((r) => ({
      name: r.name,
      amount: Math.round((dividend * r.pct_of_dividend) / 100),
      pct: r.pct_of_dividend,
      employee_id: r.employee_id ?? null,
    })),
    feeBreakdown: (split.management_fee_recipients ?? []).map((r) => ({
      name: r.name,
      amount: Math.round((managementFee * r.pct_of_fee) / 100),
      pct: r.pct_of_fee,
      employee_id: r.employee_id ?? null,
    })),
  };
}

export function fixedCostOpex(employees: EmployeeRow[]): number {
  return employees
    .filter((e) => e.is_active && e.is_fixed_cost && !e.is_management)
    .reduce((s, e) => s + e.monthly_salary, 0);
}

// ---------- Login, peran & tim ----------
export type AppRole = "admin" | "management" | "komisaris" | "investor" | "karyawan";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  brand_ids: string[] | null;
  employee_id: string | null;
  active: boolean;
  created_at?: string;
}

// ---------- Slip gaji ----------
export type PayrollStatus = "draft" | "final" | "paid";
export type PayslipStatus = "belum_dibayar" | "sudah_dibayar";
export type SendVia = "whatsapp" | "email" | "langsung" | null;

export interface PayrollPeriod {
  id: string;
  brand_id: string;
  period: string; // YYYY-MM
  status: PayrollStatus;
  notes: string | null;
  created_at?: string;
  brands?: { name: string } | null;
}

export interface PayslipLine {
  label: string;
  amount: number;
}

export interface Payslip {
  id: string;
  payroll_period_id: string;
  employee_id: string | null;
  // Snapshot nama saat slip dibuat (24 Nov 2026): slip tetap menampilkan
  // nama walau karyawan sudah dihapus (employee_id jadi null).
  employee_name?: string | null;
  base_salary: number;
  allowances: PayslipLine[];
  deductions: PayslipLine[];
  gross: number;
  total_deductions: number;
  net_pay: number;
  status: PayslipStatus;
  paid_at: string | null;
  sent_at: string | null;
  sent_via: SendVia;
  notes: string | null;
  employees?: { name: string; role: string | null; team: string | null; brand_id: string; is_management?: boolean } | null;
  payroll_periods?: { period: string; brand_id: string } | null;
}

export function payslipTotals(slips: Payslip[]) {
  const totalNet = slips.reduce((s, p) => s + p.net_pay, 0);
  const paid = slips.filter((p) => p.status === "sudah_dibayar").reduce((s, p) => s + p.net_pay, 0);
  const outstanding = totalNet - paid;
  return { totalNet, paid, outstanding, count: slips.length };
}

/**
 * Slip yang sudah dibayar masuk OPEX bulan itu; yang belum = tunggakan.
 * KOREKSI 24 Nov 2026: sebelumnya SEMUA slip yang dibayar dihitung OPEX,
 * termasuk slip management — padahal gaji management dibayar dari
 * Management Fee, bukan OPEX (sama seperti fixedCostOpex). Sekarang
 * opexFromPayslips hanya menghitung slip karyawan (is_management false);
 * slip management dihitung terpisah oleh managementFeeFromPayslips.
 */
export function opexFromPayslips(slips: Payslip[]): number {
  return slips
    .filter((p) => p.status === "sudah_dibayar" && !p.employees?.is_management)
    .reduce((s, p) => s + p.net_pay, 0);
}

/** Slip management yang sudah dibayar — keluar dari Management Fee, bukan OPEX. */
export function managementFeeFromPayslips(slips: Payslip[]): number {
  return slips
    .filter((p) => p.status === "sudah_dibayar" && p.employees?.is_management)
    .reduce((s, p) => s + p.net_pay, 0);
}

// ---------- Dividen tahunan (cair 1x per tahun) ----------
export type DividendPayoutStatus = "belum_dibayar" | "sudah_dibayar";

export interface DividendPayout {
  id: string;
  brand_id: string;
  year: number;
  recipient_name: string;
  pct_of_dividend: number;
  amount: number;
  status: DividendPayoutStatus;
  paid_at: string | null;
  // Terkirim (24 Nov 2026): seperti slip gaji — "Tandai terkirim" hanya
  // mencatat sent_at + sent_via, pengiriman tetap manual lewat WhatsApp.
  sent_at: string | null;
  sent_via: SendVia;
  notes: string | null;
  created_at?: string;
  brands?: { name: string } | null;
}

// ---------- Modal & pajak ----------
export interface CapitalContribution {
  id: string;
  brand_id: string;
  contributor: string;
  role: string | null; // pemodal / eksekutor
  amount: number | null; // null = Belum dicatat (jangan ditebak)
  contributed_at: string | null;
  status: "belum_dicatat" | "aktif";
  notes: string | null;
  brands?: { name: string } | null;
}

export interface TaxRow {
  id: string;
  brand_id: string;
  type: string; // PPN / PPh
  period: string | null;
  amount: number;
  status: string;
  notes: string | null;
  brands?: { name: string } | null;
}
