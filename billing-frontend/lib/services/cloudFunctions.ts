const DEFAULT_PUBLIC_BASE_URL = '/api/functions'
const DEFAULT_TARGET_BASE_URL = 'http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1'

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')
const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '')

export const getCloudFunctionsBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_CLOUD_FUNCTIONS_URL || DEFAULT_PUBLIC_BASE_URL

export const getCloudFunctionsTargetUrl = (): string =>
  process.env.CLOUD_FUNCTIONS_TARGET_URL || DEFAULT_TARGET_BASE_URL

export const buildCloudFunctionsUrl = (
  path: string,
  query: Record<string, string | undefined | null> = {},
): string => {
  const baseUrl = trimTrailingSlash(getCloudFunctionsBaseUrl())
  const normalizedPath = trimLeadingSlash(path)
  const url = `${baseUrl}/${normalizedPath}`
  const searchParams = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value)
    }
  })

  const queryString = searchParams.toString()
  return queryString ? `${url}?${queryString}` : url
}