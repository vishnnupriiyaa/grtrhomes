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

    /* ---------- SEED (real portfolio data) ---------- */
    if (route === '/seed' && method === 'POST') {
      await db.collection('users').deleteMany({})
      await db.collection('properties').deleteMany({})
      await db.collection('tickets').deleteMany({})

      const nowIso = new Date().toISOString()
      // Parse dates like "MM/DD/YYYY" or "Mon D, YYYY" into ISO
      const iso = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toISOString() }

      // ---- USERS ----
      const manager = { id: uuidv4(), name: 'Rachel Cooper', email: 'manager@grtr.com', password: 'demo123', phone: '512-555-0100', role: 'manager', createdAt: nowIso }

      // Two owners from spreadsheet
      const ownerBTS = { id: uuidv4(), name: 'BTS Rinu', email: 'btsrinu@gmail.com', password: 'demo123', phone: '512-555-1000', role: 'owner', createdAt: nowIso }
      const ownerRavi = { id: uuidv4(), name: 'Ravi Nasika', email: 'ravi.nasika@gmail.com', password: 'demo123', phone: '512-555-2000', role: 'owner', createdAt: nowIso }

      // Tenants (each gets a portal account)
      const tMike     = { id: uuidv4(), name: 'Mike Jones',        email: 'jones099672@yahoo.com', password: 'demo123', phone: '713-252-4874', role: 'tenant', createdAt: nowIso }
      const tTeresa   = { id: uuidv4(), name: 'Teresa Collier',    email: '4tacollier@gmail.com',  password: 'demo123', phone: '830-500-0800', role: 'tenant', createdAt: nowIso }
      const tRandall  = { id: uuidv4(), name: 'Randall Whitfield', email: 'newmillsen@gmail.com',  password: 'demo123', phone: '512-791-2905', role: 'tenant', createdAt: nowIso }
      const tKurt     = { id: uuidv4(), name: 'Kurt B Grindstaff', email: 'kurtb@example.com',     password: 'demo123', phone: '803-305-5165', role: 'tenant', createdAt: nowIso }
      const tSteven   = { id: uuidv4(), name: 'Stevenson Runyon',  email: 'sgrunyon7@aol.com',     password: 'demo123', phone: '512-555-3001', role: 'tenant', createdAt: nowIso }
      const tSamantha = { id: uuidv4(), name: 'Samantha Bender',   email: 'sjbender13@gmail.com',  password: 'demo123', phone: '307-272-2505', role: 'tenant', createdAt: nowIso }
      const tAdam     = { id: uuidv4(), name: 'Adam',              email: 'adam@example.com',      password: 'demo123', phone: '512-555-3003', role: 'tenant', createdAt: nowIso }
      const tKeith    = { id: uuidv4(), name: 'Keith',             email: 'keith@example.com',     password: 'demo123', phone: '512-555-3004', role: 'tenant', createdAt: nowIso }

      // Also add a quick-demo tenant alias
      const tDemo = { id: uuidv4(), name: 'Alex Rivera (Demo)', email: 'tenant@grtr.com', password: 'demo123', phone: '512-555-0300', role: 'tenant', createdAt: nowIso }
      // demo owner alias
      const oDemo = { id: uuidv4(), name: 'James Whitmore (Demo)', email: 'owner@grtr.com', password: 'demo123', phone: '512-555-0200', role: 'owner', createdAt: nowIso }

      await db.collection('users').insertMany([manager, ownerBTS, ownerRavi, tMike, tTeresa, tRandall, tKurt, tSteven, tSamantha, tAdam, tKeith, tDemo, oDemo])

      const houseImgs = [
        'https://images.pexels.com/photos/19344325/pexels-photo-19344325.jpeg',
        'https://images.pexels.com/photos/11018246/pexels-photo-11018246.jpeg',
        'https://images.unsplash.com/photo-1628624747186-a941c476b7ef',
        'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg',
        'https://images.pexels.com/photos/30580640/pexels-photo-30580640.jpeg',
        'https://images.unsplash.com/photo-1570129477492-45c003edd2be',
        'https://images.pexels.com/photos/19344325/pexels-photo-19344325.jpeg',
        'https://images.pexels.com/photos/11018246/pexels-photo-11018246.jpeg',
        'https://images.unsplash.com/photo-1628624747186-a941c476b7ef',
      ]
      let imgIdx = 0
      const nextImg = () => houseImgs[imgIdx++ % houseImgs.length]

      // ---- OWNER BTS Rinu — 5 properties ----
      const btsProps = [
        {
          id: uuidv4(), name: 'Siragusa Residence', address: '5704 Siragusa Dr, Austin, TX 78738', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: '', tenantName: '', tenantEmail: '', tenantPhone: '',
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 2400, securityDeposit: 0,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: iso('Aug 7, 2025'), insuranceEnd: iso('Aug 8, 2026'),
          loanProvider: 'Lakeview / Mr Cooper', loanAccountNumber: 'btsr', loanPassword: 'SreSri1977!',
          loanPortalUrl: '', roi: '', monthlyEmi: 2274.65, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'Traviston Home', address: '5415 Traviston Dr, Austin, TX 78738', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: tMike.id, tenantName: tMike.name, tenantEmail: tMike.email, tenantPhone: tMike.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: 'Fixed', leaseStart: '', leaseEnd: iso('04/01/2027'), monthlyRent: 2200, securityDeposit: 2200,
          insuranceProvider: 'Steadily', insurancePolicyNumber: '', insurancePortalUrl: 'https://app.steadily.com/customer/policies',
          insuranceStart: iso('02/08/2026'), insuranceEnd: iso('02/08/2027'),
          loanProvider: 'PNC', loanAccountNumber: 'btsr1', loanPassword: 'SysArm2008',
          loanPortalUrl: 'https://www.pnc.com', roi: '', monthlyEmi: 1249.78, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'Lost Maples House', address: '366 Lost Maples, New Braunfels, TX', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: tTeresa.id, tenantName: tTeresa.name, tenantEmail: tTeresa.email, tenantPhone: tTeresa.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: 'MTM', leaseStart: '', leaseEnd: '', monthlyRent: 1900, securityDeposit: 1900,
          insuranceProvider: 'SageSure', insurancePolicyNumber: '', insurancePortalUrl: 'https://my.sagesure.com/',
          insuranceStart: iso('Sep 29, 2025'), insuranceEnd: iso('Sep 29, 2026'),
          loanProvider: 'Mr Cooper', loanAccountNumber: 'btsr', loanPassword: 'SreSri1977!',
          loanPortalUrl: 'https://www.mrcooper.com', roi: '', monthlyEmi: 1077.14, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'Lone Peak Retreat', address: '868 Lone Peak Way, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: tRandall.id, tenantName: tRandall.name, tenantEmail: tRandall.email, tenantPhone: tRandall.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: 'MTM', leaseStart: '', leaseEnd: iso('02/27/2026'), monthlyRent: 2600, securityDeposit: 2600,
          insuranceProvider: 'MSI/MGA', insurancePolicyNumber: '', insurancePortalUrl: 'https://apps.msimga.com/Policy/Documents',
          insuranceStart: '', insuranceEnd: iso('02/27/2026'),
          loanProvider: 'Newrez / Shellpoint', loanAccountNumber: 'gmail', loanPassword: 'SreSriLonPea1977!',
          loanPortalUrl: 'https://www.newrez.com', roi: 6.13, monthlyEmi: 1733.92, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'El Capitan Estate', address: '256 El Capitan Lp, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerBTS.id, ownerName: ownerBTS.name,
          tenantId: tKurt.id, tenantName: tKurt.name, tenantEmail: tKurt.email, tenantPhone: tKurt.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: 'Fixed', leaseStart: '', leaseEnd: iso('04/30/2027'), monthlyRent: 3200, securityDeposit: 3200,
          insuranceProvider: 'SageSure', insurancePolicyNumber: '', insurancePortalUrl: 'https://my.sagesure.com/',
          insuranceStart: iso('03/12/2026'), insuranceEnd: iso('03/12/2027'), insuranceRenewalAmount: 2539.30,
          loanProvider: 'loanDepot', loanAccountNumber: 'gmail', loanPassword: 'SreSriLonPea1977!',
          loanPortalUrl: 'https://www.loandepot.com', roi: '', monthlyEmi: 2980.58, escrow: false,
          createdAt: nowIso,
        },
      ]

      // ---- OWNER Ravi Nasika — 4 properties ----
      const raviProps = [
        {
          id: uuidv4(), name: 'Traviston Home II', address: '5309 Traviston Dr, Austin, TX 78738', image: nextImg(),
          ownerId: ownerRavi.id, ownerName: ownerRavi.name,
          tenantId: tSteven.id, tenantName: tSteven.name, tenantEmail: tSteven.email, tenantPhone: tSteven.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 2500, securityDeposit: 2500,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: '', insuranceEnd: '',
          loanProvider: '', loanAccountNumber: '', loanPassword: '',
          loanPortalUrl: '', roi: '', monthlyEmi: 0, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'Lone Peak Villa', address: '862 Lone Peak Way, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerRavi.id, ownerName: ownerRavi.name,
          tenantId: tSamantha.id, tenantName: tSamantha.name, tenantEmail: tSamantha.email, tenantPhone: tSamantha.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 3400, securityDeposit: 3400,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: '', insuranceEnd: '',
          loanProvider: 'Lakeview / Mr Cooper', loanAccountNumber: 'btsr', loanPassword: 'SreSri1977!',
          loanPortalUrl: 'https://www.mrcooper.com', roi: '', monthlyEmi: 3162.31, escrow: true,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'El Capitan 200', address: '200 El Capitan Lp, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerRavi.id, ownerName: ownerRavi.name,
          tenantId: tAdam.id, tenantName: tAdam.name, tenantEmail: tAdam.email, tenantPhone: tAdam.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 3000, securityDeposit: 0,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: '', insuranceEnd: '',
          loanProvider: '', loanAccountNumber: '', loanPassword: '',
          loanPortalUrl: '', roi: '', monthlyEmi: 0, escrow: false,
          createdAt: nowIso,
        },
        {
          id: uuidv4(), name: 'El Capitan 386', address: '386 El Capitan Lp, Dripping Springs, TX 78620', image: nextImg(),
          ownerId: ownerRavi.id, ownerName: ownerRavi.name,
          tenantId: tKeith.id, tenantName: tKeith.name, tenantEmail: tKeith.email, tenantPhone: tKeith.phone,
          managerId: manager.id, managerName: manager.name,
          leaseType: '', leaseStart: '', leaseEnd: '', monthlyRent: 3100, securityDeposit: 0,
          insuranceProvider: '', insurancePolicyNumber: '', insurancePortalUrl: '',
          insuranceStart: '', insuranceEnd: '',
          loanProvider: '', loanAccountNumber: '', loanPassword: '',
          loanPortalUrl: '', roi: '', monthlyEmi: 0, escrow: false,
          createdAt: nowIso,
        },
      ]

      // Also give demo owner one property for the "one-click Owner demo" button so demo makes sense
      const demoProp = {
        id: uuidv4(), name: 'Demo Property', address: '2100 Oak Meadow Dr, Austin TX 78745', image: nextImg(),
        ownerId: oDemo.id, ownerName: oDemo.name,
        tenantId: tDemo.id, tenantName: tDemo.name, tenantEmail: tDemo.email, tenantPhone: tDemo.phone,
        managerId: manager.id, managerName: manager.name,
        leaseType: 'Fixed', leaseStart: iso(new Date(Date.now() - 86400000*180).toISOString()),
        leaseEnd: iso(new Date(Date.now() + 86400000*180).toISOString()),
        monthlyRent: 2450, securityDeposit: 2450,
        insuranceProvider: 'State Farm', insurancePolicyNumber: 'SF-88291-TX', insurancePortalUrl: '',
        insuranceStart: iso(new Date(Date.now() - 86400000*90).toISOString()),
        insuranceEnd: iso(new Date(Date.now() + 86400000*270).toISOString()),
        loanProvider: 'Chase Bank', loanAccountNumber: 'CH-4021-88', loanPassword: '',
        loanPortalUrl: 'https://chase.com', roi: 6.75, monthlyEmi: 1820, escrow: false,
        createdAt: nowIso,
      }

      const allProps = [...btsProps, ...raviProps, demoProp]
      await db.collection('properties').insertMany(allProps)

      // ---- Sample tickets ----
      const mkTicket = (prop, tenant, title, description, priority, status, daysAgo) => ({
        id: uuidv4(), propertyId: prop.id, propertyAddress: prop.address,
        tenantId: tenant.id, tenantName: tenant.name, tenantEmail: tenant.email,
        ownerId: prop.ownerId, managerId: manager.id,
        title, description, priority, status,
        createdAt: new Date(Date.now() - 86400000 * daysAgo).toISOString(),
        notifications: [
          { to: prop.ownerName, method: 'email', at: nowIso },
          { to: manager.name, method: 'email', at: nowIso },
        ],
      })
      const tickets = [
        mkTicket(btsProps[3], tRandall, 'Garage door not closing', 'Sensor light blinks red — door reverses halfway. Started last night.', 'high', 'open', 1),
        mkTicket(btsProps[4], tKurt, 'Kitchen faucet leaking', 'Slow drip under the sink — pooling on cabinet floor.', 'medium', 'in_progress', 3),
        mkTicket(btsProps[1], tMike, 'AC not cooling below 78°F', 'Set to 72°F, thermostat won\'t drop. Filter changed last month.', 'high', 'open', 2),
        mkTicket(raviProps[1], tSamantha, 'Backyard sprinkler broken', 'Zone 3 sprays only sideways, flooding the deck.', 'low', 'resolved', 8),
      ]
      await db.collection('tickets').insertMany(tickets)

      return ok({
        ok: true,
        seeded: { users: 13, properties: allProps.length, tickets: tickets.length },
        credentials: {
          manager: 'manager@grtr.com',
          owners: ['btsrinu@gmail.com', 'ravi.nasika@gmail.com', 'owner@grtr.com'],
          tenants: ['jones099672@yahoo.com', '4tacollier@gmail.com', 'newmillsen@gmail.com', 'kurtb@example.com', 'sgrunyon7@aol.com', 'sjbender13@gmail.com', 'adam@example.com', 'keith@example.com', 'tenant@grtr.com'],
          password: 'demo123',
        },
      })
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
