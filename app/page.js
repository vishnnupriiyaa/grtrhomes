'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Shield, Building2, CreditCard, Wrench, Mail, TrendingUp, FileText, Users, ArrowRight, CheckCircle2, Bell, DollarSign, Calendar, Sparkles } from 'lucide-react'

const Nav = () => (
  <nav className="w-full border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-40">
    <div className="container mx-auto flex items-center justify-between h-16 px-4">
      <Link href="/" className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
          <Home className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg tracking-tight">GRTR Homes</span>
      </Link>
      <div className="flex items-center gap-6">
        <a href="#features" className="text-sm text-muted-foreground hover:text-foreground hidden md:inline">Features</a>
        <a href="#roles" className="text-sm text-muted-foreground hover:text-foreground hidden md:inline">Who it's for</a>
        <a href="#tech" className="text-sm text-muted-foreground hover:text-foreground hidden md:inline">Tech</a>
        <Link href="/login">
          <Button className="rounded-full px-5">Login / Sign up</Button>
        </Link>
      </div>
    </div>
  </nav>
)

const Hero = () => (
  <section className="relative overflow-hidden">
    {/* Ambient background blobs */}
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute top-20 -left-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
    </div>
    <div className="container mx-auto px-4 py-14 md:py-28 grid md:grid-cols-2 gap-10 md:gap-12 items-center">
      <div>
        <div className="inline-flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1 mb-5 md:mb-6 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-muted-foreground">Trusted by landlords </span>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
          Premium Property <span className="text-primary">Management,</span>
          <br className="hidden sm:block" />Simplified.
        </h1>
        <p className="mt-5 md:mt-6 text-base md:text-lg text-muted-foreground max-w-xl">
          A trusted platform for landlords and tenants across Central Texas. Manage leases, track rent, and resolve maintenance — all in one place.
        </p>
        <div className="mt-6 md:mt-8 flex flex-wrap gap-3">
          <Link href="/login">
            <Button size="lg" className="rounded-full px-6 gap-2">
              Login / Sign up <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#features">
            <Button size="lg" variant="outline" className="rounded-full px-6 bg-background">
              Explore Features
            </Button>
          </a>
        </div>
      </div>
      <HeroVisual />
    </div>
  </section>
)

const HeroVisual = () => (
  <div className="relative w-full max-w-md mx-auto md:ml-auto md:mr-0">
    <PortfolioCard />

    {/* Floating chip: Rent received */}
    <div className="hidden md:flex absolute -left-16 top-8 items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 shadow-lg animate-float">
      <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
        <DollarSign className="h-5 w-5 text-emerald-600" />
      </div>
      <div className="text-sm font-semibold">Rent received</div>
    </div>

    {/* Floating chip: Ticket resolved */}
    <div className="hidden md:flex absolute -left-10 -bottom-8 items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 shadow-lg animate-float-slow">
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Wrench className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ticket resolved</p>
        <p className="text-sm font-bold">AC repaired · 1h ago</p>
      </div>
    </div>

    {/* Floating chip: Lease renewal */}
    <div className="hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 shadow-lg animate-float-slower">
      <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <Calendar className="h-5 w-5 text-amber-600" />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Renewal in</p>
        <p className="text-sm font-bold">30 days</p>
      </div>
    </div>

    {/* Floating chip: Notification */}
    <div className="hidden md:flex absolute -right-14 -top-6 items-center gap-2 bg-card border border-border rounded-full pl-1 pr-3 py-1 shadow-lg animate-float">
      <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
        <Bell className="h-3.5 w-3.5 text-primary-foreground" />
      </div>
      <p className="text-xs font-medium">New ticket </p>
     </div>
  </div>
)

