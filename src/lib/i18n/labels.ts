/**
 * Arabic display labels for the canonical enum keys in `src/lib/enums.ts`.
 *
 * The database stores stable ASCII keys; the UI renders Arabic via `label(...)`.
 * This is the ONLY place Arabic status/type text should live.
 */

type Dict = Record<string, string>;

const LABELS: Record<string, Dict> = {
  userStatus: { active: "نشط", inactive: "غير نشط", suspended: "موقوف" },
  branchStatus: { active: "نشط", inactive: "غير نشط" },
  donorType: { individual: "فرد", organization: "مؤسسة" },
  donorTag: { bronze: "برونزي", silver: "فضي", gold: "ذهبي", platinum: "بلاتيني" },
  donorStatus: { active: "نشط", inactive: "غير نشط" },
  campaignStatus: {
    planned: "مخطط",
    active: "نشطة",
    completed: "مكتملة",
    cancelled: "ملغاة",
  },
  projectStatus: {
    planned: "مخطط",
    active: "نشط",
    on_hold: "متوقف",
    completed: "مكتمل",
    cancelled: "ملغي",
  },
  donationMethod: {
    cash: "نقدي",
    transfer: "تحويل بنكي",
    pos: "شبكة",
    cheque: "شيك",
    online: "إلكتروني",
  },
  donationChannel: {
    direct: "مباشر",
    online: "إلكتروني",
    campaign: "حملة",
    bank: "بنك",
  },
  donationStatus: { draft: "مسودة", confirmed: "مؤكد", cancelled: "ملغي" },
  beneficiaryCategory: {
    needy_family: "أسرة محتاجة",
    orphan: "يتيم",
    widow: "أرملة",
    disabled: "ذوو إعاقة",
    elderly: "مسن",
    other: "أخرى",
  },
  beneficiaryStatus: {
    new: "جديد",
    active: "نشط",
    suspended: "موقوف",
    archived: "مؤرشف",
  },
  maritalStatus: {
    single: "أعزب",
    married: "متزوج",
    divorced: "مطلق",
    widowed: "أرمل",
  },
  aidType: {
    urgent: "مساعدة عاجلة",
    monthly: "كفالة شهرية",
    seasonal: "موسمية",
    medical: "طبية",
    educational: "تعليمية",
    in_kind: "عينية",
  },
  aidStatus: {
    pending: "بانتظار الموافقة",
    approved: "معتمدة",
    rejected: "مرفوضة",
    delivered: "مسلّمة",
    cancelled: "ملغاة",
  },
  receiptType: { donation: "تبرع", aid: "مساعدة", misc: "متنوع" },
  receiptStatus: { issued: "صادر", cancelled: "ملغي" },
  accountClassification: {
    asset: "أصول",
    liability: "التزامات",
    equity: "صافي الأصول",
    revenue: "إيرادات",
    expense: "مصروفات",
  },
  accountStatus: { active: "نشط", inactive: "غير نشط" },
  journalStatus: {
    draft: "مسودة",
    pending: "بانتظار الاعتماد",
    posted: "مرحّل",
    reversed: "معكوس",
    cancelled: "ملغى",
  },
  fund: { unrestricted: "غير مقيّد", restricted: "مقيّد", endowment: "أوقاف" },
  costCenterStatus: { active: "نشط", inactive: "غير نشط" },
  budgetStatus: {
    draft: "مسودة",
    approved: "معتمدة",
    locked: "مقفلة",
    closed: "مغلقة",
  },
  fiscalPeriodStatus: { open: "مفتوحة", closed: "مقفلة" },
  approvalStatus: { pending: "بانتظار الموافقة", approved: "معتمد", rejected: "مرفوض" },
  priority: { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" },
  supplierStatus: { active: "نشط", inactive: "غير نشط", blacklisted: "محظور" },
  purchaseRequestStatus: {
    draft: "مسودة",
    submitted: "مقدّم",
    approved: "معتمد",
    rejected: "مرفوض",
    ordered: "تم الطلب",
    cancelled: "ملغي",
  },
  purchaseOrderStatus: {
    draft: "مسودة",
    sent: "مُرسل",
    partial: "استلام جزئي",
    received: "مستلم",
    closed: "مغلق",
    cancelled: "ملغي",
  },
  quoteStatus: { pending: "بانتظار", accepted: "مقبول", rejected: "مرفوض" },
  inventoryItemStatus: { active: "نشط", inactive: "غير نشط" },
  warehouseStatus: { active: "نشط", inactive: "غير نشط" },
  stockMovementType: {
    in: "إدخال",
    out: "إخراج",
    transfer: "تحويل",
    adjustment: "تسوية",
  },
  stocktakeStatus: {
    draft: "مسودة",
    counting: "جاري الجرد",
    completed: "مكتمل",
    cancelled: "ملغي",
  },
  grantStatus: {
    pending: "معلق",
    active: "نشط",
    completed: "مكتمل",
    cancelled: "ملغي",
  },
  endowmentType: { general: "وقف عام", specific: "وقف خاص", investment: "وقف استثماري" },
  endowmentStatus: { active: "نشط", inactive: "غير نشط" },
  membershipRole: {
    member: "عضو",
    chair: "رئيس",
    vice_chair: "نائب الرئيس",
    treasurer: "أمين الصندوق",
    secretary: "أمين السر",
  },
  membershipType: {
    board: "مجلس إدارة",
    general_assembly: "جمعية عمومية",
    committee: "لجنة",
  },
  membershipStatus: { active: "نشط", inactive: "غير نشط" },
  meetingStatus: { scheduled: "مجدول", held: "منعقد", cancelled: "ملغي" },
  assetStatus: {
    active: "نشط",
    disposed: "مستبعد",
    under_maintenance: "تحت الصيانة",
  },
  assetCondition: { excellent: "ممتاز", good: "جيد", fair: "مقبول", poor: "ضعيف" },
  depreciationMethod: { straight_line: "قسط ثابت", declining_balance: "متناقص" },
  assetMovementType: {
    transfer: "نقل",
    disposal: "استبعاد",
    maintenance: "صيانة",
    revaluation: "إعادة تقييم",
  },
};

export type LabelGroup = keyof typeof LABELS;

/**
 * Translate an enum key to its Arabic label.
 * Falls back to the key itself if not found (never throws).
 */
export function label(group: LabelGroup, key: string | null | undefined): string {
  if (!key) return "";
  return LABELS[group]?.[key] ?? key;
}

/** All {value,label} options for a group — handy for <Select> inputs. */
export function options(group: LabelGroup): Array<{ value: string; label: string }> {
  const dict = LABELS[group] ?? {};
  return Object.entries(dict).map(([value, ar]) => ({ value, label: ar }));
}

export { LABELS };
