import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import VCard from 'vcf'

const MONTHS = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']

const PICKER_SUPPORTED = typeof navigator !== 'undefined'
  && 'contacts' in navigator
  && 'ContactsManager' in window

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function fmtDuration(m) {
  if (!m) return null
  const h = Math.floor(m / 60); const r = m % 60
  return r ? `${h}h ${r}min` : h ? `${h}h` : `${m} min`
}

function fmtCurrency(v) {
  if (v == null || v === 0) return null
  return `€${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function buildWaLink(phone) {
  if (!phone) return null
  return `https://wa.me/${phone.trim().replace(/^\+/, '').replace(/\s+/g, '')}`
}

function phoneKey(phone) {
  return phone?.trim().replace(/\s+/g, '') || null
}

// Parsa il testo di un file .vcf e restituisce array { name, phone }
function parseVcfText(text) {
  try {
    // La libreria vcf richiede CRLF; normalizza LF → CRLF prima di parsare
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
    const cards = VCard.parse(normalized)
    return cards.map(card => {
      const fnProp  = card.get('fn')
      const telProp = card.get('tel')
      const name = (Array.isArray(fnProp) ? fnProp[0] : fnProp)?.valueOf()?.trim() || null
      const tel  = (Array.isArray(telProp) ? telProp[0] : telProp)?.valueOf()?.trim() || null
      return { name: name || '—', phone: tel }
    }).filter(c => c.name && c.name !== '—')
  } catch {
    return []
  }
}

// Merge contatti importati + appuntamenti in un'unica lista deduplicata.
// Gli appuntamenti hanno priorità su nome e telefono rispetto ai contatti.
function groupClients(appointments, contacts = []) {
  const map = new Map()

  // 1. Seed dai contatti importati (priorità più bassa)
  for (const ct of contacts) {
    const key = phoneKey(ct.phone) ?? ('__name__' + ct.name.trim().toLowerCase())
    if (!map.has(key)) {
      map.set(key, {
        key,
        name:         ct.name,
        phone:        phoneKey(ct.phone),
        email:        ct.email || null,
        source:       ct.source ?? 'manual',
        contactId:    ct.id,
        notes:        ct.notes || '',
        appointments: [],
        spent:        0,
        firstVisit:   null,
        lastVisit:    null,
      })
    }
  }

  // 2. Sovrapponi gli appuntamenti (priorità più alta)
  const sorted = [...appointments].sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const apt of sorted) {
    const key = phoneKey(apt.client_phone) ?? ('__name__' + apt.client_name.trim().toLowerCase())

    if (!map.has(key)) {
      map.set(key, {
        key,
        name:         apt.client_name,
        phone:        phoneKey(apt.client_phone),
        email:        null,
        source:       'appointment',
        contactId:    null,
        notes:        '',
        appointments: [],
        spent:        0,
        firstVisit:   apt.date,
        lastVisit:    apt.date,
      })
    }

    const c = map.get(key)
    c.appointments.push(apt)
    c.name      = apt.client_name
    c.lastVisit  = apt.date > (c.lastVisit ?? '') ? apt.date : c.lastVisit
    c.firstVisit = c.firstVisit === null || apt.date < c.firstVisit ? apt.date : c.firstVisit
    if (!c.phone && phoneKey(apt.client_phone)) c.phone = phoneKey(apt.client_phone)
    if (apt.completed && apt.price != null) c.spent += Number(apt.price)
  }

  // Clienti con visite: ordinati per lastVisit desc; contatti senza visite: in fondo per nome
  return Array.from(map.values()).sort((a, b) => {
    if (a.lastVisit && b.lastVisit) return b.lastVisit.localeCompare(a.lastVisit)
    if (a.lastVisit) return -1
    if (b.lastVisit) return 1
    return a.name.localeCompare(b.name)
  })
}

