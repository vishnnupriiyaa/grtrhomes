'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Home, LogOut, Plus, Edit, Trash2, MapPin, Calendar, Shield, DollarSign, Percent, User, Phone, Mail, Building2, Wrench, AlertCircle, CheckCircle2, Clock, FileText } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_COLORS = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-800',
  resolved: 'bg-emerald-100 text-emerald-700',
}
const PRIORITY_COLORS = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-700',
}

const formatCurrency = (n) => n ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const daysUntil = (d) => {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return diff
}

const DashboardPage = () => {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [properties, setProperties] = useState([])
  const [tickets, setTickets] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('grtr_user')
    if (!stored) { router.push('/login'); return }
    const u = JSON.parse(stored)
    setUser(u)
    refresh(u)
  }, [router])

  const refresh = async (u = user) => {
    if (!u) return
    setLoading(true)
    try {
      const [propsRes, ticketsRes, usersRes] = await Promise.all([
        fetch(`/api/properties?userId=${u.id}&role=${u.role}`),
        fetch(`/api/tickets?userId=${u.id}&role=${u.role}`),
        u.role === 'manager' ? fetch('/api/users') : Promise.resolve(null),
      ])
      setProperties(await propsRes.json())
      setTickets(await ticketsRes.json())
      if (usersRes) setUsers(await usersRes.json())
    } catch (e) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem('grtr_user')
    router.push('/')
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/60 bg-card sticky top-0 z-30">
        <div className="container mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Home className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm md:text-base">GRTR Homes</span>
          </Link>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-muted-foreground capitalize leading-tight">{user.role}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm">
              {user.name?.charAt(0)?.toUpperCase()}
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="h-9 w-9 p-0 md:h-9 md:w-auto md:px-3"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-6 md:py-8">
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading...</div>
        ) : user.role === 'manager' ? (
          <ManagerView user={user} properties={properties} tickets={tickets} users={users} onRefresh={() => refresh()} />
        ) : user.role === 'owner' ? (
          <OwnerView user={user} properties={properties} tickets={tickets} onRefresh={() => refresh()} />
        ) : (
          <TenantView user={user} properties={properties} tickets={tickets} onRefresh={() => refresh()} />
        )}
      </div>
    </div>
  )
}

