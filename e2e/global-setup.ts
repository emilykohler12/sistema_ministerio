import { loadEnv } from 'vite'
import { esUrlLocal } from '../scripts/lib/entorno.ts'
import { vaciarIntentos } from './helpers.ts'

// El tope de frecuencia de registrar_descarga (0030) cuenta por IP, y en local todas las llamadas llegan con la del gateway:
// sin vaciar intento_descarga, la tercera corrida en 10 minutos dejaría de registrar descargas. Solo contra el Supabase local.
export default async function globalSetup() {
  // El navegador de los e2e usa VITE_SUPABASE_URL: si apunta fuera del Supabase local, la suite no corre.
  const urlDeLaApp = loadEnv('development', process.cwd(), 'VITE_').VITE_SUPABASE_URL
  if (!urlDeLaApp || !esUrlLocal(urlDeLaApp)) {
    throw new Error('VITE_SUPABASE_URL no apunta al Supabase local: los e2e solo corren contra la base local. Abortado.')
  }

  await vaciarIntentos()
}
