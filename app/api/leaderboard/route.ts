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
  flippedCards: number[];
  matchedPairs: number;
  moves: number;
  completed: boolean;
  lastMoveTimestamp: number;
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

  return NextResponse.json({ sessionId, cards: shuffledEmojis.map(() => '?') });
}

async function recordMove(body: any) {
  const { sessionId, cardId } = body;
  const session = gameSessions[sessionId];

  if (!session || session.completed) {
    return NextResponse.json({ error: 'Invalid game session' }, { status: 400 });
  }

  // Prevent rapid-fire moves
  const currentTime = Date.now();
  if (currentTime - session.lastMoveTimestamp < 500) { // 500ms cooldown
    return NextResponse.json({ error: 'Moving too fast' }, { status: 429 });
  }
  session.lastMoveTimestamp = currentTime;

  if (session.flippedCards.includes(cardId) || session.flippedCards.length >= 2) {
    return NextResponse.json({ error: 'Invalid move' }, { status: 400 });
  }

  session.flippedCards.push(cardId);
  session.moves++;

  let matchMade = false;
  let gameCompleted = false;
  if (session.flippedCards.length === 2) {
    const [firstCardId, secondCardId] = session.flippedCards;
    if (session.cards[firstCardId] === session.cards[secondCardId]) {
      session.matchedPairs++;
      matchMade = true;
    }
    session.flippedCards = [];
    gameCompleted = session.matchedPairs === session.cards.length / 2;
  }

  if (gameCompleted) {
    session.completed = true;
  }

  return NextResponse.json({
    moves: session.moves,
    matchedPairs: session.matchedPairs,
    flippedCards: session.flippedCards,
    completed: session.completed,
    revealedCards: session.cards.map((emoji, index) => 
      matchMade && (index === session.flippedCards[0] || index === session.flippedCards[1]) ? emoji : '?'
    ),
  });
}

async function completeGame(body: any) {
  const { sessionId, endTime } = body;
  const session = gameSessions[sessionId];

  if (!session || !session.completed) {
    return NextResponse.json({ error: 'Invalid game session or game not completed' }, { status: 400 });
  }

  const gameTime = endTime - session.startTime;
  if (gameTime < 5000) { // Minimum 5 seconds game time
    return NextResponse.json({ error: 'Suspicious game time' }, { status: 400 });
  }

  // Additional checks can be added here

  return NextResponse.json({ success: true, moves: session.moves, time: gameTime });
}

async function submitScore(body: any) {
  const { sessionId, name, country } = body;
  const session = gameSessions[sessionId];

  if (!session || !session.completed) {
    return NextResponse.json({ error: 'Invalid game session or game not completed' }, { status: 400 });
  }

  const gameTime = Date.now() - session.startTime;

  try {
    await client.connect();
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
  } finally {
    await client.close();
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

