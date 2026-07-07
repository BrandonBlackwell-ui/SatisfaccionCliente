import { useEffect, useMemo, useState } from 'react'

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vqgfkfvywbpjldreuplb.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxZ2ZrZnZ5d2JwamxkcmV1cGxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MjEwNDMsImV4cCI6MjA5NzA5NzA0M30.wR9_YXMi2udYsVNLY8SlPFwpxkqZ3j78hv961ShBkQk'

const MONDAY_API_KEY = import.meta.env.VITE_MONDAY_API_KEY ||
  'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjY3Mjc5ODY2OSwiYWFpIjoxMSwidWlkIjoxMDU2Mzk1NjYsImlhZCI6IjIwMjYtMDYtMThUMTg6MDM6MDguMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjExMDE4MjcwLCJyZ24iOiJ1c2UxIn0.2acatudjyor1viwXGVyQW3FQthaWFny_0JUacNOi0mQ'

const MONDAY_WORKSPACE_ID = '15943386' // Consultoria Cuentas

// ─── API helpers ─────────────────────────────────────────────────────────────
async function supabaseGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return res.json()
}

async function mondayQuery<T = any>(query: string): Promise<T> {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': MONDAY_API_KEY,
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Monday ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (json.errors?.length) throw new Error(`Monday API: ${json.errors.map((e: any) => e.message).join(', ')}`)
  return json.data
}

// ─── Types ───────────────────────────────────────────────────────────────────
type DailyAnalysis = {
  id: number; account_id: string; group_jid: string
  group_name: string | null; analysis_date: string; analyzed_at: string; raw_analysis?: any
}
type WaGroup = { jid: string; name: string; account_id: string; active: boolean }

type MondayBoard = { id: string; name: string }
type MondayItem = {
  id: string; name: string
  column_values: { id: string; text: string; value: string | null }[]
  group: { title: string }
}
type MondayBoardWithItems = MondayBoard & { items_count: number; items: MondayItem[] }

