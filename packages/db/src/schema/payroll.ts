import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { payrollStatusEnum } from './enums.js';
import { organizations, branches } from './organizations.js';
import { accounts, journalEntries } from './accounting.js';
import { users } from './users.js';

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').references(() => branches.id),
    departmentId: uuid('department_id').references(() => departments.id),
    userId: uuid('user_id').references(() => users.id),
    employeeNumber: varchar('employee_number', { length: 50 }).notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    email: varchar('email', { length: 255 }),
    nationalId: varchar('national_id', { length: 100 }),
    nassitNumber: varchar('nassit_number', { length: 100 }),
    position: varchar('position', { length: 255 }),
    employmentType: varchar('employment_type', { length: 30 }).notNull().default('full_time'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    bankName: varchar('bank_name', { length: 255 }),
    bankAccountNumber: varchar('bank_account_number', { length: 100 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('employees_org_number_idx').on(t.organizationId, t.employeeNumber)],
);

export const salaryStructures = pgTable('salary_structures', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const salaryStructureLines = pgTable('salary_structure_lines', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  structureId: uuid('structure_id').notNull().references(() => salaryStructures.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  computationType: varchar('computation_type', { length: 20 }).notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }),
  percentage: numeric('percentage', { precision: 5, scale: 2 }),
  basedOn: varchar('based_on', { length: 50 }),
  accountId: uuid('account_id').references(() => accounts.id),
  sequence: integer('sequence').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const employeeSalaryAssignments = pgTable('employee_salary_assignments', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  structureId: uuid('structure_id').notNull().references(() => salaryStructures.id),
  basicSalary: numeric('basic_salary', { precision: 18, scale: 4 }).notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id),
    branchId: uuid('branch_id').references(() => branches.id),
    runNumber: varchar('run_number', { length: 50 }).notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    paymentDate: date('payment_date').notNull(),
    status: payrollStatusEnum('status').notNull().default('draft'),
    totalGross: numeric('total_gross', { precision: 18, scale: 4 }).notNull().default('0'),
    totalDeductions: numeric('total_deductions', { precision: 18, scale: 4 }).notNull().default('0'),
    totalNet: numeric('total_net', { precision: 18, scale: 4 }).notNull().default('0'),
    totalEmployerNassit: numeric('total_employer_nassit', { precision: 18, scale: 4 }).notNull().default('0'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    processedBy: uuid('processed_by').references(() => users.id),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payroll_org_number_idx').on(t.organizationId, t.runNumber)],
);

export const payslips = pgTable('payslips', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  payrollRunId: uuid('payroll_run_id').notNull().references(() => payrollRuns.id),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  basicSalary: numeric('basic_salary', { precision: 18, scale: 4 }).notNull().default('0'),
  totalAllowances: numeric('total_allowances', { precision: 18, scale: 4 }).notNull().default('0'),
  totalDeductions: numeric('total_deductions', { precision: 18, scale: 4 }).notNull().default('0'),
  nassitEmployee: numeric('nassit_employee', { precision: 18, scale: 4 }).notNull().default('0'),
  nassitEmployer: numeric('nassit_employer', { precision: 18, scale: 4 }).notNull().default('0'),
  payeTax: numeric('paye_tax', { precision: 18, scale: 4 }).notNull().default('0'),
  grossSalary: numeric('gross_salary', { precision: 18, scale: 4 }).notNull().default('0'),
  netSalary: numeric('net_salary', { precision: 18, scale: 4 }).notNull().default('0'),
  lines: jsonb('lines').notNull().default('[]'),
  pdfUrl: text('pdf_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
