import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

type LeadStage = 'new' | 'qualified' | 'proposal' | 'won' | 'lost'
type LeadPriority = 'low' | 'medium' | 'high'

type Lead = {
  id: string
  company: string
  contactName: string
  contactEmail: string
  source: string
  stage: LeadStage
  value: number
  priority: LeadPriority
  owner: string
  notes: string
  createdAt: string
  updatedAt: string
}

type Intake = {
  id: string
  leadId: string
  company: string
  contactName: string
  contactEmail: string
  serviceNeed: string
  budgetBand: string
  timeline: string
  details: string
  createdAt: string
}

type DashboardState = {
  leads: Lead[]
  intakes: Intake[]
}

const STORE = getStore({ name: 'stank-saas-dashboard', consistency: 'strong' })
const STORE_KEY = 'state-v1'

const STAGES: LeadStage[] = ['new', 'qualified', 'proposal', 'won', 'lost']
const PRIORITIES: LeadPriority[] = ['low', 'medium', 'high']

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${random}`
}

function clampText(value: unknown, max = 300): string {
  return String(value ?? '').trim().slice(0, max)
}

function parseMoney(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return Math.round(numeric)
}

function createSeedState(): DashboardState {
  const seededAt = nowIso()
  const leads: Lead[] = [
    {
      id: makeId('lead'),
      company: 'Northline Dental Group',
      contactName: 'Aria Fleming',
      contactEmail: 'aria@northline-dental.com',
      source: 'Referral',
      stage: 'proposal',
      value: 24000,
      priority: 'high',
      owner: 'Harper',
      notes: 'Requested a 3-location rollout with HIPAA-safe automation.',
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: makeId('lead'),
      company: 'Forge Peak Logistics',
      contactName: 'Mason Velez',
      contactEmail: 'mason@forgepeak.io',
      source: 'Outbound',
      stage: 'qualified',
      value: 18000,
      priority: 'medium',
      owner: 'Jordan',
      notes: 'Ops team wants lead scoring integrated into dispatch workflow.',
      createdAt: seededAt,
      updatedAt: seededAt,
    },
    {
      id: makeId('lead'),
      company: 'Ridgeview Wellness',
      contactName: 'Imani Reed',
      contactEmail: 'imani@ridgeviewwellness.co',
      source: 'Webinar',
      stage: 'won',
      value: 32000,
      priority: 'high',
      owner: 'Sky',
      notes: 'Contract sent and first onboarding sprint scheduled.',
      createdAt: seededAt,
      updatedAt: seededAt,
    },
  ]

  const intakes: Intake[] = [
    {
      id: makeId('intake'),
      leadId: leads[0].id,
      company: leads[0].company,
      contactName: leads[0].contactName,
      contactEmail: leads[0].contactEmail,
      serviceNeed: 'CRM + appointment intake automation',
      budgetBand: '$15k-$30k',
      timeline: '30 days',
      details: 'Needs live booking sync with conversion dashboards.',
      createdAt: seededAt,
    },
    {
      id: makeId('intake'),
      leadId: leads[2].id,
      company: leads[2].company,
      contactName: leads[2].contactName,
      contactEmail: leads[2].contactEmail,
      serviceNeed: 'Omnichannel patient growth stack',
      budgetBand: '$30k-$60k',
      timeline: '45 days',
      details: 'Priority: paid media lead routing and nurture automation.',
      createdAt: seededAt,
    },
  ]

  return { leads, intakes }
}

async function readState(): Promise<DashboardState> {
  const state = await STORE.get(STORE_KEY, { type: 'json' }) as DashboardState | null
  if (state && Array.isArray(state.leads) && Array.isArray(state.intakes)) {
    return state
  }

  const seeded = createSeedState()
  await STORE.setJSON(STORE_KEY, seeded)
  return seeded
}

async function writeState(nextState: DashboardState): Promise<void> {
  await STORE.setJSON(STORE_KEY, nextState)
}

function computeSummary(state: DashboardState) {
  const stageCounts = STAGES.reduce<Record<LeadStage, number>>((acc, stage) => {
    acc[stage] = state.leads.filter((lead) => lead.stage === stage).length
    return acc
  }, { new: 0, qualified: 0, proposal: 0, won: 0, lost: 0 })

  const openPipelineValue = state.leads
    .filter((lead) => lead.stage !== 'won' && lead.stage !== 'lost')
    .reduce((sum, lead) => sum + lead.value, 0)

  const wonValue = state.leads
    .filter((lead) => lead.stage === 'won')
    .reduce((sum, lead) => sum + lead.value, 0)

  const closedCount = stageCounts.won + stageCounts.lost
  const winRate = closedCount > 0 ? (stageCounts.won / closedCount) * 100 : 0

  const intakeBacklog = state.intakes.filter((intake) => {
    const lead = state.leads.find((item) => item.id === intake.leadId)
    return !lead || (lead.stage !== 'won' && lead.stage !== 'lost')
  }).length

  return {
    totalLeads: state.leads.length,
    openPipelineValue,
    wonValue,
    winRate: Number(winRate.toFixed(1)),
    intakeBacklog,
    stageCounts,
  }
}

function sortByUpdated(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function methodNotAllowed(allowed: string): Response {
  return Response.json(
    { ok: false, message: 'Method not allowed' },
    {
      status: 405,
      headers: {
        Allow: allowed,
        'Cache-Control': 'no-store',
      },
    },
  )
}

function stageFrom(value: unknown): LeadStage {
  const candidate = String(value ?? '').toLowerCase() as LeadStage
  return STAGES.includes(candidate) ? candidate : 'new'
}

function priorityFrom(value: unknown): LeadPriority {
  const candidate = String(value ?? '').toLowerCase() as LeadPriority
  return PRIORITIES.includes(candidate) ? candidate : 'medium'
}

export default async (req: Request) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '')
  const leadsBasePath = '/api/saas-dashboard/leads'

  if (path === '/api/saas-dashboard' && req.method !== 'GET') {
    return methodNotAllowed('GET')
  }

  if (path === '/api/saas-dashboard') {
    const state = await readState()
    return json({
      ok: true,
      summary: computeSummary(state),
      leads: sortByUpdated(state.leads),
      intakes: [...state.intakes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      updatedAt: nowIso(),
    })
  }

  if (path === '/api/saas-dashboard/intakes') {
    if (req.method !== 'POST') {
      return methodNotAllowed('POST')
    }

    let payload: Record<string, unknown>
    try {
      payload = await req.json() as Record<string, unknown>
    } catch {
      return json({ ok: false, message: 'Invalid JSON payload' }, 400)
    }

    const company = clampText(payload.company, 90)
    const contactName = clampText(payload.contactName, 90)
    const contactEmail = clampText(payload.contactEmail, 120)
    const source = clampText(payload.source, 50) || 'Website'
    const owner = clampText(payload.owner, 40) || 'Unassigned'
    const notes = clampText(payload.notes, 500)
    const serviceNeed = clampText(payload.serviceNeed, 120)
    const budgetBand = clampText(payload.budgetBand, 40)
    const timeline = clampText(payload.timeline, 40)

    if (!company || !contactName || !contactEmail || !serviceNeed) {
      return json({ ok: false, message: 'company, contactName, contactEmail, and serviceNeed are required' }, 400)
    }

    const state = await readState()
    const timestamp = nowIso()
    const newLead: Lead = {
      id: makeId('lead'),
      company,
      contactName,
      contactEmail,
      source,
      stage: 'new',
      value: parseMoney(payload.value),
      priority: priorityFrom(payload.priority),
      owner,
      notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const newIntake: Intake = {
      id: makeId('intake'),
      leadId: newLead.id,
      company,
      contactName,
      contactEmail,
      serviceNeed,
      budgetBand,
      timeline,
      details: clampText(payload.details, 600),
      createdAt: timestamp,
    }

    const nextState: DashboardState = {
      leads: [newLead, ...state.leads],
      intakes: [newIntake, ...state.intakes],
    }

    await writeState(nextState)

    return json({
      ok: true,
      lead: newLead,
      intake: newIntake,
      summary: computeSummary(nextState),
    }, 201)
  }

  if (path === leadsBasePath) {
    if (req.method !== 'POST') {
      return methodNotAllowed('POST')
    }

    let payload: Record<string, unknown>
    try {
      payload = await req.json() as Record<string, unknown>
    } catch {
      return json({ ok: false, message: 'Invalid JSON payload' }, 400)
    }

    const company = clampText(payload.company, 90)
    const contactName = clampText(payload.contactName, 90)
    const contactEmail = clampText(payload.contactEmail, 120)

    if (!company || !contactName || !contactEmail) {
      return json({ ok: false, message: 'company, contactName, and contactEmail are required' }, 400)
    }

    const state = await readState()
    const timestamp = nowIso()
    const lead: Lead = {
      id: makeId('lead'),
      company,
      contactName,
      contactEmail,
      source: clampText(payload.source, 50) || 'Manual',
      stage: stageFrom(payload.stage),
      value: parseMoney(payload.value),
      priority: priorityFrom(payload.priority),
      owner: clampText(payload.owner, 40) || 'Unassigned',
      notes: clampText(payload.notes, 500),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const nextState = {
      leads: [lead, ...state.leads],
      intakes: state.intakes,
    }

    await writeState(nextState)
    return json({ ok: true, lead, summary: computeSummary(nextState) }, 201)
  }

  if (path.startsWith(`${leadsBasePath}/`)) {
    const leadId = path.slice(`${leadsBasePath}/`.length)
    if (!leadId) {
      return json({ ok: false, message: 'Lead id is required' }, 400)
    }

    const state = await readState()
    const targetIndex = state.leads.findIndex((lead) => lead.id === leadId)
    if (targetIndex === -1) {
      return json({ ok: false, message: 'Lead not found' }, 404)
    }

    if (req.method === 'DELETE') {
      const nextState = {
        leads: state.leads.filter((lead) => lead.id !== leadId),
        intakes: state.intakes.filter((intake) => intake.leadId !== leadId),
      }
      await writeState(nextState)
      return json({ ok: true, summary: computeSummary(nextState) })
    }

    if (req.method !== 'PATCH') {
      return methodNotAllowed('PATCH, DELETE')
    }

    let payload: Record<string, unknown>
    try {
      payload = await req.json() as Record<string, unknown>
    } catch {
      return json({ ok: false, message: 'Invalid JSON payload' }, 400)
    }

    const existing = state.leads[targetIndex]
    const updated: Lead = {
      ...existing,
      company: clampText(payload.company, 90) || existing.company,
      contactName: clampText(payload.contactName, 90) || existing.contactName,
      contactEmail: clampText(payload.contactEmail, 120) || existing.contactEmail,
      source: clampText(payload.source, 50) || existing.source,
      stage: payload.stage === undefined ? existing.stage : stageFrom(payload.stage),
      value: payload.value === undefined ? existing.value : parseMoney(payload.value),
      priority: payload.priority === undefined ? existing.priority : priorityFrom(payload.priority),
      owner: payload.owner === undefined ? existing.owner : (clampText(payload.owner, 40) || 'Unassigned'),
      notes: payload.notes === undefined ? existing.notes : clampText(payload.notes, 500),
      updatedAt: nowIso(),
    }

    const nextLeads = [...state.leads]
    nextLeads[targetIndex] = updated

    const nextState = {
      leads: nextLeads,
      intakes: state.intakes,
    }

    await writeState(nextState)

    return json({
      ok: true,
      lead: updated,
      summary: computeSummary(nextState),
    })
  }

  return json({ ok: false, message: 'Not found' }, 404)
}

export const config: Config = {
  path: ['/api/saas-dashboard', '/api/saas-dashboard/*'],
}
