import { NextResponse } from 'next/server';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { LeaderboardEntry } from '@/components/types';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Remove this debug log at the top of the file
// console.log('SECRET_PASSPHRASE:', process.env.SECRET_PASSPHRASE);

let client: MongoClient | null = null;

async function getMongoClient() {
  if (client) {
    try {
      await client.db().command({ ping: 1 });
      return client;
    } catch (error) {
      console.error('Error pinging MongoDB:', error);
      await client.close();
      client = null;
    }
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not defined');
    throw new Error('MONGODB_URI is not defined');
  }

  try {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });

    await client.connect();
    console.log('Connected to MongoDB');
    return client;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

type GameSession = {
  id: string;
  startTime: number;
  cards: string[];
  moves: number;
  completed: boolean;
  endTime?: number;
};

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request: Request) {
  try {
    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const leaderboard = database.collection("leaderboard");
    
    const entries = await leaderboard.find().sort({ time: 1 }).limit(10).toArray();
    return NextResponse.json(entries, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Received POST request with body:', body);
    const { action, sessionId } = body;

    switch (action) {
      case 'initializeGame':
        return initializeGame(body);
      case 'completeGame':
        return completeGame(body);
      case 'submitScore':
        return submitScore(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in POST handler:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function initializeGame(body: any) {
  const { encryptedEmojis } = body;
  const sessionId = uuidv4();
  
  try {
    const secretPassphrase = process.env.SECRET_PASSPHRASE;
    if (!secretPassphrase) {
      throw new Error('SECRET_PASSPHRASE is not defined');
    }

    // Remove these console.logs
    // console.log('Attempting to decrypt with passphrase:', secretPassphrase);
    // console.log('Encrypted emojis:', encryptedEmojis);

    if (!encryptedEmojis) {
      throw new Error('Encrypted emojis are missing');
    }

    const decryptedEmojis = decryptData(encryptedEmojis, secretPassphrase);
    // Remove this console.log
    // console.log('Decrypted emojis:', decryptedEmojis);

    const emojis = JSON.parse(decryptedEmojis);
    const shuffledEmojis = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    
    const session: GameSession = {
      id: sessionId,
      startTime: Date.now(),
      cards: shuffledEmojis,
      moves: 0,
      completed: false,
    };

    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const sessions = database.collection("sessions");
    await sessions.insertOne(session);

    const encryptedCards = encryptData(JSON.stringify(shuffledEmojis), secretPassphrase);
    return NextResponse.json({ sessionId, encryptedCards });
  } catch (error) {
    console.error('Error in initializeGame:', error);
    throw error;
  }
}

async function completeGame(body: any) {
  const { sessionId, endTime, moves } = body;
  if (!sessionId || !endTime || moves === undefined) {
    console.error('Invalid request body:', body);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  console.log('Received completeGame request:', { sessionId, endTime, moves });

  try {
    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const sessions = database.collection("sessions");

    const session = await sessions.findOne({ id: sessionId });

    if (!session) {
      console.error('Invalid session:', sessionId);
      return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
    }

    if (session.completed) {
      console.log('Game already completed:', sessionId);
      const gameTime = session.endTime ? session.endTime - session.startTime : 0;
      return NextResponse.json({ success: true, moves: session.moves, time: gameTime });
    }

    const gameTime = endTime - session.startTime;

    if (gameTime < 5000) {
      console.error('Suspicious game time:', gameTime);
      return NextResponse.json({ error: 'Suspicious game time' }, { status: 400 });
    }

    await sessions.updateOne(
      { id: sessionId },
      { $set: { completed: true, moves: moves, endTime: endTime } }
    );

    console.log('Game completed successfully:', { sessionId, moves, gameTime });
    return NextResponse.json({ success: true, moves: moves, time: gameTime });
  } catch (error) {
    console.error('Error completing game:', error);
    return NextResponse.json({ error: 'Failed to complete game' }, { status: 500 });
  }
}

async function submitScore(body: any) {
  const { sessionId, name, country } = body;
  
  if (!sessionId || !name) {
    console.error('Missing required fields:', body);
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const sessions = database.collection("sessions");
    const leaderboard = database.collection("leaderboard");

    const session = await sessions.findOne({ id: sessionId });

    if (!session || !session.completed) {
      console.error('Invalid or incomplete session:', sessionId);
      return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
    }

    const { moves, startTime, endTime } = session;
    const time = endTime - startTime;

    const entry: LeaderboardEntry = {
      name,
      time,
      moves,
      country: country || '🌎',
      date: new Date().toISOString(),
      sessionId,
    };
    
    await leaderboard.insertOne(entry);

    console.log('Score submitted successfully for session:', sessionId);
    return NextResponse.json({ message: 'Score submitted successfully' }, { status: 201 });
  } catch (error) {
    console.error('Error submitting score:', error);
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  }
}

// Cleanup function to close MongoDB connection when the server shuts down
process.on('SIGINT', async () => {
  if (client) {
    await client.close();
  }
  process.exit(0);
});

// Add these utility functions for encryption and decryption
function deriveKey(password: string): Buffer {
  return crypto.pbkdf2Sync(password, 'salt', 100000, 32, 'sha256');
}

function encryptData(data: string, password: string): string {
  const key = deriveKey(password);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return iv.toString('base64') + ':' + encrypted + ':' + authTag.toString('base64');
}

function decryptData(encryptedData: string, password: string): string {
  try {
    // Remove all console.logs from this function
    const key = deriveKey(password);
    const [ivBase64, encrypted, authTagBase64] = encryptedData.split(':');
    
    if (!ivBase64 || !encrypted || !authTagBase64) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error in decryptData');
    throw error;
  }
}

