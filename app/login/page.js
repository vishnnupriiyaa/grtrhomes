'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Home, ArrowLeft, Plus, Trash2, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { getRoleProfileFields, createPropertyDraft, isValidEmail, normalizeEmail } from '@/lib/onboarding.mjs'

const LoginPage = () => {
  const router = useRouter()
  const [tab, setTab] = useState('login')
  const [loading, setLoading] = useState(false)

  const [loginForm, setLoginForm] = useState({ email: '', password: '', authMethod: 'email-password' })
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', phone: '', role: 'tenant' })
  const [profileForm, setProfileForm] = useState(() => getRoleProfileFields('tenant'))
  const [recoveryMode, setRecoveryMode] = useState('none')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get('error')
    if (!error) return

    const messages = {
      'google-account-not-allowed': 'Continue with Google only works with verified Gmail accounts.',
      'google-account-not-registered': 'No portal account exists for this Google account. Register first, then try Google sign-in again.',
      AccessDenied: 'Google sign-in was denied. Use a verified Gmail account linked to your portal access.',
      OAuthAccountNotLinked: 'This Google account is not linked for sign-in here.',
      Configuration: 'Google sign-in is not configured yet. Add the Google OAuth environment variables.',
    }

    toast.error(messages[error] || 'Google sign-in failed. Please try again.')
  }, [])

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      await signIn('google', { callbackUrl: '/dashboard' })
    } catch (err) {
      toast.error(err.message || 'Unable to start Google sign-in')
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (loginForm.authMethod === 'google') {
      await handleGoogleSignIn()
      return
    }
    const normalizedEmail = normalizeEmail(loginForm.email)
    if (!isValidEmail(normalizedEmail)) {
      toast.error('Please use a real email address to sign in.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, email: normalizedEmail }),
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
      const normalizedEmail = normalizeEmail(regForm.email)
      if (!isValidEmail(normalizedEmail)) {
        toast.error('Please use a real email address for registration.')
        setLoading(false)
        return
      }
      const payload = {
        ...regForm,
        email: normalizedEmail,
        profile: profileForm,
        authMethod: 'email-password',
      }
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const handleRoleChange = (value) => {
    setRegForm({ ...regForm, role: value })
    setProfileForm(getRoleProfileFields(value))
  }

  const updateProperty = (index, field, value) => {
    const updated = [...profileForm.properties]
    updated[index] = { ...updated[index], [field]: value }
    setProfileForm({ ...profileForm, properties: updated })
  }

  const addProperty = () => {
    if (profileForm.properties.length >= 2) {
      toast.error('You can add up to two properties during registration.')
      return
    }
    setProfileForm({ ...profileForm, properties: [...profileForm.properties, createPropertyDraft()] })
  }

  const handleImageUpload = (index, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const updated = [...profileForm.properties]
      updated[index] = { ...updated[index], image: reader.result }
      setProfileForm({ ...profileForm, properties: updated })
    }
    reader.readAsDataURL(file)
  }

  const removeProperty = (index) => {
    const updated = profileForm.properties.filter((_, i) => i !== index)
    setProfileForm({ ...profileForm, properties: updated })
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
                    <Label>Sign in with</Label>
                    <Select value={loginForm.authMethod} onValueChange={(value) => setLoginForm({ ...loginForm, authMethod: value })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email-password">Email & password</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {loginForm.authMethod === 'email-password' ? (
                    <>
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
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-4">
                      <p className="text-sm text-muted-foreground">Use your verified Gmail account to continue. If that Gmail address is already registered for a portal account, you will be signed in automatically.</p>
                      <Button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full rounded-full">{loading ? 'Redirecting...' : 'Continue with Google'}</Button>
                    </div>
                  )}
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
                    <Select value={regForm.role} onValueChange={handleRoleChange}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tenant">Tenant</SelectItem>
                        <SelectItem value="owner">Property Owner</SelectItem>
                        <SelectItem value="manager">Property Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-4">
                    <div>
                      <Label>Profile bio</Label>
                      <Textarea value={profileForm.bio || ''} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} className="mt-1.5" placeholder="Tell us a little about your role and experience" />
                    </div>
                    <div>
                      <Label>Profile photo URL</Label>
                      <Input value={profileForm.profilePhoto || ''} onChange={(e) => setProfileForm({ ...profileForm, profilePhoto: e.target.value })} className="mt-1.5" placeholder="https://..." />
                    </div>

                    {regForm.role !== 'tenant' && (
                      <div className="space-y-3">
                        <div>
                          <Label>Company / portfolio name</Label>
                          <Input value={profileForm.companyName || ''} onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })} className="mt-1.5" placeholder="Example Holdings" />
                        </div>
                        <div>
                          <Label>Service area / address</Label>
                          <Input value={profileForm.address || ''} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} className="mt-1.5" placeholder="Austin, TX" />
                        </div>
                        {regForm.role === 'manager' && (
                          <div>
                            <Label>Managed property count</Label>
                            <Input value={profileForm.managedPropertyCount || ''} onChange={(e) => setProfileForm({ ...profileForm, managedPropertyCount: e.target.value })} className="mt-1.5" placeholder="3" />
                          </div>
                        )}
                      </div>
                    )}

                    {regForm.role === 'tenant' && (
                      <div className="space-y-3">
                        <div>
                          <Label>Emergency contact</Label>
                          <Input value={profileForm.emergencyContact || ''} onChange={(e) => setProfileForm({ ...profileForm, emergencyContact: e.target.value })} className="mt-1.5" placeholder="Name / phone" />
                        </div>
                        <div>
                          <Label>Preferred contact</Label>
                          <Input value={profileForm.preferredContact || ''} onChange={(e) => setProfileForm({ ...profileForm, preferredContact: e.target.value })} className="mt-1.5" placeholder="Email or phone" />
                        </div>
                      </div>
                    )}

                    {(regForm.role === 'owner' || regForm.role === 'manager') && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Properties to manage</Label>
                          <Button type="button" variant="outline" size="sm" onClick={addProperty} className="gap-1 rounded-full">
                            <Plus className="h-3.5 w-3.5" /> Add property
                          </Button>
                        </div>
                        {profileForm.properties.map((property, index) => (
                          <div key={`${property.name || 'property'}-${index}`} className="rounded-lg border border-border bg-background/70 p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Property {index + 1}</p>
                              {profileForm.properties.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeProperty(index)} className="h-8 w-8 p-0">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                              <Input value={property.name || ''} onChange={(e) => updateProperty(index, 'name', e.target.value)} placeholder="Property name" />
                              <Input value={property.address || ''} onChange={(e) => updateProperty(index, 'address', e.target.value)} placeholder="Property address" />
                              <Input type="number" value={property.monthlyRent || ''} onChange={(e) => updateProperty(index, 'monthlyRent', e.target.value)} placeholder="Monthly rent" />
                              <Input value={property.image || ''} onChange={(e) => updateProperty(index, 'image', e.target.value)} placeholder="Image URL" />
                              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(index, e.target.files?.[0])} />
                                <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2">
                                  <ImagePlus className="h-4 w-4" /> Upload image
                                </span>
                              </label>
                              {property.image && <img src={property.image} alt={property.name || 'Property preview'} className="h-24 w-full rounded-md object-cover border border-border" />}
                              <Textarea value={property.description || ''} onChange={(e) => updateProperty(index, 'description', e.target.value)} placeholder="Short description" rows={2} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
