import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/server/db/index";
import {
  donations,
  donors,
  beneficiaries,
  aidRecords,
  projects,
  campaigns,
  grants,
  employees,
} from "@/server/db/schema";
import { authHandler, type Ctx } from "@/server/db/api-utils";
import { DonationStatus, AidStatus, BeneficiaryStatus, EmployeeStatus } from "@/lib/enums";

// GET /api/reports/summary — real organisation-wide operational aggregates.
// Read-only; computed live from the operational tables (no double counting).
async function GET(_event: { request: Request }, _ctx: Ctx) {
  const [
    donationRows,
    donorRows,
    beneficiaryRows,
    aidRows,
    projectRows,
    campaignRows,
    grantRows,
    employeeRows,
  ] = await Promise.all([
    db.select({ amount: donations.amount, status: donations.status }).from(donations),
    db.select({ id: donors.id }).from(donors),
    db.select({ status: beneficiaries.status }).from(beneficiaries),
    db.select({ amount: aidRecords.amount, status: aidRecords.status }).from(aidRecords),
    db
      .select({ budget: projects.budget, spent: projects.spent, status: projects.status })
      .from(projects),
    db.select({ raised: campaigns.raised }).from(campaigns),
    db.select({ amount: grants.amount }).from(grants),
    db.select({ salary: employees.salary, status: employees.status }).from(employees),
  ]);

  const confirmedDonations = donationRows.filter((d) => d.status === DonationStatus.CONFIRMED);
  const deliveredAid = aidRows.filter((a) => a.status === AidStatus.DELIVERED);
  const sum = <T>(rows: T[], pick: (r: T) => number | null | undefined) =>
    rows.reduce((acc, r) => acc + (pick(r) || 0), 0);

  const summary = {
    donations: {
      total: sum(confirmedDonations, (d) => d.amount),
      count: confirmedDonations.length,
    },
    donors: { count: donorRows.length },
    beneficiaries: {
      count: beneficiaryRows.length,
      active: beneficiaryRows.filter((b) => b.status === BeneficiaryStatus.ACTIVE).length,
    },
    aid: { disbursed: sum(deliveredAid, (a) => a.amount), count: deliveredAid.length },
    projects: {
      count: projectRows.length,
      budget: sum(projectRows, (p) => p.budget),
      spent: sum(projectRows, (p) => p.spent),
    },
    campaigns: { count: campaignRows.length, raised: sum(campaignRows, (c) => c.raised) },
    grants: { count: grantRows.length, total: sum(grantRows, (g) => g.amount) },
    hr: {
      count: employeeRows.length,
      active: employeeRows.filter((e) => e.status === EmployeeStatus.ACTIVE).length,
      monthlyPayroll: sum(
        employeeRows.filter((e) => e.status !== EmployeeStatus.TERMINATED),
        (e) => e.salary,
      ),
    },
  };

  return Response.json({ summary });
}

export const Route = createFileRoute("/api/reports/summary")({
  server: {
    handlers: {
      GET: authHandler("reports.view", GET),
    },
  },
});
