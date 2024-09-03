"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import Confetti from 'react-confetti'

type CardType = {
  id: number
  emoji: string
  isFlipped: boolean
  isMatched: boolean
}

const emojis = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼"]

export default function MemoryGame() {
  const [cards, setCards] = useState<CardType[]>([])
  const [flippedCards, setFlippedCards] = useState<number[]>([])
  const [matchedPairs, setMatchedPairs] = useState(0)
  const [moves, setMoves] = useState(0)
  const [isGameComplete, setIsGameComplete] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })
  const [titleClickCount, setTitleClickCount] = useState(0)

  useEffect(() => {
    initializeGame()
    updateWindowSize()
    window.addEventListener('resize', updateWindowSize)
    return () => window.removeEventListener('resize', updateWindowSize)
  }, [])

  const updateWindowSize = () => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight })
  }

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
  }

  const handleCardClick = (id: number) => {
    if (flippedCards.length === 2 || cards[id].isMatched || flippedCards.includes(id)) return

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
        }
      } else {
        newCards[firstCardId].isFlipped = false
        newCards[secondCardId].isFlipped = false
      }

      setCards(newCards)
      setFlippedCards([])
    }, 1000)
  }

  const handleTitleClick = useCallback(() => {
    const newCount = titleClickCount + 1
    setTitleClickCount(newCount)
    console.log(`Title clicked ${newCount} times`) // Debug log
    if (newCount === 5) {
      // Trigger the easter egg
      const allMatchedCards = cards.map(card => ({...card, isFlipped: true, isMatched: true}))
      setCards(allMatchedCards)
      setMatchedPairs(emojis.length)
      setIsGameComplete(true)
      // Reset the click count
      setTitleClickCount(0)
    }
  }, [titleClickCount, cards])

  // Remove this useEffect hook that was resetting the titleClickCount
  // useEffect(() => {
  //   setTitleClickCount(0)
  // }, [initializeGame])

  // Instead, reset titleClickCount when the game is reset
  const resetGame = () => {
    initializeGame()
    setTitleClickCount(0)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      {isGameComplete && (
        <>
          <Confetti
            width={windowSize.width}
            height={windowSize.height}
            numberOfPieces={1000}
            gravity={0.1}
            initialVelocityX={6}
            initialVelocityY={10}
            confettiSource={{
              x: 0,
              y: windowSize.height,
              w: 0,
              h: 0
            }}
            wind={0.100}
          />
          <Confetti
            width={windowSize.width}
            height={windowSize.height}
            numberOfPieces={1000}
            gravity={0.1}
            initialVelocityX={10}
            initialVelocityY={50}
            confettiSource={{
              x: windowSize.width,
              y: windowSize.height,
              w: 0,
              h: 0
            }}
            wind={-0.05}
          />
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
      <p className="mb-4">Title click count: {titleClickCount}</p>
      <div className="mb-4">
        <span className="mr-4">Moves: {moves}</span>
        <span>Matched Pairs: {matchedPairs}/{emojis.length}</span>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-4">
        {cards.map((card) => (
          <div
            key={card.id}
            className={`w-20 h-20 cursor-pointer perspective-1000 ${
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
      <Button onClick={resetGame}>Reset Game</Button>

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