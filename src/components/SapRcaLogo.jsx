import React from 'react'

const BASE_URL = import.meta.env.BASE_URL

export default function SapRcaLogo({ compact = false }) {
  return (
    <span className={`sphereLogo ${compact ? 'compact' : ''}`} aria-hidden="true">
      <picture>
        <source srcSet={`${BASE_URL}branding/logo/sphere-logo-navbar-dark.webp`} type="image/webp" />
        <img
          className="sphereLogoImage"
          src={`${BASE_URL}branding/logo/sphere-logo-navbar-dark.png`}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
      </picture>
    </span>
  )
}
