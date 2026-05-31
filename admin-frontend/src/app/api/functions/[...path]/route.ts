import { NextRequest, NextResponse } from 'next/server'
import { getCloudFunctionsTargetUrl } from '@/lib/services/cloudFunctions'

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const proxyRequest = async (
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) => {
  const resolvedParams = await params
  const targetUrl = new URL(
    `${(resolvedParams.path || []).map(encodeURIComponent).join('/')}`,
    `${getCloudFunctionsTargetUrl().replace(/\/+$/, '')}/`,
  )

  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value)
  })

  const headers = new Headers(request.headers)
  hopByHopHeaders.forEach((headerName) => headers.delete(headerName))

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text()
  }

  const response = await fetch(targetUrl, init)
  const responseHeaders = new Headers(response.headers)
  hopByHopHeaders.forEach((headerName) => responseHeaders.delete(headerName))

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  })
}

export const GET = proxyRequest
export const HEAD = proxyRequest
export const OPTIONS = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const PATCH = proxyRequest
export const DELETE = proxyRequest