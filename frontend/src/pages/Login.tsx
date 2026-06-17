import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { login as apiLogin } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { LogIn } from 'lucide-react'
import OptickBrand from '../components/OptickBrand'
import { getWhatsAppUrl } from '../config/contact'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: () => {
      toast.success('Sesión iniciada')
      navigate('/')
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      if (!err.response) {
        toast.error('No se pudo conectar con el servidor. Verifica tu conexión.')
        return
      }
      toast.error(err.response.data?.error ?? 'Error al iniciar sesión')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <OptickBrand variant="login" />

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label">Correo electrónico</label>
            <input
              type="email"
              className="input"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full justify-center py-3"
            disabled={mutation.isPending}
          >
            <LogIn size={18} />
            {mutation.isPending ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-8">
          Desarrollado por Optick Cloud © {new Date().getFullYear()}
          {' · '}
          <Link to="/contacto" state={{ from: 'login' }} className="text-teal-600 hover:text-teal-700 font-medium">
            Contáctenos
          </Link>
          {' · '}
          <a
            href={getWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#25D366] hover:text-[#20bd5a] font-medium"
          >
            WhatsApp
          </a>
        </p>
      </div>
    </div>
  )
}
