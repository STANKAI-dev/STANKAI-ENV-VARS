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

function generateSportsOdds() {
  const now = Date.now()
  const t = now / 20000 // slow transitions
  const slot = Math.floor(now / 8000) // discrete slot for game changes

  const nbaTeams = ['Lakers', 'Celtics', 'Warriors', 'Bucks', 'Nuggets', 'Heat', 'Suns', '76ers', 'Mavericks', 'Knicks', 'Timberwolves', 'Thunder']
  const nflTeams = ['Chiefs', 'Eagles', '49ers', 'Cowboys', 'Bills', 'Ravens', 'Lions', 'Dolphins', 'Bengals', 'Packers']
  const mlbTeams = ['Yankees', 'Dodgers', 'Braves', 'Astros', 'Rangers', 'Orioles', 'Rays', 'Phillies', 'Twins', 'Mariners']
  const soccerTeams = ['Man City', 'Arsenal', 'Liverpool', 'Real Madrid', 'Barcelona', 'Bayern', 'PSG', 'Inter Milan', 'Dortmund', 'Juventus']

  const pickIdx = (len: number, seed: number): number => Math.floor(seededRandom(seed) * len)
  const pickTwo = (teams: string[], seed: number): [string, string] => {
    const a = pickIdx(teams.length, seed)
    let b = pickIdx(teams.length, seed + 0.5)
    if (b === a) b = (b + 1) % teams.length
    return [teams[a], teams[b]]
  }

  function makeGame(teams: string[], sport: string, gameSeed: number) {
    const [home, away] = pickTwo(teams, gameSeed)
    const isLive = seededRandom(gameSeed + 0.1) < 0.4

    const spreadNoise = smoothNoise(t * 0.3, gameSeed * 100)
    const homeSpread = Number(((spreadNoise - 0.5) * 14).toFixed(1))

    const total = sport === 'NBA' ? Number((210 + smoothNoise(t * 0.2, gameSeed * 110) * 30).toFixed(1)) :
                  sport === 'NFL' ? Number((42 + smoothNoise(t * 0.2, gameSeed * 120) * 12).toFixed(1)) :
                  sport === 'MLB' ? Number((7.5 + smoothNoise(t * 0.2, gameSeed * 130) * 3).toFixed(1)) :
                  Number((2.2 + smoothNoise(t * 0.2, gameSeed * 140) * 1.5).toFixed(1))

    const mlNoise = smoothNoise(t * 0.25, gameSeed * 150)
    const homeML = Math.floor((mlNoise - 0.5) * 400)
    const awayML = homeML > 0 ? -Math.floor(seededRandom(gameSeed * 160) * 200 + 120) : Math.floor(seededRandom(gameSeed * 170) * 200 + 120)

    const aiPick = seededRandom(slot + gameSeed * 77) > 0.5 ? home : away
    const confNoise = smoothNoise(t * 0.3, gameSeed * 180)
    const aiConfidence = Math.floor(confNoise * 25 + 65)
    const aiEdge = Number((smoothNoise(t * 0.3, gameSeed * 190) * 8 + 1).toFixed(1))

    // Scores for live games increment slowly
    const scoreBase = sport === 'NBA' ? 90 : sport === 'NFL' ? 20 : sport === 'MLB' ? 5 : 2
    const homeScoreNoise = smoothNoise(t * 0.1, gameSeed * 200)
    const awayScoreNoise = smoothNoise(t * 0.1, gameSeed * 210)

    const hourSlot = Math.floor(seededRandom(gameSeed * 300) * 12) + 1
    const minSlot = Math.floor(seededRandom(gameSeed * 310) * 6) * 10
    const ampm = seededRandom(gameSeed * 320) > 0.5 ? 'PM' : 'AM'

    return {
      sport,
      home,
      away,
      isLive,
      homeScore: isLive ? Math.floor(homeScoreNoise * scoreBase) : null,
      awayScore: isLive ? Math.floor(awayScoreNoise * scoreBase) : null,
      quarter: isLive ? (sport === 'Soccer' ? `${Math.floor(smoothNoise(t * 0.05, gameSeed * 220) * 90) + 1}'` : `Q${Math.floor(seededRandom(slot + gameSeed) * 4) + 1}`) : null,
      startTime: isLive ? 'LIVE' : `${hourSlot}:${String(minSlot).padStart(2, '0')} ${ampm} ET`,
      odds: {
        spread: { home: homeSpread, away: Number((-homeSpread).toFixed(1)), homeJuice: -110, awayJuice: -110 },
        total: { value: total, overJuice: -110, underJuice: -110 },
        moneyline: { home: homeML, away: awayML },
      },
      ai: {
        pick: aiPick,
        confidence: aiConfidence,
        edge: aiEdge,
        reasoning: aiConfidence > 80 ? 'Strong statistical edge detected' :
                   aiConfidence > 70 ? 'Moderate advantage identified' : 'Slight lean based on trends',
        model: 'StankAI-Sports-v3',
      },
    }
  }

  // Stable game lineup based on slot
  const games = [
    ...Array.from({ length: 4 }, (_, i) => makeGame(nbaTeams, 'NBA', slot * 0.01 + i + 1)),
    ...Array.from({ length: 3 }, (_, i) => makeGame(nflTeams, 'NFL', slot * 0.01 + i + 10)),
    ...Array.from({ length: 3 }, (_, i) => makeGame(mlbTeams, 'MLB', slot * 0.01 + i + 20)),
    ...Array.from({ length: 2 }, (_, i) => makeGame(soccerTeams, 'Soccer', slot * 0.01 + i + 30)),
  ]

  // Performance stats - smooth
  const todayW = Math.floor(smoothNoise(t * 0.05, 2000) * 5) + 3
  const todayL = Math.floor(smoothNoise(t * 0.05, 2100) * 3) + 1
  const weekW = Math.floor(smoothNoise(t * 0.02, 2200) * 15) + 20
  const weekL = Math.floor(smoothNoise(t * 0.02, 2300) * 10) + 8
  const seasonW = Math.floor(smoothNoise(t * 0.01, 2400) * 50) + 180
  const seasonL = Math.floor(smoothNoise(t * 0.01, 2500) * 30) + 100

  const roiNoise = smoothNoise(t * 0.1, 2600)
  const unitsNoise = smoothNoise(t * 0.1, 2700)
  const streakSeed = seededRandom(slot + 2800)

  const sports = ['NBA', 'NFL', 'MLB', 'Soccer']

  const performance = {
    todayRecord: `${todayW}-${todayL}`,
    weekRecord: `${weekW}-${weekL}`,
    seasonRecord: `${seasonW}-${seasonL}`,
    roi: Number((5 + roiNoise * 12).toFixed(1)),
    units: Number((15 + unitsNoise * 40).toFixed(1)),
    streak: streakSeed > 0.5 ? `W${Math.floor(seededRandom(slot + 2900) * 5) + 1}` : `L${Math.floor(seededRandom(slot + 3000) * 3) + 1}`,
    bestSport: sports[Math.floor(seededRandom(slot + 3100) * sports.length)],
  }

  return {
    timestamp: new Date().toISOString(),
    games,
    performance,
    trending: games.filter(g => g.ai.confidence > 75).slice(0, 3).map(g => ({
      matchup: `${g.away} @ ${g.home}`,
      pick: g.ai.pick,
      confidence: g.ai.confidence,
    })),
  }
}

export default async (req: Request) => {
  return Response.json(generateSportsOdds(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}

export const config: Config = {
  path: '/api/sports-odds',
}
