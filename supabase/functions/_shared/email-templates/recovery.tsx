/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { OtpCodeBlock } from './_otp-block.tsx'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  token: string
}

export const RecoveryEmail = ({ token }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your ChiChat password reset code is {token}</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={header}>
          <span style={brand}>ChiChat</span>
          <span style={tagline}>Experience the possibilities</span>
        </div>

        <Heading style={h1}>Reset your password 🔐</Heading>

        <Text style={text}>
          We received a request to reset your ChiChat password. Enter this 6-digit code in the app to choose a new password.
        </Text>

        <OtpCodeBlock token={token} />

        <Text style={footer}>
          If you didn't request this, you can safely ignore this email — your password won't change.
          Never share this code with anyone, not even ChiChat support.
        </Text>

        <div style={hr} />
        <Text style={tinyFooter}>© ChiChat · Experience the possibilities</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' } as const
const brand = { fontSize: '18px', fontWeight: 'bold' as const, color: '#0B8F6C', letterSpacing: '0.3px' }
const tagline = { fontSize: '12px', color: '#8A8A8A' }
const h1 = { fontSize: '26px', fontWeight: 'bold' as const, color: '#121212', margin: '0 0 16px', lineHeight: '1.25' }
const text = { fontSize: '16px', color: '#3a3a3a', lineHeight: '1.6', margin: '0 0 18px' }
const footer = { fontSize: '13px', color: '#8A8A8A', margin: '24px 0 0', lineHeight: '1.55', textAlign: 'center' as const }
const hr = { borderTop: '1px solid #ECECEC', margin: '32px 0 14px' }
const tinyFooter = { fontSize: '11px', color: '#B0B0B0', textAlign: 'center' as const, margin: 0 }
