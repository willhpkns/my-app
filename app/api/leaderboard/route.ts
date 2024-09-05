import { NextResponse } from 'next/server';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { LeaderboardEntry } from '@/components/types';
import { v4 as uuidv4 } from 'uuid';

let client: MongoClient | null = null;

async function getMongoClient() {
  if (client) {
    try {
      // Check if the client is connected
      await client.db().command({ ping: 1 });
      return client;
    } catch (error) {
      // If ping fails, the connection is likely closed
      await client.close();
      client = null;
    }
  }


  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined');
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  await client.connect();
  return client;
}

type GameSession = {
  id: string;
  startTime: number;
  cards: string[];
  flippedCards: number[];
  matchedPairs: number;
  moves: number;
  completed: boolean;
  lastMoveTimestamp: number;
};

const gameSessions: { [key: string]: GameSession } = {};

export async function GET() {
  try {
    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const leaderboard = database.collection("leaderboard");
    
    const entries = await leaderboard.find().sort({ time: 1 }).limit(10).toArray();
    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, sessionId } = body;

  switch (action) {
    case 'initializeGame':
      return initializeGame(body);
    case 'recordMove':
      return recordMove(body);
    case 'completeGame':
      return completeGame(body);
    case 'submitScore':
      return submitScore(body);
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
}

async function initializeGame(body: any) {
  const { emojis } = body;
  const sessionId = uuidv4();
  const shuffledEmojis = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
  
  gameSessions[sessionId] = {
    id: sessionId,
    startTime: Date.now(),
    cards: shuffledEmojis,
    flippedCards: [],
    matchedPairs: 0,
    moves: 0,
    completed: false,
    lastMoveTimestamp: Date.now(),
  };

  return NextResponse.json({ sessionId, cards: shuffledEmojis });
}

async function recordMove(body: any) {
  const { sessionId, cardId } = body;
  const session = gameSessions[sessionId];

  if (!session) {
    return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
  }

  const currentTime = Date.now();
  if (currentTime - session.lastMoveTimestamp < 500) {
    return NextResponse.json({ error: 'Moving too fast', timeToWait: 500 - (currentTime - session.lastMoveTimestamp) }, { status: 429 });
  }
  session.lastMoveTimestamp = currentTime;

  if (session.flippedCards.includes(cardId)) {
    return NextResponse.json({ error: 'Card already flipped' }, { status: 400 });
  }

  session.flippedCards.push(cardId);
  session.moves++;

  let matchMade = false;
  if (session.flippedCards.length === 2) {
    const [firstCardId, secondCardId] = session.flippedCards;
    if (session.cards[firstCardId] === session.cards[secondCardId]) {
      session.matchedPairs++;
      matchMade = true;
    }
    session.flippedCards = []; // Reset flipped cards after each pair
  }

  const revealedCards = session.cards.map((emoji, index) => {
    if (index === cardId || (matchMade && (index === session.flippedCards[0] || index === session.flippedCards[1]))) {
      return emoji;
    }
    return null;
  });

  return NextResponse.json({
    moves: session.moves,
    matchedPairs: session.matchedPairs,
    flippedCards: session.flippedCards,
    completed: session.completed,
    revealedCards: revealedCards,
    matchMade: matchMade,
  });
}

async function completeGame(body: any) {
  const { sessionId, endTime } = body;
  const session = gameSessions[sessionId];

  if (!session) {
    return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
  }

  if (session.completed) {
    return NextResponse.json({ error: 'Game already completed' }, { status: 400 });
  }

  session.completed = true;
  const gameTime = endTime - session.startTime;

  if (gameTime < 5000) {
    return NextResponse.json({ error: 'Suspicious game time' }, { status: 400 });
  }

  return NextResponse.json({ success: true, moves: session.moves, time: gameTime });
}

async function submitScore(body: any) {
  const { sessionId, name, country } = body;
  const session = gameSessions[sessionId];

  if (!session) {
    return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
  }

  const gameTime = Date.now() - session.startTime;

  try {
    const client = await getMongoClient();
    const database = client.db("memoryGame");
    const leaderboard = database.collection("leaderboard");
    
    const entry: LeaderboardEntry = {
      name,
      time: gameTime,
      moves: session.moves,
      country: country || '🌎',
      date: new Date().toISOString(),
    };
    
    await leaderboard.insertOne(entry);
    delete gameSessions[sessionId]; // Clean up the session

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