type SurveyRow = {
  accountId: string; accountName: string; hasContract: boolean
  questionA: { answered: boolean; question: string; answer: string; score: number | null } | null
  questionB: { answered: boolean; question: string; answer: string; score: number | null } | null
  lastSurveyDate: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function lookupKey(v: string | null | undefined) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const ACCOUNT_FOLDERS = [
  '01_TURBOFIN','02_MAJA','03_ADUANAS','04_IDLAYR','05_CREDIX','06_RR','07_APOLLO','08_ULDIS',
  '09_GRUPO_AZVI','10_JACK_LEVI','11_ASCENSO_Y_DESCENSO','12_MTV','13_GRUPO_CIMA','14_DALINDE',
  '15_ARMOR_LIFE_LAB','16_MAPELLY','17_IRUGAMI','18_STPRM','19_CASA_MATA','20_VERACRUZ',
  '21_NUVOIL','22_TOTALPLAY','23_LUCA','24_GICSA','25_ANDY','26_BERNARDO_V','27_CUERNAVACA',
  '28_QUERETARO','29_COAST_OIL','30_ERICK_RUBI','31_SASIL','32_COJAB','33_NEZA','34_SUPPLY_PAY',
  '35_PEPE_AGUILAR','37_LEADSALES','38_KARPOWERSHIP','39_ISMERELY','40_AUSTRIA','41_IFA_CELTICS',
]

// Status colors for Monday
function statusColor(text: string): { bg: string; color: string; border: string } {
  const t = text?.toLowerCase() || ''
  if (t.includes('done') || t.includes('complet') || t.includes('terminad') || t.includes('listo')) return { bg: 'rgba(42,122,80,0.12)', color: '#2a7a50', border: 'rgba(42,122,80,0.25)' }
  if (t.includes('work') || t.includes('progre') || t.includes('proceso') || t.includes('activ')) return { bg: 'rgba(39,96,185,0.10)', color: '#1d5ca8', border: 'rgba(39,96,185,0.25)' }
  if (t.includes('stuck') || t.includes('bloq') || t.includes('riesgo') || t.includes('atras')) return { bg: 'rgba(168,69,59,0.10)', color: '#a8453b', border: 'rgba(168,69,59,0.25)' }
  if (t.includes('review') || t.includes('revisi') || t.includes('pendiente')) return { bg: 'rgba(184,132,28,0.10)', color: '#8a6010', border: 'rgba(184,132,28,0.25)' }
  return { bg: 'rgba(120,128,140,0.08)', color: '#4a4e57', border: 'rgba(120,128,140,0.2)' }
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false
  const d = new Date(dateStr + 'T23:59:59')
  return d < new Date()
}

// ─── Components ──────────────────────────────────────────────────────────────

function SurveyCell({ answered, hasSurveyData, question, answer }: {
  answered: boolean; hasSurveyData: boolean; question?: string; answer?: string
}) {
  const [show, setShow] = useState(false)
  if (!hasSurveyData) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
        <span style={{ fontSize:22, color:'#d0ccc4', lineHeight:1 }}>✗</span>
        <span style={{ fontSize:10, color:'#c0bbb0' }}>Sin datos</span>
      </div>
    )
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, position:'relative', cursor:'pointer' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {answered
        ? <span style={{ fontSize:26, color:'#2a7a50', lineHeight:1, fontWeight:700 }}>✓</span>
        : <span style={{ fontSize:26, color:'#a8453b', lineHeight:1, fontWeight:700 }}>✗</span>}
      <span style={{ fontSize:10, fontWeight:600, color: answered ? '#3f7050' : '#c06050', letterSpacing:'.03em' }}>
        {answered ? 'Respondida' : 'Pendiente'}
      </span>
      {show && (question || answer) && (
        <div style={{ position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)', background:'#1c2027', color:'#fdfcf8', borderRadius:10, padding:'12px 16px', fontSize:12.5, lineHeight:1.55, width:280, zIndex:200, marginBottom:8, boxShadow:'0 6px 24px rgba(0,0,0,0.3)', whiteSpace:'normal', textAlign:'left', pointerEvents:'none' }}>
          {question && <div style={{ fontWeight:700, marginBottom:8, color:'#e8e4d8' }}>{question}</div>}
          {answer ? <div style={{ color:'#a0c4e8', fontStyle:'italic' }}>"{answer}"</div>
            : answered ? <div style={{ color:'#78808c', fontStyle:'italic' }}>Respuesta registrada</div> : null}
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span style={{ color:'#c0bbb0', fontSize:13 }}>--</span>
  const good = score >= 80, mid = score >= 60
  return (
    <span style={{ display:'inline-block', padding:'3px 11px', borderRadius:999, fontSize:13, fontWeight:700,
      background: good ? 'rgba(42,122,80,0.12)' : mid ? 'rgba(184,132,28,0.12)' : 'rgba(168,69,59,0.12)',
      color: good ? '#2a7a50' : mid ? '#8a6010' : '#a8453b',
      border: `1px solid ${good ? 'rgba(42,122,80,0.25)' : mid ? 'rgba(184,132,28,0.25)' : 'rgba(168,69,59,0.25)'}` }}>
      {score}/100
    </span>
  )
}

// ─── Survey Tab ───────────────────────────────────────────────────────────────
function SurveyTab({ analyses, groups, checklists }: {
  analyses: DailyAnalysis[]; groups: WaGroup[]; checklists: { folder: string; data: any }[]
}) {
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'done' | 'pending'>('all')

  const findChecklist = (accountId: string, accountName?: string) => {
    const nn = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const asNumber = /^\d+$/.test(accountId.trim()) ? String(Number(accountId.trim())) : null
    if (asNumber) {
      const byNum = checklists.find(x => String(Number(x.data.account_number ?? -1)) === asNumber)
      if (byNum) return byNum.data
    }
    for (const key of [accountId, accountName].filter(Boolean).map(k => nn(String(k)))) {
      if (key.length < 3) continue
      const m = checklists.find(x => nn(x.data.account_id ?? '') === key) ??
        checklists.find(x => { const cn = nn(x.data.account_name ?? ''); return cn.length >= 3 && (cn.includes(key) || key.includes(cn)) })
      if (m) return m.data
    }
    return null
  }

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

  const accounts = useMemo(() => {
    const m = new Map<string, { id: string; name: string; jids: string[] }>()
    for (const g of groups) {
      const key = g.account_id || g.jid
      if (!m.has(key)) m.set(key, { id: key, name: g.name, jids: [] })
      m.get(key)!.jids.push(g.jid)
    }
    for (const a of analyses) {
      if (!m.has(a.account_id)) m.set(a.account_id, { id: a.account_id, name: a.group_name || a.account_id, jids: [a.group_jid] })
      else { const acc = m.get(a.account_id)!; if (!acc.jids.includes(a.group_jid)) acc.jids.push(a.group_jid) }
    }
    return Array.from(m.values())
  }, [groups, analyses])

  const rows: SurveyRow[] = useMemo(() => {
    return accounts.map(acc => {
      const checklist = findChecklist(acc.id, acc.name)
      const hasContract = !!checklist?.contract?.vigencia
      let entry = latestSurveyByAccount.get(acc.id)
      if (!entry) {
        const asNum = /^\d+$/.test(acc.id.trim()) ? String(Number(acc.id.trim())) : null
        if (asNum) for (const [k, v] of latestSurveyByAccount) if (String(Number(k)) === asNum) { entry = v; break }
      }
      if (!entry) {
        for (const jid of acc.jids) {
          const byJid = latestSurveyByJid.get(jid)
          if (byJid && (!entry || byJid.analysis.analyzed_at > entry.analysis.analyzed_at)) entry = byJid
        }
      }
      const survey = entry?.survey
      const qA = survey?.question_a, qB = survey?.question_b
      const answeredA = !!(qA?.score != null || qA?.answer)
      const answeredB = !!(qB?.score != null || qB?.answer)
      return {
        accountId: acc.id, accountName: acc.name, hasContract,
        questionA: survey ? { answered: answeredA, question: qA?.question || 'Pregunta Tipo A — Satisfacción General', answer: qA?.answer || '', score: qA?.score != null ? Number(qA.score) : null } : null,
        questionB: survey ? { answered: answeredB, question: qB?.question || 'Pregunta Tipo B — Objetivo Específico', answer: qB?.answer || '', score: qB?.score != null ? Number(qB.score) : null } : null,
        lastSurveyDate: entry?.analysis.analyzed_at ?? null,
      }
    }).sort((a, b) => {
      if (a.hasContract && !b.hasContract) return -1
      if (!a.hasContract && b.hasContract) return 1
      const aDone = !!(a.questionA?.answered || a.questionB?.answered)
      const bDone = !!(b.questionA?.answered || b.questionB?.answered)
      if (aDone && !bDone) return -1
      if (!aDone && bDone) return 1
      return a.accountName.localeCompare(b.accountName)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, checklists, latestSurveyByAccount, latestSurveyByJid])

  const withContract = rows.filter(r => r.hasContract).length
  const withSurvey = rows.filter(r => r.hasContract && (r.questionA?.answered || r.questionB?.answered)).length
  const bothAnswered = rows.filter(r => r.hasContract && r.questionA?.answered && r.questionB?.answered).length

  const filteredRows = useMemo(() => {
    let res = rows
    if (filterMode === 'done')    res = res.filter(r => r.questionA?.answered || r.questionB?.answered)
    if (filterMode === 'pending') res = res.filter(r => r.hasContract && !r.questionA?.answered && !r.questionB?.answered)
    if (search.trim()) { const q = lookupKey(search); res = res.filter(r => lookupKey(r.accountName).includes(q)) }
    return res
  }, [rows, filterMode, search])

  const dtSurvey = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    return {
      date: new Intl.DateTimeFormat('es-MX', { day:'2-digit', month:'short', year:'numeric' }).format(d),
      time: new Intl.DateTimeFormat('es-MX', { hour:'2-digit', minute:'2-digit' }).format(d),
    }
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display:'flex', gap:14, marginBottom:28, flexWrap:'wrap' }}>
        {[
          { label:'Con survey respondido', value:withSurvey, sub:`de ${withContract} cuentas activas`, bg:'#d4eedd', border:'#a5d4b8', color:'#2a7a50', subColor:'#4c9466' },
          { label:'Ambas preguntas', value:bothAnswered, sub:'contestaron Tipo A y Tipo B', bg:'#fdf1ad', border:'#e4d870', color:'#8a6010', subColor:'#9a7020' },
          { label:'Pendientes', value:withContract-withSurvey, sub:'sin survey aplicado', bg:'#fde8e6', border:'#f0c0bc', color:'#a8453b', subColor:'#c0504a' },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:14, padding:'18px 24px', flex:1, minWidth:160, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:s.color, marginBottom:6 }}>{s.label}</div>
            <div style={{ fontSize:36, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:12, color:s.subColor, marginTop:6 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:220 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'#9aa0a6', pointerEvents:'none' }}>🔍</span>
          <input id="survey-search" type="text" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width:'100%', padding:'8px 12px 8px 36px', border:'1px solid rgba(20,36,92,0.15)', borderRadius:8, fontSize:13, background:'#fff', color:'var(--ink-900)', outline:'none', fontFamily:'var(--sans)' }} />
        </div>
        {(['all','done','pending'] as const).map(mode => {
          const labels = { all:'Todos', done:'✓ Respondidos', pending:'✗ Pendientes' }
          const active = filterMode === mode
          return (
            <button key={mode} onClick={() => setFilterMode(mode)} style={{ padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:600, border:`1px solid ${active ? 'var(--ink-800)' : 'rgba(20,36,92,0.15)'}`, background:active ? 'var(--ink-800)' : '#fff', color:active ? '#fdfcf8' : 'var(--char)', cursor:'pointer', transition:'all 0.15s', fontFamily:'var(--sans)' }}>
              {labels[mode]}
            </button>
          )
        })}
        <span style={{ fontSize:12, color:'#9aa0a6', marginLeft:4 }}>{filteredRows.length} cliente{filteredRows.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{ overflowX:'auto', borderRadius:12, boxShadow:'0 2px 12px rgba(20,36,92,0.08)', border:'1px solid rgba(20,36,92,0.08)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--sans)', fontSize:13, background:'#fff' }}>
          <thead>
            <tr style={{ background:'#f5f2ea' }}>
              {[
                { label:'Cliente', align:'left', width:'auto', sub:'' },
                { label:'Pregunta Tipo A', align:'center', width:150, sub:'Satisfacción General' },
                { label:'Pregunta Tipo B', align:'center', width:150, sub:'Objetivo Específico' },
                { label:'Último Survey', align:'center', width:160, sub:'' },
                { label:'Score A', align:'center', width:90, sub:'' },
                { label:'Score B', align:'center', width:90, sub:'' },
              ].map((col, i) => (
                <th key={i} style={{ padding:'13px 16px', textAlign:col.align as any, fontWeight:700, fontSize:10.5, letterSpacing:'.08em', textTransform:'uppercase', color:'#78808c', borderBottom:'2px solid #e4ddca', minWidth:col.width }}>
                  {col.label}{col.sub && <><br/><span style={{ fontWeight:400, textTransform:'none', fontSize:9.5, color:'#a8acb5', letterSpacing:0 }}>{col.sub}</span></>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding:'40px 16px', textAlign:'center', color:'#9aa0a6', fontSize:14, fontStyle:'italic' }}>No se encontraron clientes.</td></tr>
            ) : filteredRows.map((row, idx) => {
              const isEven = idx % 2 === 0
              const hasSurvey = row.questionA?.answered || row.questionB?.answered
              const dotColor = hasSurvey ? '#2a7a50' : row.hasContract ? '#a8453b' : '#ccc'
              const dt = dtSurvey(row.lastSurveyDate)
              return (
                <tr key={row.accountId} style={{ background: isEven ? '#fff' : '#faf8f3', borderBottom:'1px solid rgba(20,36,92,0.06)', opacity: row.hasContract ? 1 : 0.4, transition:'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0ede5')}
                  onMouseLeave={e => (e.currentTarget.style.background = isEven ? '#fff' : '#faf8f3')}>
                  <td style={{ padding:'15px 16px', verticalAlign:'middle' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:9, height:9, borderRadius:'50%', flexShrink:0, background:dotColor, boxShadow:`0 0 0 2px ${dotColor}22` }} />
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color:'#1c2027', lineHeight:1.2 }}>{row.accountName}</div>
                        {!row.hasContract && <div style={{ fontSize:10.5, color:'#9aa0a6', marginTop:1 }}>Sin contrato activo</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'15px 16px', textAlign:'center', verticalAlign:'middle' }}>
                    <SurveyCell answered={row.questionA?.answered ?? false} hasSurveyData={row.questionA !== null} question={row.questionA?.question} answer={row.questionA?.answer} />
                  </td>
                  <td style={{ padding:'15px 16px', textAlign:'center', verticalAlign:'middle' }}>
                    <SurveyCell answered={row.questionB?.answered ?? false} hasSurveyData={row.questionB !== null} question={row.questionB?.question} answer={row.questionB?.answer} />
                  </td>
                  <td style={{ padding:'15px 16px', textAlign:'center', verticalAlign:'middle' }}>
                    {dt ? <div><div style={{ fontSize:13, fontWeight:600, color:'#3d434c' }}>{dt.date}</div><div style={{ fontSize:10.5, color:'#9aa0a6', marginTop:2, fontFamily:'var(--mono)' }}>{dt.time}</div></div>
                      : <span style={{ fontSize:12, color:'#c8c4bc', fontStyle:'italic' }}>Sin survey</span>}
                  </td>
                  <td style={{ padding:'15px 16px', textAlign:'center', verticalAlign:'middle' }}><ScoreBadge score={row.questionA?.score ?? null} /></td>
                  <td style={{ padding:'15px 16px', textAlign:'center', verticalAlign:'middle' }}><ScoreBadge score={row.questionB?.score ?? null} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop:18, fontSize:11.5, color:'#a8acb5', fontStyle:'italic', lineHeight:1.5 }}>
        Pasa el cursor sobre ✓ o ✗ para ver la pregunta y respuesta. Las cuentas sin contrato aparecen atenuadas.
      </p>
    </div>
  )
}

