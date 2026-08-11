// Number/currency/percentage formatters (Arabic locale). No demo data here.

export const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(n) + " ر.س";
export const fmtNum = (n: number) => new Intl.NumberFormat("ar-SA").format(n);
export const fmtPct = (n: number) => `${n}%`;
