import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  MapPin, Phone, Clock, ArrowRight, ShoppingBag,
  ClipboardCheck, HandCoins, Hammer, Truck, ShieldCheck,
} from 'lucide-react';

const ORG = {
  name: 'Mamykab',
  tagline: 'Building Materials & Construction Supplies',
  address: '73 Main Sawa Road, Bo, Sierra Leone',
  phone: '+232 78 053 636',
  phoneHref: 'tel:+23278053636',
  hours: 'Mon – Sat, 8:00 AM – 6:00 PM', // placeholder — confirm/update
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('73 Main Sawa Road, Bo, Sierra Leone'),
};

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
              <Hammer className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-xl text-slate-900 tracking-tight">{ORG.name}</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <Link href="/catalog" className="hover:text-slate-900 transition-colors">Browse Catalog</Link>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#visit" className="hover:text-slate-900 transition-colors">Visit Us</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
              Staff sign in
            </Link>
            <Link href="/catalog" className="text-sm font-semibold bg-brand-primary text-white px-4 py-2 rounded-lg hover:bg-brand-light transition-colors">
              Browse Catalog
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-brand-primary/5 to-white">
        <div className="max-w-6xl mx-auto px-4 pt-14 pb-14 text-center">
          <div className="inline-flex items-center gap-2 bg-brand-primary/10 text-brand-primary px-3 py-1.5 rounded-full text-xs font-semibold mb-5">
            <MapPin className="w-3.5 h-3.5" />
            Based in Bo, Sierra Leone
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 leading-tight tracking-tight mb-4">
            Quality Building Materials
            <span className="text-brand-primary block">For Every Project</span>
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            Cement, roofing sheets, rods, tiles and everything else you need for your build —
            all in one place. Browse what we have in stock, request what you need online,
            then come in and pay when you&rsquo;re ready to collect.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/catalog" className="flex items-center gap-2 bg-brand-primary text-white px-8 py-3.5 rounded-xl font-semibold text-base hover:bg-brand-light transition-colors shadow-lg shadow-brand-primary/20">
              <ShoppingBag className="w-4 h-4" />
              Browse the Catalog
            </Link>
            <a href={ORG.mapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-700 font-medium px-6 py-3.5 rounded-xl border border-slate-200 hover:bg-white transition-colors">
              <MapPin className="w-4 h-4" />
              Get Directions
            </a>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────── */}
      <section id="how-it-works" className="bg-slate-50 py-14">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2">How it works</h2>
            <p className="text-slate-500 text-lg">No online payment needed — pay and collect in person, at your convenience.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {HOW_IT_WORKS.map(({ icon: Icon, step, title, description }) => (
              <div key={title} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm text-center">
                <div className="w-11 h-11 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mb-3 mx-auto">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-xs font-bold text-brand-primary uppercase tracking-wide mb-1">Step {step}</div>
                <h3 className="font-bold text-slate-900 mb-1.5">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why us ─────────────────────────────────────── */}
      <section className="py-14 max-w-6xl mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Why builders choose {ORG.name}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 rounded-3xl p-8">
          {WHY_ITEMS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-secondary/10 text-brand-secondary flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{title}</p>
                <p className="text-slate-500 text-sm mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Visit us ───────────────────────────────────── */}
      <section id="visit" className="bg-gradient-to-br from-brand-navy to-brand-primary py-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold text-white mb-2">Visit our shop</h2>
            <p className="text-white/70 text-lg">Come see our full range in person, or bring your purchase request to pay and collect.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <a href={ORG.mapUrl} target="_blank" rel="noopener noreferrer" className="bg-white/10 hover:bg-white/15 transition-colors rounded-2xl p-5 text-center">
              <MapPin className="w-6 h-6 text-brand-secondary mx-auto mb-3" />
              <p className="text-white font-semibold text-sm">{ORG.address}</p>
              <p className="text-white/60 text-xs mt-1">Get directions</p>
            </a>
            <a href={ORG.phoneHref} className="bg-white/10 hover:bg-white/15 transition-colors rounded-2xl p-5 text-center">
              <Phone className="w-6 h-6 text-brand-secondary mx-auto mb-3" />
              <p className="text-white font-semibold text-sm">{ORG.phone}</p>
              <p className="text-white/60 text-xs mt-1">Call or WhatsApp</p>
            </a>
            <div className="bg-white/10 rounded-2xl p-5 text-center">
              <Clock className="w-6 h-6 text-brand-secondary mx-auto mb-3" />
              <p className="text-white font-semibold text-sm">{ORG.hours}</p>
              <p className="text-white/60 text-xs mt-1">Opening hours</p>
            </div>
          </div>
          <div className="text-center mt-10">
            <Link href="/catalog" className="inline-flex items-center gap-2 bg-white text-brand-primary px-8 py-3.5 rounded-xl font-bold text-base hover:bg-slate-100 transition-colors shadow-xl">
              Browse the Catalog
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="bg-brand-navy border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-secondary rounded-md flex items-center justify-center">
              <Hammer className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-bold tracking-tight">{ORG.name}</span>
            <span className="text-slate-500 text-sm ml-2 hidden sm:inline">{ORG.tagline}</span>
          </div>
          <p className="text-slate-500 text-sm">{ORG.address} · {ORG.phone}</p>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-slate-500 hover:text-white transition-colors">Staff sign in</Link>
            <span className="text-slate-700">© {new Date().getFullYear()} {ORG.name}</span>
          </div>
        </div>
        <div className="border-t border-slate-800/60">
          <div className="max-w-6xl mx-auto px-4 py-4 text-center">
            <a
              href="https://unlimitedinnovations.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-slate-400 text-xs transition-colors"
            >
              Powered by Unlimited Innovation
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const HOW_IT_WORKS = [
  {
    icon: ShoppingBag,
    step: 1,
    title: 'Browse the catalog',
    description: 'See what’s in stock and the price of every item, right from your phone.',
  },
  {
    icon: ClipboardCheck,
    step: 2,
    title: 'Submit a request',
    description: 'Add what you need and send us your name and phone number — no payment required yet.',
  },
  {
    icon: HandCoins,
    step: 3,
    title: 'Pay & collect in person',
    description: 'Bring your reference number to the shop, pay, and take your materials home.',
  },
];

const WHY_ITEMS = [
  { icon: Truck, title: 'Everything under one roof', desc: 'Cement, roofing, rods, tiles, and more — no need to shop around.' },
  { icon: ShieldCheck, title: 'Pay only when you’re ready', desc: 'Reserve items online, pay in person — no card details, no risk.' },
  { icon: MapPin, title: 'Local and reliable', desc: 'Based right here in Bo, serving builders and contractors in the community.' },
];
