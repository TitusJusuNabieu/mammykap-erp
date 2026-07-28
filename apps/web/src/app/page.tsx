import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  BarChart3, Package, ShoppingCart, FileText, Smartphone,
  Users, Building2, Shield, CheckCircle, ArrowRight, Globe,
  TrendingUp, Star, ChevronRight,
} from 'lucide-react';

export default async function LandingPage() {
  const cookieStore = await cookies();
  if (cookieStore.get('session')) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-white">
      {/* ── Navbar ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <nav className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <span className="font-bold text-xl text-slate-900 tracking-tight">LEDGERA</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</a>
            <a href="#about" className="hover:text-slate-900 transition-colors">About</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors">
              Sign in
            </Link>
            <Link href="/register" className="text-sm font-semibold bg-brand-primary text-white px-4 py-2 rounded-lg hover:bg-brand-light transition-colors">
              Start free trial
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-primary/10 text-brand-primary px-3 py-1.5 rounded-full text-xs font-semibold mb-6">
          <Globe className="w-3.5 h-3.5" />
          Built for African businesses · SLE, USD, NGN, GHS &amp; more
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
          The complete accounting
          <span className="text-brand-primary block">platform for Africa</span>
        </h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Invoicing, POS, inventory, payroll, mobile money — everything your growing business needs in one place. No spreadsheets. No complexity.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register" className="flex items-center gap-2 bg-brand-primary text-white px-8 py-3.5 rounded-xl font-semibold text-base hover:bg-brand-light transition-colors shadow-lg shadow-brand-primary/20">
            Start your 30-day free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#features" className="flex items-center gap-2 text-slate-700 font-medium px-6 py-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            See all features
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
        <p className="text-slate-400 text-sm mt-4">No credit card required · Free 30-day trial</p>

        {/* Floating stats */}
        <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mt-16">
          {[
            { value: '500+', label: 'Businesses' },
            { value: '15+', label: 'Countries' },
            { value: '99.9%', label: 'Uptime' },
          ].map(({ value, label }) => (
            <div key={label} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <div className="text-2xl font-extrabold text-brand-primary">{value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────── */}
      <section id="features" className="bg-slate-50 py-24">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Everything your business needs</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">From the market stall to the warehouse — LEDGERA grows with you.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description, color }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why LEDGERA ─────────────────────────────────── */}
      <section className="py-24 max-w-6xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-6">Built for the realities of African business</h2>
            <div className="space-y-4">
              {WHY_ITEMS.map(({ title, desc }) => (
                <div key={title} className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-brand-secondary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900">{title}</p>
                    <p className="text-slate-500 text-sm mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gradient-to-br from-brand-navy to-brand-primary rounded-3xl p-8 text-white">
            <div className="space-y-4">
              {STATS.map(({ value, label, sub }) => (
                <div key={label} className="flex items-center justify-between border-b border-white/10 pb-4 last:border-0 last:pb-0">
                  <div>
                    <div className="font-semibold">{label}</div>
                    <div className="text-white/60 text-xs mt-0.5">{sub}</div>
                  </div>
                  <div className="text-2xl font-extrabold text-brand-secondary">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────── */}
      <section id="pricing" className="bg-slate-50 py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-500 text-lg">Start free. Scale as you grow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map(({ name, price, currency, period, features, cta, highlighted }) => (
              <div key={name} className={`rounded-2xl p-6 border ${highlighted ? 'bg-brand-primary border-brand-primary text-white shadow-xl shadow-brand-primary/25 scale-105' : 'bg-white border-slate-200'}`}>
                <div className={`text-xs font-bold uppercase tracking-wide mb-3 ${highlighted ? 'text-white/70' : 'text-slate-500'}`}>{name}</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className={`text-4xl font-extrabold ${highlighted ? 'text-white' : 'text-slate-900'}`}>{price}</span>
                  <span className={`text-sm mb-1.5 ${highlighted ? 'text-white/70' : 'text-slate-500'}`}>{currency}/{period}</span>
                </div>
                <p className={`text-sm mb-6 ${highlighted ? 'text-white/70' : 'text-slate-500'}`}>{price === 'Free' ? '30-day trial, no card needed' : 'Per organization'}</p>
                <ul className="space-y-2.5 mb-8">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle className={`w-4 h-4 flex-shrink-0 ${highlighted ? 'text-brand-secondary' : 'text-brand-secondary'}`} />
                      <span className={highlighted ? 'text-white/90' : 'text-slate-700'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                    highlighted
                      ? 'bg-white text-brand-primary hover:bg-slate-100'
                      : 'bg-brand-primary text-white hover:bg-brand-light'
                  }`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────── */}
      <section className="py-24 max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Trusted by businesses across Africa</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map(({ quote, name, role, country }) => (
            <div key={name} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">&ldquo;{quote}&rdquo;</p>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">{name[0]}</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{name}</p>
                  <p className="text-slate-500 text-xs">{role} · {country}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-brand-navy to-brand-primary py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Ready to take control of your finances?</h2>
          <p className="text-white/70 text-lg mb-8">Join thousands of businesses already using LEDGERA to run smarter operations.</p>
          <Link href="/register" className="inline-flex items-center gap-2 bg-brand-secondary text-white px-8 py-4 rounded-xl font-bold text-base hover:opacity-90 transition-opacity shadow-xl">
            Start for free today
            <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-white/50 text-sm mt-4">No credit card · 30-day free trial · Cancel anytime</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer id="about" className="bg-brand-navy border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-brand-secondary rounded-md flex items-center justify-center">
                  <span className="text-white font-bold text-xs">L</span>
                </div>
                <span className="text-white font-bold tracking-tight">LEDGERA</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">Every transaction tells a story. Built for African businesses.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><Link href="/register" className="hover:text-white transition-colors">Free Trial</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#about" className="hover:text-white transition-colors">About</a></li>
                <li><span className="text-slate-600">Blog (coming soon)</span></li>
                <li><span className="text-slate-600">Careers</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><span className="text-slate-600">Privacy Policy</span></li>
                <li><span className="text-slate-600">Terms of Service</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-slate-600 text-sm">© {new Date().getFullYear()} LEDGERA. All rights reserved.</p>
            <p className="text-slate-600 text-sm">Made with ❤️ for African businesses</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: FileText,
    title: 'Quotes & Invoices',
    description: 'Create professional quotations, proforma invoices and tax invoices. Preview before printing or saving as PDF.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: ShoppingCart,
    title: 'Point of Sale',
    description: 'Fast checkout with cash, card, Orange Money, Afrimoney, and QMoney. Thermal receipt printing included.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: Package,
    title: 'Inventory Management',
    description: 'Track stock across multiple branches. FIFO and weighted average costing. Low-stock alerts.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: BarChart3,
    title: 'Financial Reports',
    description: 'Real-time P&L, balance sheet, trial balance, and cash flow. Close your books in minutes, not days.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Smartphone,
    title: 'Mobile Money',
    description: 'Accept and track Orange Money, Afrimoney and QMoney payments. Fully reconciled with your accounts.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: Users,
    title: 'Payroll',
    description: 'Pay your staff, track NASSIT contributions, and generate payslips in Sierra Leonean Leones and other currencies.',
    color: 'bg-rose-50 text-rose-600',
  },
  {
    icon: Building2,
    title: 'Multi-Branch',
    description: 'One account, multiple locations. Consolidated reporting and per-branch control.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    icon: TrendingUp,
    title: 'Double-Entry Accounting',
    description: 'Full chart of accounts with journal entries, bank reconciliation, and audit trail.',
    color: 'bg-teal-50 text-teal-600',
  },
  {
    icon: Shield,
    title: 'Role-Based Access',
    description: 'Cashiers, accountants, managers and viewers — each with the right level of access.',
    color: 'bg-slate-100 text-slate-600',
  },
];

const WHY_ITEMS = [
  { title: 'Works with African mobile money', desc: 'Orange Money, Afrimoney, QMoney — not just Stripe.' },
  { title: 'Multi-currency from day one', desc: 'SLE, USD, NGN, GHS, EUR and more, with live exchange rates.' },
  { title: 'Your own branded workspace', desc: 'Get your own {yourname}.ledgera.io login page for your team.' },
  { title: 'Offline-ready design', desc: 'Data syncs when you reconnect. No lost sales from bad internet.' },
  { title: 'Compliance built in', desc: 'NRA-compliant VAT, NASSIT payroll, and audit-ready records.' },
];

const STATS = [
  { value: '< 2 min', label: 'Onboarding time', sub: 'From signup to first invoice' },
  { value: '40%', label: 'Time saved', sub: 'Vs manual bookkeeping' },
  { value: '100%', label: 'Data ownership', sub: 'Export everything, any time' },
];

const PLANS = [
  {
    name: 'Starter',
    price: 'Free',
    currency: '',
    period: '',
    highlighted: false,
    cta: 'Start free trial',
    features: [
      '1 branch',
      'Up to 3 users',
      'POS & invoicing',
      'Basic reports',
      '500 transactions/month',
    ],
  },
  {
    name: 'Growth',
    price: '$29',
    currency: 'USD',
    period: 'mo',
    highlighted: true,
    cta: 'Get started',
    features: [
      'Up to 3 branches',
      'Unlimited users',
      'Full inventory & payroll',
      'All financial reports',
      'Mobile money integration',
      'Priority support',
    ],
  },
  {
    name: 'Business',
    price: '$79',
    currency: 'USD',
    period: 'mo',
    highlighted: false,
    cta: 'Contact sales',
    features: [
      'Unlimited branches',
      'Unlimited users',
      'API access',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
    ],
  },
];

const TESTIMONIALS = [
  {
    quote: 'LEDGERA replaced three separate tools for us. Now I can see exactly how much my shops made today, from my phone, in real time.',
    name: 'Fatmata Kamara',
    role: 'Retail chain owner',
    country: 'Sierra Leone',
  },
  {
    quote: "We were drowning in spreadsheets before. Now our accountant closes the books in one afternoon instead of a whole week.",
    name: 'Kwame Mensah',
    role: 'Wholesale distributor',
    country: 'Ghana',
  },
  {
    quote: "The mobile money tracking alone is worth it. Every Orange Money payment is instantly in our books.",
    name: 'Amara Jalloh',
    role: 'Restaurant group director',
    country: 'Sierra Leone',
  },
];
