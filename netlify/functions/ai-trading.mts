import type { Config } from '@netlify/functions'

// Deterministic pseudo-random
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function smoothNoise(t: number, seed: number): number {
  const i = Math.floor(t)
  const f = t - i
  const a = seededRandom(i + seed * 1000)
  const b = seededRandom(i + 1 + seed * 1000)
  const blend = f * f * (3 - 2 * f)
  return a + (b - a) * blend
}

function generateTradingSignals() {
  const now = Date.now()
  const t = now / 15000 // updates every ~15 seconds smoothly
  const signalSlot = Math.floor(now / 5000) // discrete slot for signal changes

  const strategies = ['Momentum', 'Mean Reversion', 'Breakout', 'Scalping', 'Swing', 'VWAP'] as const
  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1D'] as const

  const assets = [
    { symbol: 'BTC/USD', type: 'crypto', base: 67850 },
    { symbol: 'ETH/USD', type: 'crypto', base: 3420 },
    { symbol: 'NVDA', type: 'stock', base: 875 },
    { symbol: 'TSLA', type: 'stock', base: 245 },
    { symbol: 'AAPL', type: 'stock', base: 198 },
    { symbol: 'SOL/USD', type: 'crypto', base: 178 },
    { symbol: 'EUR/USD', type: 'forex', base: 1.08 },
    { symbol: 'AMZN', type: 'stock', base: 186 },
  ]

  function pick<T>(arr: readonly T[], seed: number): T { return arr[Math.floor(seededRandom(seed) * arr.length)] }

  const activeSignals = assets.map((asset, i) => {
    const seed = i + 1
    const conf = smoothNoise(t * 0.5, seed * 10)
    const confidence = Math.floor(conf * 30 + 70)

    const signalSeed = seededRandom(signalSlot + seed * 77)
    const signal = confidence > 90 ? (signalSeed > 0.5 ? 'STRONG BUY' : 'STRONG SELL') :
                   confidence > 80 ? (signalSeed > 0.5 ? 'BUY' : 'SELL') : 'HOLD'

    const priceNoise = smoothNoise(t * 0.3, seed * 20)
    const entry = Number((asset.base * (0.98 + priceNoise * 0.04)).toFixed(2))
    const isLong = signal.includes('BUY')
    const tp = Number((entry * (isLong ? 1.02 + seededRandom(seed * 33) * 0.03 : 0.95 + seededRandom(seed * 44) * 0.03)).toFixed(2))
    const sl = Number((entry * (isLong ? 0.97 + seededRandom(seed * 55) * 0.02 : 1.01 + seededRandom(seed * 66) * 0.02)).toFixed(2))
    const rr = Number(Math.abs((tp - entry) / (sl - entry)).toFixed(2))

    return {
      symbol: asset.symbol,
      type: asset.type,
      signal,
      confidence,
      strategy: pick(strategies, signalSlot + seed * 5),
      timeframe: pick(timeframes, signalSlot + seed * 7),
      entry,
      takeProfit: tp,
      stopLoss: sl,
      riskReward: isNaN(rr) || !isFinite(rr) ? 2.0 : rr,
      aiScore: Math.floor(smoothNoise(t * 0.4, seed * 30) * 20 + 80),
    }
  })

  // Day trading - short timeframe positions
  const dayTrades = assets.slice(0, 5).map((asset, i) => {
    const seed = i + 30
    const dirSeed = seededRandom(Math.floor(t * 0.2) + seed * 11)
    const direction = dirSeed > 0.5 ? 'LONG' : 'SHORT'

    const entryNoise = smoothNoise(t * 0.2, seed * 40)
    const entry = Number((asset.base * (0.95 + entryNoise * 0.1)).toFixed(2))
    const currentNoise = smoothNoise(t * 0.6, seed * 50)
    const current = Number((entry * (0.985 + currentNoise * 0.03)).toFixed(2))
    const pnl = Number(((current - entry) / entry * 100 * (direction === 'LONG' ? 1 : -1)).toFixed(2))

    const durationMin = Math.floor(smoothNoise(t * 0.1, seed * 60) * 120)
    const statusSeed = seededRandom(Math.floor(t * 0.3) + seed * 88)

    return {
      symbol: asset.symbol,
      type: asset.type,
      direction,
      entry,
      current,
      pnl,
      strategy: pick(strategies, Math.floor(t) + seed * 5),
      timeframe: pick(['1m', '5m', '15m'] as const, Math.floor(t) + seed * 3),
      status: statusSeed > 0.3 ? 'ACTIVE' : 'PENDING',
      duration: `${durationMin}m`,
      volume: Math.floor(seededRandom(signalSlot + seed * 99) * 10000) + 100,
    }
  })

  // Portfolio - smooth values
  const portfolioNoise = smoothNoise(t * 0.2, 500)
  const pnlNoise = smoothNoise(t * 0.5, 600)
  const dayPnl = Number(((pnlNoise - 0.4) * 3000).toFixed(2))

  const portfolio = {
    totalValue: Number((125000 + (portfolioNoise - 0.5) * 5000).toFixed(2)),
    dayPnl,
    dayPnlPercent: Number((dayPnl / 1250).toFixed(2)),
    weekPnl: Number(((smoothNoise(t * 0.05, 700) - 0.3) * 8000).toFixed(2)),
    winRate: Number((65 + smoothNoise(t * 0.1, 800) * 20).toFixed(1)),
    totalTrades: Math.floor(smoothNoise(t * 0.05, 900) * 50) + 150,
    activeTrades: Math.floor(smoothNoise(t * 0.3, 950) * 8) + 2,
    aiAccuracy: Number((78 + smoothNoise(t * 0.1, 1000) * 15).toFixed(1)),
  }

  // Sentiment
  const fgNoise = smoothNoise(t * 0.15, 1100)
  const fearGreedIndex = Math.floor(fgNoise * 40 + 40)

  return {
    timestamp: new Date().toISOString(),
    signals: activeSignals,
    dayTrades,
    portfolio,
    marketSentiment: {
      overall: fearGreedIndex > 60 ? 'BULLISH' : fearGreedIndex < 45 ? 'BEARISH' : 'NEUTRAL',
      fearGreedIndex,
      volatilityIndex: Number((15 + smoothNoise(t * 0.2, 1200) * 20).toFixed(1)),
    },
  }
}

export default async (req: Request) => {
  return Response.json(generateTradingSignals(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}

export const config: Config = {
  path: '/api/ai-trading',
}
