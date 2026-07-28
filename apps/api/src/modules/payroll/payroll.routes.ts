import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import {
  employees, departments, payrollRuns, payslips, accounts,
} from '@ledgera/db';
import { authenticate, requireMinRole } from '../../middleware/auth.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { AccountingEngine } from '../accounting/accounting.engine.js';
import { nextSequence } from '../../utils/sequence.js';
import { logAudit } from '../../utils/audit.js';

// ── Sierra Leone PAYE Brackets (SLE p.a.) ────────────────
// 0 - 720,000      = 0%
// 720,001 - 1.8M   = 15%
// 1.8M - 3M        = 20%
// 3M - 5.4M        = 30%
// >5.4M            = 35%
function calcPayeSL(annualGross: number): number {
  const brackets = [
    { up: 720_000,    rate: 0.00 },
    { up: 1_800_000,  rate: 0.15 },
    { up: 3_000_000,  rate: 0.20 },
    { up: 5_400_000,  rate: 0.30 },
    { up: Infinity,   rate: 0.35 },
  ];

  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (annualGross <= prev) break;
    const taxable = Math.min(annualGross, b.up) - prev;
    tax += taxable * b.rate;
    prev = b.up;
  }
  return tax / 12; // monthly
}

function calcNassit(grossMonthly: number) {
  return {
    employee: grossMonthly * 0.05,  // 5%
    employer: grossMonthly * 0.10,  // 10%
  };
}

