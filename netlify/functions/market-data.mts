import type { Config } from '@netlify/functions'

// Deterministic pseudo-random based on seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Smooth noise function that changes gradually over time
function smoothNoise(t: number, seed: number): number {
  const i = Math.floor(t)
  const f = t - i
  const a = seededRandom(i + seed * 1000)
  const b = seededRandom(i + 1 + seed * 1000)
  // Smooth interpolation
  const blend = f * f * (3 - 2 * f)
  return a + (b - a) * blend
}

function generateMarketData() {
  // Use time in 10-second intervals for smooth transitions
  const now = Date.now()
  const t = now / 10000 // changes slowly
  const hour = new Date().getUTCHours()
  const marketOpen = hour >= 13 && hour <= 20

  const cryptos = [
    { symbol: 'BTC', name: 'Bitcoin', base: 67850, volatility: 0.025 },
    { symbol: 'ETH', name: 'Ethereum', base: 3420, volatility: 0.03 },
    { symbol: 'SOL', name: 'Solana', base: 178.5, volatility: 0.04 },
    { symbol: 'XRP', name: 'Ripple', base: 0.628, volatility: 0.035 },
    { symbol: 'ADA', name: 'Cardano', base: 0.485, volatility: 0.038 },
    { symbol: 'DOGE', name: 'Dogecoin', base: 0.162, volatility: 0.05 },
  ]

  const stocks = [
    { symbol: 'AAPL', name: 'Apple', base: 198.5, volatility: 0.012 },
    { symbol: 'NVDA', name: 'NVIDIA', base: 875.3, volatility: 0.02 },
    { symbol: 'TSLA', name: 'Tesla', base: 245.8, volatility: 0.025 },
    { symbol: 'MSFT', name: 'Microsoft', base: 425.6, volatility: 0.01 },
    { symbol: 'AMZN', name: 'Amazon', base: 186.2, volatility: 0.015 },
    { symbol: 'META', name: 'Meta', base: 512.4, volatility: 0.018 },
  ]

  const forex = [
    { symbol: 'EUR/USD', name: 'Euro/Dollar', base: 1.0845, volatility: 0.003 },
    { symbol: 'GBP/USD', name: 'Pound/Dollar', base: 1.2650, volatility: 0.004 },
    { symbol: 'USD/JPY', name: 'Dollar/Yen', base: 154.85, volatility: 0.005 },
  ]

  function fluctuate(base: number, volatility: number, seed: number) {
    // Layered noise at different frequencies for realistic movement
    const noise1 = (smoothNoise(t * 0.3, seed) - 0.5) * 2 * volatility
    const noise2 = (smoothNoise(t * 0.8, seed + 50) - 0.5) * volatility * 0.5
    const trend = Math.sin(t * 0.1 + seed) * volatility * 0.3
    const jitter = (seededRandom(Math.floor(now / 3000) + seed * 100) - 0.5) * volatility * 0.15

    const price = base * (1 + noise1 + noise2 + trend + jitter)
    const change = ((price - base) / base) * 100
    const volumeSeed = seededRandom(Math.floor(now / 5000) + seed * 200)
    const volume = Math.floor(volumeSeed * 50000000) + 1000000

    const decimals = base > 100 ? 2 : base > 1 ? 4 : 6
    return {
      price: Number(price.toFixed(decimals)),
      change: Number(change.toFixed(2)),
      volume,
      high24h: Number((base * (1 + volatility * 0.8)).toFixed(decimals)),
      low24h: Number((base * (1 - volatility * 0.6)).toFixed(decimals)),
    }
  }

  // Index values also use smooth noise
  const spNoise = smoothNoise(t * 0.4, 100)
  const nqNoise = smoothNoise(t * 0.4, 200)
  const dwNoise = smoothNoise(t * 0.4, 300)

  return {
    timestamp: new Date().toISOString(),
    marketOpen,
    crypto: cryptos.map((c, i) => ({ ...c, ...fluctuate(c.base, c.volatility, i + 1) })),
    stocks: stocks.map((s, i) => ({ ...s, ...fluctuate(s.base, s.volatility, i + 10) })),
    forex: forex.map((f, i) => ({ ...f, ...fluctuate(f.base, f.volatility, i + 20) })),
    indices: {
      sp500: {
        value: Number((5280 + (spNoise - 0.5) * 60).toFixed(2)),
        change: Number(((spNoise - 0.5) * 1.5).toFixed(2)),
      },
      nasdaq: {
        value: Number((16720 + (nqNoise - 0.5) * 200).toFixed(2)),
        change: Number(((nqNoise - 0.5) * 2).toFixed(2)),
      },
      dow: {
        value: Number((39450 + (dwNoise - 0.5) * 300).toFixed(2)),
        change: Number(((dwNoise - 0.5) * 1.2).toFixed(2)),
      },
    },
  }
}

export default async (req: Request) => {
  return Response.json(generateMarketData(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}

export const config: Config = {
  path: '/api/market-data',
}
