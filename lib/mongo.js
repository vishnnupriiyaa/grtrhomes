import { MongoClient } from 'mongodb'

let client
let clientPromise

async function createMongoClient(mongoUrl) {
  const nextClient = new MongoClient(mongoUrl, {
    maxPoolSize: 10,
    minPoolSize: 0,
    retryWrites: true,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  })
  await nextClient.connect()
  return nextClient
}

export async function connectToMongo() {
  const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI || process.env.GRTRHOMES_MONGODB_URI || process.env.grtrhomes_MONGODB_URI
  if (!mongoUrl) {
    throw new Error('Missing MongoDB connection string. Set MONGO_URL, MONGODB_URI, or GRTRHOMES_MONGODB_URI.')
  }
  const dbName = process.env.DB_NAME || 'grtr_homes'

  if (!clientPromise) {
    clientPromise = createMongoClient(mongoUrl)
  }

  try {
    client = await clientPromise
    await client.db(dbName).command({ ping: 1 })
  } catch (error) {
    console.warn('MongoDB reconnect triggered:', error?.message)
    clientPromise = createMongoClient(mongoUrl)
    client = await clientPromise
  }

  return client.db(dbName)
}