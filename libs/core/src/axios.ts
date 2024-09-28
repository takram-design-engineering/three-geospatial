import defaultAxios from 'axios'
import rateLimit from 'axios-rate-limit'

export const axios = rateLimit(defaultAxios.create(), { maxRequests: 100 })
