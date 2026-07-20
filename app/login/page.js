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

  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', phone: '', role: 'tenant' })
  const [profileForm, setProfileForm] = useState(() => getRoleProfileFields('tenant'))
  const [recoveryMode, setRecoveryMode] = useState('none')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [forgotOtpSent, setForgotOtpSent] = useState(false)
  const [registerVerificationCode, setRegisterVerificationCode] = useState('')
  const [pendingRegistration, setPendingRegistration] = useState(null)
  const [recoveryLoading, setRecoveryLoading] = useState(false)

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get('error')
    if (!error) return

    const messages = {
      'social-account-not-allowed': 'Continue with Google only works with verified Google account emails.',
      'social-account-not-registered': 'No portal account could be created for this Google account. Please try again.',
      AccessDenied: 'Google sign-in was denied. Use a verified Google account linked to your portal access.',
      OAuthAccountNotLinked: 'This Google account is not linked for sign-in here.',
      Configuration: 'Social sign-in is not configured yet. Add the Auth0 environment variables.',
    }

    toast.error(messages[error] || 'Google sign-in failed. Please try again.')
  }, [])

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      const result = await signIn('auth0', {
        callbackUrl: '/dashboard',
        redirect: false,
      })

      if (!result?.url || result.error) {
        const nextAuthError = result?.error || 'Configuration'
        throw new Error(nextAuthError)
      }

      window.location.assign(result.url)
    } catch (err) {
      const messageMap = {
        Configuration: 'Social sign-in is not configured yet. Add the Auth0 environment variables.',
        OAuthSignin: 'Unable to connect to Google sign-in provider. Please try again.',
        AccessDenied: 'Google sign-in was denied. Use a verified Google account linked to your portal access.',
      }
      toast.error(messageMap[err.message] || err.message || 'Unable to start Google sign-in')
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    const normalizedEmail = normalizeEmail(loginForm.email)
    if (!isValidEmail(normalizedEmail, { enforceRealAddress: false })) {
      toast.error('Please enter a valid email address to sign in.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/app-auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password: loginForm.password, authMethod: 'email-password' }),
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
      const sourcePayload = pendingRegistration || {
        ...regForm,
        profile: profileForm,
        authMethod: 'email-password',
      }
      const normalizedEmail = normalizeEmail(sourcePayload.email)
      if (!isValidEmail(normalizedEmail)) {
        toast.error('Please use a real email address for registration.')
        setLoading(false)
        return
      }
      const payload = {
        ...sourcePayload,
        email: normalizedEmail,
        verificationCode: pendingRegistration ? registerVerificationCode : undefined,
      }
      const res = await fetch('/api/app-auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.status === 202 && data.verificationRequired) {
        setPendingRegistration({ ...sourcePayload, email: normalizedEmail })
        toast.success(data.message || 'Verification code sent to your email.')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      localStorage.setItem('grtr_user', JSON.stringify(data.user))
      toast.success('Account created!')
      setPendingRegistration(null)
      setRegisterVerificationCode('')
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
      const normalizedEmail = normalizeEmail(recoveryEmail)
      if (!isValidEmail(normalizedEmail, { enforceRealAddress: false })) {
        throw new Error('Please use a valid email address.')
      }
      const res = await fetch('/api/app-auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to process password reset')
      toast.success(data.message || 'If an account exists, a reset code has been sent.')
      setRecoveryEmail(normalizedEmail)
      setForgotOtpSent(true)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setRecoveryLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setRecoveryLoading(true)
    try {
      const normalizedEmail = normalizeEmail(recoveryEmail)
      const res = await fetch('/api/app-auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, otp: resetOtp, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to reset password')
      toast.success(data.message || 'Password reset successfully')
      setRecoveryEmail('')
      setResetOtp('')
      setNewPassword('')
      setForgotOtpSent(false)
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
      const normalizedEmail = normalizeEmail(recoveryEmail)
      const res = await fetch('/api/app-auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to change password')
      toast.success(data.message || 'Password updated successfully')
      setRecoveryEmail('')
      setCurrentPassword('')
      setNewPassword('')
      setResetOtp('')
      setForgotOtpSent(false)
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
                    <button type="button" onClick={() => { setRecoveryMode('forgot'); setRecoveryEmail(loginForm.email); setForgotOtpSent(false); setResetOtp(''); setNewPassword('') }} className="text-primary hover:underline">Forgot password?</button>
                    <button type="button" onClick={() => { setRecoveryMode('change'); setRecoveryEmail(loginForm.email); setForgotOtpSent(false); setResetOtp('') }} className="text-primary hover:underline">Change password</button>
                  </div>
                  {recoveryMode !== 'none' && (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3">
                      <p className="text-sm font-medium">{recoveryMode === 'forgot' ? 'Reset your password' : 'Update your password'}</p>
                      {recoveryMode === 'forgot' ? (
                        <div className="space-y-3">
                          <div>
                            <Label>Email</Label>
                            <Input type="email" required value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} className="mt-1.5" placeholder="you@example.com" />
                          </div>
                          {forgotOtpSent && (
                            <>
                              <div>
                                <Label>Reset code</Label>
                                <Input required value={resetOtp} onChange={(e) => setResetOtp(e.target.value)} className="mt-1.5" placeholder="Enter the 6-digit code" />
                              </div>
                              <div>
                                <Label>New password</Label>
                                <Input type="password" required minLength={4} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5" placeholder="At least 4 chars, include letters + numbers" />
                              </div>
                            </>
                          )}
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => { setRecoveryMode('none'); setForgotOtpSent(false); setResetOtp(''); setNewPassword('') }}>Cancel</Button>
                            <Button type="button" onClick={forgotOtpSent ? handleResetPassword : handleForgotPassword} disabled={recoveryLoading} className="flex-1">{recoveryLoading ? 'Working...' : forgotOtpSent ? 'Reset password' : 'Send reset code'}</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
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
                            <Input type="password" required minLength={4} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5" placeholder="At least 4 chars, include letters + numbers" />
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => setRecoveryMode('none')}>Cancel</Button>
                            <Button type="button" onClick={handleChangePassword} disabled={recoveryLoading} className="flex-1">{recoveryLoading ? 'Updating...' : 'Change password'}</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <Button type="submit" disabled={loading} className="w-full rounded-full">{loading ? 'Signing in...' : 'Sign in'}</Button>
                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or continue with</span></div>
                  </div>
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3">
                    <p className="text-sm text-muted-foreground">Use your verified Google account to continue.</p>
                    <Button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full rounded-full">{loading ? 'Redirecting...' : 'Continue with Google'}</Button>
                  </div>
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
                    <Input type="password" required minLength={4} value={regForm.password} onChange={(e) => setRegForm({ ...regForm, password: e.target.value })} className="mt-1.5" placeholder="At least 4 chars, include letters + numbers" />
                  </div>
                  {pendingRegistration && (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3">
                      <p className="text-sm font-medium">Email verification required</p>
                      <p className="text-xs text-muted-foreground">We sent a 6-digit code to {pendingRegistration.email}. Enter it to complete account creation.</p>
                      <div>
                        <Label>Verification code</Label>
                        <Input required value={registerVerificationCode} onChange={(e) => setRegisterVerificationCode(e.target.value)} className="mt-1.5" placeholder="Enter 6-digit code" />
                      </div>
                    </div>
                  )}
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

                  <Button type="submit" disabled={loading} className="w-full rounded-full">{loading ? (pendingRegistration ? 'Verifying...' : 'Creating...') : (pendingRegistration ? 'Verify & create account' : 'Create account')}</Button>
                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or continue with</span></div>
                  </div>
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3">
                    <p className="text-sm text-muted-foreground">Continue with Google to create or access your account faster.</p>
                    <Button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full rounded-full">{loading ? 'Redirecting...' : 'Continue with Google'}</Button>
                  </div>
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
