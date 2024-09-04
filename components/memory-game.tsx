"use client"

import axios from 'axios';
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import Confetti from 'react-confetti'
import { CardType, LeaderboardEntry } from '@/types'

const emojis = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼"]

export default function MemoryGame() {
  const [cards, setCards] = useState<CardType[]>([])
  const [flippedCards, setFlippedCards] = useState<number[]>([])
  const [matchedPairs, setMatchedPairs] = useState(0)
  const [moves, setMoves] = useState(0)
  const [isGameComplete, setIsGameComplete] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })
  const [titleClickCount, setTitleClickCount] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [endTime, setEndTime] = useState<number | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isEasterEggActivated, setIsEasterEggActivated] = useState(false)
  const [userCountry, setUserCountry] = useState('🌎');

  useEffect(() => {
    initializeGame()
    updateWindowSize()
    loadLeaderboard()
    getUserCountry();
    window.addEventListener('resize', updateWindowSize)
    return () => window.removeEventListener('resize', updateWindowSize)
  }, [])

  const updateWindowSize = () => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight })
  }

  const getUserCountry = async () => {
    try {
      const response = await axios.get('https://ipapi.co/json/');
      setUserCountry(response.data.country_code);
    } catch (error) {
      console.error('Error fetching user country:', error);
    }
  };

  const initializeGame = () => {
    const shuffledEmojis = [...emojis, ...emojis].sort(() => Math.random() - 0.5)
    const newCards = shuffledEmojis.map((emoji, index) => ({
      id: index,
      emoji,
      isFlipped: false,
      isMatched: false,
    }))
    setCards(newCards)
    setFlippedCards([])
    setMatchedPairs(0)
    setMoves(0)
    setIsGameComplete(false)
    setStartTime(Date.now())
    setEndTime(null)
  }

  const handleCardClick = (id: number) => {
    if (flippedCards.length === 2 || cards[id].isMatched || flippedCards.includes(id)) return

    if (startTime === null) {
      setStartTime(Date.now())
    }

    const newCards = [...cards]
    newCards[id].isFlipped = true
    setCards(newCards)

    setFlippedCards([...flippedCards, id])

    if (flippedCards.length === 1) {
      setMoves(moves + 1)
      checkForMatch([flippedCards[0], id])
    }
  }

  const checkForMatch = (cardIds: number[]) => {
    setTimeout(() => {
      const [firstCardId, secondCardId] = cardIds
      const newCards = [...cards]

      if (cards[firstCardId].emoji === cards[secondCardId].emoji) {
        newCards[firstCardId].isMatched = true
        newCards[secondCardId].isMatched = true
        const newMatchedPairs = matchedPairs + 1
        setMatchedPairs(newMatchedPairs)
        if (newMatchedPairs === emojis.length) {
          setIsGameComplete(true)
          setEndTime(Date.now())
        }
      } else {
        newCards[firstCardId].isFlipped = false
        newCards[secondCardId].isFlipped = false
      }

      setCards(newCards)
      setFlippedCards([])
    }, 1000)
  }

  const formatTime = (milliseconds: number) => {
    if (milliseconds < 0) return "Cheater!";
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  const handleTitleClick = useCallback(() => {
    const newCount = titleClickCount + 1
    setTitleClickCount(newCount)
    if (newCount === 5) {
      // Trigger the easter egg
      const allMatchedCards = cards.map(card => ({...card, isFlipped: true, isMatched: true}))
      setCards(allMatchedCards)
      setMatchedPairs(emojis.length)
      setIsGameComplete(true)
      setEndTime(Date.now())
      setIsEasterEggActivated(true)  // Set this flag when easter egg is activated
      setTitleClickCount(0)
    }
  }, [titleClickCount, cards])

  const resetGame = () => {
    initializeGame()
    setTitleClickCount(0)
    setShowLeaderboard(false)
    setHasSubmitted(false)
    setIsEasterEggActivated(false)  // Reset the easter egg flag
  }

  const loadLeaderboard = () => {
    const storedLeaderboard = localStorage.getItem('memoryGameLeaderboard')
    if (storedLeaderboard) {
      setLeaderboard(JSON.parse(storedLeaderboard))
    }
  }

  const saveLeaderboard = (newLeaderboard: LeaderboardEntry[]) => {
    localStorage.setItem('memoryGameLeaderboard', JSON.stringify(newLeaderboard))
    setLeaderboard(newLeaderboard)
  }

  const submitToLeaderboard = () => {
    if (hasSubmitted) {
      alert("You've already submitted your score for this game!")
      return
    }

    if (isEasterEggActivated) {
      alert("Nice try, cheater! Your score won't be submitted to the leaderboard.")
      return
    }

    const name = prompt("Enter your name for the leaderboard:")
    if (name) {
      const newEntry: LeaderboardEntry = {
        name,
        time: endTime! - startTime!,
        moves,
        country: userCountry, // Use the fetched country code
        date: new Date().toISOString(),
      }
      const newLeaderboard = [...leaderboard, newEntry].sort((a, b) => a.time - b.time).slice(0, 10)
      saveLeaderboard(newLeaderboard)
      setShowLeaderboard(true)
      setHasSubmitted(true)
    }
  }
  

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4 relative">
      {isGameComplete && (
        <>
          <Confetti
            width={windowSize.width}
            height={windowSize.height}
            numberOfPieces={300}
            gravity={0.01}
            initialVelocityX={20}
            initialVelocityY={10}
            confettiSource={{
              x: windowSize.width,
              y: windowSize.height,
              w: 0,
              h: 0
            }}
            wind={-0.05}
          />
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white text-black p-8 rounded-lg shadow-lg text-center">
              <h2 className="text-3xl font-bold mb-4">
                {isEasterEggActivated ? "Stop cheating!" : "Congratulations!"}
              </h2>
              <p className="text-xl mb-2">You've completed the game in {moves} moves!</p>
              <p className="text-xl mb-6">Time: {formatTime(endTime! - startTime!)}</p>
              <div className="flex justify-center space-x-4">
                {!hasSubmitted && !isEasterEggActivated && (
                  <Button 
                    onClick={submitToLeaderboard}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-full text-lg transition-all duration-200 hover:scale-105 hover:shadow-lg"
                  >
                    Submit to Leaderboard
                  </Button>
                )}
                <Button 
                  onClick={resetGame}
                  className="bg-black hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-full text-lg transition-all duration-200 hover:scale-105 hover:shadow-lg"
                >
                  Play Again
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      <h1 className="text-3xl font-bold mb-4">
        <span 
          className="cursor-pointer" 
          onClick={handleTitleClick}
        >
          Memory
        </span> Game
      </h1>
      <div className="mb-4">
        <span className="mr-4">Moves: {moves}</span>
        <span>Matched Pairs: {matchedPairs}/{emojis.length}</span>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-4">
        {cards.map((card) => (
          <div
            key={card.id}
            className={`w-20 h-20 cursor-pointer perspective-1000 transition-all duration-200 hover:scale-105 hover:shadow-lg ${
              card.isFlipped || card.isMatched ? "flipped" : ""
            }`}
            onClick={() => handleCardClick(card.id)}
          >
            <div className="relative w-full h-full transition-transform duration-500 transform-style-3d">
              <div className="absolute w-full h-full flex items-center justify-center text-3xl bg-secondary backface-hidden">
                ?
              </div>
              <div className="absolute w-full h-full flex items-center justify-center text-3xl bg-primary text-primary-foreground backface-hidden transform-rotateY-180">
                {card.emoji}
              </div>
            </div>
          </div>
        ))}
      </div>
      <Button onClick={() => setShowLeaderboard(!showLeaderboard)} className="mb-4">
        {showLeaderboard ? "Hide Leaderboard" : "Show Leaderboard"}
      </Button>
      {showLeaderboard && (
        <div className="w-full max-w-2xl">
          <h2 className="text-2xl font-bold mb-2">Leaderboard</h2>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Rank</th>
                <th className="text-left">Name</th>
                <th className="text-left">Time</th>
                <th className="text-left">Moves</th>
                <th className="text-left">Country</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{entry.name}</td>
                  <td>{formatTime(entry.time)}</td>
                  <td>{entry.moves}</td>
                  <td>{entry.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="absolute bottom-4 left-4 flex space-x-2">
        <a
          href="https://github.com/willhpkns"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 bg-gray-800 text-white rounded-full transition-all duration-300 hover:bg-gray-600 hover:scale-110 hover:shadow-lg"
          aria-label="GitHub Profile"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
        <a
          href="https://instagram.com/willhpkns"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 bg-gray-800 text-white rounded-full transition-all duration-300 hover:bg-gray-600 hover:scale-110 hover:shadow-lg"
          aria-label="Instagram Profile"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
        </a>
      </div>

      <style jsx>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .transform-rotateY-180 {
          transform: rotateY(180deg);
        }
        .flipped .relative {
          transform: rotateY(180deg);
        }
      `}</style>
    </div>
  )
}