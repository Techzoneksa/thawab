import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge, Btn, Table, Td, statusTone, SectionTitle } from "@/components/erp/AppShell";
import { DONORS, DONATIONS, fmtSAR } from "@/data/sample";
import { Phone, Mail, MapPin, Printer, MessageCircle, Edit, Repeat } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/donors/$id")({
  head: () => ({ meta: [{ title: "ملف المتبرع — ثواب" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const donor = DONORS.find((d) => d.id === id) || DONORS[0];
  const [tab, setTab] = useState("نظرة عامة");
  const tabs = ["نظرة عامة", "التبرعات", "الإيصالات", "الاتصالات", "المشاريع المدعومة", "ملاحظات"];

  return (
    <AppShell breadcrumb={["الرئيسية", "المتبرعون", donor.name]} title={donor.name}
      actions={<><Btn variant="outline"><MessageCircle size={15} />تواصل</Btn><Btn variant="outline"><Printer size={15} />طباعة</Btn><Btn variant="primary"><Edit size={15} />تعديل</Btn></>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="p-5 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-primary to-info text-white text-2xl font-extrabold">{donor.name[0]}</div>
            <h3 className="mt-3 font-bold">{donor.name}</h3>
            <div className="text-xs text-muted-foreground font-mono">{donor.id}</div>
            <div className="mt-2 flex gap-1.5"><Badge tone="info">{donor.type}</Badge><Badge tone={donor.tag === "ذهبي" ? "warning" : "muted"}>{donor.tag}</Badge>{donor.recurring && <Badge tone="success">متكرر</Badge>}</div>
          </div>
          <div className="mt-5 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Phone size={14} /> {donor.phone}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><Mail size={14} /> donor@example.sa</div>
            <div className="flex items-center gap-2 text-muted-foreground"><MapPin size={14} /> {donor.city}، المملكة العربية السعودية</div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4">
            <div><div className="text-xs text-muted-foreground">إجمالي التبرعات</div><div className="font-bold tabular-nums text-lg">{fmtSAR(donor.total)}</div></div>
            <div><div className="text-xs text-muted-foreground">عدد العمليات</div><div className="font-bold text-lg">{donor.donations}</div></div>
            <div><div className="text-xs text-muted-foreground">أول تبرع</div><div className="font-semibold text-sm">1443/05/12</div></div>
            <div><div className="text-xs text-muted-foreground">آخر تبرع</div><div className="font-semibold text-sm">1446/10/12</div></div>
          </div>
        </Card>

        <div className="lg:col-span-3 space-y-4">
          <Card className="px-2">
            <div className="flex flex-wrap gap-1 border-b px-2">
              {tabs.map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`px-4 py-3 text-sm font-medium border-b-2 ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
              ))}
            </div>

            {tab === "نظرة عامة" && (
              <div className="p-5 grid grid-cols-2 gap-4">
                {[
                  { l: "تبرعات هذا العام", v: fmtSAR(620_000) },
                  { l: "متوسط التبرع", v: fmtSAR(Math.round(donor.total / donor.donations)) },
                  { l: "أعلى تبرع", v: fmtSAR(600_000) },
                  { l: "حملات مدعومة", v: "4 حملات" },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">{s.l}</div>
                    <div className="font-bold mt-1 tabular-nums">{s.v}</div>
                  </div>
                ))}
                <div className="col-span-2">
                  <SectionTitle title="مخطط التبرعات الشهرية" />
                  <div className="flex items-end gap-1.5 h-32">
                    {[40, 65, 30, 80, 50, 95, 70, 100, 60, 75, 85, 55].map((h, i) => (
                      <div key={i} className="flex-1 bg-gradient-to-t from-primary to-info/70 rounded-t" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "التبرعات" && (
              <div className="p-3">
                <Table
                  columns={["رقم", "التاريخ", "المشروع", "المبلغ", "الطريقة", "الحالة"]}
                  rows={DONATIONS.slice(0, 6)}
                  renderRow={(d) => (
                    <>
                      <Td className="font-mono text-xs">{d.id}</Td>
                      <Td>{d.date}</Td>
                      <Td>{d.project}</Td>
                      <Td className="tabular-nums font-bold">{fmtSAR(d.amount)}</Td>
                      <Td>{d.method}</Td>
                      <Td><Badge tone={statusTone(d.status)}>{d.status}</Badge></Td>
                    </>
                  )}
                />
              </div>
            )}

            {tab === "الإيصالات" && (
              <div className="p-5 space-y-2">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-semibold">إيصال رقم RCT-2406-0{n}88</div>
                      <div className="text-xs text-muted-foreground">صادر بتاريخ 1446/10/{12 - n} · بمبلغ {fmtSAR(250_000 - n * 10000)}</div>
                    </div>
                    <div className="flex gap-2"><Btn variant="outline"><Printer size={14} />طباعة</Btn><Btn variant="ghost">تنزيل PDF</Btn></div>
                  </div>
                ))}
              </div>
            )}

            {tab === "الاتصالات" && (
              <div className="p-5">
                <ol className="relative border-r-2 border-muted pr-4 space-y-4">
                  {[
                    { d: "1446/10/12", t: "رسالة شكر على تبرع كفالة الأيتام", c: "WhatsApp" },
                    { d: "1446/09/28", t: "دعوة لحفل الجمعية السنوي", c: "بريد إلكتروني" },
                    { d: "1446/09/15", t: "تقرير ربعي عن المشاريع المدعومة", c: "بريد إلكتروني" },
                    { d: "1446/08/20", t: "مكالمة شكر شخصية من المدير التنفيذي", c: "هاتف" },
                  ].map((it, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -right-[26px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-card" />
                      <div className="text-sm font-semibold">{it.t}</div>
                      <div className="text-xs text-muted-foreground">{it.d} · عبر {it.c}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {tab === "المشاريع المدعومة" && (
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                {["كفالة الأيتام 1446", "إفطار صائم", "السلال الغذائية", "كسوة الشتاء"].map((p) => (
                  <div key={p} className="rounded-lg border p-4">
                    <div className="font-semibold">{p}</div>
                    <div className="text-xs text-muted-foreground mt-1">إجمالي الدعم: {fmtSAR(120_000)}</div>
                    <div className="h-2 rounded-full bg-muted mt-3 overflow-hidden"><div className="h-full bg-primary" style={{ width: "70%" }} /></div>
                  </div>
                ))}
              </div>
            )}

            {tab === "ملاحظات" && (
              <div className="p-5">
                <textarea rows={6} className="w-full rounded-lg border bg-background p-3 text-sm" placeholder="أضف ملاحظة داخلية عن المتبرع..." defaultValue="متبرع منتظم منذ 1443هـ، يفضل التواصل عبر WhatsApp ودعم مشاريع الأيتام بشكل خاص. تم تكريمه في الحفل السنوي 1445." />
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