// ─── Monday Tab ───────────────────────────────────────────────────────────────
function MondayTab() {
  const [boards, setBoards] = useState<MondayBoardWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        // First get boards from Consultoria Cuentas workspace
        const data = await mondayQuery<{ boards: any[] }>(`{
          boards(workspace_ids: [${MONDAY_WORKSPACE_ID}], limit: 100) {
            id name items_count
            items_page(limit: 100) {
              items {
                id name
                group { title }
                column_values {
                  id text value
                }
              }
            }
          }
        }`)
        const result: MondayBoardWithItems[] = (data.boards || [])
          .filter((b: any) => b.name && !['Prueba', 'Test'].includes(b.name))
          .map((b: any) => ({
            id: b.id,
            name: b.name,
            items_count: b.items_count ?? 0,
            items: (b.items_page?.items || []) as MondayItem[],
          }))
          .sort((a: MondayBoardWithItems, b: MondayBoardWithItems) => a.name.localeCompare(b.name))
        setBoards(result)
        if (result.length > 0) setSelectedBoard(result[0].id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar Monday')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const currentBoard = boards.find(b => b.id === selectedBoard)

  // Collect all unique status values for filter
  const allStatuses = useMemo(() => {
    if (!currentBoard) return []
    const set = new Set<string>()
    for (const item of currentBoard.items) {
      const sv = item.column_values.find(cv => cv.id === 'color_mm452en1')
      if (sv?.text) set.add(sv.text)
    }
    return Array.from(set).sort()
  }, [currentBoard])

  const filteredItems = useMemo(() => {
    if (!currentBoard) return []
    let items = currentBoard.items
    if (search.trim()) {
      const q = lookupKey(search)
      items = items.filter(item => lookupKey(item.name).includes(q))
    }
    if (statusFilter !== 'all') {
      items = items.filter(item => {
        const sv = item.column_values.find(cv => cv.id === 'color_mm452en1')
        return sv?.text === statusFilter
      })
    }
    return items
  }, [currentBoard, search, statusFilter])

  // Stats by Assignee/Responsable
  const statsByAssignee = useMemo(() => {
    if (!currentBoard) return []
    
    const map = new Map<string, { completed: number; overdue: number; inProgress: number; total: number }>()
    
    const isCompleted = (status: string) => {
      const t = status.toLowerCase()
      return t.includes('concluid') || t.includes('listo') || t.includes('terminad') || t.includes('done') || t.includes('complet')
    }

    const checkOverdue = (dateStr: string | null) => {
      if (!dateStr) return false
      const d = new Date(dateStr + 'T23:59:59')
      return d < new Date()
    }

    for (const item of currentBoard.items) {
      const statusVal = item.column_values.find(cv => cv.id === 'color_mm452en1')?.text || ''
      const dateVal   = item.column_values.find(cv => cv.id === 'date_mm45ncq9')?.text || null
      const respVal   = item.column_values.find(cv => cv.id === 'multiple_person_mm453tee')?.text || ''
      
      const done = isCompleted(statusVal)
      const overdue = !done && checkOverdue(dateVal)
      
      const assignees = respVal ? respVal.split(',').map(r => r.trim()) : ['Sin asignar']
      
      for (const name of assignees) {
        if (!map.has(name)) {
          map.set(name, { completed: 0, overdue: 0, inProgress: 0, total: 0 })
        }
        const s = map.get(name)!
        s.total++
        if (done) s.completed++
        else if (overdue) s.overdue++
        else s.inProgress++
      }
    }
    
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total)
  }, [currentBoard])

  // Group items by group title
  const groupedItems = useMemo(() => {
    const map = new Map<string, MondayItem[]>()
    for (const item of filteredItems) {
      const gTitle = item.group?.title || 'Sin grupo'
      if (!map.has(gTitle)) map.set(gTitle, [])
      map.get(gTitle)!.push(item)
    }
    return Array.from(map.entries())
  }, [filteredItems])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0', gap:16 }}>
      <div className="spinner" />
      <span style={{ fontSize:15, color:'var(--char)' }}>Conectando con Monday.com...</span>
    </div>
  )

  if (error) return (
    <div style={{ padding:'40px 20px', textAlign:'center' }}>
      <div style={{ fontSize:36, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:15, color:'#a8453b', fontWeight:600 }}>Error al cargar Monday</div>
      <p style={{ fontSize:13, color:'var(--char)', marginTop:8, maxWidth:400, margin:'8px auto 0' }}>{error}</p>
    </div>
  )

  return (
    <div style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
      {/* Sidebar: board list */}
      <div style={{
        width: 220,
        flexShrink: 0,
        position: 'sticky',
        top: 20,
        maxHeight: 'calc(100vh - 220px)',
        overflowY: 'auto',
        paddingRight: 8,
        borderRight: '1px solid rgba(20,36,92,0.08)'
      }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#78808c', marginBottom:10 }}>
          Clientes ({boards.length})
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {boards.map(board => {
            const active = board.id === selectedBoard
            return (
              <button key={board.id} onClick={() => { setSelectedBoard(board.id); setSearch(''); setStatusFilter('all') }}
                style={{ textAlign:'left', padding:'8px 10px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'var(--sans)', fontSize:12.5, fontWeight: active ? 700 : 400,
                  background: active ? 'var(--ink-800)' : 'transparent', color: active ? '#fdfcf8' : 'var(--char)', transition:'all 0.12s',
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{board.name}</span>
                <span style={{ fontSize:10, fontWeight:600, marginLeft:8, opacity:0.65, flexShrink:0,
                  background: active ? 'rgba(255,255,255,0.2)' : 'rgba(20,36,92,0.1)', borderRadius:999, padding:'1px 7px' }}>
                  {board.items_count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main: items for selected board */}
      <div style={{ flex:1, minWidth:0 }}>
        {currentBoard ? (
          <>
            {/* Avance por Responsable */}
            {statsByAssignee.length > 0 && (
              <div style={{
                background: '#fdfcf7',
                border: '1px solid rgba(20,36,92,0.08)',
                borderRadius: 12,
                padding: '16px 20px',
                marginBottom: 20,
                boxShadow: '0 1px 4px rgba(20,36,92,0.03)'
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#78808c', marginBottom: 12 }}>
                  Avance por Responsable
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                  {statsByAssignee.map(([name, stat]) => {
                    const pctCompleted = (stat.completed / stat.total) * 100
                    const pctOverdue = (stat.overdue / stat.total) * 100
                    const pctInProgress = (stat.inProgress / stat.total) * 100

                    return (
                      <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: '#1c2027' }}>{name}</span>
                          <span style={{ color: '#78808c', fontSize: 10.5, fontWeight: 600 }}>
                            {stat.total} tarea{stat.total !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {/* Segmented bar */}
                        <div style={{
                          display: 'flex',
                          height: 8,
                          borderRadius: 999,
                          background: 'rgba(20,36,92,0.06)',
                          overflow: 'hidden',
                          position: 'relative'
                        }}>
                          {stat.completed > 0 && (
                            <div style={{ width: `${pctCompleted}%`, background: 'var(--teal)', height: '100%' }} title={`${stat.completed} completadas (${Math.round(pctCompleted)}%)`} />
                          )}
                          {stat.inProgress > 0 && (
                            <div style={{ width: `${pctInProgress}%`, background: 'var(--amber)', height: '100%' }} title={`${stat.inProgress} en proceso (${Math.round(pctInProgress)}%)`} />
                          )}
                          {stat.overdue > 0 && (
                            <div style={{ width: `${pctOverdue}%`, background: 'var(--crimson)', height: '100%' }} title={`${stat.overdue} vencidas (${Math.round(pctOverdue)}%)`} />
                          )}
                        </div>
                        {/* Mini legends summary */}
                        <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 700, marginTop: 1 }}>
                          {stat.completed > 0 && (
                            <span style={{ color: 'var(--teal)' }}>
                              ✓ {stat.completed}
                            </span>
                          )}
                          {stat.inProgress > 0 && (
                            <span style={{ color: 'var(--amber)' }}>
                              ⏳ {stat.inProgress}
                            </span>
                          )}
                          {stat.overdue > 0 && (
                            <span style={{ color: 'var(--crimson)' }}>
                              ⚠️ {stat.overdue}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
              <div style={{ position:'relative', flex:1, minWidth:180 }}>
                <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#9aa0a6', pointerEvents:'none' }}>🔍</span>
                <input type="text" placeholder="Buscar tarea..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width:'100%', padding:'7px 12px 7px 32px', border:'1px solid rgba(20,36,92,0.15)', borderRadius:8, fontSize:13, background:'#fff', color:'var(--ink-900)', outline:'none', fontFamily:'var(--sans)' }} />
              </div>
              {allStatuses.length > 0 && (
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  style={{ padding:'7px 12px', borderRadius:8, border:'1px solid rgba(20,36,92,0.15)', fontSize:13, background:'#fff', color:'var(--char)', fontFamily:'var(--sans)', cursor:'pointer', outline:'none' }}>
                  <option value="all">Todos los estatus</option>
                  {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <span style={{ fontSize:12, color:'#9aa0a6' }}>{filteredItems.length} tarea{filteredItems.length !== 1 ? 's' : ''}</span>
            </div>

            {filteredItems.length === 0 ? (
              <p style={{ textAlign:'center', color:'#9aa0a6', fontStyle:'italic', padding:'40px 0' }}>No hay tareas con los filtros actuales.</p>
            ) : groupedItems.map(([groupTitle, items]) => (
              <div key={groupTitle} style={{ marginBottom:24 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'#78808c', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ flex:1, height:1, background:'rgba(20,36,92,0.1)' }} />
                  <span>{groupTitle}</span>
                  <div style={{ flex:1, height:1, background:'rgba(20,36,92,0.1)' }} />
                </div>
                <div style={{ overflowX:'auto', borderRadius:12, boxShadow:'0 2px 10px rgba(20,36,92,0.07)', border:'1px solid rgba(20,36,92,0.08)' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--sans)', fontSize:13, background:'#fff' }}>
                    <thead>
                      <tr style={{ background:'#f5f2ea' }}>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#78808c', borderBottom:'2px solid #e4ddca', width:'40%' }}>Tarea</th>
                        <th style={{ padding:'10px 14px', textAlign:'center', fontSize:10.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#78808c', borderBottom:'2px solid #e4ddca', minWidth:120 }}>Estatus</th>
                        <th style={{ padding:'10px 14px', textAlign:'center', fontSize:10.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#78808c', borderBottom:'2px solid #e4ddca', minWidth:110 }}>Fecha de Entrega</th>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#78808c', borderBottom:'2px solid #e4ddca', minWidth:130 }}>Responsable</th>
                        <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10.5, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'#78808c', borderBottom:'2px solid #e4ddca', minWidth:130 }}>Tipo de Trabajo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const isEven = idx % 2 === 0
                        const statusVal = item.column_values.find(cv => cv.id === 'color_mm452en1')?.text || ''
                        const dateVal   = item.column_values.find(cv => cv.id === 'date_mm45ncq9')?.text || ''
                        const responsible = item.column_values.find(cv => cv.id === 'multiple_person_mm453tee')?.text || ''
                        const workType = item.column_values.find(cv => cv.id === 'color_mm4513mj')?.text || ''
                        const linkJson = item.column_values.find(cv => cv.id === 'link_mm45byn3')?.value
                        
                        let deliverableUrl = ''
                        let deliverableLabel = ''
                        if (linkJson) {
                          try {
                            const parsed = JSON.parse(linkJson)
                            deliverableUrl = parsed.url || ''
                            const rawLabel = parsed.text || parsed.url || ''
                            
                            // Make label friendly & short to save screen space
                            if (deliverableUrl.includes('docs.google.com/presentation')) {
                              deliverableLabel = '📊 Presentación Google'
                            } else if (deliverableUrl.includes('docs.google.com/document')) {
                              deliverableLabel = '📝 Documento Google'
                            } else if (deliverableUrl.includes('docs.google.com/spreadsheets')) {
                              deliverableLabel = '📁 Hoja de Cálculo'
                            } else if (deliverableUrl.includes('drive.google.com')) {
                              deliverableLabel = '📂 Google Drive'
                            } else {
                              deliverableLabel = rawLabel.length > 25 ? '🔗 Entregable' : `🔗 ${rawLabel}`
                            }
                          } catch {
                            // Try fallback if JSON parsing fails
                          }
                        }

                        const sc = statusColor(statusVal)
                        const overdue = isOverdue(dateVal)
                        return (
                          <tr key={item.id} style={{ background: isEven ? '#fff' : '#faf8f3', borderBottom:'1px solid rgba(20,36,92,0.06)', transition:'background 0.1s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f0ede5')}
                            onMouseLeave={e => (e.currentTarget.style.background = isEven ? '#fff' : '#faf8f3')}>
                            <td style={{ padding:'10px 14px', verticalAlign:'middle', maxWidth: 300, wordBreak: 'break-word' }}>
                              <div style={{ fontWeight:600, color:'#1c2027', lineHeight:1.35 }}>{item.name}</div>
                              {deliverableUrl && (
                                <div style={{ marginTop: 6 }}>
                                  <a href={deliverableUrl} target="_blank" rel="noopener noreferrer" 
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 5,
                                      fontSize: 11, color: '#1d5ca8', background: 'rgba(39,96,185,0.06)',
                                      padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(39,96,185,0.15)',
                                      textDecoration: 'none', fontWeight: 600, transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(39,96,185,0.12)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(39,96,185,0.06)')}
                                  >
                                    {deliverableLabel}
                                  </a>
                                </div>
                              )}
                            </td>
                            <td style={{ padding:'10px 14px', textAlign:'center', verticalAlign:'middle' }}>
                              {statusVal ? (
                                <span style={{ display:'inline-block', padding:'4px 10px', borderRadius:999, fontSize:11.5, fontWeight:600, background:sc.bg, color:sc.color, border:`1px solid ${sc.border}` }}>
                                  {statusVal}
                                </span>
                              ) : <span style={{ color:'#ccc' }}>--</span>}
                            </td>
                            <td style={{ padding:'10px 14px', textAlign:'center', verticalAlign:'middle' }}>
                              {dateVal ? (
                                <span style={{ fontSize:12.5, fontWeight: overdue ? 700 : 500, color: overdue ? '#a8453b' : '#3d434c', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                                  {overdue && <span title="Vencida" style={{ fontSize:14 }}>⚠️</span>}
                                  {fmtDate(dateVal)}
                                </span>
                              ) : <span style={{ color:'#ccc', fontSize:12.5 }}>Sin fecha</span>}
                            </td>
                            <td style={{ padding:'10px 14px', verticalAlign:'middle' }}>
                              {responsible ? (
                                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                  {responsible.split(',').map((r, i) => (
                                    <span key={i} style={{ fontSize:11.5, background:'rgba(39,69,133,0.06)', color:'#274585', padding:'1px 7px', borderRadius:999, border:'1px solid rgba(39,69,133,0.12)' }}>{r.trim()}</span>
                                  ))}
                                </div>
                              ) : <span style={{ color:'#ccc', fontSize:12.5 }}>--</span>}
                            </td>
                            <td style={{ padding:'10px 14px', verticalAlign:'middle' }}>
                              {workType ? (
                                <span style={{ fontSize:12.5, fontWeight: 500, color:'var(--char)' }}>{workType}</span>
                              ) : <span style={{ color:'#ccc', fontSize:12.5 }}>--</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        ) : (
          <p style={{ color:'#9aa0a6', fontStyle:'italic' }}>Selecciona un cliente del panel izquierdo.</p>
        )}
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [analyses, setAnalyses] = useState<DailyAnalysis[]>([])
  const [groups, setGroups]     = useState<WaGroup[]>([])
  const [checklists, setChecklists] = useState<{ folder: string; data: any }[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'survey' | 'monday'>('survey')

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null)
      try {
        const [analysisRows, groupRows] = await Promise.all([
          supabaseGet<DailyAnalysis[]>('/rest/v1/wa_daily_analysis?select=id,account_id,group_jid,group_name,analysis_date,analyzed_at,raw_analysis&order=analyzed_at.desc&limit=500'),
          supabaseGet<WaGroup[]>('/rest/v1/wa_groups?select=jid,name,account_id,active&order=name.asc'),
        ])
        setAnalyses(analysisRows); setGroups(groupRows)
      } catch (err) { setError(err instanceof Error ? err.message : 'Error desconocido') }
      finally { setLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    async function loadChecklists() {
      const results = await Promise.all(ACCOUNT_FOLDERS.map(async folder => {
        try { const r = await fetch(`/data/accounts/${folder}/checklist.json`); if (r.ok) return { folder, data: await r.json() } } catch { /* skip */ }
        return null
      }))
      setChecklists(results.filter(Boolean) as { folder: string; data: any }[])
    }
    loadChecklists()
  }, [])

  const Rings = () => <div className="lb-rings">{Array.from({ length: 9 }).map((_, i) => <div className="lb-ring" key={i} />)}</div>

  if (loading) return (
    <div className="lb-shell">
      <div className="lb-book"><div className="lb-page">
        <div className="lb-lines" /><div className="lb-margin" />
        <div className="lb-spine"><Rings /></div>
        <div className="lb-content" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
          <div style={{ textAlign:'center' }}>
            <div className="spinner" style={{ margin:'0 auto 16px' }} />
            <span className="lb-eyebrow">Conectando a Supabase</span>
            <h1 style={{ fontFamily:'var(--caveat)', fontSize:36, margin:'4px 0 0', color:'var(--ink-900)' }}>Cargando datos...</h1>
          </div>
        </div>
      </div></div>
    </div>
  )

  if (error) return (
    <div className="lb-shell">
      <div className="lb-book"><div className="lb-page">
        <div className="lb-lines" /><div className="lb-margin" />
        <div className="lb-spine"><Rings /></div>
        <div className="lb-content" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
          <div style={{ textAlign:'center' }}>
            <span className="lb-eyebrow" style={{ color:'#a8453b' }}>Error de conexión</span>
            <h1 style={{ fontFamily:'var(--caveat)', fontSize:36, margin:'4px 0 12px', color:'#a8453b' }}>No se pudieron leer datos</h1>
            <p style={{ fontSize:13, color:'var(--char)', maxWidth:420 }}>{error}</p>
          </div>
        </div>
      </div></div>
    </div>
  )

  return (
    <div className="lb-shell">
      <div className="lb-book">
        <div className="lb-page">
          <div className="lb-lines" />
          <div className="lb-margin" />
          <div className="lb-spine"><Rings /></div>
          <div className="lb-content">

            {/* Header */}
            <div className="lb-header-row">
              <div>
                <span className="lb-eyebrow">Satisfacción del Cliente</span>
                <h1 className="lb-h1">{activeTab === 'survey' ? 'Survey Dashboard' : 'Tareas Monday'}</h1>
                <p className="lb-subtext">
                  {activeTab === 'survey'
                    ? 'Seguimiento de preguntas bimestrales de satisfacción por cliente.'
                    : 'Tableros de tareas por cliente — Consultoria Cuentas.'}
                </p>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'var(--caveat)', fontSize:28, fontWeight:700, color:'#3a3a44', lineHeight:1.1, marginBottom:12 }}>
                  {new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric', timeZone:'America/Mexico_City' })}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:4, marginBottom:28, borderBottom:'2px solid rgba(20,36,92,0.1)', paddingBottom:0 }}>
              {([
                { id:'survey', label:'📋 Survey de Satisfacción' },
                { id:'monday', label:'📌 Tareas Monday' },
              ] as const).map(tab => {
                const active = activeTab === tab.id
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    style={{ padding:'10px 20px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer', fontFamily:'var(--sans)', fontSize:13.5, fontWeight: active ? 700 : 500,
                      background: active ? '#fff' : 'transparent', color: active ? 'var(--ink-900)' : 'var(--char)',
                      borderBottom: active ? '2px solid var(--ink-800)' : '2px solid transparent', marginBottom:-2,
                      transition:'all 0.15s' }}>
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Tab content */}
            {activeTab === 'survey'
              ? <SurveyTab analyses={analyses} groups={groups} checklists={checklists} />
              : <MondayTab />}

          </div>
        </div>
      </div>
    </div>
  )
}
