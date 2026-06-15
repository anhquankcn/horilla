// Build-time feature flags. Vite statically replaces import.meta.env.VITE_* at
// build time, so these compile to constant booleans per environment.
//
// VITE_WC2026_ENABLED: bật ở staging (.env.stage build arg), tắt mặc định ở
// production — code WC2026 vẫn nằm trong bundle nhưng route + entry card bị ẩn.
export const WC2026_ENABLED = import.meta.env.VITE_WC2026_ENABLED === 'true'
