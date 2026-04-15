import type { Config } from '@netlify/functions'

const DIGI_VAULT_CODE = '65000'

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return Response.json(
      { ok: false, message: 'Method not allowed' },
      {
        status: 405,
        headers: {
          'Allow': 'POST',
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  try {
    const payload = await req.json() as { code?: string | number }
    const code = String(payload?.code ?? '').trim()
    const isValid = code === DIGI_VAULT_CODE

    return Response.json(
      {
        ok: isValid,
        state: isValid ? 'UNLOCKED' : 'LOCKED',
      },
      {
        status: isValid ? 200 : 401,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch {
    return Response.json(
      { ok: false, message: 'Invalid payload' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  }
}

export const config: Config = {
  path: '/api/vault-login',
}