const payrollRoutes: FastifyPluginAsync = async (app) => {

  // ── Departments ───────────────────────────────────────
  app.get('/departments', { preHandler: [authenticate] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(departments)
      .where(eq(departments.organizationId, orgId));
    return { data: rows };
  });

  app.post('/departments', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const { orgId } = req.user;
    const { name } = z.object({ name: z.string().min(1).max(255) }).parse(req.body);
    const [dept] = await req.db.insert(departments).values({ organizationId: orgId, name }).returning();
    return reply.status(201).send({ data: dept });
  });

  // ── Employees ──────────────────────────────────────────
  app.get('/employees', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId } = req.user;
    const query = z.object({ active: z.coerce.boolean().optional() }).parse(req.query);
    const conditions = [eq(employees.organizationId, orgId)];
    if (query.active !== undefined) conditions.push(eq(employees.isActive, query.active));
    const rows = await req.db.select().from(employees).where(and(...conditions)).orderBy(employees.fullName);
    return { data: rows };
  });

  app.post('/employees', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranchId } = req.user;
    const body = z.object({
      fullName:       z.string().min(1).max(255),
      phone:          z.string().optional(),
      email:          z.string().email().optional(),
      nationalId:     z.string().optional(),
      nassitNumber:   z.string().optional(),
      position:       z.string().optional(),
      departmentId:   z.string().uuid().optional(),
      branchId:       z.string().uuid().optional(),
      employmentType: z.enum(['full_time','part_time','contract']).default('full_time'),
      startDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      bankName:       z.string().optional(),
      bankAccountNumber: z.string().optional(),
    }).parse(req.body);

    const count = await req.db.$count(employees, eq(employees.organizationId, orgId));
    const employeeNumber = `EMP-${String(count + 1).padStart(5, '0')}`;

    const [emp] = await req.db.insert(employees).values({
      ...body,
      organizationId: orgId,
      branchId: body.branchId ?? userBranchId ?? undefined,
      employeeNumber,
    }).returning();

    return reply.status(201).send({ data: emp });
  });

  app.get('/employees/:id', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const [emp] = await req.db.select().from(employees)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)));
    if (!emp) throw new NotFoundError('Employee');
    return { data: emp };
  });

  app.patch('/employees/:id', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const body = z.object({
      fullName:     z.string().optional(),
      phone:        z.string().optional(),
      position:     z.string().optional(),
      isActive:     z.boolean().optional(),
      endDate:      z.string().optional(),
    }).parse(req.body);

    const [updated] = await req.db.update(employees)
      .set(body)
      .where(and(eq(employees.id, id), eq(employees.organizationId, orgId)))
      .returning();

    if (!updated) throw new NotFoundError('Employee');
    return { data: updated };
  });

  // ── Payroll Runs ───────────────────────────────────────
  app.get('/payroll-runs', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { orgId } = req.user;
    const rows = await req.db.select().from(payrollRuns)
      .where(eq(payrollRuns.organizationId, orgId))
      .orderBy(desc(payrollRuns.periodEnd));
    return { data: rows };
  });

  // ── POST /payroll-runs — create & calculate run ────────
  app.post('/payroll-runs', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req, reply) => {
    const { orgId, userId, branchId: userBranchId } = req.user;
    const body = z.object({
      periodStart:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEnd:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      paymentDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      branchId:     z.string().uuid().optional(),
      // Optional per-employee overrides
      entries: z.array(z.object({
        employeeId: z.string().uuid(),
        basicSalary: z.number().positive(),
        allowances:  z.number().min(0).default(0),
      })).min(1),
    }).parse(req.body);

    const branchId = body.branchId ?? userBranchId;
    const runNumber = await nextSequence(req.db, orgId, 'payroll', 'PAY', 6);

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalEmployerNassit = 0;

    const payslipData = body.entries.map((entry) => {
      const gross = entry.basicSalary + entry.allowances;
      const nassit = calcNassit(gross);
      const paye = calcPayeSL(gross * 12);
      const totalDed = nassit.employee + paye;
      const net = gross - totalDed;

      totalGross += gross;
      totalDeductions += totalDed;
      totalNet += net;
      totalEmployerNassit += nassit.employer;

      return {
        employeeId: entry.employeeId,
        basicSalary: entry.basicSalary,
        totalAllowances: entry.allowances,
        nassitEmployee: nassit.employee,
        nassitEmployer: nassit.employer,
        payeTax: paye,
        totalDeductions: totalDed,
        grossSalary: gross,
        netSalary: net,
        lines: [
          { name: 'Basic Salary', type: 'earning', amount: entry.basicSalary },
          { name: 'Allowances', type: 'earning', amount: entry.allowances },
          { name: 'NASSIT (Employee 5%)', type: 'deduction', amount: nassit.employee },
          { name: 'PAYE Tax', type: 'deduction', amount: paye },
        ],
      };
    });

    const [run] = await req.db.insert(payrollRuns).values({
      organizationId: orgId,
      branchId: branchId ?? undefined,
      runNumber,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      paymentDate: body.paymentDate,
      status: 'draft',
      totalGross: String(totalGross),
      totalDeductions: String(totalDeductions),
      totalNet: String(totalNet),
      totalEmployerNassit: String(totalEmployerNassit),
      createdBy: userId,
    }).returning();

    if (!run) throw new Error('Failed to create payroll run');

    // Insert payslips
    await req.db.insert(payslips).values(
      payslipData.map((p) => ({
        payrollRunId: run.id,
        organizationId: orgId,
        employeeId: p.employeeId,
        basicSalary: String(p.basicSalary),
        totalAllowances: String(p.totalAllowances),
        nassitEmployee: String(p.nassitEmployee),
        nassitEmployer: String(p.nassitEmployer),
        payeTax: String(p.payeTax),
        totalDeductions: String(p.totalDeductions),
        grossSalary: String(p.grossSalary),
        netSalary: String(p.netSalary),
        lines: p.lines,
      })),
    );

    await logAudit(req.db, {
      organizationId: orgId,
      userId,
      action: 'create',
      resourceType: 'payroll_run',
      resourceId: run.id,
      resourceNumber: runNumber,
    });

    return reply.status(201).send({ data: { ...run, totalSlips: payslipData.length } });
  });

  // ── POST /payroll-runs/:id/post — approve + journal ───
  app.post('/payroll-runs/:id/post', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId, userId } = req.user;

    const [run] = await req.db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, id), eq(payrollRuns.organizationId, orgId)));
    if (!run) throw new NotFoundError('Payroll run');
    if (run.status !== 'draft') throw new ValidationError('Only draft runs can be posted');

    const accRows = await req.db.select().from(accounts).where(eq(accounts.organizationId, orgId));
    const accByCode = new Map(accRows.map((a) => [a.code, a]));

    const salaryExpense   = accByCode.get('5100');
    const nassitExpense   = accByCode.get('5110');
    const salaryPayable   = accByCode.get('2200');
    const nassitPayable   = accByCode.get('2210');
    const payePayable     = accByCode.get('2220');

    // Journal:
    // DR Salary Expense (gross)
    // DR NASSIT Expense (employer)
    // CR Salary Payable (net)
    // CR NASSIT Payable (employee + employer)
    // CR PAYE Payable
    const gross    = Number(run.totalGross);
    const empNassit = gross * 0.05;
    const empPaye  = Number(run.totalDeductions) - empNassit;
    const netPay   = Number(run.totalNet);
    const erNassit = Number(run.totalEmployerNassit);
    const totalNassit = empNassit + erNassit;

    if (salaryExpense && nassitExpense && salaryPayable && nassitPayable && payePayable) {
      const accounting = new AccountingEngine(req.db);
      const je = await accounting.postJournal({
        organizationId: orgId,
        date: run.paymentDate,
        description: `Payroll ${run.runNumber} (${run.periodStart} – ${run.periodEnd})`,
        sourceType: 'payroll',
        sourceId: run.id,
        createdBy: userId,
        lines: [
          { accountId: salaryExpense.id,  debit: gross,       credit: 0,          description: 'Gross salary' },
          { accountId: nassitExpense.id,   debit: erNassit,    credit: 0,          description: 'Employer NASSIT' },
          { accountId: salaryPayable.id,   debit: 0,           credit: netPay,     description: 'Net pay payable' },
          { accountId: nassitPayable.id,   debit: 0,           credit: totalNassit,description: 'NASSIT payable' },
          { accountId: payePayable.id,     debit: 0,           credit: empPaye,    description: 'PAYE payable' },
        ],
      });

      await req.db.update(payrollRuns)
        .set({
          status: 'completed',
          journalEntryId: je.id,
          processedBy: userId,
          processedAt: new Date(),
        })
        .where(eq(payrollRuns.id, id));
    } else {
      await req.db.update(payrollRuns)
        .set({ status: 'completed', processedBy: userId, processedAt: new Date() })
        .where(eq(payrollRuns.id, id));
    }

    return { data: { success: true, runNumber: run.runNumber } };
  });

  // ── GET /payroll-runs/:id/payslips ────────────────────
  app.get('/payroll-runs/:id/payslips', { preHandler: [authenticate, requireMinRole('accountant')] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const rows = await req.db.select().from(payslips)
      .where(and(eq(payslips.payrollRunId, id), eq(payslips.organizationId, orgId)));
    return { data: rows };
  });

  // ── GET /payslips/:id — individual payslip ─────────────
  app.get('/payslips/:id', { preHandler: [authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const { orgId } = req.user;
    const [slip] = await req.db.select().from(payslips)
      .where(and(eq(payslips.id, id), eq(payslips.organizationId, orgId)));
    if (!slip) throw new NotFoundError('Payslip');
    return { data: slip };
  });
};

export default payrollRoutes;
