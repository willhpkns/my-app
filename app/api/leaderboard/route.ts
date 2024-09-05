import { NextResponse } from 'next/server';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { LeaderboardEntry } from '@/components/types';
import { v4 as uuidv4 } from 'uuid';

const uri = process.env.MONGODB_URI as string
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

type GameSession = {
  id: string;
  startTime: number;
  cards: string[];
  moves: number;
  matchedPairs: number;
  completed: boolean;
};

const gameSessions: { [key: string]: GameSession } = {};

export async function GET() {
    try {
      console.log('Attempting to connect to MongoDB...');
      await client.connect();
      console.log('Successfully connected to MongoDB');
      const database = client.db("memoryGame");
      const leaderboard = database.collection("leaderboard");
      
      const entries = await leaderboard.find().sort({ time: 1 }).limit(10).toArray();
      console.log('Successfully fetched leaderboard entries');
      return NextResponse.json(entries);
    } catch (error) {
      console.error('Error connecting to MongoDB or fetching leaderboard:', error);
      return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
    } finally {
      await client.close();
      console.log('Closed MongoDB connection');
    }
  }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

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
        return submitLeaderboardEntry(body);
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

async function initializeGame(body: any) {
  const { emojis } = body;
  const sessionId = uuidv4();
  
  gameSessions[sessionId] = {
    id: sessionId,
    startTime: Date.now(),
    cards: [...emojis, ...emojis].sort(() => Math.random() - 0.5),
    moves: 0,
    matchedPairs: 0,
    completed: false,
  };

  return NextResponse.json({ sessionId });
}

async function recordMove(body: any) {
  const { sessionId, cardId, moves } = body;
  const session = gameSessions[sessionId];

  if (!session) {
    return NextResponse.json({ error: 'Game session not found' }, { status: 404 });
  }

  session.moves = moves;
  // You can add more validation here if needed

  return NextResponse.json({ success: true });
}

async function completeGame(body: any) {
  const { sessionId, endTime } = body;
  const session = gameSessions[sessionId];

  if (!session) {
    return NextResponse.json({ error: 'Game session not found' }, { status: 404 });
  }

  session.completed = true;
  // Calculate and store the final score here

  return NextResponse.json({ success: true });
}

async function submitScore(body: any) {
  const { sessionId, name } = body;
  const session = gameSessions[sessionId];

  if (!session || !session.completed) {
    return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
  }

  try {
    console.log('Attempting to connect to MongoDB...');
    await client.connect();
    console.log('Successfully connected to MongoDB');
    const database = client.db("memoryGame");
    const leaderboard = database.collection("leaderboard");
    
    const entry: LeaderboardEntry = {
      name,
      time: Date.now() - session.startTime,
      moves: session.moves,
      country: body.country || '🌎',
      date: new Date().toISOString(),
    };
    
    await leaderboard.insertOne(entry);
    console.log('Successfully inserted new leaderboard entry');

    // Clean up the session
    delete gameSessions[sessionId];

    return NextResponse.json({ message: 'Score submitted successfully' }, { status: 201 });
  } catch (error) {
    console.error('Error connecting to MongoDB or inserting entry:', error);
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  } finally {
    await client.close();
    console.log('Closed MongoDB connection');
  }
}

async function submitLeaderboardEntry(entry: LeaderboardEntry) {
  try {
    console.log('Attempting to connect to MongoDB...');
    await client.connect();
    console.log('Successfully connected to MongoDB');
    const database = client.db("memoryGame");
    const leaderboard = database.collection("leaderboard");
    
    await leaderboard.insertOne(entry);
    console.log('Successfully inserted new leaderboard entry');
    return NextResponse.json({ message: 'Score submitted successfully' }, { status: 201 });
  } catch (error) {
    console.error('Error connecting to MongoDB or inserting entry:', error);
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  } finally {
    await client.close();
    console.log('Closed MongoDB connection');
  }
}

