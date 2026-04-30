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
import { getOtpCode, OtpCodeBlock } from './_otp-block.tsx'
import { BrandHeader, FeatureStrip, SignOff } from './_brand.tsx'

interface ReauthenticationEmailProps {
  token: string
  firstName?: string
}

export const ReauthenticationEmail = ({ token, firstName }: ReauthenticationEmailProps) => {
  const code = getOtpCode(token)

  return (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your ChiChat verification code is {code}</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />

        <Heading style={h1}>
          {firstName ? `Hi ${firstName}, just confirming it's you` : "Just confirming it's you"} 🔐
        </Heading>

        <Text style={text}>
          Enter this verification code in ChiChat to confirm it&rsquo;s really you. Quick check, then back to your conversations.
        </Text>

        <OtpCodeBlock token={token} />

        <Text style={footer}>
          If you didn&rsquo;t request this, you can safely ignore this email.
          Never share this code with anyone.
        </Text>

        <FeatureStrip />
        <SignOff message="A small step to keep your account safe." />

        <div style={hr} />
        <Text style={tinyFooter}>© ChiChat · Experience the possibilities</Text>
      </Container>
    </Body>
  </Html>
  )
}

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '28px', fontWeight: 'bold' as const, color: '#121212', margin: '0 0 16px', lineHeight: '1.25' }
const text = { fontSize: '16px', color: '#3a3a3a', lineHeight: '1.65', margin: '0 0 18px' }
const footer = { fontSize: '13px', color: '#8A8A8A', margin: '20px 0 0', lineHeight: '1.55', textAlign: 'center' as const }
const hr = { borderTop: '1px solid #ECECEC', margin: '28px 0 14px' }
const tinyFooter = { fontSize: '11px', color: '#B0B0B0', textAlign: 'center' as const, margin: 0 }