function avgFrequency(client) {
  if (client.appointments.length < 2) return null
  const days = Math.round(
    (new Date(client.lastVisit) - new Date(client.firstVisit)) / 86400000
  )
  return Math.round(days / (client.appointments.length - 1))
}

/* ── Component ── */
export default function Clienti({ business }) {
  const [appointments, setAppointments] = useState([])
  const [contacts,     setContacts]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [drawer,       setDrawer]       = useState(null)

  // Import modal state
  const [showImport,     setShowImport]     = useState(false)
  const [importStep,     setImportStep]     = useState('choose') // 'choose' | 'preview' | 'done'
  const [previewList,    setPreviewList]    = useState([])       // { name, phone }[]
  const [previewSource,  setPreviewSource]  = useState('')
  const [importing,      setImporting]      = useState(false)
  const [importResult,   setImportResult]   = useState(null)     // { imported, skipped }
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!business) return
    Promise.all([
      supabase
        .from('appointments')
        .select('id, client_name, client_phone, date, start_time, duration_minutes, price, notes, completed, employees(name, color), appointment_services(service_id, price_snapshot, duration_snapshot, services(name))')
        .eq('business_id', business.id)
        .order('date', { ascending: false }),
      supabase
        .from('contacts')
        .select('id, name, phone, email, notes, source')
        .eq('business_id', business.id)
        .order('name'),
    ]).then(([{ data: apts }, { data: cts }]) => {
      setAppointments(apts ?? [])
      setContacts(cts ?? [])
      setLoading(false)
    })
  }, [business])

  const clients = useMemo(() => groupClients(appointments, contacts), [appointments, contacts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q))
    )
  }, [clients, search])

  // Blocca scroll body quando drawer o modal import sono aperti
  useEffect(() => {
    document.body.style.overflow = (drawer || showImport) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawer, showImport])

  /* ── Import handlers ── */

  const openImport = () => {
    setImportStep('choose')
    setPreviewList([])
    setImportResult(null)
    setShowImport(true)
  }

  const closeImport = () => {
    setShowImport(false)
  }

  const reloadContacts = async () => {
    const { data: cts } = await supabase
      .from('contacts')
      .select('id, name, phone, email, notes, source')
      .eq('business_id', business.id)
      .order('name')
    setContacts(cts ?? [])
  }

  // Dedup + INSERT in batch; restituisce { imported, skipped }
  const doImport = async (list, source) => {
    const { data: existing } = await supabase
      .from('contacts')
      .select('phone')
      .eq('business_id', business.id)
      .not('phone', 'is', null)

    const existingKeys = new Set(
      (existing ?? []).map(c => phoneKey(c.phone)).filter(Boolean)
    )

    const toInsert = list.filter(c => {
      if (!phoneKey(c.phone)) return true   // senza telefono: importa sempre
      return !existingKeys.has(phoneKey(c.phone))
    })

    if (toInsert.length > 0) {
      await supabase.from('contacts').insert(
        toInsert.map(c => ({
          business_id: business.id,
          name:        c.name,
          phone:       phoneKey(c.phone) ?? null,
          source,
        }))
      )
    }

    // Ricarica contacts
    const { data: updated } = await supabase
      .from('contacts')
      .select('id, name, phone, email, notes, source')
      .eq('business_id', business.id)
      .order('name')
    setContacts(updated ?? [])

    return { imported: toInsert.length, skipped: list.length - toInsert.length }
  }

  // Metodo 1 — Contact Picker API (Android Chrome)
  const handlePickerImport = async () => {
    try {
      const results = await navigator.contacts.select(['name', 'tel'], { multiple: true })
      const parsed = results
        .map(r => ({
          name:  r.name?.[0]?.trim() || '—',
          phone: r.tel?.[0]?.trim()  || null,
        }))
        .filter(c => c.name && c.name !== '—')
      setPreviewList(parsed)
      setPreviewSource('android_picker')
      setImportStep('preview')
    } catch {
      // Utente ha annullato — non fare nulla
    }
  }

  // Metodo 2 — file .vcf
  const handleVcfChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseVcfText(ev.target.result)
      setPreviewList(parsed)
      setPreviewSource('vcf_import')
      setImportStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''   // reset per permettere ri-selezione dello stesso file
  }

  const confirmImport = async () => {
    setImporting(true)
    const result = await doImport(previewList, previewSource)
    setImportResult(result)
    setImportStep('done')
    setImporting(false)
  }

  if (loading) return <div className="db-section"><p className="db-card-empty">Caricamento…</p></div>

  return (
    <div className="db-section">

      {/* Toolbar */}
      <div className="cl-toolbar">
        <div className="cl-search-wrap">
          <svg className="cl-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="cl-search-input"
            type="text"
            placeholder="Cerca per nome o telefono…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="cl-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <button className="cl-import-btn" onClick={openImport} title="Importa contatti">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="21" y1="11" x2="15" y2="11"/><line x1="18" y1="8" x2="18" y2="14"/></svg>
          Importa
        </button>
      </div>

      {/* Lista clienti */}
      {filtered.length === 0 ? (
        <p className="db-card-empty">
          {clients.length === 0
            ? 'Nessun cliente ancora. I clienti appariranno automaticamente dopo il primo appuntamento.'
            : 'Nessun cliente trovato per questa ricerca.'}
        </p>
      ) : (
        <div className="cl-list">
          {filtered.map(c => {
            const waLink = buildWaLink(c.phone)
            return (
              <div key={c.key} className="cl-row" onClick={() => setDrawer(c)}>
                <div className="cl-avatar">{c.name.trim()[0]?.toUpperCase() ?? '?'}</div>
                <div className="cl-info">
                  <span className="cl-name">{c.name}</span>
                  {c.phone && (
                    <span className="cl-phone">
                      {c.phone}
                      {waLink && (
                        <a
                          className="cl-wa-btn"
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          title="Apri WhatsApp"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          WA
                        </a>
                      )}
                    </span>
                  )}
                </div>
                <div className="cl-meta">
                  {c.appointments.length > 0
                    ? <span className="cl-meta-appt">{c.appointments.length} {c.appointments.length === 1 ? 'visita' : 'visite'}</span>
                    : <span className="cl-meta-no-visits">Nessuna visita</span>
                  }
                  {c.spent > 0 && <span className="cl-meta-spent">{fmtCurrency(c.spent)}</span>}
                  {c.lastVisit
                    ? <span className="cl-meta-date">{fmtDate(c.lastVisit)}</span>
                    : <span className="cl-meta-source">contatto</span>
                  }
                </div>
                <svg className="cl-row-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            )
          })}
        </div>
      )}

      {/* Drawer scheda cliente */}
      {drawer && (
        <ClientDrawer client={drawer} business={business} onClose={() => setDrawer(null)} onReload={reloadContacts} />
      )}

      {/* Modal importazione contatti */}
      {showImport && (
        <div className="sv-modal-overlay" onClick={e => e.target === e.currentTarget && closeImport()}>
          <div className="sv-modal cl-import-modal">
            <div className="sv-modal-header">
              <h2 className="sv-modal-title">
                {importStep === 'done' ? 'Importazione completata' : 'Importa contatti'}
              </h2>
              <button className="sv-modal-close" onClick={closeImport}><IconX /></button>
            </div>

            <div className="sv-modal-body">

              {/* Step 1 — scelta metodo */}
              {importStep === 'choose' && (
                <div className="cl-import-methods">
                  {PICKER_SUPPORTED && (
                    <button className="cl-import-method-btn" onClick={handlePickerImport}>
                      <div className="cl-import-method-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      </div>
                      <div className="cl-import-method-text">
                        <div className="cl-import-method-title">Importa dalla rubrica</div>
                        <div className="cl-import-method-desc">Seleziona i contatti direttamente dalla tua rubrica telefonica</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  )}

                  <label className="cl-import-method-btn">
                    <div className="cl-import-method-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                    </div>
                    <div className="cl-import-method-text">
                      <div className="cl-import-method-title">Importa file vCard (.vcf)</div>
                      <div className="cl-import-method-desc">Esporta i contatti da iPhone o Android come file .vcf</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".vcf,text/vcard"
                      onChange={handleVcfChange}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              )}

              {/* Step 2 — anteprima */}
              {importStep === 'preview' && (
                <>
                  <p className="cl-import-preview-summary">
                    Trovati <strong>{previewList.length}</strong> {previewList.length === 1 ? 'contatto' : 'contatti'}
                    {previewList.length === 0 && ' — nessun contatto valido nel file.'}
                  </p>
                  {previewList.length > 0 && (
                    <div className="cl-import-preview-list">
                      {previewList.map((c, i) => (
                        <div key={i} className="cl-import-preview-row">
                          <span className="cl-import-preview-name">{c.name}</span>
                          {c.phone && <span className="cl-import-preview-phone">{c.phone}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Step 3 — risultato */}
              {importStep === 'done' && importResult && (
                <div className="cl-import-result">
                  <div className="cl-import-result-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <p className="cl-import-result-text">
                    Importati <strong>{importResult.imported}</strong> {importResult.imported === 1 ? 'contatto' : 'contatti'}
                    {importResult.skipped > 0 && (
                      <>, <span className="cl-import-result-skipped">{importResult.skipped} già presenti saltati</span></>
                    )}
                  </p>
                </div>
              )}

            </div>

            {/* Footer */}
            {importStep === 'preview' && previewList.length > 0 && (
              <div className="sv-modal-footer">
                <button className="sv-btn-cancel" onClick={() => setImportStep('choose')}>Indietro</button>
                <button className="sv-btn-save" onClick={confirmImport} disabled={importing}>
                  {importing ? 'Importazione…' : `Importa tutti (${previewList.length})`}
                </button>
              </div>
            )}
            {importStep === 'preview' && previewList.length === 0 && (
              <div className="sv-modal-footer">
                <button className="sv-btn-cancel" onClick={() => setImportStep('choose')}>Indietro</button>
              </div>
            )}
            {importStep === 'done' && (
              <div className="sv-modal-footer">
                <button className="sv-btn-save" onClick={closeImport}>Chiudi</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

/* ── ClientDrawer ── */
function ClientDrawer({ client, business, onClose, onReload }) {
  const waLink = buildWaLink(client.phone)
  const freq   = avgFrequency(client)

  const [editName,  setEditName]  = useState(client.name  || '')
  const [editPhone, setEditPhone] = useState(client.phone || '')
  const [editNotes, setEditNotes] = useState(client.notes || '')
  const [saving,    setSaving]    = useState(false)

  const apts = [...client.appointments]
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.start_time > a.start_time ? 1 : -1))

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      name:  editName.trim() || client.name,
      phone: phoneKey(editPhone) || null,
      notes: editNotes.trim() || null,
    }
    if (client.contactId) {
      await supabase.from('contacts').update(payload).eq('id', client.contactId)
    } else {
      await supabase.from('contacts').insert({ ...payload, business_id: business.id, source: 'manual' })
    }
    await onReload()
    setSaving(false)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="adm-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-drawer">

        {/* Header */}
        <div className="adm-drawer-header">
          <div className="adm-drawer-title-wrap">
            <div className="cl-drawer-avatar">{client.name.trim()[0]?.toUpperCase() ?? '?'}</div>
            <div>
              <div className="adm-drawer-title">{client.name}</div>
              {client.phone && (
                <div className="cl-drawer-phone">
                  {client.phone}
                  {waLink && (
                    <a className="cl-drawer-wa" href={waLink} target="_blank" rel="noopener noreferrer">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              )}
              {client.firstVisit
                ? <div className="adm-drawer-subtitle">Prima visita: {fmtDate(client.firstVisit)}</div>
                : <div className="adm-drawer-subtitle">Contatto importato — nessuna visita</div>
              }
            </div>
          </div>
          <button className="adm-drawer-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="adm-drawer-body">

          {/* Riepilogo */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Riepilogo</div>
            <div className="cl-stats-grid">
              <div className="cl-stat">
                <span className="cl-stat-value">{client.appointments.length}</span>
                <span className="cl-stat-label">{client.appointments.length === 1 ? 'visita' : 'visite totali'}</span>
              </div>
              <div className="cl-stat">
                <span className="cl-stat-value">{client.spent > 0 ? fmtCurrency(client.spent) : '—'}</span>
                <span className="cl-stat-label">totale speso</span>
              </div>
              <div className="cl-stat">
                <span className="cl-stat-value">{freq ? `${freq}gg` : '—'}</span>
                <span className="cl-stat-label">frequenza media</span>
              </div>
            </div>
          </div>

          {/* Modifica contatto */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Modifica contatto</div>
            <div className="cl-edit-form">
              <div className="cl-edit-field">
                <label className="cl-edit-label">Nome</label>
                <input
                  className="sv-input"
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                />
              </div>
              <div className="cl-edit-field">
                <label className="cl-edit-label">Telefono</label>
                <input
                  className="sv-input"
                  type="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="+39 333 000 0000"
                />
              </div>
              <div className="cl-edit-field">
                <label className="cl-edit-label">Note</label>
                <textarea
                  className="sv-textarea"
                  rows={3}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Preferenze, allergie, informazioni utili…"
                />
              </div>
              <button className="sv-btn-save" style={{ width: '100%' }} onClick={handleSave} disabled={saving}>
                {saving ? 'Salvataggio…' : 'Salva modifiche'}
              </button>
            </div>
          </div>

          {/* Storico appuntamenti */}
          <div className="adm-drawer-section">
            <div className="adm-drawer-section-title">Storico visite</div>
            {apts.length === 0 ? (
              <p className="cl-apt-empty">Nessuna visita ancora.</p>
            ) : (
              <div className="cl-apt-list">
                {apts.map(apt => (
                  <div key={apt.id} className={`cl-apt-item ${apt.completed ? 'cl-apt-item--done' : ''}`}>
                    <div className="cl-apt-header">
                      <span className="cl-apt-date">{fmtDate(apt.date)}</span>
                      {apt.start_time && (
                        <span className="cl-apt-time">{apt.start_time.slice(0, 5)}</span>
                      )}
                      {apt.completed && <span className="cl-apt-done-badge">✓</span>}
                    </div>
                    {apt.appointment_services?.length > 0 ? (
                      <div className="cl-apt-services">
                        {apt.appointment_services.map((s, i) => (
                          <span key={s.service_id ?? i} className="cl-apt-svc-tag">
                            {s.services?.name ?? '—'}
                          </span>
                        ))}
                        {apt.price != null && (
                          <span className="cl-apt-detail cl-apt-detail--price">{fmtCurrency(apt.price)}</span>
                        )}
                      </div>
                    ) : (
                      <div className="cl-apt-details">
                        {apt.duration_minutes && (
                          <span className="cl-apt-detail">{fmtDuration(apt.duration_minutes)}</span>
                        )}
                        {apt.price != null && (
                          <span className="cl-apt-detail cl-apt-detail--price">{fmtCurrency(apt.price)}</span>
                        )}
                      </div>
                    )}
                    {apt.employees?.name && (
                      <div className="cl-apt-details" style={{ marginTop: 2 }}>
                        <span className="cl-apt-detail">
                          <span className="cl-emp-dot" style={{ background: apt.employees.color }} />
                          {apt.employees.name}
                        </span>
                      </div>
                    )}
                    {apt.notes && <p className="cl-apt-notes">{apt.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

function IconX() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
