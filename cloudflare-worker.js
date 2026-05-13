/**
 * Cloudflare Worker — proxy trasparente per sottodomini piumapp.com
 *
 * Deploy: Cloudflare Dashboard → Workers → Create Worker → incolla questo codice
 * Route:  *piumapp.com/* (oppure *.piumapp.com/*)
 *
 * Comportamento:
 *   mario.piumapp.com/qualsiasi/path?query
 *     → fetch https://www.piumapp.com/qualsiasi/path?query
 *     → la SPA React carica, legge window.location.hostname = "mario.piumapp.com"
 *     → PublicSite.jsx estrae "mario" come slug e carica i dati dell'attività
 *
 * www.piumapp.com e piumapp.com (senza sottodominio) passano direttamente,
 * senza proxy.
 */

export default {
  async fetch(request) {
    const url   = new URL(request.url)
    const parts = url.hostname.split('.')

    // Passa direttamente: www, dominio nudo (es. piumapp.com), localhost
    if (parts.length < 3 || parts[0] === 'www') {
      return fetch(request)
    }

    // Sottodominio rilevato: proxy trasparente verso www.piumapp.com
    const target = new URL(request.url)
    target.hostname = 'www.piumapp.com'

    const proxied = new Request(target.toString(), {
      method:  request.method,
      headers: request.headers,
      body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    })

    return fetch(proxied)
  },
}
