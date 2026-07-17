import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'

let client
let db

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME || 'grtr_homes')
  }
  return db
}

function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

const clean = (doc) => { if (!doc) return doc; const { _id, password, ...rest } = doc; return rest }
const ok = (data, status = 200) => handleCORS(NextResponse.json(data, { status }))
const err = (msg, status = 400) => handleCORS(NextResponse.json({ error: msg }, { status }))

async function handleRoute(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    if (route === '/' && method === 'GET') return ok({ message: 'GRTR Homes API' })

    /* ---------- AUTH ---------- */
    if (route === '/auth/register' && method === 'POST') {
      const b = await request.json()
      if (!b.email || !b.password || !b.name || !b.role) return err('email, password, name, role required')
      const existing = await db.collection('users').findOne({ email: b.email })
      if (existing) return err('Email already registered')
      const user = {
        id: uuidv4(), email: b.email, password: b.password, name: b.name,
        phone: b.phone || '', role: b.role, createdAt: new Date().toISOString(),
      }
      await db.collection('users').insertOne(user)
      return ok({ user: clean(user) })
    }

    if (route === '/auth/login' && method === 'POST') {
      const b = await request.json()
      const user = await db.collection('users').findOne({ email: b.email, password: b.password })
      if (!user) return err('Invalid email or password', 401)
      return ok({ user: clean(user) })
    }

    if (route === '/users' && method === 'GET') {
      const users = await db.collection('users').find({}).toArray()
      return ok(users.map(clean))
    }

    /* ---------- PROPERTIES ---------- */
    if (route === '/properties' && method === 'GET') {
      const url = new URL(request.url)
      const userId = url.searchParams.get('userId')
      const role = url.searchParams.get('role')
      let query = {}
      if (role === 'owner') query.ownerId = userId
      else if (role === 'tenant') query.tenantId = userId
      const list = await db.collection('properties').find(query).sort({ createdAt: -1 }).toArray()
      return ok(list.map(clean))
    }

    if (route === '/properties' && method === 'POST') {
      const b = await request.json()
      const p = { id: uuidv4(), ...b, createdAt: new Date().toISOString() }
      await db.collection('properties').insertOne(p)
      return ok(clean(p))
    }

    const propMatch = route.match(/^\/properties\/([^/]+)$/)
    if (propMatch) {
      const id = propMatch[1]
      if (method === 'GET') {
        const p = await db.collection('properties').findOne({ id })
        return p ? ok(clean(p)) : err('Not found', 404)
      }
      if (method === 'PUT') {
        const b = await request.json()
        delete b._id; delete b.id
        await db.collection('properties').updateOne({ id }, { $set: { ...b, updatedAt: new Date().toISOString() } })
        const updated = await db.collection('properties').findOne({ id })
        return ok(clean(updated))
      }
      if (method === 'DELETE') {
        await db.collection('properties').deleteOne({ id })
        return ok({ deleted: true })
      }
    }

    /* ---------- TICKETS ---------- */
    if (route === '/tickets' && method === 'GET') {
      const url = new URL(request.url)
      const userId = url.searchParams.get('userId')
      const role = url.searchParams.get('role')
      let query = {}
      if (role === 'tenant') query.tenantId = userId
      else if (role === 'owner') {
        const owned = await db.collection('properties').find({ ownerId: userId }).toArray()
        query.propertyId = { $in: owned.map(p => p.id) }
      }
      const list = await db.collection('tickets').find(query).sort({ createdAt: -1 }).toArray()
      return ok(list.map(clean))
    }

    if (route === '/tickets' && method === 'POST') {
      const b = await request.json()
      const property = await db.collection('properties').findOne({ id: b.propertyId })
      const t = {
        id: uuidv4(), ...b, status: 'open',
        propertyAddress: property?.address,
        ownerId: property?.ownerId, ownerEmail: property?.ownerEmail,
        managerId: property?.managerId,
        createdAt: new Date().toISOString(),
        notifications: [
          { to: property?.ownerName || 'Owner', method: 'email', at: new Date().toISOString() },
          { to: property?.managerName || 'Manager', method: 'email', at: new Date().toISOString() },
        ],
      }
      await db.collection('tickets').insertOne(t)
      console.log(`[EMAIL MOCKED] Ticket "${t.title}" sent to owner + manager for ${property?.address}`)
      return ok(clean(t))
    }

    const ticketMatch = route.match(/^\/tickets\/([^/]+)$/)
    if (ticketMatch) {
      const id = ticketMatch[1]
      if (method === 'PUT') {
        const b = await request.json()
        delete b._id; delete b.id
        await db.collection('tickets').updateOne({ id }, { $set: { ...b, updatedAt: new Date().toISOString() } })
        const updated = await db.collection('tickets').findOne({ id })
        return ok(clean(updated))
      }
      if (method === 'DELETE') {
        await db.collection('tickets').deleteOne({ id })
        return ok({ deleted: true })
      }
    }

    /* ---------- SEED ---------- */
    if (route === '/seed' && method === 'POST') {
      await db.collection('users').deleteMany({})
      await db.collection('properties').deleteMany({})
      await db.collection('tickets').deleteMany({})

      const manager = { id: uuidv4(), name: 'Rachel Cooper', email: 'manager@grtr.com', password: 'demo123', phone: '512-555-0100', role: 'manager', createdAt: new Date().toISOString() }
      const owner = { id: uuidv4(), name: 'James Whitmore', email: 'owner@grtr.com', password: 'demo123', phone: '512-555-0200', role: 'owner', createdAt: new Date().toISOString() }
      const owner2 = { id: uuidv4(), name: 'Sofia Martinez', email: 'sofia@grtr.com', password: 'demo123', phone: '512-555-0201', role: 'owner', createdAt: new Date().toISOString() }
      const tenant = { id: uuidv4(), name: 'Alex Rivera', email: 'tenant@grtr.com', password: 'demo123', phone: '512-555-0300', role: 'tenant', createdAt: new Date().toISOString() }
      const tenant2 = { id: uuidv4(), name: 'Emma Chen', email: 'emma@grtr.com', password: 'demo123', phone: '512-555-0301', role: 'tenant', createdAt: new Date().toISOString() }
      await db.collection('users').insertMany([manager, owner, owner2, tenant, tenant2])

      const today = new Date()
      const inMonths = (m) => { const d = new Date(today); d.setMonth(d.getMonth() + m); return d.toISOString() }

      const properties = [
        {
          id: uuidv4(), name: 'Sunset Ridge', address: '2100 Oak Meadow Dr, Austin TX 78745',
          image: 'https://images.pexels.com/photos/19344325/pexels-photo-19344325.jpeg',
          ownerId: owner.id, ownerName: owner.name,
          tenantId: tenant.id, tenantName: tenant.name, tenantEmail: tenant.email, tenantPhone: tenant.phone,
          managerId: manager.id, managerName: manager.name,
          leaseStart: inMonths(-6), leaseEnd: inMonths(6), monthlyRent: 2450, securityDeposit: 2450,
          insuranceProvider: 'State Farm', insurancePolicyNumber: 'SF-88291-TX', insuranceStart: inMonths(-3), insuranceEnd: inMonths(9),
          loanProvider: 'Chase Bank', loanAccountNumber: 'CH-4021-88', roi: 6.75, monthlyEmi: 1820, loanPortalUrl: 'https://chase.com',
          createdAt: new Date().toISOString(),
        },
        {
          id: uuidv4(), name: 'Cedar Park Villa', address: '450 Cedar Ln, Round Rock TX 78664',
          image: 'https://images.pexels.com/photos/11018246/pexels-photo-11018246.jpeg',
          ownerId: owner.id, ownerName: owner.name,
          tenantId: tenant2.id, tenantName: tenant2.name, tenantEmail: tenant2.email, tenantPhone: tenant2.phone,
          managerId: manager.id, managerName: manager.name,
          leaseStart: inMonths(-2), leaseEnd: inMonths(10), monthlyRent: 3100, securityDeposit: 3100,
          insuranceProvider: 'Allstate', insurancePolicyNumber: 'AL-77213-TX', insuranceStart: inMonths(-1), insuranceEnd: inMonths(11),
          loanProvider: 'Wells Fargo', loanAccountNumber: 'WF-9982-11', roi: 7.10, monthlyEmi: 2210, loanPortalUrl: 'https://wellsfargo.com',
          createdAt: new Date().toISOString(),
        },
        {
          id: uuidv4(), name: 'Hilltop Retreat', address: '78 Ranch Rd, Dripping Springs TX 78620',
          image: 'https://images.unsplash.com/photo-1628624747186-a941c476b7ef',
          ownerId: owner2.id, ownerName: owner2.name,
          tenantId: '', tenantName: '', tenantEmail: '', tenantPhone: '',
          managerId: manager.id, managerName: manager.name,
          leaseStart: '', leaseEnd: '', monthlyRent: 3800, securityDeposit: 0,
          insuranceProvider: 'Liberty Mutual', insurancePolicyNumber: 'LM-33218-TX', insuranceStart: inMonths(-4), insuranceEnd: inMonths(8),
          loanProvider: 'Bank of America', loanAccountNumber: 'BOA-5501-22', roi: 6.95, monthlyEmi: 2680, loanPortalUrl: 'https://bofa.com',
          createdAt: new Date().toISOString(),
        },
      ]
      await db.collection('properties').insertMany(properties)

      const tickets = [
        { id: uuidv4(), propertyId: properties[0].id, propertyAddress: properties[0].address, tenantId: tenant.id, tenantName: tenant.name, tenantEmail: tenant.email, ownerId: owner.id, managerId: manager.id, title: 'Kitchen faucet leaking', description: 'The cold water faucet in the kitchen has a slow leak — water pooling under the sink.', priority: 'medium', status: 'open', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
        { id: uuidv4(), propertyId: properties[0].id, propertyAddress: properties[0].address, tenantId: tenant.id, tenantName: tenant.name, tenantEmail: tenant.email, ownerId: owner.id, managerId: manager.id, title: 'AC not cooling properly', description: 'Living room stays at 78°F even when set to 72°F. Started yesterday.', priority: 'high', status: 'in_progress', createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
        { id: uuidv4(), propertyId: properties[1].id, propertyAddress: properties[1].address, tenantId: tenant2.id, tenantName: tenant2.name, tenantEmail: tenant2.email, ownerId: owner.id, managerId: manager.id, title: 'Garage door remote broken', description: 'Remote stopped working. Manual works fine.', priority: 'low', status: 'resolved', createdAt: new Date(Date.now() - 86400000 * 10).toISOString() },
      ]
      await db.collection('tickets').insertMany(tickets)

      return ok({ ok: true, seeded: { users: 5, properties: 3, tickets: 3 } })
    }

    return err(`Route ${route} not found`, 404)
  } catch (e) {
    console.error('API Error:', e)
    return err('Internal server error: ' + e.message, 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
