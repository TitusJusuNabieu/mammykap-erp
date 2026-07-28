# LEDGERA — User Manual
### *Every transaction tells a story.*

**Version:** 1.0 | **Platform:** Web (ledgera.app) | **Support:** support@ledgera.app

---

> **How to export this manual:**  
> - **PDF:** Open in any browser → File → Print → Save as PDF  
> - **Word:** Install Pandoc, then run: `pandoc USER_MANUAL.md -o LEDGERA_User_Manual.docx`

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started — Registration & Login](#2-getting-started)
3. [Dashboard Overview](#3-dashboard-overview)
4. [Sales & Point of Sale (POS)](#4-sales--point-of-sale)
5. [Purchases & Goods Received](#5-purchases--goods-received)
6. [Inventory Management](#6-inventory-management)
7. [Customers](#7-customers)
8. [Expenses](#8-expenses)
9. [Payroll](#9-payroll)
10. [Mobile Money Wallets](#10-mobile-money-wallets)
11. [Banking](#11-banking)
12. [Reports](#12-reports)
13. [Journal Entries](#13-journal-entries)
14. [Settings & Organization](#14-settings--organization)
15. [Billing & Subscription (Monime)](#15-billing--subscription)
16. [User Roles & Permissions](#16-user-roles--permissions)
17. [Frequently Asked Questions](#17-frequently-asked-questions)

---

## 1. Introduction

**LEDGERA** is a cloud-based accounting and business management platform built for African small and medium enterprises (SMEs). It combines:

- A full **double-entry accounting engine** — every sale, purchase, expense, and payroll automatically creates balanced journal entries
- A **Point of Sale (POS)** system supporting cash, Orange Money, Afrimoney, QMoney, and bank transfers
- **Inventory tracking** with weighted average or FIFO costing
- **Payroll** with Sierra Leone NASSIT and PAYE calculations
- **Mobile Money** wallet ledgers for Orange Money, Afrimoney, and QMoney
- **Financial reports** — Profit & Loss, Balance Sheet, Trial Balance, and more
- **Multi-branch** support for businesses with multiple locations

LEDGERA is purpose-built for **Sierra Leone** with SLE currency support, NASSIT/PAYE compliance, and mobile money integration via **Monime**.

---

## 2. Getting Started

### 2.1 Creating Your Account

1. Go to **ledgera.app** and click **Get Started Free**
2. Enter your full name, email address, and a strong password (minimum 8 characters)
3. Click **Create Account**
4. Fill in your organization details:
   - Business name
   - Business type (Retail / Pharmacy / Restaurant / Service / NGO / School / Other)
   - Your base currency (defaults to SLE)
   - Your timezone (defaults to Africa/Freetown)
5. Click **Finish Setup** — LEDGERA will automatically create:
   - Your Chart of Accounts (26 default accounts)
   - Your first fiscal year and 12 accounting periods
   - A default branch ("Main Branch")
   - Your starter subscription (14-day free trial)

### 2.2 Logging In

1. Go to **ledgera.app/login**
2. Enter your email and password
3. Click **Sign In**

If you have **Two-Factor Authentication (2FA)** enabled, you will be prompted to enter the 6-digit code from your authenticator app after entering your password.

### 2.3 Inviting Team Members

Only the **Organization Owner** can invite users.

1. Go to **Settings → Organization → Users**
2. Click **Invite User**
3. Enter the email address, select a role, and optionally assign a branch
4. Click **Send Invitation**

The invited person will receive an email with a link. They click the link, set their password, and are immediately added to your organization.

**Available roles:**

| Role | What they can do |
|---|---|
| Accountant | Full accounting, reports, payroll |
| Branch Manager | Sales, purchases, expenses for their branch |
| Inventory Officer | Products, stock levels, GRNs |
| Cashier | POS sales only |
| Employee | View own payslips only |
| Viewer | Read-only access to reports |

---

## 3. Dashboard Overview

The dashboard is your **real-time financial summary**. It refreshes automatically.

| Widget | What it shows |
|---|---|
| **Today's Sales** | Total revenue from sales made today |
| **Today's Transactions** | Number of completed sales |
| **Cash Position** | Balance across all cash and bank accounts |
| **Receivables** | Total amount owed by customers |
| **Payables** | Total amount owed to suppliers |
| **Low Stock Alerts** | Products below reorder point |
| **Recent Sales** | Last 5 sales with status |
| **Revenue Chart** | Daily revenue for the last 30 days |

The **sidebar** on the left gives you access to all modules. Your name and role appear at the bottom.

---

## 4. Sales & Point of Sale

### 4.1 Making a Sale (POS)

1. Click **Sales / POS** in the sidebar
2. **Search for products** using the search box (by name, SKU, or barcode)
3. Click a product card to add it to the cart
4. In the cart (right panel):
   - Adjust quantity using the **+/-** buttons
   - Apply a **discount** by typing a percentage in the discount field
   - Remove an item using the **×** button
5. Under **Payment**:
   - Click **+ Add Payment**
   - Select the method: Cash, Bank Transfer, Orange Money, Afrimoney, or QMoney
   - Enter the amount
   - Add more payment rows if the customer is paying with multiple methods (e.g., part cash, part mobile money)
6. Click **Complete Sale**
7. A **receipt** will appear — you can print it or start a new sale

> **Change Due:** If the customer pays more than the total in cash, the change due is shown automatically.

> **Credit Sales:** To sell on credit, set the payment amount to 0 (or less than the total). The difference will be added to the customer's outstanding balance. You must select a customer for credit sales.

### 4.2 Viewing Sales History

1. Click **Sales / Invoices** in the sidebar
2. Browse the list of all sales, filtered by status: **Paid**, **Partial**, **Credit**, **Voided**
3. Click any row to view the full invoice details

### 4.3 Voiding a Sale

Sales can be voided by an accountant or branch manager if an error was made.

1. Open the sale from Sales / Invoices
2. Click **Void Sale**
3. Enter a reason for voiding
4. Confirm — the sale is reversed, stock is restored, and a reversing journal entry is created automatically

---

## 5. Purchases & Goods Received

### 5.1 Creating a Purchase Order (PO)

1. Click **Purchases** in the sidebar
2. Click **New Purchase Order**
3. Select a **Supplier** from the dropdown (or add a new one)
4. Add products with quantities and unit prices
5. Click **Save PO** — the PO is in **Draft** status

To approve the PO, click **Approve**. Only approved POs can have GRNs raised against them.

### 5.2 Receiving Goods (GRN)

When physical goods arrive:

1. Go to **Purchases → Goods Received**
2. Click **New GRN**
3. Select the **Purchase Order** the goods are for
4. Enter the actual quantity received for each item (can be partial)
5. Enter the **unit cost** for each item
6. Click **Receive Goods**

LEDGERA automatically:
- Updates stock levels at your branch
- Posts the journal entry: **DR Inventory / CR Accounts Payable**

### 5.3 Recording Supplier Payments

1. Go to **Purchases** and click the **Suppliers** tab
2. Find the supplier and click **Record Payment**
3. Enter the amount paid and the payment method
4. Click **Save** — the journal entry posts: **DR Accounts Payable / CR Cash/Bank**

---

## 6. Inventory Management

### 6.1 Adding a New Product

1. Click **Inventory** in the sidebar
2. Click **+ Add Product** (top right)
3. Fill in:
   - **Product Name** (required)
   - **SKU** — your internal product code
   - **Barcode** — for scanning at POS
   - **Category** — for grouping and reports
   - **Cost Price** — what you paid per unit
   - **Selling Price** — what you charge customers
   - **Tax Rate** — if the product is taxable
   - **Track Inventory** — uncheck for services or non-stock items
   - **Reorder Point** — LEDGERA alerts you when stock falls below this
4. Click **Save Product**

### 6.2 Viewing Stock Levels

The inventory list shows each product with:
- **Stock Level** — total quantity across all branches
- **Avg Cost** — weighted average cost per unit
- **Low Stock** badge — if quantity is below reorder point

Click any product to open the detail page showing per-branch stock, edit the product, and view the full **stock movement history**.

### 6.3 Understanding Stock Movements

Every movement is logged automatically:
- `sale` — stock reduced when a sale is made
- `grn` — stock increased when goods are received
- `adjustment` — manual corrections
- `transfer_out` / `transfer_in` — inter-branch transfers

---

## 7. Customers

### 7.1 Adding a Customer

1. Click **Customers** in the sidebar
2. Click **+ Add Customer**
3. Enter: Name, Phone, Email, TIN (optional), Credit Limit (how much they can owe before you stop selling on credit)
4. Click **Save**

### 7.2 Customer Credit & Balance

Each customer has a **running balance**. When you make a credit sale, the balance increases. When the customer pays, it decreases.

The balance is visible in the customer list. A red balance means the customer owes you money.

---

## 8. Expenses

### 8.1 Recording an Expense

1. Click **Expenses** in the sidebar
2. Click **+ New Expense**
3. Fill in:
   - **Description** — what was purchased
   - **Amount** — in SLE
   - **Category** — maps to a Chart of Accounts expense account (e.g., Rent, Utilities, Travel)
   - **Date** — when the expense occurred
   - **Payment Method** — Cash, Bank, or Mobile Money
   - **Receipt** — attach a photo (optional)
4. Click **Submit**

### 8.2 Expense Approval Workflow

Expenses go through a simple approval workflow:
- **Draft** → **Submitted** → **Approved** → **Rejected**

When an expense is **Approved**, LEDGERA automatically posts the journal entry:
**DR [Expense Account] / CR Cash or Bank Account**

---

## 9. Payroll

### 9.1 Setting Up Employees

1. Click **Payroll** in the sidebar
2. Click the **Employees** tab
3. Click **+ Add Employee**
4. Enter: Full Name, National ID, Phone, Department, Position, Basic Salary
5. Click **Save**

### 9.2 Running Payroll

1. Click **Payroll** then the **Payroll Runs** tab
2. Click **+ New Payroll Run**
3. Select the month and year
4. Click **Create Run**

LEDGERA automatically calculates for each employee:
- **NASSIT** — 5% employee contribution, 10% employer contribution
- **PAYE** (income tax) — applied using Sierra Leone's progressive tax brackets:
  - 0% on the first SLE 720,000/year (SLE 60,000/month)
  - 15% on SLE 720,001 – 1,800,000/year
  - 20% on SLE 1,800,001 – 3,000,000/year
  - 30% on SLE 3,000,001 – 5,400,000/year
  - 35% on income above SLE 5,400,000/year
- **Net Pay** = Gross - NASSIT Employee - PAYE

5. Review the payslips on screen
6. Click **Post Payroll** to commit:
   - Journal: **DR Salary Expense + DR NASSIT Employer / CR Salary Payable + CR NASSIT Payable + CR PAYE Payable**

---

## 10. Mobile Money Wallets

LEDGERA tracks your business's mobile money wallet balances so you know exactly how much money is in each wallet at all times.

### 10.1 Adding a Wallet

1. Click **Mobile Money** in the sidebar
2. Click **+ Add Wallet**
3. Select provider: Orange Money, Afrimoney, or QMoney
4. Enter the phone number and account name
5. Click **Add Wallet**

### 10.2 Recording Transactions

1. Select a wallet from the left panel
2. Click **+ Record**
3. Choose type: **Receive**, **Send**, or **Fee**
4. Enter the amount, fee (if any), reference, and description
5. Click **Record**

The wallet balance updates automatically and a journal entry is posted:
- **Receive:** DR MoMo Wallet / CR Revenue (or AR)
- **Send:** DR Expense / CR MoMo Wallet
- **Fee:** DR Mobile Money Fees (expense) / CR MoMo Wallet

---

## 11. Banking

### 11.1 Adding a Bank Account

1. Click **Banking** in the sidebar
2. Click **+ Add Bank Account**
3. Enter: Account Label, Bank Name, Account Number, Currency
4. Click **Create Account**

### 11.2 Recording Transactions

1. Select the bank account
2. Click **+ Record Transaction**
3. Choose type: **Deposit**, **Withdrawal**, or **Bank Charge**
4. Enter amount, date, reference, and description
5. Click **Record**

---

## 12. Reports

All reports are found by clicking **P&L Report** or **Balance Sheet** in the sidebar. The full reports page has four tabs:

### 12.1 Profit & Loss (P&L)

Shows your business's profitability over a period.

- **Revenue** — all income from sales
- **Cost of Goods Sold (COGS)** — cost of products sold
- **Gross Profit** = Revenue − COGS
- **Operating Expenses** — rent, salaries, utilities, etc.
- **Net Profit** = Gross Profit − Operating Expenses

Use the **date range picker** to select any period. Filter by branch for branch-level profitability.

### 12.2 Balance Sheet

A snapshot of what your business **owns** (Assets), **owes** (Liabilities), and **is worth** (Equity) at a specific date.

- **Assets** = Cash + Inventory + Accounts Receivable + Fixed Assets
- **Liabilities** = Accounts Payable + Loans + Tax Payable
- **Equity** = Assets − Liabilities

A correctly balanced balance sheet shows **Assets = Liabilities + Equity**.

### 12.3 Trial Balance

Lists every account with its total **Debits** and **Credits** for the period. Used by accountants to verify the books are balanced.

### 12.4 Inventory Valuation

Shows the quantity on hand and total value (qty × avg cost) for every product.

---

## 13. Journal Entries

The journal is the heart of double-entry accounting. Every transaction in LEDGERA (sales, purchases, expenses, payroll) automatically creates a journal entry. Accountants can also create **manual journal entries**.

### 13.1 Viewing Journal Entries

1. Click **Journal** in the sidebar
2. Browse the list of all entries — each shows the entry number, date, description, and status (Posted / Voided)
3. Click any entry to see the individual debit and credit lines

### 13.2 Creating a Manual Journal Entry

1. Click **+ New Entry**
2. Enter a date and description
3. For each line, select an account and enter either a Debit or Credit amount
4. Add as many lines as needed — the footer shows total DR and CR and whether the entry is **Balanced**
5. Click **Post Entry** — only balanced entries can be posted

### 13.3 Voiding a Journal Entry

Posted entries can be voided (reversed) but never deleted. Voiding creates a reversing entry automatically.

1. Click the entry to open its detail panel
2. Click **Void this entry…**
3. Enter the reason
4. The entry is marked Voided and a reversal entry is created

---

## 14. Settings & Organization

Access **Settings** from the sidebar.

### 14.1 Organization Tab

View your organization's registered details (name, currency, timezone, slug). Contact support to change these.

### 14.2 Tax Settings

- **Enable Tax** — turn GST/VAT on or off
- **Default Tax Rate** — the percentage applied to taxable products (e.g., 15%)
- **Receipt Prefix** — the prefix on your receipt numbers (e.g., RCP → RCP-000001)
- **Allow Negative Stock** — if enabled, LEDGERA will allow sales even when stock reaches zero

### 14.3 Managing Users

Under the **Organization** section in Settings:
- View all team members, their roles, and last active date
- Change a user's role
- Deactivate a user to revoke their access
- Invite new users

---

## 15. Billing & Subscription

LEDGERA subscriptions are paid monthly via **Monime** — Sierra Leone's mobile money payment infrastructure.

### 15.1 Subscription Plans

| Plan | Price/month | Users | Branches | Products |
|---|---|---|---|---|
| **Starter** | SLE 500,000 | 3 | 1 | 500 |
| **Growth** | SLE 1,200,000 | 10 | 3 | 5,000 |
| **Business** | SLE 2,500,000 | 25 | 10 | 50,000 |

All new accounts start with a **14-day free trial** on the Starter plan.

### 15.2 How to Pay

1. Go to **Settings → Billing & Subscription**
2. Review your current plan status
3. Select the plan you want to activate or renew
4. Enter your **mobile money phone number** and select your network (Orange Money, Afrimoney, or QMoney)
5. Click **Pay via Mobile Money**
6. A **USSD payment prompt** will be sent to your phone
7. Approve the prompt on your phone
8. Your subscription activates within seconds

> **Payments are processed by Monime.io** — a licensed payment service provider in Sierra Leone.

---

## 16. User Roles & Permissions

| Action | Owner | Accountant | Branch Mgr | Inv. Officer | Cashier | Employee | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create sale | ✅ | ✅ | ✅ | — | ✅ | — | — |
| Void sale | ✅ | ✅ | ✅ | — | — | — | — |
| Credit sale | ✅ | ✅ | ✅ | — | — | — | — |
| Create PO | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Approve PO | ✅ | ✅ | ✅ | — | — | — | — |
| Receive GRN | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Add product | ✅ | ✅ | — | ✅ | — | — | — |
| Stock adjustment | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Post journal | ✅ | ✅ | — | — | — | — | — |
| Close period | ✅ | ✅ | — | — | — | — | — |
| Run payroll | ✅ | ✅ | — | — | — | — | — |
| View own payslip | — | — | — | — | — | ✅ | — |
| View P&L | ✅ | ✅ | — | — | — | — | ✅ |
| Invite users | ✅ | — | — | — | — | — | — |
| Change settings | ✅ | — | — | — | — | — | — |
| Manage billing | ✅ | — | — | — | — | — | — |

---

## 17. Frequently Asked Questions

**Q: What happens if I lose internet connection during a sale?**  
A: The POS requires an internet connection in v1. Offline mode (queuing sales locally and syncing when back online) is planned for a future release.

**Q: Can I use LEDGERA on my phone?**  
A: Yes. LEDGERA is a responsive web app that works in any mobile browser. It can also be installed as a PWA (Progressive Web App) on Android by tapping "Add to Home Screen" in your browser.

**Q: What if I make a mistake in a journal entry?**  
A: Posted journal entries cannot be edited — this protects the integrity of your books. Instead, void the entry (which creates an automatic reversal) and then post a corrected entry.

**Q: Can I have multiple businesses in one account?**  
A: Each LEDGERA account is one organization. If you run multiple separate businesses, create a separate LEDGERA account for each.

**Q: How does LEDGERA calculate NASSIT?**  
A: NASSIT is 5% of gross salary (employee deduction) and 10% of gross salary (employer contribution). Both are calculated automatically in payroll runs and posted to NASSIT Payable.

**Q: What currencies does LEDGERA support?**  
A: The primary currency is SLE (Sierra Leone Leones). Multi-currency support (USD, GBP, EUR) is available in the Business plan.

**Q: Is my data secure?**  
A: All data is encrypted in transit (HTTPS/TLS) and at rest. Each organization's data is completely isolated from other businesses using the platform. Daily automated backups are taken with point-in-time restore capability.

**Q: How do I export reports to Excel or PDF?**  
A: PDF and Excel export buttons are available on each report page. This feature is available on the Growth plan and above.

**Q: Who do I contact for support?**  
A: Email **support@ledgera.app** or use the in-app chat (available on Growth and Business plans).

---

*© 2026 LEDGERA. All rights reserved. Built for Africa.*
