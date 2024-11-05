import defaultAxios from 'axios'
import rateLimit from 'axios-rate-limit'

export const axios = /*#__PURE__*/ rateLimit(
  /*#__PURE__*/ defaultAxios.create(),
  { maxRequests: 100 }
)
