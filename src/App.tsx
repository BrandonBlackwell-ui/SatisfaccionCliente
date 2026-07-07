import { useEffect, useMemo, useState } from 'react'

// ─── Supabase config ────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vqgfkfvywbpjldreuplb.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxZ2ZrZnZ5d2JwamxkcmV1cGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MjEwNDMsImV4cCI6MjA5NzA5NzA0M30.wR9_YXMi2udYsVNLY8SlPFwpxkqZ3j78hv961ShBkQk'

async function supabaseGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

// ─── Types ──────────────────────────────────────────────────────────────────
type DailyAnalysis = {
  id: number
  account_id: string
  group_jid: string
  group_name: string | null
  analysis_date: string
  analyzed_at: string
  raw_analysis?: any
}

type WaGroup = {
  jid: string
  name: string
  account_id: string
  active: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function lookupKey(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// All known account folders so we can load checklists
const ACCOUNT_FOLDERS = [
  '01_TURBOFIN','02_MAJA','03_ADUANAS','04_IDLAYR','05_CREDIX',
  '06_RR','07_APOLLO','08_ULDIS','09_GRUPO_AZVI','10_JACK_LEVI',
  '11_ASCENSO_Y_DESCENSO','12_MTV','13_GRUPO_CIMA','14_DALINDE',
  '15_ARMOR_LIFE_LAB','16_MAPELLY','17_IRUGAMI','18_STPRM',
  '19_CASA_MATA','20_VERACRUZ','21_NUVOIL','22_TOTALPLAY',
  '23_LUCA','24_GICSA','25_ANDY','26_BERNARDO_V','27_CUERNAVACA',
  '28_QUERETARO','29_COAST_OIL','30_ERICK_RUBI','31_SASIL',
  '32_COJAB','33_NEZA','34_SUPPLY_PAY','35_PEPE_AGUILAR',
  '37_LEADSALES','38_KARPOWERSHIP','39_ISMERELY','40_AUSTRIA','41_IFA_CELTICS',
]

// ─── Survey Row type ─────────────────────────────────────────────────────────
type SurveyRow = {
  accountId: string
  accountName: string
  hasContract: boolean
  groupNames: string[]
  questionA: {
    answered: boolean
    question: string
    answer: string
    score: number | null
  } | null
  questionB: {
    answered: boolean
    question: string
    answer: string
    score: number | null
  } | null
  lastSurveyDate: string | null
}

// ─── Survey Cell ─────────────────────────────────────────────────────────────
function SurveyCell({
  answered,
  hasSurveyData,
  question,
  answer,
}: {
  answered: boolean
  hasSurveyData: boolean
  question?: string
  answer?: string
}) {
  const [show, setShow] = useState(false)

  if (!hasSurveyData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 22, color: '#d0ccc4', lineHeight: 1 }}>✗</span>
        <span style={{ fontSize: 10, color: '#c0bbb0' }}>Sin datos</span>
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, position: 'relative', cursor: 'pointer' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {answered ? (
        <span style={{ fontSize: 26, color: '#2a7a50', lineHeight: 1, fontWeight: 700 }}>✓</span>
      ) : (
        <span style={{ fontSize: 26, color: '#a8453b', lineHeight: 1, fontWeight: 700 }}>✗</span>
      )}
      <span style={{ fontSize: 10, fontWeight: 600, color: answered ? '#3f7050' : '#c06050', letterSpacing: '.03em' }}>
        {answered ? 'Respondida' : 'Pendiente'}
      </span>

      {show && (question || answer) && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: '#1c2027', color: '#fdfcf8', borderRadius: 10,
          padding: '12px 16px', fontSize: 12.5, lineHeight: 1.55,
          width: 280, zIndex: 200, marginBottom: 8,
          boxShadow: '0 6px 24px rgba(0,0,0,0.3)',
          whiteSpace: 'normal', textAlign: 'left', pointerEvents: 'none',
        }}>
          {question && (
            <div style={{ fontWeight: 700, marginBottom: 8, color: '#e8e4d8' }}>{question}</div>
          )}
          {answer ? (
            <div style={{ color: '#a0c4e8', fontStyle: 'italic' }}>"{answer}"</div>
          ) : answered ? (
            <div style={{ color: '#78808c', fontStyle: 'italic' }}>Respuesta registrada</div>
          ) : null}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
            width: 12, height: 12, background: '#1c2027',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
          }} />
        </div>
      )}
    </div>
  )
}