const PortfolioCard = () => (
  <div className="bg-card border border-border rounded-2xl p-8 shadow-sm max-w-md ml-auto w-full">
    <div className="flex items-center justify-between mb-6">
      <div className="h-11 w-11 rounded-lg bg-muted flex items-center justify-center">
        <Shield className="h-5 w-5 text-primary" />
      </div>
      <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-medium">Secure</span>
    </div>
    <h3 className="font-bold text-lg mb-6"> Overview</h3>
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground">Manage your properties:</p>
        <p className="text-2xl font-bold mt-1"> As a property manager</p>
        <p className="text-2xl text-muted-foreground">As an owner</p>
        <p className="text-2xl font-bold text-primary mt-1"> As a tenant</p>
      </div>
      <div className="h-px bg-border" />
      <div>
        <p className="text-xs text-muted-foreground">Active Agreements</p>
        <p className="text-2xl font-bold mt-1">Active Leases</p>
      </div>
    </div>
  </div>
)

const Features = () => {
  const items = [
    { icon: Building2, title: 'Lease Management', desc: 'Track MTM and fixed-term leases across all properties. Never miss a renewal date again.' },
    { icon: CreditCard, title: 'Rent Tracking', desc: 'Automated payment reminders, complete transaction history, and outstanding balance tracking.' },
    { icon: Wrench, title: 'Maintenance Portal', desc: 'Tenants submit priority-based tickets while landlords review, assign, and resolve in real-time.' },
  ]
  return (
    <section id="features" className="py-20 border-t border-border/60">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl md:text-4xl font-bold">Everything You Need</h2>
          <p className="text-muted-foreground mt-4">Built specifically for mid-sized portfolios. Get complete visibility into your properties without the bloat of enterprise software.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 md:gap-6">
          {items.map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-2xl p-6 md:p-8">
              <div className="h-1 w-8 bg-primary rounded-full mb-6 md:mb-8" />
              <f.icon className="h-7 w-7 text-primary" />
              <h3 className="font-bold text-lg mt-5 md:mt-6">{f.title}</h3>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const Roles = () => {
  const roles = [
    { icon: Users, title: 'Property Managers', desc: 'Master database records controlling leases, managing maintenance queries, and handling financial portfolios in a central terminal layout.' },
    { icon: TrendingUp, title: 'Asset Owners', desc: 'Oversight dashboard capturing complex loan data structures, return on investments (ROI), monthly EMIs, and custom asset gallery uploads.' },
    { icon: Home, title: 'Active Tenants', desc: 'Personal tenant profiling with lease visibility, insurance details, and support tickets routed straight to landlords and managers.' },
  ]
  return (
    <section id="roles" className="py-20 border-t border-border/60 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">Three Role-Based Interfaces</p>
          <h2 className="text-3xl md:text-4xl font-bold mt-3">Built for the entire ecosystem</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {roles.map((r) => (
            <div key={r.title} className="bg-card border border-border rounded-2xl p-8">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                <r.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-bold text-xl">{r.title}</h3>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const TechStack = () => {
  const items = [
    { icon: FileText, title: 'Unified Database Schema', desc: 'Direct API routing and single source of truth for tenants, leases, insurance, and mortgage data.' },
    { icon: Mail, title: 'Automated Email Loops', desc: 'Mailing triggers dispatch ticket info directly to both managers and owners.' },
    { icon: CheckCircle2, title: 'Asset Media Storage', desc: 'Fast image streaming pipelines so landlords can update property photos instantly.' },
  ]
  return (
    <section id="tech" className="py-20 border-t border-border/60">
      <div className="container mx-auto px-4 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">System & Architecture</p>
          <h2 className="text-3xl md:text-4xl font-bold mt-3">Core technical features</h2>
          <p className="text-muted-foreground mt-4">Eliminating processing bottlenecks via direct API routing and automated communications significantly reduces operational overhead.</p>
          <Link href="/login" className="inline-block mt-8">
            <Button className="rounded-full px-6 gap-2">Get Started <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
        <div className="space-y-4">
          {items.map((it) => (
            <div key={it.title} className="bg-card border border-border rounded-2xl p-6 flex gap-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                <it.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold">{it.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{it.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const Footer = () => (
  <footer className="border-t border-border/60 py-10">
    <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
          <Home className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold">GRTR Homes</span>
      </div>
      <p className="text-sm text-muted-foreground">Shaping the future of real estate operations.</p>
    </div>
  </footer>
)

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Features />
      <Roles />
      <TechStack />
      <Footer />
    </div>
  )
}

export default App
