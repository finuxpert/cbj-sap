SPHERE BRANDING PACKAGE
=======================

Brand:
SPHERE
SAP Performance Health Evaluation & Reporting

RECOMMENDED FILES FOR CURRENT DARK NAVBAR
-----------------------------------------
1. logo/sphere-logo-navbar-dark.png
   Use in the current dark header/navbar.

2. icon/sphere-icon-512.png
   Main SPHERE icon / app icon.

3. favicon/favicon.ico
   Browser favicon bundle.

4. favicon/sphere-favicon-192.png
5. favicon/sphere-favicon-512.png
   PWA / mobile icons.

OTHER VARIANTS
--------------
logo/sphere-logo-navbar-light.png
  For light navbar/header.

logo/sphere-logo-horizontal-dark.png
  Full logo + subtitle for dark background.

logo/sphere-logo-horizontal-light.png
  Full logo + subtitle for light background.

logo/sphere-wordmark-dark.png
  Text-only SPHERE for dark background.

logo/sphere-wordmark-light.png
  Text-only SPHERE for light background.

WEBP versions are included for navbar/full logos.

SUGGESTED SERVER STRUCTURE
--------------------------
branding/
  logo/
  icon/
  favicon/
  site.webmanifest

If the files are served by your application, suggested URLs:
  /branding/logo/sphere-logo-navbar-dark.png
  /branding/icon/sphere-icon-512.png
  /branding/favicon/favicon.ico

For a Vite source repository, a practical location is:
  public/branding/

After npm run build, these files are copied into:
  dist/branding/

IMPORTANT FOR YOUR TWO DEPLOYMENTS
----------------------------------
DEV:
  https://sapdev.cbj-kontruksi.com/

PROD:
  https://cbj-kontruksi.com/sap/

Avoid hardcoding "/branding/..." if the PROD app is hosted under /sap/.
Use import.meta.env.BASE_URL or a relative/base-aware asset path.

Example:
  const base = import.meta.env.BASE_URL
  const logo = `${base}branding/logo/sphere-logo-navbar-dark.png`

Recommended navbar display height:
  34-42px desktop
  30-36px mobile

Recommended favicon:
  branding/favicon/favicon.ico
