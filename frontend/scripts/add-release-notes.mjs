/**
 * Release notes CLI — DEPRECATED.
 *
 * Novedades del sistema now live in the DB (ReleaseNote) and are edited in the
 * product UI by the system owner (Dashboard → Novedades → Añadir / Editar / Eliminar).
 *
 * This script no longer writes frontend/src/content/releaseNotes.ts.
 */

console.log(`Las novedades del sistema se gestionan en la base de datos.

Como propietario del sistema (isSystemOwner):
  1. Abre el Dashboard
  2. En «Novedades del sistema» usa Añadir / Editar / Eliminar

API: GET/POST/PATCH/DELETE /api/release-notes
(POST/PATCH/DELETE requieren isSystemOwner; fallan con 403 para el resto.)
`)
process.exit(0)