/* ---------------- MANAGER VIEW ---------------- */
const ManagerView = ({ user, properties, tickets, users, onRefresh }) => {
  const stats = {
    props: properties.length,
    revenue: properties.reduce((s, p) => s + (Number(p.monthlyRent) || 0), 0),
    openTickets: tickets.filter(t => t.status === 'open').length,
    activeLeases: properties.filter(p => p.tenantId).length,
  }
  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 md:mb-8">
        <div>
          <p className="text-xs md:text-sm text-primary font-semibold uppercase tracking-wide">Manager Dashboard</p>
          <h1 className="text-2xl md:text-3xl font-bold mt-1">Welcome, {user.name}</h1>
        </div>
        <PropertyDialog user={user} users={users} onSaved={onRefresh}>
          <Button className="rounded-full gap-2 self-start md:self-auto"><Plus className="h-4 w-4" /> Add Property</Button>
        </PropertyDialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Building2} label="Managed Properties" value={stats.props} />
        <StatCard icon={DollarSign} label="Monthly Revenue" value={formatCurrency(stats.revenue)} accent />
        <StatCard icon={FileText} label="Active Leases" value={stats.activeLeases} />
        <StatCard icon={AlertCircle} label="Open Tickets" value={stats.openTickets} />
      </div>

      <Tabs defaultValue="properties">
        <TabsList>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="tickets">Tickets ({tickets.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="properties" className="mt-6 space-y-4">
          {properties.length === 0 ? (
            <EmptyState msg="No properties yet. Click 'Add Property' to get started." />
          ) : properties.map(p => (
            <PropertyRow key={p.id} property={p} role="manager" user={user} users={users} onRefresh={onRefresh} />
          ))}
        </TabsContent>
        <TabsContent value="tickets" className="mt-6 space-y-3">
          {tickets.length === 0 ? <EmptyState msg="No tickets yet." /> :
            tickets.map(t => <TicketRow key={t.id} ticket={t} property={properties.find(p => p.id === t.propertyId)} canManage onRefresh={onRefresh} />)}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------------- OWNER VIEW ---------------- */
const OwnerView = ({ user, properties, tickets, onRefresh }) => {
  const stats = {
    props: properties.length,
    revenue: properties.reduce((s, p) => s + (Number(p.monthlyRent) || 0), 0),
    emi: properties.reduce((s, p) => s + (Number(p.monthlyEmi) || 0), 0),
    tickets: tickets.length,
  }
  return (
    <div>
      <div className="mb-6 md:mb-8">
        <p className="text-xs md:text-sm text-primary font-semibold uppercase tracking-wide">Owner Portfolio</p>
        <h1 className="text-2xl md:text-3xl font-bold mt-1">Welcome, {user.name}</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">Financial transparency across your entire portfolio.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Building2} label="My Properties" value={stats.props} />
        <StatCard icon={DollarSign} label="Monthly Rent Inflow" value={formatCurrency(stats.revenue)} accent />
        <StatCard icon={Percent} label="Monthly EMI Outflow" value={formatCurrency(stats.emi)} />
        <StatCard icon={AlertCircle} label="Open Tickets" value={tickets.filter(t=>t.status!=='resolved').length} />
      </div>
      <Tabs defaultValue="properties">
        <TabsList>
          <TabsTrigger value="properties">My Properties</TabsTrigger>
          <TabsTrigger value="tickets">Tickets ({tickets.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="properties" className="mt-6 space-y-4">
          {properties.length === 0 ? <EmptyState msg="No properties assigned to you yet." /> :
            properties.map(p => <PropertyRow key={p.id} property={p} role="owner" user={user} onRefresh={onRefresh} />)}
        </TabsContent>
        <TabsContent value="tickets" className="mt-6 space-y-3">
          {tickets.length === 0 ? <EmptyState msg="No tickets from your properties." /> :
            tickets.map(t => <TicketRow key={t.id} ticket={t} property={properties.find(p => p.id === t.propertyId)} onRefresh={onRefresh} />)}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------------- TENANT VIEW ---------------- */
const TenantView = ({ user, properties, tickets, onRefresh }) => {
  const p = properties[0]
  const nextRentDay = new Date()
  nextRentDay.setDate(1); nextRentDay.setMonth(nextRentDay.getMonth() + 1)
  return (
    <div>
      <div className="mb-6 md:mb-8">
        <p className="text-xs md:text-sm text-primary font-semibold uppercase tracking-wide">Tenant Portal</p>
        <h1 className="text-2xl md:text-3xl font-bold mt-1">Hi, {user.name}</h1>
      </div>
      {!p ? <EmptyState msg="You have no active lease yet. Contact your property manager." /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
            <StatCard icon={Calendar} label="Lease Expires" value={formatDate(p.leaseEnd)} sub={daysUntil(p.leaseEnd) !== null ? `${daysUntil(p.leaseEnd)} days left` : ''} />
            <StatCard icon={DollarSign} label="Next Rent Due" value={formatCurrency(p.monthlyRent)} sub={formatDate(nextRentDay)} accent />
            <StatCard icon={Shield} label="Home Insurance" value={p.insuranceProvider || '—'} sub={p.insuranceEnd ? `Expires ${formatDate(p.insuranceEnd)}` : ''} link={p.insurancePortalUrl} />
          </div>
          <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6 md:mb-8">
            <PropertyRow property={p} role="tenant" user={user} onRefresh={onRefresh} standalone />
          </div>
        </>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg md:text-xl font-bold">My Maintenance Tickets</h2>
        {p && (
          <TicketDialog user={user} property={p} onSaved={onRefresh}>
            <Button className="rounded-full gap-2 self-start"><Plus className="h-4 w-4" /> New Ticket</Button>
          </TicketDialog>
        )}
      </div>
      <div className="space-y-3">
        {tickets.length === 0 ? <EmptyState msg="No tickets raised yet." /> :
          tickets.map(t => <TicketRow key={t.id} ticket={t} property={p} onRefresh={onRefresh} />)}
      </div>
    </div>
  )
}

/* ---------------- COMPONENTS ---------------- */
const StatCard = ({ icon: Icon, label, value, sub, accent, link }) => (
  <div className="bg-card border border-border rounded-2xl p-4 md:p-5">
    <div className="flex items-center justify-between mb-2 md:mb-3">
      <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wide truncate">{label}</p>
      <Icon className="h-4 w-4 text-primary shrink-0" />
    </div>
    <p className={`text-lg md:text-2xl font-bold break-words ${accent ? 'text-primary' : ''}`}>{value}</p>
    {sub && <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{sub}</p>}
    {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-[10px] md:text-xs text-primary underline mt-1 inline-block">Open portal ↗</a>}
  </div>
)

const EmptyState = ({ msg }) => (
  <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">{msg}</div>
)

const PropertyRow = ({ property, role, user, users, onRefresh, standalone }) => {
  const [open, setOpen] = useState(false)
  const handleDelete = async () => {
    if (!confirm('Delete this property?')) return
    const res = await fetch(`/api/properties/${property.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); onRefresh() } else toast.error('Failed')
  }
  return (
    <div className={standalone ? 'p-0' : 'bg-card border border-border rounded-2xl overflow-hidden'}>
      <div className="md:flex">
        <div className="md:w-64 lg:w-72 shrink-0 h-40 sm:h-52 md:h-auto md:aspect-auto bg-muted relative">
          {property.image ? (
            <img src={property.image} alt={property.address} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center"><Home className="h-12 w-12 text-muted-foreground/30" /></div>
          )}
        </div>
        <div className="flex-1 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground mb-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{property.address}</span>
              </div>
              <h3 className="text-base md:text-lg font-bold truncate">{property.name || property.address}</h3>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {(role === 'manager' || role === 'owner') && (
                <>
                  <PropertyDialog user={user} users={users} existing={property} onSaved={onRefresh}>
                    <Button variant="outline" size="sm" className="gap-1 h-8"><Edit className="h-3 w-3" /> <span className="hidden sm:inline">Edit</span></Button>
                  </PropertyDialog>
                  {role === 'manager' && <Button variant="outline" size="sm" className="h-8" onClick={handleDelete}><Trash2 className="h-3 w-3" /></Button>}
                </>
              )}
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Details'}</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <MiniField icon={Calendar} label="Lease" value={`${formatDate(property.leaseStart)} → ${formatDate(property.leaseEnd)}`} />
            <MiniField icon={DollarSign} label="Rent" value={formatCurrency(property.monthlyRent)} />
            {(role !== 'tenant') && <MiniField icon={User} label="Tenant" value={property.tenantName || 'Vacant'} />}
            <MiniField icon={Shield} label="Insurance" value={property.insuranceProvider || '—'} />
          </div>

          {open && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="grid md:grid-cols-2 gap-4">
                {(role === 'manager' || role === 'owner') && (
                  <DetailCard icon={User} title="Tenant Details" accent="emerald">
                    <Row label="Full name" value={property.tenantName || 'Vacant'} />
                    <Row label="Email" value={property.tenantEmail} />
                    <Row label="Phone" value={property.tenantPhone} />
                    <Row label="Security Deposit" value={formatCurrency(property.securityDeposit)} />
                    <Row label="Lease Type" value={property.leaseType || 'Standard'} />
                  </DetailCard>
                )}

                <DetailCard icon={Shield} title="Home Insurance" accent="blue">
                  <Row label="Provider" value={property.insuranceProvider} />
                  <Row label="Policy #" value={property.insurancePolicyNumber} />
                  <Row label="Start" value={formatDate(property.insuranceStart)} />
                  <Row label="End" value={formatDate(property.insuranceEnd)} />
                  <Row label="Renewal in" value={daysUntil(property.insuranceEnd) !== null ? `${daysUntil(property.insuranceEnd)} days` : '—'} highlight={daysUntil(property.insuranceEnd) !== null && daysUntil(property.insuranceEnd) < 60} />
                  {property.insuranceRenewalAmount && <Row label="Renewal amount" value={formatCurrency(property.insuranceRenewalAmount)} />}
                  {property.insurancePortalUrl && (
                    <a href={property.insurancePortalUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open insurance portal <span aria-hidden>↗</span></a>
                  )}
                </DetailCard>

                {role === 'owner' && (
                  <DetailCard icon={Percent} title="Financial / Mortgage" accent="amber" fullWidth>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                      <Row label="Loan provider" value={property.loanProvider} />
                      <Row label="Loan UID" value={property.loanAccountNumber} />
                      <Row label="Loan password" value={property.loanPassword ? '••••••••' : '—'} />
                      <Row label="ROI" value={property.roi ? `${property.roi}%` : '—'} />
                      <Row label="Monthly EMI" value={formatCurrency(property.monthlyEmi)} strong />
                      <Row label="Escrow" value={property.escrow ? 'Enabled' : 'Not enabled'} badge={property.escrow ? 'emerald' : 'slate'} />
                    </div>
                    {property.loanPortalUrl && (
                      <a href={property.loanPortalUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open loan portal <span aria-hidden>↗</span></a>
                    )}
                  </DetailCard>
                )}

                {role === 'manager' && (
                  <DetailCard icon={User} title="Owner" accent="amber">
                    <Row label="Name" value={property.ownerName} />
                  </DetailCard>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const MiniField = ({ icon: Icon, label, value }) => (
  <div>
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" /> {label}
    </div>
    <p className="text-sm font-medium mt-0.5 truncate" title={value}>{value}</p>
  </div>
)

const ACCENT_MAP = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200/60',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200/60',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200/60',
}
const DetailCard = ({ icon: Icon, title, accent = 'emerald', fullWidth, children }) => (
  <div className={`bg-muted/30 border border-border rounded-2xl p-4 md:p-5 ${fullWidth ? 'md:col-span-2' : ''}`}>
    <div className="flex items-center gap-2 mb-3 md:mb-4">
      <div className={`h-8 w-8 rounded-lg ring-1 flex items-center justify-center shrink-0 ${ACCENT_MAP[accent]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <h4 className="font-semibold text-sm">{title}</h4>
    </div>
    {children}
  </div>
)
const Row = ({ label, value, strong, highlight, badge }) => (
  <div className="flex items-baseline justify-between gap-3 py-2 border-b border-border/40 last:border-0">
    <span className="text-[11px] md:text-xs text-muted-foreground shrink-0">{label}</span>
    {badge ? (
      <span className={`text-[11px] md:text-xs font-medium px-2 py-0.5 rounded-full ${ACCENT_MAP[badge]}`}>{value || '—'}</span>
    ) : (
      <span className={`text-xs md:text-sm text-right break-all ${strong ? 'font-bold text-foreground' : 'font-medium'} ${highlight ? 'text-amber-700' : ''}`}>{value || '—'}</span>
    )}
  </div>
)

const TicketRow = ({ ticket, property, canManage, onRefresh }) => {
  const updateStatus = async (status) => {
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) { toast.success(`Ticket ${status.replace('_', ' ')}`); onRefresh() }
  }
  const StatusIcon = ticket.status === 'resolved' ? CheckCircle2 : ticket.status === 'in_progress' ? Clock : AlertCircle
  return (
    <div className="bg-card border border-border rounded-2xl p-4 md:p-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`${PRIORITY_COLORS[ticket.priority]} border-0 capitalize text-[10px] md:text-xs`}>{ticket.priority}</Badge>
            <Badge className={`${STATUS_COLORS[ticket.status]} border-0 capitalize gap-1 text-[10px] md:text-xs`}><StatusIcon className="h-3 w-3" />{ticket.status.replace('_', ' ')}</Badge>
            <span className="text-[10px] md:text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</span>
          </div>
          <h3 className="font-semibold mt-2 text-sm md:text-base break-words">{ticket.title}</h3>
          <p className="text-xs md:text-sm text-muted-foreground mt-1 break-words">{ticket.description}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] md:text-xs text-muted-foreground">
            {property && <span className="flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{property.address}</span></span>}
            <span className="flex items-center gap-1"><User className="h-3 w-3 shrink-0" />{ticket.tenantName}</span>
          </div>
        </div>
        {canManage && ticket.status !== 'resolved' && (
          <Select onValueChange={updateStatus} defaultValue={ticket.status}>
            <SelectTrigger className="w-full md:w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}

/* ---------------- DIALOGS ---------------- */
const PropertyDialog = ({ children, user, users = [], existing, onSaved }) => {
  const [open, setOpen] = useState(false)
  const empty = {
    name: '', address: '', image: '',
    ownerId: '', ownerName: '',
    tenantId: '', tenantName: '', tenantEmail: '', tenantPhone: '',
    leaseStart: '', leaseEnd: '', monthlyRent: '', securityDeposit: '',
    insuranceProvider: '', insurancePolicyNumber: '', insuranceStart: '', insuranceEnd: '',
    loanProvider: '', loanAccountNumber: '', roi: '', monthlyEmi: '', loanPortalUrl: '',
  }
  const [form, setForm] = useState(existing || empty)
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm({ ...form, [k]: v })

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const url = existing ? `/api/properties/${existing.id}` : '/api/properties'
      const method = existing ? 'PUT' : 'POST'
      // resolve owner/tenant names from users list
      const owner = users.find(u => u.id === form.ownerId)
      const tenant = users.find(u => u.id === form.tenantId)
      const payload = {
        ...form,
        ownerName: owner?.name || form.ownerName,
        tenantName: tenant?.name || form.tenantName,
        tenantEmail: tenant?.email || form.tenantEmail,
        tenantPhone: tenant?.phone || form.tenantPhone,
        managerId: user.id, managerName: user.name,
      }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Save failed')
      toast.success(existing ? 'Property updated' : 'Property added')
      setOpen(false); onSaved()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const owners = users.filter(u => u.role === 'owner')
  const tenants = users.filter(u => u.role === 'tenant')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? 'Edit Property' : 'Add Property'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-6">
          <Section title="Basics">
            <F label="Property name"><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Sunset Villa" /></F>
            <F label="Address" required><Input required value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Oak St, Austin TX" /></F>
            <F label="Image URL" full><Input value={form.image} onChange={e => set('image', e.target.value)} placeholder="https://..." /></F>
          </Section>

          <Section title="Assignment">
            {user.role === 'manager' && (<>
              <F label="Owner">
                <Select value={form.ownerId} onValueChange={v => set('ownerId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>{owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name} ({o.email})</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Tenant">
                <Select value={form.tenantId} onValueChange={v => set('tenantId', v)}>
                  <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                  <SelectContent>{tenants.map(o => <SelectItem key={o.id} value={o.id}>{o.name} ({o.email})</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </>)}
          </Section>

          <Section title="Lease">
            <F label="Lease start"><Input type="date" value={form.leaseStart?.slice(0,10)} onChange={e => set('leaseStart', e.target.value)} /></F>
            <F label="Lease end"><Input type="date" value={form.leaseEnd?.slice(0,10)} onChange={e => set('leaseEnd', e.target.value)} /></F>
            <F label="Monthly rent ($)"><Input type="number" step="0.01" value={form.monthlyRent} onChange={e => set('monthlyRent', e.target.value)} /></F>
            <F label="Security deposit ($)"><Input type="number" step="0.01" value={form.securityDeposit} onChange={e => set('securityDeposit', e.target.value)} /></F>
          </Section>

          <Section title="Home Insurance">
            <F label="Provider"><Input value={form.insuranceProvider} onChange={e => set('insuranceProvider', e.target.value)} placeholder="State Farm" /></F>
            <F label="Policy number"><Input value={form.insurancePolicyNumber} onChange={e => set('insurancePolicyNumber', e.target.value)} /></F>
            <F label="Policy start"><Input type="date" value={form.insuranceStart?.slice(0,10)} onChange={e => set('insuranceStart', e.target.value)} /></F>
            <F label="Policy end"><Input type="date" value={form.insuranceEnd?.slice(0,10)} onChange={e => set('insuranceEnd', e.target.value)} /></F>
          </Section>

          <Section title="Financial / Mortgage">
            <F label="Loan provider"><Input value={form.loanProvider} onChange={e => set('loanProvider', e.target.value)} /></F>
            <F label="Loan UID / Account #"><Input value={form.loanAccountNumber} onChange={e => set('loanAccountNumber', e.target.value)} /></F>
            <F label="ROI (%)"><Input type="number" step="0.01" value={form.roi} onChange={e => set('roi', e.target.value)} /></F>
            <F label="Monthly EMI ($)"><Input type="number" step="0.01" value={form.monthlyEmi} onChange={e => set('monthlyEmi', e.target.value)} /></F>
            <F label="Loan portal URL" full><Input value={form.loanPortalUrl} onChange={e => set('loanPortalUrl', e.target.value)} placeholder="https://..." /></F>
          </Section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : (existing ? 'Save changes' : 'Create property')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const Section = ({ title, children }) => (
  <div>
    <h4 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">{title}</h4>
    <div className="grid grid-cols-2 gap-4">{children}</div>
  </div>
)
const F = ({ label, children, required, full }) => (
  <div className={full ? 'col-span-2' : ''}>
    <Label className="text-xs">{label}{required && ' *'}</Label>
    <div className="mt-1">{children}</div>
  </div>
)

const TicketDialog = ({ children, user, property, onSaved }) => {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' })
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, propertyId: property.id,
          tenantId: user.id, tenantName: user.name, tenantEmail: user.email,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Ticket submitted — owner & manager notified')
      setOpen(false); setForm({ title: '', description: '', priority: 'medium' }); onSaved()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Raise a maintenance ticket</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Title</Label><Input required className="mt-1" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Leaking kitchen sink" /></div>
          <div><Label>Description</Label><Textarea required rows={4} className="mt-1" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Submitting...' : 'Submit ticket'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default DashboardPage
