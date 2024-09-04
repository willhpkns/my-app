import { NextResponse } from 'next/server';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { LeaderboardEntry } from '@/components/types';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

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
    console.log('Attempting to connect to MongoDB...');
    await client.connect();
    console.log('Successfully connected to MongoDB');
    const entry: LeaderboardEntry = await request.json();
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

