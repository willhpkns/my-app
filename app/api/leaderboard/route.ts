import { NextResponse } from 'next/server';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { LeaderboardEntry } from '@/components/types';
import { v4 as uuidv4 } from 'uuid';

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

const gameSessions: { [key: string]: GameSession } = {};

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
  const { emojis } = body;
  const sessionId = uuidv4();
  const shuffledEmojis = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
  
  gameSessions[sessionId] = {
    id: sessionId,
    startTime: Date.now(),
    cards: shuffledEmojis,
    moves: 0,
    completed: false,
  };

  return NextResponse.json({ sessionId, cards: shuffledEmojis });
}

async function completeGame(body: any) {
  const { sessionId, endTime, moves } = body;
  if (!sessionId || !endTime || moves === undefined) {
    console.error('Invalid request body:', body);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  console.log('Received completeGame request:', { sessionId, endTime, moves });

  const session = gameSessions[sessionId];

  if (!session) {
    console.error('Invalid session:', sessionId);
    return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
  }

  if (session.completed) {
    console.log('Game already completed:', sessionId);
    // Use a fallback value if session.endTime is undefined
    const gameTime = session.endTime ? session.endTime - session.startTime : 0;
    return NextResponse.json({ success: true, moves: session.moves, time: gameTime });
  }

  const gameTime = endTime - session.startTime;

  if (gameTime < 5000) {
    console.error('Suspicious game time:', gameTime);
    return NextResponse.json({ error: 'Suspicious game time' }, { status: 400 });
  }

  session.completed = true;
  session.moves = moves;
  session.endTime = endTime;

  console.log('Game completed successfully:', { sessionId, moves, gameTime });
  return NextResponse.json({ success: true, moves: session.moves, time: gameTime });
}

async function submitScore(body: any) {
  const { sessionId, name, country } = body;
  const session = gameSessions[sessionId];

  if (!session) {
    return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
  }

  if (!session.endTime) {
    return NextResponse.json({ error: 'Game not completed' }, { status: 400 });
  }

  const gameTime = session.endTime - session.startTime;

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
      sessionId,
      endTime: session.endTime, // This line is now safe because we've checked for undefined
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

