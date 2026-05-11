export function countItems(value) {
  return Array.isArray(value) ? value.length : Number(value || 0) || 0
}

export function limitList(value, limit = 3) {
  return Array.isArray(value) ? value.slice(0, limit) : []
}

export function toUpperText(value, fallback = 'INFO') {
  return String(value || fallback).toUpperCase()
}
