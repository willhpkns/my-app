import { NextResponse } from 'next/server';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { LeaderboardEntry } from '@/components/types';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

let client: MongoClient | null = null;

async function getMongoClient() {
  if (client) {
    try {
      await client.db().command({ ping: 1 });
      return client;
    } catch (error) {
      await client.close();
      client = null;
    }
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
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
    return client;
  } catch (error) {
    throw error;
  }
}

type GameSession = {
  id: string;
  startTime: number;
  cards: string[];
  flippedCards: number[];
  matchedPairs: number;
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
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, sessionId } = body;

    switch (action) {
      case 'initializeGame':
        return initializeGame(body);
      case 'makeMove':
        return makeMove(body);
      case 'completeGame':
        return completeGame(body);
      case 'submitScore':
        return submitScore(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
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

    if (!encryptedEmojis) {
      throw new Error('Encrypted emojis are missing');
    }

    const decryptedEmojis = decryptData(encryptedEmojis, secretPassphrase);
    const emojis = JSON.parse(decryptedEmojis);
    const shuffledEmojis = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    
    const session: GameSession = {
      id: sessionId,
      startTime: Date.now(),
      cards: shuffledEmojis,
      flippedCards: [],
      matchedPairs: 0,
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
    throw error;
  }
}

async function makeMove(body: any) {
  const { sessionId, cardId } = body;
  
  try {
    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const sessions = database.collection("sessions");

    const session = await sessions.findOne({ id: sessionId });

    if (!session || session.completed) {
      return NextResponse.json({ error: 'Invalid or completed game session' }, { status: 400 });
    }

    let updatedFlippedCards = [...session.flippedCards, cardId];
    let updatedMatchedPairs = session.matchedPairs;
    let matchedCardIds: number[] = [];
    let isComplete = false;
    let updatedMoves = session.moves;

    if (updatedFlippedCards.length > 2) {
      updatedFlippedCards = [cardId];
    } else if (updatedFlippedCards.length === 2) {
      updatedMoves++;
      const [firstCardId, secondCardId] = updatedFlippedCards;
      if (session.cards[firstCardId] === session.cards[secondCardId]) {
        matchedCardIds = [firstCardId, secondCardId];
        updatedMatchedPairs++;
        updatedFlippedCards = [];
      }
    }

    isComplete = updatedMatchedPairs === session.cards.length / 2;

    await sessions.updateOne(
      { id: sessionId },
      { 
        $set: { 
          flippedCards: updatedFlippedCards,
          matchedPairs: updatedMatchedPairs,
          moves: updatedMoves,
          completed: isComplete,
          endTime: isComplete ? Date.now() : undefined
        } 
      }
    );

    const response = {
      gameState: {
        flippedCards: updatedFlippedCards,
        matchedPairs: updatedMatchedPairs,
        moves: updatedMoves,
        completed: isComplete,
        matchedCardIds
      },
      isComplete
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to make move' }, { status: 500 });
  }
}

async function completeGame(body: any) {
  const { sessionId, endTime, moves } = body;
  if (!sessionId || !endTime || moves === undefined) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const sessions = database.collection("sessions");

    const session = await sessions.findOne({ id: sessionId });

    if (!session) {
      return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
    }

    if (session.completed) {
      const gameTime = session.endTime - session.startTime;
      return NextResponse.json({ success: true, moves: session.moves, time: gameTime });
    }

    const gameTime = endTime - session.startTime;

    if (gameTime < 5000) {
      return NextResponse.json({ error: 'Suspicious game time' }, { status: 400 });
    }

    await sessions.updateOne(
      { id: sessionId },
      { $set: { completed: true, moves: moves, endTime: endTime } }
    );

    return NextResponse.json({ success: true, moves: moves, time: gameTime });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to complete game' }, { status: 500 });
  }
}

async function submitScore(body: any) {
  const { sessionId, name, country } = body;
  
  if (!sessionId || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const sessions = database.collection("sessions");
    const leaderboard = database.collection("leaderboard");

    const session = await sessions.findOne({ id: sessionId });

    if (!session || !session.completed) {
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

    return NextResponse.json({ message: 'Score submitted successfully' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  }
}

process.on('SIGINT', async () => {
  if (client) {
    await client.close();
  }
  process.exit(0);
});

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
    throw error;
  }
}

