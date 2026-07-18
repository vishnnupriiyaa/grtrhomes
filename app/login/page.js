'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Home, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

const LoginPage = () => {
  const router = useRouter()
  const [tab, setTab] = useState('login')
  const [loading, setLoading] = useState(false)

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', phone: '', role: 'tenant' })
  const [recoveryMode, setRecoveryMode] = useState('none')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      localStorage.setItem('grtr_user', JSON.stringify(data.user))
      toast.success(`Welcome back, ${data.user.name}!`)
      router.push('/dashboard')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      localStorage.setItem('grtr_user', JSON.stringify(data.user))
      toast.success('Account created!')
      router.push('/dashboard')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setRecoveryLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to process password reset')
      toast.success(data.message || 'If an account exists, reset instructions are ready.')
      setRecoveryEmail('')
      setRecoveryMode('none')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRecoveryLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setRecoveryLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail, currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to change password')
      toast.success(data.message || 'Password updated successfully')
      setRecoveryEmail('')
      setCurrentPassword('')
      setNewPassword('')
      setRecoveryMode('none')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRecoveryLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container mx-auto px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Home className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl">GRTR Homes</span>
            </div>
            <h1 className="text-2xl font-bold">Access your portal</h1>
            <p className="text-sm text-muted-foreground mt-2">Sign in as a Manager, Owner, or Tenant.</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label>Email</Label>
                    <Input type="email" required value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} className="mt-1.5" placeholder="you@example.com" />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input type="password" required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} className="mt-1.5" placeholder="••••••••" />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <button type="button" onClick={() => { setRecoveryMode('forgot'); setRecoveryEmail(loginForm.email) }} className="text-primary hover:underline">Forgot password?</button>
                    <button type="button" onClick={() => { setRecoveryMode('change'); setRecoveryEmail(loginForm.email) }} className="text-primary hover:underline">Change password</button>
                  </div>
                  {recoveryMode !== 'none' && (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3">
                      <p className="text-sm font-medium">{recoveryMode === 'forgot' ? 'Reset your password' : 'Update your password'}</p>
                      {recoveryMode === 'forgot' ? (
                        <form onSubmit={handleForgotPassword} className="space-y-3">
                          <div>
                            <Label>Email</Label>
                            <Input type="email" required value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} className="mt-1.5" placeholder="you@example.com" />
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => setRecoveryMode('none')}>Cancel</Button>
                            <Button type="submit" disabled={recoveryLoading} className="flex-1">{recoveryLoading ? 'Working...' : 'Send reset'}</Button>
                          </div>
                        </form>
                      ) : (
                        <form onSubmit={handleChangePassword} className="space-y-3">
                          <div>
                            <Label>Email</Label>
                            <Input type="email" required value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} className="mt-1.5" placeholder="you@example.com" />
                          </div>
                          <div>
                            <Label>Current password</Label>
                            <Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1.5" placeholder="••••••••" />
                          </div>
                          <div>
                            <Label>New password</Label>
                            <Input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5" placeholder="••••••••" />
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => setRecoveryMode('none')}>Cancel</Button>
                            <Button type="submit" disabled={recoveryLoading} className="flex-1">{recoveryLoading ? 'Updating...' : 'Change password'}</Button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                  <Button type="submit" disabled={loading} className="w-full rounded-full">{loading ? 'Signing in...' : 'Sign in'}</Button>
                </form>
              </TabsContent>
              <TabsContent value="register" className="mt-6">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input required value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" required value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input required value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input type="password" required minLength={6} value={regForm.password} onChange={(e) => setRegForm({ ...regForm, password: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>I am a...</Label>
                    <Select value={regForm.role} onValueChange={(v) => setRegForm({ ...regForm, role: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tenant">Tenant</SelectItem>
                        <SelectItem value="owner">Property Owner</SelectItem>
                        <SelectItem value="manager">Property Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full rounded-full">{loading ? 'Creating...' : 'Create account'}</Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>

        </div>
      </div>
    </div>
  )
}

export default LoginPage