// ─── Score Badge ──────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color: '#c0bbb0', fontSize: 13 }}>--</span>
  const good = score >= 80
  const mid  = score >= 60
  return (
    <span style={{
      display: 'inline-block', padding: '3px 11px', borderRadius: 999,
      fontSize: 13, fontWeight: 700,
      background: good ? 'rgba(42,122,80,0.12)' : mid ? 'rgba(184,132,28,0.12)' : 'rgba(168,69,59,0.12)',
      color:      good ? '#2a7a50'              : mid ? '#8a6010'              : '#a8453b',
      border:     `1px solid ${good ? 'rgba(42,122,80,0.25)' : mid ? 'rgba(184,132,28,0.25)' : 'rgba(168,69,59,0.25)'}`,
    }}>
      {score}/100
    </span>
  )
}

// ─── Date formatter ───────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return {
    date: new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(d),
    time: new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(d),
  }
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [analyses, setAnalyses] = useState<DailyAnalysis[]>([])
  const [groups, setGroups]     = useState<WaGroup[]>([])
  const [checklists, setChecklists] = useState<{ folder: string; data: any }[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'done' | 'pending'>('all')

  // Load data from Supabase
  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [analysisRows, groupRows] = await Promise.all([
          supabaseGet<DailyAnalysis[]>(
            '/rest/v1/wa_daily_analysis?select=id,account_id,group_jid,group_name,analysis_date,analyzed_at,raw_analysis&order=analyzed_at.desc&limit=500'
          ),
          supabaseGet<WaGroup[]>('/rest/v1/wa_groups?select=jid,name,account_id,active&order=name.asc'),
        ])
        setAnalyses(analysisRows)
        setGroups(groupRows)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Load checklists from public folder
  useEffect(() => {
    async function loadChecklists() {
      const results = await Promise.all(
        ACCOUNT_FOLDERS.map(async folder => {
          try {
            const r = await fetch(`/data/accounts/${folder}/checklist.json`)
            if (r.ok) return { folder, data: await r.json() }
          } catch { /* skip */ }
          return null
        })
      )
      setChecklists(results.filter(Boolean) as { folder: string; data: any }[])
    }
    loadChecklists()
  }, [])

  // findChecklist helper
  const findChecklist = (accountId: string, accountName?: string) => {
    const nameNorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const asNumber = /^\d+$/.test(accountId.trim()) ? String(Number(accountId.trim())) : null
    if (asNumber) {
      const byNum = checklists.find(x => String(Number(x.data.account_number ?? -1)) === asNumber)
      if (byNum) return byNum.data
    }
    const keys = [accountId, accountName].filter(Boolean).map(k => nameNorm(String(k)))
    for (const key of keys) {
      if (key.length < 3) continue
      const match =
        checklists.find(x => nameNorm(x.data.account_id ?? '') === key) ??
        checklists.find(x => {
          const cn = nameNorm(x.data.account_name ?? '')
          return cn.length >= 3 && (cn.includes(key) || key.includes(cn))
        })
      if (match) return match.data
    }
    return null
  }

  // Build survey entries map: accountId → latest analysis with survey data
  const latestSurveyByAccount = useMemo(() => {
    const map = new Map<string, { analysis: DailyAnalysis; survey: any }>()
    for (const a of analyses) {
      let raw: any = null
      try { raw = typeof a.raw_analysis === 'string' ? JSON.parse(a.raw_analysis) : a.raw_analysis } catch { raw = a.raw_analysis }
      const survey = raw?.survey || raw?.raw_analysis?.survey
      if (!survey) continue
      const hasA = survey.question_a?.score != null || survey.question_a?.answer
      const hasB = survey.question_b?.score != null || survey.question_b?.answer
      if (!hasA && !hasB) continue
      const existing = map.get(a.account_id)
      if (!existing || a.analyzed_at > existing.analysis.analyzed_at) map.set(a.account_id, { analysis: a, survey })
    }
    return map
  }, [analyses])

  // Also build a map from group_jid to latest survey (fallback)
  const latestSurveyByJid = useMemo(() => {
    const map = new Map<string, { analysis: DailyAnalysis; survey: any }>()
    for (const a of analyses) {
      let raw: any = null
      try { raw = typeof a.raw_analysis === 'string' ? JSON.parse(a.raw_analysis) : a.raw_analysis } catch { raw = a.raw_analysis }
      const survey = raw?.survey || raw?.raw_analysis?.survey
      if (!survey) continue
      const hasA = survey.question_a?.score != null || survey.question_a?.answer
      const hasB = survey.question_b?.score != null || survey.question_b?.answer
      if (!hasA && !hasB) continue
      const existing = map.get(a.group_jid)
      if (!existing || a.analyzed_at > existing.analysis.analyzed_at) map.set(a.group_jid, { analysis: a, survey })
    }
    return map
  }, [analyses])

  // Build unique accounts list from groups + analyses
  const accounts = useMemo(() => {
    const accountMap = new Map<string, { id: string; name: string; jids: string[] }>()

    for (const g of groups) {
      const key = g.account_id || g.jid
      if (!accountMap.has(key)) {
        accountMap.set(key, { id: key, name: g.name, jids: [] })
      }
      accountMap.get(key)!.jids.push(g.jid)
    }

    for (const a of analyses) {
      if (!accountMap.has(a.account_id)) {
        accountMap.set(a.account_id, { id: a.account_id, name: a.group_name || a.account_id, jids: [a.group_jid] })
      } else {
        const acc = accountMap.get(a.account_id)!
        if (!acc.jids.includes(a.group_jid)) acc.jids.push(a.group_jid)
        // Prefer non-"Interno" name from group
        if (acc.name.toLowerCase().includes('interno') && a.group_name && !a.group_name.toLowerCase().includes('interno')) {
          acc.name = a.group_name
        }
      }
    }
    return Array.from(accountMap.values())
  }, [groups, analyses])

  // Build survey rows
  const rows: SurveyRow[] = useMemo(() => {
    return accounts.map(acc => {
      const checklist = findChecklist(acc.id, acc.name)
      const hasContract = !!checklist?.contract?.vigencia

      // Try direct account_id lookup
      let entry = latestSurveyByAccount.get(acc.id)

      // Try numeric variation
      if (!entry) {
        const asNum = /^\d+$/.test(acc.id.trim()) ? String(Number(acc.id.trim())) : null
        if (asNum) {
          for (const [k, v] of latestSurveyByAccount) {
            if (String(Number(k)) === asNum) { entry = v; break }
          }
        }
      }

      // Try by JID
      if (!entry) {
        for (const jid of acc.jids) {
          const byJid = latestSurveyByJid.get(jid)
          if (byJid && (!entry || byJid.analysis.analyzed_at > entry.analysis.analyzed_at)) {
            entry = byJid
          }
        }
      }

      const survey = entry?.survey
      const qA = survey?.question_a
      const qB = survey?.question_b
      const answeredA = !!(qA?.score != null || qA?.answer)
      const answeredB = !!(qB?.score != null || qB?.answer)

      // Get all group names for this account
      const groupNames = acc.jids
        .map(jid => groups.find(g => g.jid === jid)?.name || null)
        .filter(Boolean) as string[]

      return {
        accountId: acc.id,
        accountName: acc.name,
        hasContract,
        groupNames,
        questionA: survey ? {
          answered: answeredA,
          question: qA?.question || 'Pregunta Tipo A — Satisfacción General',
          answer: qA?.answer || '',
          score: qA?.score != null ? Number(qA.score) : null,
        } : null,
        questionB: survey ? {
          answered: answeredB,
          question: qB?.question || 'Pregunta Tipo B — Objetivo Específico',
          answer: qB?.answer || '',
          score: qB?.score != null ? Number(qB.score) : null,
        } : null,
        lastSurveyDate: entry?.analysis.analyzed_at ?? null,
      }
    }).sort((a, b) => {
      // Contracts with survey first, then contracts pending, then rest
      if (a.hasContract && !b.hasContract) return -1
      if (!a.hasContract && b.hasContract) return 1
      const aDone = !!(a.questionA?.answered || a.questionB?.answered)
      const bDone = !!(b.questionA?.answered || b.questionB?.answered)
      if (aDone && !bDone) return -1
      if (!aDone && bDone) return 1
      return a.accountName.localeCompare(b.accountName)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, checklists, latestSurveyByAccount, latestSurveyByJid, groups])

  // Stats
  const withContract  = rows.filter(r => r.hasContract).length
  const withSurvey    = rows.filter(r => r.hasContract && (r.questionA?.answered || r.questionB?.answered)).length
  const bothAnswered  = rows.filter(r => r.hasContract && r.questionA?.answered && r.questionB?.answered).length
  const pending       = withContract - withSurvey

  // Filter
  const filteredRows = useMemo(() => {
    let result = rows
    if (filterMode === 'done')    result = result.filter(r => r.questionA?.answered || r.questionB?.answered)
    if (filterMode === 'pending') result = result.filter(r => r.hasContract && !r.questionA?.answered && !r.questionB?.answered)
    if (search.trim()) {
      const q = lookupKey(search)
      result = result.filter(r => lookupKey(r.accountName).includes(q))
    }
    return result
  }, [rows, filterMode, search])

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="lb-shell">
        <div className="lb-book">
          <div className="lb-page">
            <div className="lb-lines" />
            <div className="lb-margin" />
            <div className="lb-spine"><div className="lb-rings">{Array.from({ length: 9 }).map((_, i) => <div className="lb-ring" key={i} />)}</div></div>
            <div className="lb-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 16px' }} />
                <span className="lb-eyebrow">Conectando a Supabase</span>
                <h1 style={{ fontFamily: 'var(--caveat)', fontSize: 36, margin: '4px 0 0', color: 'var(--ink-900)' }}>Cargando surveys...</h1>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="lb-shell">
        <div className="lb-book">
          <div className="lb-page">
            <div className="lb-lines" /><div className="lb-margin" />
            <div className="lb-spine"><div className="lb-rings">{Array.from({ length: 9 }).map((_, i) => <div className="lb-ring" key={i} />)}</div></div>
            <div className="lb-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
              <div style={{ textAlign: 'center' }}>
                <span className="lb-eyebrow" style={{ color: '#a8453b' }}>Error de conexión</span>
                <h1 style={{ fontFamily: 'var(--caveat)', fontSize: 36, margin: '4px 0 12px', color: '#a8453b' }}>No se pudieron leer datos</h1>
                <p style={{ fontSize: 13, color: 'var(--char)', maxWidth: 420 }}>{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lb-shell">
      <div className="lb-book">
        <div className="lb-page">
          <div className="lb-lines" />
          <div className="lb-margin" />
          <div className="lb-spine"><div className="lb-rings">{Array.from({ length: 9 }).map((_, i) => <div className="lb-ring" key={i} />)}</div></div>
          <div className="lb-content">

            {/* Header */}
            <div className="lb-header-row">
              <div>
                <span className="lb-eyebrow">Satisfacción del Cliente</span>
                <h1 className="lb-h1">Survey Dashboard</h1>
                <p className="lb-subtext">Seguimiento de preguntas bimestrales de satisfacción por cliente.</p>
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--caveat)', fontSize: 30, fontWeight: 700, color: '#3a3a44', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' })}
              </div>
            </div>

            {/* Stat cards */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 32, flexWrap: 'wrap' }}>
              {[
                { label: 'Con survey respondido', value: withSurvey,   sub: `de ${withContract} cuentas activas`, bg: '#d4eedd', border: '#a5d4b8', color: '#2a7a50', subColor: '#4c9466' },
                { label: 'Ambas preguntas',        value: bothAnswered, sub: 'contestaron Tipo A y Tipo B',        bg: '#fdf1ad', border: '#e4d870', color: '#8a6010', subColor: '#9a7020' },
                { label: 'Pendientes',              value: pending,     sub: 'sin survey aplicado',                bg: '#fde8e6', border: '#f0c0bc', color: '#a8453b', subColor: '#c0504a' },
              ].map(s => (
                <div key={s.label} style={{
                  background: s.bg, border: `1px solid ${s.border}`, borderRadius: 14,
                  padding: '18px 24px', flex: 1, minWidth: 160,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: s.color, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: s.subColor, marginTop: 6 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search */}
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9aa0a6', pointerEvents: 'none' }}>🔍</span>
                <input
                  id="survey-search"
                  type="text"
                  placeholder="Buscar cliente..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px 8px 36px',
                    border: '1px solid rgba(20,36,92,0.15)', borderRadius: 8,
                    fontSize: 13, background: '#fff', color: 'var(--ink-900)',
                    outline: 'none', fontFamily: 'var(--sans)',
                  }}
                />
              </div>
              {/* Filter buttons */}
              {(['all', 'done', 'pending'] as const).map(mode => {
                const labels = { all: 'Todos', done: '✓ Respondidos', pending: '✗ Pendientes' }
                const active = filterMode === mode
                return (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    style={{
                      padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: `1px solid ${active ? 'var(--ink-800)' : 'rgba(20,36,92,0.15)'}`,
                      background: active ? 'var(--ink-800)' : '#fff',
                      color: active ? '#fdfcf8' : 'var(--char)',
                      cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--sans)',
                    }}
                  >
                    {labels[mode]}
                  </button>
                )
              })}
              <span style={{ fontSize: 12, color: '#9aa0a6', marginLeft: 4 }}>
                {filteredRows.length} cliente{filteredRows.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', borderRadius: 12, boxShadow: '0 2px 12px rgba(20,36,92,0.08)', border: '1px solid rgba(20,36,92,0.08)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--sans)', fontSize: 13, background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f5f2ea' }}>
                    {[
                      { label: 'Cliente',            align: 'left',   width: 'auto' },
                      { label: 'Pregunta Tipo A',     align: 'center', width: 150,  sub: 'Satisfacción General' },
                      { label: 'Pregunta Tipo B',     align: 'center', width: 150,  sub: 'Objetivo Específico' },
                      { label: 'Último Survey',       align: 'center', width: 160 },
                      { label: 'Score A',             align: 'center', width: 90 },
                      { label: 'Score B',             align: 'center', width: 90 },
                    ].map((col, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '13px 16px',
                          textAlign: col.align as 'left' | 'center',
                          fontWeight: 700, fontSize: 10.5,
                          letterSpacing: '.08em', textTransform: 'uppercase',
                          color: '#78808c', borderBottom: '2px solid #e4ddca',
                          minWidth: col.width,
                        }}
                      >
                        {col.label}
                        {(col as any).sub && (
                          <><br /><span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9.5, color: '#a8acb5', letterSpacing: 0 }}>{(col as any).sub}</span></>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: '#9aa0a6', fontSize: 14, fontStyle: 'italic' }}>
                        No se encontraron clientes con los filtros actuales.
                      </td>
                    </tr>
                  ) : filteredRows.map((row, idx) => {
                    const isEven = idx % 2 === 0
                    const hasSurvey = row.questionA?.answered || row.questionB?.answered
                    const dotColor = hasSurvey ? '#2a7a50' : row.hasContract ? '#a8453b' : '#ccc'
                    const dt = fmtDate(row.lastSurveyDate)

                    return (
                      <tr
                        key={row.accountId}
                        style={{
                          background: isEven ? '#fff' : '#faf8f3',
                          borderBottom: '1px solid rgba(20,36,92,0.06)',
                          opacity: row.hasContract ? 1 : 0.4,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0ede5')}
                        onMouseLeave={e => (e.currentTarget.style.background = isEven ? '#fff' : '#faf8f3')}
                      >
                        {/* Client */}
                        <td style={{ padding: '15px 16px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: dotColor, boxShadow: `0 0 0 2px ${dotColor}22` }} />
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: '#1c2027', lineHeight: 1.2 }}>{row.accountName}</div>
                              {!row.hasContract && (
                                <div style={{ fontSize: 10.5, color: '#9aa0a6', marginTop: 1 }}>Sin contrato activo</div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Tipo A */}
                        <td style={{ padding: '15px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <SurveyCell
                            answered={row.questionA?.answered ?? false}
                            hasSurveyData={row.questionA !== null}
                            question={row.questionA?.question}
                            answer={row.questionA?.answer}
                          />
                        </td>

                        {/* Tipo B */}
                        <td style={{ padding: '15px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <SurveyCell
                            answered={row.questionB?.answered ?? false}
                            hasSurveyData={row.questionB !== null}
                            question={row.questionB?.question}
                            answer={row.questionB?.answer}
                          />
                        </td>

                        {/* Last survey date */}
                        <td style={{ padding: '15px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {dt ? (
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#3d434c' }}>{dt.date}</div>
                              <div style={{ fontSize: 10.5, color: '#9aa0a6', marginTop: 2, fontFamily: 'var(--mono)' }}>{dt.time}</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: '#c8c4bc', fontStyle: 'italic' }}>Sin survey</span>
                          )}
                        </td>

                        {/* Score A */}
                        <td style={{ padding: '15px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <ScoreBadge score={row.questionA?.score ?? null} />
                        </td>

                        {/* Score B */}
                        <td style={{ padding: '15px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <ScoreBadge score={row.questionB?.score ?? null} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: 18, fontSize: 11.5, color: '#a8acb5', fontStyle: 'italic', lineHeight: 1.5 }}>
              Los surveys se leen automáticamente del campo <code style={{ background: 'rgba(20,36,92,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>raw_analysis.survey</code> en <code style={{ background: 'rgba(20,36,92,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>wa_daily_analysis</code>.
              Las cuentas sin contrato activo aparecen atenuadas.
              Pasa el cursor sobre ✓ o ✗ para ver la pregunta y respuesta exacta.
            </p>

          </div>
        </div>
      </div>
    </div>
  )
}
